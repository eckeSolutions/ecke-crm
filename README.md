# ecke-crm

Rebuild of the ecke.Solutions CRM as a Stencil design system + React PWA, off the old
Flutter/Dart app. A private, self-hosted CRM for a German Kleinunternehmer (§19 UStG):
clients, contacts, time tracking, GoBD-compliant invoicing, a simple income/expense
ledger, company settings.

Architecture plan: `~/.claude/plans/i-pivoted-form-a-sparkling-scott.md` (rationale).
Sequenced work: [`ROADMAP.md`](ROADMAP.md).
Source repos it draws from: `../ecke.Solutions CRM_old` (retired Flutter app — the
backend was lifted from it, see below), and the design system, vendored as a pinned
submodule at `vendor/design-system/` (see [Design system](#design-system)).

**Status:** Phase 1 (backend) in progress. The React app (Phase 2+) does not exist yet.
See [`ROADMAP.md`](ROADMAP.md) for the phase breakdown and locked decisions.

---

## Design system

`vendor/design-system/` is a git submodule pinned to a tagged release of
[eckeSolutions/ecke.Solutions-Design-System](https://github.com/eckeSolutions/ecke.Solutions-Design-System)
— currently **`v0.2.0`**. This replaces the old hand-copied brand CSS values; the pin
is bumped deliberately, never floating.

```bash
git clone --recurse-submodules https://github.com/eckeSolutions/ecke-crm.git
# or, in an existing clone:
git submodule update --init
```

Phase 2 (the React PWA) consumes it directly — no build step of its own:

- **Design tokens** — import `vendor/design-system/tokens/*.css` (`colors`, `spacing`,
  `typography`, `fonts`), or the bundled `vendor/design-system/styles.css` which also
  pulls in `components/components.css`. Every value in the app is a `var(--token)` from
  these files. Dark-only — no light mode, no `prefers-color-scheme` branch.
- **Components** — the framework-agnostic Stencil web components under
  `vendor/design-system/stencil/` (separate npm project, see its own `readme.md`).
  `stencil/` is the single owned component library; ship none of Ionic's.

Bumping the pin when a new tag lands:

```bash
git -C vendor/design-system fetch --tags
git -C vendor/design-system checkout vX.Y.Z
git add vendor/design-system && git commit -m "chore: bump design-system to vX.Y.Z"
```

`vendor/design-system/CHANGELOG.md` tracks what changed between tags.

---

## Backend

Reused essentially unchanged from the old repo — the database layer was never
Flutter-specific. Single-tenant: `admin` + `employee` roles, per-user RLS, no
`organization_id`.

### Layout

```
supabase/
  config.toml             # Supabase CLI link (the old repo had none)
  migrations/              # 1 file — squashed current-state schema (see below)
  functions/              # 4 Edge Functions (JMAP sync + PDF) + main/ dispatcher
infrastructure/supabase/  # the self-hosted stack (Hetzner + Coolify), project "ecke-crm"
  docker-compose.yml      # + NEW edge-functions service; containers ecke-crm-*
  kong.yml.example        # + NEW /functions/v1 route; copy to volumes/api/kong.yml
  .env.example            # copy to .env; generate real JWT_SECRET / keys
  seed/dev_dummy_data.sql
```

### Migrations

Squashed from the old repo's 9 incremental migrations into **one** current-state
schema. The old project's granular history stays in *its* git — a greenfield repo
with no production data to preserve doesn't need to replay it.

**`20260101000000_initial_schema.sql`** — everything: extensions, 9 tables in final
form, `is_admin()` + 32 RLS policies, 12 triggers, 4 RPCs, `invoice_number_seq`
(starts 422), the `invoice-pdfs` bucket + policy, the single `company_settings` row.
Folds in two fixes:

- explicit `CREATE EXTENSION "uuid-ossp"` — the old schema left it commented, relying
  on the `supabase/postgres` image preinstalling it;
- an `AFTER INSERT/DELETE ON invoice_items` trigger keeping `time_entries.is_invoiced`
  / `invoice_id` in sync — documented in the old `docs/DATABASE_SCHEMA.md`, never
  migrated (the Flutter client patched it in app code).

The old repo's `…_add_mfa_phone_config` migration was **dropped**: phone MFA
(`auth.factor_type = 'phone'`, `auth.mfa_factors.phone`, …) is native in modern GoTrue.
That file was a 2024 workaround for an older GoTrue and can't be applied by the CLI's
non-superuser role anyway (`must be owner of type auth.factor_type`). The app's
phone-MFA feature uses native GoTrue MFA — toggled via `[auth.mfa.phone]` in
`config.toml`, no schema change.

`supabase db reset` applies `20260101000000_initial_schema.sql` clean against a real
Supabase stack (Postgres + GoTrue + Storage system migrations). An earlier stubbed
smoke test also confirmed: RLS on all 9 tables, 15-min round-up, the new
`invoice_items` → `time_entries` sync, first-user-is-admin, GoBD immutability.

### Edge Functions

`generate-pdf`, `set-jmap-secret`, `sync-contacts`, `sync-calendar` — copied verbatim;
**never deployed or run end-to-end in the old project** (its self-hosted stack had no
functions runtime and no Kong route). Now wired:

- `infrastructure/supabase/docker-compose.yml` runs a `supabase/edge-runtime` container
  (`ecke-crm-edge-functions`) whose single entrypoint is `supabase/functions/main/index.ts`
  (spawns a worker per request, keyed on the first path segment).
- `kong.yml.example` adds `POST /functions/v1/<name>` → the runtime.

Still TODO in Phase 1: bring the stack up, live-test each function with a real JWT
(especially JMAP against Stalwart), and add font embedding + text wrap + pagination to
`generate-pdf`. Dedupe the copy-pasted `resolveJmapCredentials()` in
`sync-contacts` / `sync-calendar` into `functions/_shared/`.

---

## Verify

### 1. Migrations + `config.toml` — via the Supabase CLI (its own bundled stack)

Isolated from any other stack: containers are `supabase_*_ecke-crm`, ports 54321-54324.
**No need to stop the old `supabase` compose stack for this.**

```bash
# from repo root; no global install needed
npx --yes supabase@latest start        # first run pulls images (multi-GB)
npx --yes supabase@latest db reset     # applies the schema migration from scratch
```

Expect 0 errors, then (Studio at http://127.0.0.1:54323, or the printed DB URL):

```sql
select tablename, rowsecurity from pg_tables where schemaname='public' order by 1;
-- 9 tables, all rowsecurity = t
-- create two auth users -> first profiles.role = 'admin', second = 'employee'
-- insert a draft invoice + item with linked_time_entry_id
--   -> that time_entries row flips is_invoiced = true, invoice_id set
-- set the invoice status = 'sent', then UPDATE its total_amount
--   -> rejected by enforce_invoice_immutability
```

Then generate the app's DB types (used in Phase 2):

```bash
npx --yes supabase@latest gen types typescript --local > supabase/database.types.ts
```

### 2. Self-hosted stack — the deployed artifact (heavier integration test)

The old repo's stack (Compose project `supabase`, containers `supabase-*`) may still be
running. This one is project **`ecke-crm`**, containers **`ecke-crm-*`**, so the names
don't collide — but both publish host port **8000**, so stop the old one first:

```bash
docker compose -p supabase down          # old stack; keeps its ./volumes data
cd infrastructure/supabase
cp .env.example .env                      # set POSTGRES_PASSWORD; generate JWT_SECRET +
                                          # ANON_KEY + SERVICE_ROLE_KEY + REALTIME_SECRET_KEY_BASE;
                                          # set DASHBOARD_*
cp ./kong.yml.example volumes/api/kong.yml    # set the two dashboard credentials
docker compose up -d                      # -> ecke-crm-db, ecke-crm-kong, ...
npx --yes supabase@latest db push --db-url "postgresql://postgres:<POSTGRES_PASSWORD>@localhost:5432/postgres"
curl -sX POST http://localhost:8000/functions/v1/set-jmap-secret \
  -H "Authorization: Bearer <a real admin user JWT>" \
  -H "Content-Type: application/json" -d '{"secret":"test"}'
```

---

## Not done yet (Phase 1 remainder)

- Run `supabase db reset` (started); fix anything it surfaces.
- Live-test the 4 Edge Functions through Kong; `functions/_shared/jmap.ts` dedupe;
  `generate-pdf` fonts/wrap/pagination.
- Bump the far-behind image set (`supabase/postgres:15.1.1.78`, `gotrue:v2.151.0`,
  `postgrest:v12.0.1`, `realtime:v2.30.23`, `studio:20240729-*`) to a current
  self-host bundle; decide Postgres 15 → 17.
- Realtime `invalid_schema_name` crash — optional (online-first CRM doesn't need it).
- Confirm the `supabase/edge-runtime` image tag + `main` dispatcher API line up.
