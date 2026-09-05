// set-jmap-secret — rotates the Vault-backed JMAP/DAV credential referenced
// by company_settings.jmap_secret_id.
//
// docs/API_CONTRACTS.md documents `generate-pdf` and `sync-contacts` but
// not this one — it's a genuine gap: the Settings UI needs *some* way to
// write the secret, and the client can never do it directly (RLS +
// architecture both forbid it; only a service_role Edge Function may touch
// vault.decrypted_secrets / vault.create_secret / vault.update_secret).
//
// Verified 2026-09-05 against a real local stack (supabase_vault 0.3.1):
// vault.create_secret(new_secret, new_name, new_description, new_key_id)
// returns uuid, vault.update_secret(secret_id, new_secret, new_name,
// new_description, new_key_id) returns void -- the create path's param
// names matched Supabase's docs, but update_secret's first param is
// `secret_id`, not `id` as originally guessed here; PostgREST's RPC
// matches named JSON body keys to the function's actual parameter names,
// so the wrong name silently 404'd ("could not find function") rather
// than erroring on a type mismatch. Also needed `vault` added to the
// exposed schemas list (`[api].schemas` / `PGRST_DB_SCHEMAS`) -- without
// it PostgREST rejects `.schema("vault")` calls with "Invalid schema:
// vault" before ever reaching Postgres's own grants.
//
// Error envelope matches docs/API_CONTRACTS.md: non-2xx status with
// { "error": { "code": "...", "message": "..." } }.

import { createClient } from "jsr:@supabase/supabase-js@2";

function errorResponse(status: number, code: string, message: string): Response {
  return new Response(JSON.stringify({ error: { code, message } }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return errorResponse(405, "method_not_allowed", "Only POST is supported.");
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return errorResponse(401, "missing_authorization", "Missing Authorization header.");
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Caller-scoped client: resolves the caller's identity and re-checks
  // admin status via the *caller's own* JWT, subject to normal RLS —
  // service_role is only used afterwards, for the Vault write itself.
  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: { user },
    error: userError,
  } = await callerClient.auth.getUser();
  if (userError || !user) {
    return errorResponse(401, "invalid_session", "Could not resolve the caller's session.");
  }

  const { data: profile, error: profileError } = await callerClient
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profileError || profile?.role !== "admin") {
    return errorResponse(403, "not_admin", "Only admins may rotate the JMAP secret.");
  }

  let body: { secret?: string };
  try {
    body = await req.json();
  } catch {
    return errorResponse(400, "invalid_body", "Expected a JSON body with a `secret` field.");
  }
  const secret = body.secret?.trim();
  if (!secret) {
    return errorResponse(400, "empty_secret", "`secret` must be a non-empty string.");
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const { data: settings, error: settingsError } = await adminClient
    .from("company_settings")
    .select("jmap_secret_id")
    .eq("id", true)
    .single();
  if (settingsError) {
    return errorResponse(500, "settings_read_failed", settingsError.message);
  }

  let secretId: string;
  if (settings?.jmap_secret_id) {
    const { error: updateError } = await adminClient.schema("vault").rpc("update_secret", {
      secret_id: settings.jmap_secret_id,
      new_secret: secret,
    });
    if (updateError) {
      return errorResponse(500, "vault_update_failed", updateError.message);
    }
    secretId = settings.jmap_secret_id;
  } else {
    const { data: createdId, error: createError } = await adminClient
      .schema("vault")
      .rpc("create_secret", {
        new_secret: secret,
        new_name: `jmap_secret_${Date.now()}`,
        new_description: "JMAP/DAV credential for company_settings",
      });
    if (createError || !createdId) {
      return errorResponse(500, "vault_create_failed", createError?.message ?? "no id returned");
    }
    secretId = createdId as string;

    const { error: linkError } = await adminClient
      .from("company_settings")
      .update({ jmap_secret_id: secretId })
      .eq("id", true);
    if (linkError) {
      return errorResponse(500, "settings_link_failed", linkError.message);
    }
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
