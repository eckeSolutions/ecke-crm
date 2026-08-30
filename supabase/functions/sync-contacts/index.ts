// sync-contacts — pushes a client's contact people to Stalwart Mail over
// JMAP, per docs/API_CONTRACTS.md §2 and issue #2.
//
// UPDATE: the wire protocol below is now verified against a real Stalwart
// v1.0.0 instance (https://stalwart.ecke.solutions, a test account with an
// address book), by hand, via curl, on 2026-08-02 -- not through this
// function itself (still not deployed as an actual Edge Function; see
// below). That session confirmed and corrected the original best-effort
// guess in three concrete ways:
//   1. The capability URN guess, `urn:ietf:params:jmap:contacts`, was
//      right -- Stalwart's session `capabilities` and `primaryAccounts`
//      both advertise it, confirming Stalwart implements the IETF JMAP
//      Contacts draft rather than CardDAV or a proprietary extension.
//   2. The method name guess, `Contact/set`, was WRONG -- Stalwart
//      returned `{"type":"unknownMethod"}` for it. The real object type is
//      `ContactCard` (JSContact/RFC 9553-shaped), with `ContactCard/get`,
//      `ContactCard/set` methods, confirmed working against the live
//      instance.
//   3. The property shape guess (flat `firstName`/`lastName`/`emails: []`
//      strings) was WRONG -- a real ContactCard uses JSContact's nested
//      shape: `name: { full, components: [{kind, value}] }`, and
//      `emails`/`phones` are *maps* keyed by an arbitrary string, not
//      arrays: `emails: { "e1": { address } }`. Confirmed by creating,
//      updating, reading back, and deleting a probe card against the live
//      account. A `ContactCard` also requires `addressBookIds` at
//      creation ("Contact has to belong to at least one address book" is
//      the server's own rejection message for a missing one) -- discovered
//      by triggering that exact validation error -- so this now calls
//      `AddressBook/get` first to find one, which the original version
//      didn't do at all.
//
// What's still NOT verified: this function itself has not been deployed
// as a Supabase Edge Function and invoked end-to-end -- the probes above
// were plain curl, not this code running with a Vault-resolved secret
// through `service_role`, and not through this repo's actual RLS-scoped
// Postgres reads. The `company_settings` read, the
// `vault.decrypted_secrets` read, and the `clients`/`contacts` RLS
// interactions are still exactly as unverified as before. Deploy and
// invoke this for real before trusting the plumbing around the JMAP
// calls, not just the JMAP calls themselves.
//
// AUTH (issue #3): originally used HTTP Basic auth with the account's own
// password (`jmap_username` + the Vault secret). Switched to
// `Authorization: Bearer <secret>` with a Stalwart API Key instead --
// also verified against the live instance (session discovery plus a full
// ContactCard/set create/get/destroy round trip). API keys can be scoped
// narrower than a full account password (Stalwart's Inherit/Disable/
// Replace permission modes -- see
// https://stalw.art/docs/ref/object/api-key/), which is the point:
// `jmap_secret_id` is meant to hold that scoped key's secret, not the
// account's login password. `jmap_username` is no longer read by this
// function at all -- the Bearer token alone identifies the account.
// Today's test key was scoped `Inherit` (full account access), so this
// proves the *mechanism* works, not that a narrower-scoped key still
// grants everything sync-contacts needs -- verify again once a
// restricted key exists.
//
// Scope: `direction: "push"` only. `pull`/`bidirectional` return 501
// rather than guessing at merge logic.
//
// CLIENTS (issue #5): originally only `contacts` (individual people) were
// synced -- `clients` (the company) had no documented company-card
// mapping. Now also verified against the live instance: `kind: "org"` on
// a ContactCard is accepted and persists correctly. `links` (which would
// carry `clients.website`) does NOT persist -- confirmed twice (create
// and a follow-up update), the write reports success but the property is
// silently absent on read-back. So `website` stays unmapped, same as it
// already was for `contacts`' fields. The client card's id is written to
// `clients.stalwart_contact_id`.
//
// CREDENTIALS (issue #4): `JMAP_API_KEY`/`JMAP_ENDPOINT` env vars, if set,
// are used directly instead of the `company_settings`/Vault lookup --
// see resolveJmapCredentials() below. Local/test convenience; the
// Settings-UI-driven path is unchanged when they're unset. See
// supabase/functions/.env.example.
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

const RATE_LIMIT_WINDOW_MS = 10_000;

// -- JMAP wire format -- verified against a live Stalwart v1.0.0 instance,
// see the file header for how and when.
const JMAP_CORE_CAPABILITY = "urn:ietf:params:jmap:core";
const JMAP_CONTACTS_CAPABILITY = "urn:ietf:params:jmap:contacts";
const JMAP_CONTACT_CARD_SET_METHOD = "ContactCard/set";
const JMAP_ADDRESS_BOOK_GET_METHOD = "AddressBook/get";

interface JmapSession {
  apiUrl: string;
  accounts?: Record<string, unknown>;
  primaryAccounts?: Record<string, string>;
}

interface ContactRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  stalwart_contact_id: string | null;
}

interface ClientRow {
  id: string;
  name: string;
  email_1: string | null;
  email_2: string | null;
  phone: string | null;
  mobile_1: string | null;
  mobile_2: string | null;
  stalwart_contact_id: string | null;
  last_contact_sync_at: string | null;
}

interface JmapCredentials {
  endpoint: string;
  secret: string;
}

// Resolves the endpoint + Bearer secret to talk to Stalwart with. Prefers
// JMAP_API_KEY/JMAP_ENDPOINT env vars (issue #4, local/test convenience)
// over the company_settings/Vault path so local iteration doesn't require
// seeding the DB by hand -- falls back to the DB+Vault path, unchanged,
// when the env var isn't set.
async function resolveJmapCredentials(
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
  // holds a Stalwart API Key secret, not an account password -- see the
  // file header (issue #3).
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

// JSContact-shaped (RFC 9553) ContactCard properties for an individual
// `contacts` row, confirmed against a live Stalwart instance by creating,
// reading back, and updating a probe card: `name` is a nested object,
// `emails`/`phones` are maps keyed by an arbitrary string (not arrays).
// `addressBookIds` is required at creation but is threaded in by the
// caller, not here, since it's the same value for every card in a given
// sync run. No `links` property: `contacts` has no `website` field at
// all (unlike `clients` -- see buildOrgCard below).
function buildContactCard(contact: ContactRow): Record<string, unknown> {
  const full = [contact.first_name, contact.last_name].filter(Boolean).join(" ");
  const components = [
    ...(contact.first_name ? [{ kind: "given", value: contact.first_name }] : []),
    ...(contact.last_name ? [{ kind: "surname", value: contact.last_name }] : []),
  ];
  return {
    name: { full, ...(components.length > 0 ? { components } : {}) },
    emails: contact.email ? { e1: { address: contact.email } } : {},
    phones: contact.phone ? { p1: { number: contact.phone } } : {},
  };
}

// The `clients` (company) card -- `kind: "org"`, verified against the
// live instance to persist correctly. No `links`/website: see the file
// header (issue #5) for why. Multiple emails/phones each get their own
// map key, unlike buildContactCard's single email/phone.
function buildOrgCard(client: ClientRow): Record<string, unknown> {
  const emails: Record<string, { address: string }> = {};
  if (client.email_1) emails.e1 = { address: client.email_1 };
  if (client.email_2) emails.e2 = { address: client.email_2 };

  const phones: Record<string, { number: string }> = {};
  if (client.phone) phones.p1 = { number: client.phone };
  if (client.mobile_1) phones.p2 = { number: client.mobile_1 };
  if (client.mobile_2) phones.p3 = { number: client.mobile_2 };

  return { kind: "org", name: { full: client.name }, emails, phones };
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

  // Caller-scoped client: the client_id read/write goes through this, so
  // the caller's own `clients`/`contacts` RLS decides what they can touch.
  // service_role is only used below for company_settings (admin-only) and
  // the Vault secret read.
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

  let body: { client_id?: string; direction?: string };
  try {
    body = await req.json();
  } catch {
    return errorResponse(400, "invalid_body", "Expected a JSON body with `client_id` and `direction`.");
  }
  const clientId = body.client_id?.trim();
  const direction = body.direction;
  if (!clientId) {
    return errorResponse(400, "invalid_body", "`client_id` must be a non-empty string.");
  }
  if (direction !== "push" && direction !== "pull" && direction !== "bidirectional") {
    return errorResponse(400, "invalid_body", '`direction` must be one of "push", "pull", "bidirectional".');
  }
  if (direction !== "push") {
    return errorResponse(
      501,
      "direction_not_implemented",
      `direction "${direction}" is not implemented yet -- only "push" is currently supported.`,
    );
  }

  const { data: client, error: clientError } = await callerClient
    .from("clients")
    .select("id, name, email_1, email_2, phone, mobile_1, mobile_2, stalwart_contact_id, last_contact_sync_at")
    .eq("id", clientId)
    .single();
  if (clientError || !client) {
    return errorResponse(404, "client_not_found", `Client ${clientId} was not found.`);
  }

  if (client.last_contact_sync_at) {
    const elapsed = Date.now() - new Date(client.last_contact_sync_at).getTime();
    if (elapsed < RATE_LIMIT_WINDOW_MS) {
      return errorResponse(429, "rate_limited", "sync-contacts was called for this client_id less than 10s ago.");
    }
  }

  // Claim the rate-limit slot up front. Not perfectly atomic against a
  // concurrent request in the same window -- "basic abuse guard against
  // retry storms," per the doc, not a strict distributed lock.
  await callerClient.from("clients").update({ last_contact_sync_at: new Date().toISOString() }).eq("id", clientId);

  const markSyncError = async (message: string) => {
    await callerClient.from("clients").update({ sync_status: "error", last_sync_error: message }).eq("id", clientId);
  };

  const { data: contacts, error: contactsError } = await callerClient
    .from("contacts")
    .select("id, first_name, last_name, email, phone, stalwart_contact_id")
    .eq("client_id", clientId);
  if (contactsError) {
    await markSyncError(contactsError.message);
    return errorResponse(500, "contacts_load_failed", contactsError.message);
  }

  const credResult = await resolveJmapCredentials(supabaseUrl, serviceRoleKey);
  if (!credResult.credentials) {
    await markSyncError(credResult.errorMessage!);
    return errorResponse(500, credResult.errorCode!, credResult.errorMessage!);
  }
  const { endpoint: jmapEndpoint, secret: jmapSecret } = credResult.credentials;
  const jmapAuth = `Bearer ${jmapSecret}`;

  let session: JmapSession;
  try {
    const sessionUrl = new URL("/.well-known/jmap", jmapEndpoint).toString();
    const sessionResp = await fetch(sessionUrl, { headers: { Authorization: jmapAuth } });
    if (!sessionResp.ok) {
      throw new Error(`session discovery returned HTTP ${sessionResp.status}`);
    }
    session = await sessionResp.json();
  } catch (err) {
    const message = `JMAP session discovery failed: ${err instanceof Error ? err.message : String(err)}`;
    await markSyncError(message);
    return errorResponse(502, "jmap_session_failed", message);
  }

  const accountId =
    session.primaryAccounts?.[JMAP_CONTACTS_CAPABILITY] ??
    (session.accounts ? Object.keys(session.accounts)[0] : undefined);
  if (!accountId) {
    const message = "JMAP session has no usable account for the contacts capability.";
    await markSyncError(message);
    return errorResponse(502, "jmap_no_account", message);
  }

  // A ContactCard must belong to at least one AddressBook (confirmed by
  // triggering the server's own validation error for a missing one -- see
  // the file header) -- there's no "default mailbox"-style implicit
  // membership like Email/Mailbox, so this has to be resolved first.
  let addressBookId: string | undefined;
  try {
    const abResp = await fetch(session.apiUrl, {
      method: "POST",
      headers: { Authorization: jmapAuth, "Content-Type": "application/json" },
      body: JSON.stringify({
        using: [JMAP_CORE_CAPABILITY, JMAP_CONTACTS_CAPABILITY],
        methodCalls: [[JMAP_ADDRESS_BOOK_GET_METHOD, { accountId, ids: null }, "ab1"]],
      }),
    });
    if (!abResp.ok) {
      throw new Error(`${JMAP_ADDRESS_BOOK_GET_METHOD} returned HTTP ${abResp.status}`);
    }
    const abBody = await abResp.json();
    const addressBooks: Array<{ id: string; isDefault?: boolean }> = abBody.methodResponses?.[0]?.[1]?.list ?? [];
    addressBookId = addressBooks.find((ab) => ab.isDefault)?.id ?? addressBooks[0]?.id;
  } catch (err) {
    const message = `JMAP ${JMAP_ADDRESS_BOOK_GET_METHOD} failed: ${err instanceof Error ? err.message : String(err)}`;
    await markSyncError(message);
    return errorResponse(502, "jmap_address_book_lookup_failed", message);
  }
  if (!addressBookId) {
    const message = "The JMAP account has no address book to sync contacts into.";
    await markSyncError(message);
    return errorResponse(502, "jmap_no_address_book", message);
  }

  const create: Record<string, Record<string, unknown>> = {};
  const update: Record<string, Record<string, unknown>> = {};

  // The client (company) itself, as an org card -- issue #5. Keyed by
  // `client.id`, which can't collide with any `contact.id` (independent
  // uuids), so `setResult.created`/`update` entries can be told apart
  // from contacts' below by that id alone.
  const clientRow = client as ClientRow;
  if (clientRow.stalwart_contact_id) {
    update[clientRow.stalwart_contact_id] = buildOrgCard(clientRow);
  } else {
    create[clientRow.id] = { ...buildOrgCard(clientRow), addressBookIds: { [addressBookId]: true } };
  }

  for (const contact of contacts as ContactRow[]) {
    if (contact.stalwart_contact_id) {
      update[contact.stalwart_contact_id] = buildContactCard(contact);
    } else {
      create[contact.id] = { ...buildContactCard(contact), addressBookIds: { [addressBookId]: true } };
    }
  }

  let setResult: {
    created?: Record<string, { id: string }>;
    updated?: Record<string, unknown>;
    notCreated?: Record<string, unknown>;
    notUpdated?: Record<string, unknown>;
  };
  try {
    const setResp = await fetch(session.apiUrl, {
      method: "POST",
      headers: { Authorization: jmapAuth, "Content-Type": "application/json" },
      body: JSON.stringify({
        using: [JMAP_CORE_CAPABILITY, JMAP_CONTACTS_CAPABILITY],
        methodCalls: [[JMAP_CONTACT_CARD_SET_METHOD, { accountId, create, update }, "c1"]],
      }),
    });
    if (!setResp.ok) {
      throw new Error(`${JMAP_CONTACT_CARD_SET_METHOD} returned HTTP ${setResp.status}`);
    }
    const setRespBody = await setResp.json();
    setResult = setRespBody.methodResponses?.[0]?.[1] ?? {};
  } catch (err) {
    const message = `JMAP ${JMAP_CONTACT_CARD_SET_METHOD} failed: ${err instanceof Error ? err.message : String(err)}`;
    await markSyncError(message);
    return errorResponse(502, "jmap_set_failed", message);
  }

  // Write newly assigned JMAP ids back onto their Postgres rows. The
  // client's own card is keyed by `clientRow.id` (see above) and goes to
  // `clients`; everything else is a contact and goes to `contacts`.
  for (const [creationId, created] of Object.entries(setResult.created ?? {})) {
    if (creationId === clientRow.id) {
      await callerClient.from("clients").update({ stalwart_contact_id: created.id }).eq("id", creationId);
    } else {
      await callerClient.from("contacts").update({ stalwart_contact_id: created.id }).eq("id", creationId);
    }
  }

  const createdCount = Object.keys(setResult.created ?? {}).length;
  const updatedCount = Object.keys(update).length - Object.keys(setResult.notUpdated ?? {}).length;
  const failedCount = Object.keys(setResult.notCreated ?? {}).length + Object.keys(setResult.notUpdated ?? {}).length;

  if (failedCount > 0) {
    await markSyncError(
      `${failedCount} card(s) failed to sync: ${JSON.stringify({ ...setResult.notCreated, ...setResult.notUpdated })}`,
    );
  } else {
    await callerClient.from("clients").update({ sync_status: "ok", last_sync_error: null }).eq("id", clientId);
  }

  return new Response(
    JSON.stringify({
      pushed: contacts.length + 1,
      created: createdCount,
      updated: updatedCount,
      failed: failedCount,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
});
