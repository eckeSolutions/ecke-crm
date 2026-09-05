// Shared by sync-contacts and sync-calendar: resolves the endpoint + Bearer
// secret to talk to Stalwart with. Prefers JMAP_API_KEY/JMAP_ENDPOINT env
// vars (issue #4, local/test convenience) over the company_settings/Vault
// path so local iteration doesn't require seeding the DB by hand -- falls
// back to the DB+Vault path, unchanged, when the env var isn't set.

import { createClient } from "jsr:@supabase/supabase-js@2";

export interface JmapCredentials {
  endpoint: string;
  secret: string;
}

export async function resolveJmapCredentials(
  supabaseUrl: string,
  serviceRoleKey: string,
): Promise<{ credentials?: JmapCredentials; errorCode?: string; errorMessage?: string }> {
  const envApiKey = Deno.env.get("JMAP_API_KEY");
  if (envApiKey) {
    const envEndpoint = Deno.env.get("JMAP_ENDPOINT");
    if (!envEndpoint) {
      return {
        errorCode: "jmap_not_configured",
        errorMessage: "JMAP_API_KEY is set but JMAP_ENDPOINT is not (see supabase/functions/.env.example).",
      };
    }
    return { credentials: { endpoint: envEndpoint, secret: envApiKey } };
  }

  // company_settings is admin-only RLS -- read via service_role
  // regardless of the caller's own role, same split set-jmap-secret uses.
  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const { data: settings, error: settingsError } = await adminClient
    .from("company_settings")
    .select("jmap_endpoint, jmap_secret_id")
    .eq("id", true)
    .single();
  if (settingsError || !settings?.jmap_endpoint || !settings.jmap_secret_id) {
    return {
      errorCode: "jmap_not_configured",
      errorMessage: "JMAP is not configured (missing jmap_endpoint or jmap_secret_id on company_settings).",
    };
  }

  // First Vault *read* in this repo -- set-jmap-secret only ever writes.
  // `vault.decrypted_secrets` is a view; verify this shape against your
  // project's installed supabase_vault extension version, same caveat
  // set-jmap-secret already carries for its own vault RPC calls. This
  // holds a Stalwart API Key secret, not an account password -- see
  // sync-contacts/index.ts's file header (issue #3).
  const { data: secretRow, error: secretError } = await adminClient
    .schema("vault")
    .from("decrypted_secrets")
    .select("decrypted_secret")
    .eq("id", settings.jmap_secret_id)
    .single();
  if (secretError || !secretRow?.decrypted_secret) {
    return { errorCode: "jmap_secret_unresolved", errorMessage: "Could not resolve the JMAP credential from Vault." };
  }

  return { credentials: { endpoint: settings.jmap_endpoint, secret: secretRow.decrypted_secret } };
}
