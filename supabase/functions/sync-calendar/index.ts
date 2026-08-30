// sync-calendar — pushes a time_entries row to Stalwart Mail as a JMAP
// CalendarEvent, and pulls JMAP calendar events not yet linked to any
// time_entries row so they can be turned into billable items. Issue #6.
// No dedicated contract existed for this before -- docs/API_CONTRACTS.md
// §3 only ever documented a field mapping, never an Edge Function -- this
// is the first implementation, designed and verified alongside it.
//
// Verified against a live Stalwart v1.0.0 test instance
// (https://stalwart.ecke.solutions) by hand via curl on 2026-08-02, the
// same way sync-contacts' ContactCard calls were: Calendar/get,
// CalendarEvent/set create, CalendarEvent/get read-back,
// CalendarEvent/query with an after/before filter, and delete, all
// against a probe event. Two assumptions from the original
// docs/API_CONTRACTS.md §3 mapping turned out wrong, caught before they
// shipped:
//   1. JSCalendar (what `urn:ietf:params:jmap:calendars` actually is) uses
//      `start` (a *local*, timezone-less date-time string) plus a
//      separate `timeZone` (IANA name) and an ISO-8601 `duration` --
//      NOT `start`+`end` as §3 said. `duration_minutes` is sent as
//      `PT<n>M`.
//   2. `participants` -- which would have been the natural way to carry
//      "which client is this event for" -- does NOT persist. Confirmed
//      directly: a CalendarEvent/set update with a participants entry
//      reports success, but the property is silently absent on
//      CalendarEvent/get read-back. Same failure mode `links` has on
//      ContactCard (see supabase/functions/sync-contacts/index.ts).
//      Consequence: the client is identified by prefixing the event
//      *title* with the client's name instead, and pulled events can't
//      be auto-matched to a client -- picking one is a manual step this
//      function deliberately does not attempt.
//
// What's still NOT verified: this function has not been deployed as an
// actual Supabase Edge Function and invoked end-to-end -- every probe
// above was plain curl, not this code running through `service_role`/RLS.
//
// Credentials: same JMAP_API_KEY/JMAP_ENDPOINT env var override, falling
// back to company_settings/Vault, as sync-contacts (issue #4) -- see that
// file's resolveJmapCredentials() for the fuller explanation; duplicated
// here rather than shared, matching this repo's one-file-per-function
// convention (no `_shared` module exists for Edge Functions here).
//
// Scope: `direction: "push"` sends one time_entries row (by id). `pull`
// lists candidate JMAP events; it does not create a time_entries row from
// one -- that needs a client/template picker, which is real UI work
// (apps/ecke_crm/lib/features/time_tracking), deliberately deferred.
// `bidirectional` returns 501, same as sync-contacts.
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

// This business is German (see docs/FEATURES.md, §19 UStG) -- fixed
// rather than per-entry configurable, since nothing in the schema tracks
// a time zone per time_entries row.
const JMAP_TIME_ZONE = "Europe/Berlin";
const PULL_WINDOW_PAST_DAYS = 7;
const PULL_WINDOW_FUTURE_DAYS = 60;

// -- JMAP wire format -- verified against a live Stalwart v1.0.0 instance,
// see the file header for how and when.
const JMAP_CORE_CAPABILITY = "urn:ietf:params:jmap:core";
const JMAP_CALENDARS_CAPABILITY = "urn:ietf:params:jmap:calendars";
const JMAP_CALENDAR_GET_METHOD = "Calendar/get";
const JMAP_CALENDAR_EVENT_SET_METHOD = "CalendarEvent/set";
const JMAP_CALENDAR_EVENT_QUERY_METHOD = "CalendarEvent/query";
const JMAP_CALENDAR_EVENT_GET_METHOD = "CalendarEvent/get";

interface JmapSession {
  apiUrl: string;
  accounts?: Record<string, unknown>;
  primaryAccounts?: Record<string, string>;
}

interface JmapCredentials {
  endpoint: string;
  secret: string;
}

// Duplicated from sync-contacts/index.ts -- see that file's copy for the
// full explanation (issue #4). Kept identical on purpose.
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

async function jmapCall(
  apiUrl: string,
  auth: string,
  using: string[],
  methodCalls: Array<[string, Record<string, unknown>, string]>,
): Promise<any> {
  const resp = await fetch(apiUrl, {
    method: "POST",
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body: JSON.stringify({ using, methodCalls }),
  });
  if (!resp.ok) {
    throw new Error(`JMAP call returned HTTP ${resp.status}`);
  }
  return resp.json();
}

// duration_minutes -> a JSCalendar ISO-8601 duration. Always expressed in
// minutes (`PT90M` rather than `PT1H30M`) -- both are valid ISO-8601 and
// this is simpler to generate; Stalwart may or may not normalize it on
// read-back (not verified either way), which is why parseIsoDurationMinutes
// below parses the general H/M/S form rather than assuming its own shape
// comes back unchanged.
function toIsoDurationMinutes(minutes: number): string {
  return `PT${minutes}M`;
}

function parseIsoDurationMinutes(iso: string): number {
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso);
  if (!match) return 0;
  const hours = Number(match[1] ?? 0);
  const minutes = Number(match[2] ?? 0);
  const seconds = Number(match[3] ?? 0);
  return hours * 60 + minutes + Math.round(seconds / 60);
}

// Renders a UTC instant as a local wall-clock "YYYY-MM-DDTHH:mm:ss" string
// in `timeZone`, the shape JSCalendar's `start` property needs (paired
// with a separate `timeZone` property -- see the file header for why this
// isn't just `date.toISOString()`).
function toZonedDateTimeString(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}`;
}

// The inverse: a local wall-clock string plus an IANA zone name -> the UTC
// instant it represents. `Intl.DateTimeFormat` can only go UTC -> local,
// not local -> UTC, so this uses the standard guess-and-correct technique:
// treat the local string as if it were already UTC, see what that guess
// renders as in `timeZone`, and shift by the difference. One correction
// is enough except exactly at a DST transition, which this dataset (time
// tracking / calendar entries, never at midnight-precision edge cases
// that matter) doesn't need to handle perfectly.
function fromZonedDateTimeString(localDateTime: string, timeZone: string): Date {
  const naiveUtc = new Date(`${localDateTime}Z`);
  const renderedAsLocal = toZonedDateTimeString(naiveUtc, timeZone);
  const offsetMs = naiveUtc.getTime() - new Date(`${renderedAsLocal}Z`).getTime();
  return new Date(naiveUtc.getTime() + offsetMs);
}

async function findDefaultCalendarId(apiUrl: string, auth: string, accountId: string): Promise<string | undefined> {
  const body = await jmapCall(apiUrl, auth, [JMAP_CORE_CAPABILITY, JMAP_CALENDARS_CAPABILITY], [
    [JMAP_CALENDAR_GET_METHOD, { accountId, ids: null }, "cal1"],
  ]);
  const calendars: Array<{ id: string; isDefault?: boolean }> = body.methodResponses?.[0]?.[1]?.list ?? [];
  return calendars.find((c) => c.isDefault)?.id ?? calendars[0]?.id;
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

  // Caller-scoped client: time_entries RLS (own rows unless admin;
  // update/delete additionally requires is_invoiced = false for
  // non-admins) decides what this caller can touch -- no separate
  // authorization check is layered on top of it here.
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

  let body: { direction?: string; time_entry_id?: string };
  try {
    body = await req.json();
  } catch {
    return errorResponse(400, "invalid_body", "Expected a JSON body with `direction`.");
  }
  const direction = body.direction;
  if (direction !== "push" && direction !== "pull" && direction !== "bidirectional") {
    return errorResponse(400, "invalid_body", '`direction` must be one of "push", "pull", "bidirectional".');
  }
  if (direction === "bidirectional") {
    return errorResponse(501, "direction_not_implemented", 'direction "bidirectional" is not implemented yet.');
  }

  const credResult = await resolveJmapCredentials(supabaseUrl, serviceRoleKey);
  if (!credResult.credentials) {
    return errorResponse(500, credResult.errorCode!, credResult.errorMessage!);
  }
  const jmapAuth = `Bearer ${credResult.credentials.secret}`;

  let session: JmapSession;
  try {
    const sessionUrl = new URL("/.well-known/jmap", credResult.credentials.endpoint).toString();
    const sessionResp = await fetch(sessionUrl, { headers: { Authorization: jmapAuth } });
    if (!sessionResp.ok) throw new Error(`session discovery returned HTTP ${sessionResp.status}`);
    session = await sessionResp.json();
  } catch (err) {
    return errorResponse(
      502,
      "jmap_session_failed",
      `JMAP session discovery failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const accountId =
    session.primaryAccounts?.[JMAP_CALENDARS_CAPABILITY] ??
    (session.accounts ? Object.keys(session.accounts)[0] : undefined);
  if (!accountId) {
    return errorResponse(502, "jmap_no_account", "JMAP session has no usable account for the calendars capability.");
  }

  let calendarId: string | undefined;
  try {
    calendarId = await findDefaultCalendarId(session.apiUrl, jmapAuth, accountId);
  } catch (err) {
    return errorResponse(
      502,
      "jmap_calendar_lookup_failed",
      `${JMAP_CALENDAR_GET_METHOD} failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (!calendarId) {
    return errorResponse(502, "jmap_no_calendar", "The JMAP account has no calendar to sync events into.");
  }

  if (direction === "push") {
    const timeEntryId = body.time_entry_id?.trim();
    if (!timeEntryId) {
      return errorResponse(400, "invalid_body", "`time_entry_id` must be a non-empty string for direction=push.");
    }

    const { data: entry, error: entryError } = await callerClient
      .from("time_entries")
      .select("id, client_id, description, start_time, duration_minutes, calendar_event_id")
      .eq("id", timeEntryId)
      .single();
    if (entryError || !entry) {
      return errorResponse(404, "time_entry_not_found", `time_entries row ${timeEntryId} was not found.`);
    }

    const { data: client } = await callerClient.from("clients").select("name").eq("id", entry.client_id).single();

    // No `participants` (doesn't persist -- see file header): the client
    // is identified in the title text itself instead.
    const title = client?.name ? `${client.name} — ${entry.description}` : entry.description;
    const eventProps = {
      title,
      description: entry.description,
      start: toZonedDateTimeString(new Date(entry.start_time), JMAP_TIME_ZONE),
      timeZone: JMAP_TIME_ZONE,
      duration: toIsoDurationMinutes(entry.duration_minutes),
    };

    let setResult: {
      created?: Record<string, { id: string }>;
      updated?: Record<string, unknown>;
      notCreated?: Record<string, unknown>;
      notUpdated?: Record<string, unknown>;
    };
    try {
      const create = entry.calendar_event_id ? {} : { e1: { ...eventProps, calendarIds: { [calendarId]: true } } };
      const update = entry.calendar_event_id ? { [entry.calendar_event_id]: eventProps } : {};
      const setBody = await jmapCall(session.apiUrl, jmapAuth, [JMAP_CORE_CAPABILITY, JMAP_CALENDARS_CAPABILITY], [
        [JMAP_CALENDAR_EVENT_SET_METHOD, { accountId, create, update }, "c1"],
      ]);
      setResult = setBody.methodResponses?.[0]?.[1] ?? {};
    } catch (err) {
      return errorResponse(
        502,
        "jmap_set_failed",
        `JMAP ${JMAP_CALENDAR_EVENT_SET_METHOD} failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    const rejections = { ...setResult.notCreated, ...setResult.notUpdated };
    if (Object.keys(rejections).length > 0) {
      return errorResponse(502, "jmap_set_rejected", `Stalwart rejected the CalendarEvent: ${JSON.stringify(rejections)}`);
    }

    const newEventId = entry.calendar_event_id ?? setResult.created?.e1?.id;
    if (!newEventId) {
      return errorResponse(502, "jmap_set_failed", "CalendarEvent/set reported success but returned no id.");
    }

    // .select() so an RLS-blocked update (e.g. a non-admin touching an
    // already-invoiced, locked entry) is visible as 0 rows rather than a
    // false "success" -- update() alone doesn't surface that distinction.
    const { data: updatedRows, error: linkError } = await callerClient
      .from("time_entries")
      .update({ calendar_event_id: newEventId })
      .eq("id", timeEntryId)
      .select("id");
    if (linkError) {
      return errorResponse(500, "time_entry_update_failed", linkError.message);
    }
    if (!updatedRows || updatedRows.length === 0) {
      return errorResponse(
        403,
        "time_entry_locked",
        `time_entries row ${timeEntryId} could not be updated -- likely locked (is_invoiced) or not owned by the caller.`,
      );
    }

    return new Response(JSON.stringify({ calendar_event_id: newEventId }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // direction === "pull"
  const now = new Date();
  const after = new Date(now.getTime() - PULL_WINDOW_PAST_DAYS * 86_400_000).toISOString();
  const before = new Date(now.getTime() + PULL_WINDOW_FUTURE_DAYS * 86_400_000).toISOString();

  let eventIds: string[];
  try {
    const queryBody = await jmapCall(session.apiUrl, jmapAuth, [JMAP_CORE_CAPABILITY, JMAP_CALENDARS_CAPABILITY], [
      [JMAP_CALENDAR_EVENT_QUERY_METHOD, { accountId, filter: { after, before } }, "q1"],
    ]);
    eventIds = queryBody.methodResponses?.[0]?.[1]?.ids ?? [];
  } catch (err) {
    return errorResponse(
      502,
      "jmap_query_failed",
      `JMAP ${JMAP_CALENDAR_EVENT_QUERY_METHOD} failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // Exclude events already linked to one of the caller's own time_entries
  // rows -- RLS naturally scopes this to "their" calendar (own rows unless
  // admin), which is the right scope: pulling is about finding *this
  // caller's* unconverted events, not auditing everyone's.
  const { data: linkedRows, error: linkedError } = await callerClient
    .from("time_entries")
    .select("calendar_event_id")
    .not("calendar_event_id", "is", null);
  if (linkedError) {
    return errorResponse(500, "time_entries_load_failed", linkedError.message);
  }
  const linkedIds = new Set((linkedRows ?? []).map((r) => r.calendar_event_id as string));
  const candidateIds = eventIds.filter((id) => !linkedIds.has(id));

  if (candidateIds.length === 0) {
    return new Response(JSON.stringify({ events: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  let events: Array<{
    id: string;
    title?: string;
    description?: string | null;
    start?: string;
    duration?: string;
    timeZone?: string;
  }>;
  try {
    const getBody = await jmapCall(session.apiUrl, jmapAuth, [JMAP_CORE_CAPABILITY, JMAP_CALENDARS_CAPABILITY], [
      [JMAP_CALENDAR_EVENT_GET_METHOD, { accountId, ids: candidateIds }, "g1"],
    ]);
    events = getBody.methodResponses?.[0]?.[1]?.list ?? [];
  } catch (err) {
    return errorResponse(
      502,
      "jmap_get_failed",
      `JMAP ${JMAP_CALENDAR_EVENT_GET_METHOD} failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const result = events.map((event) => ({
    jmap_id: event.id,
    title: event.title ?? null,
    description: event.description ?? null,
    start_utc: event.start
      ? fromZonedDateTimeString(event.start, event.timeZone ?? JMAP_TIME_ZONE).toISOString()
      : null,
    duration_minutes: event.duration ? parseIsoDurationMinutes(event.duration) : null,
  }));

  return new Response(JSON.stringify({ events: result }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
