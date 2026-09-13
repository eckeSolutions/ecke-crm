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

**Status:** Phases 0-2 done as of 6 Sep 2026 — design system, backend, and the React
app shell. Phase 3 (feature port) has five of six feature areas real and
live-verified as of 13 Sep 2026 — Kunden (clients + contacts), Zeiterfassung
(time tracking), Rechnungen (invoices), Finanzen (finance), Einstellungen (settings).
Only Dashboard remains a placeholder. See [`ROADMAP.md`](ROADMAP.md) for the phase
breakdown and locked decisions.

---

## Design system

`vendor/design-system/` is a git submodule pinned to a tagged release of
[eckeSolutions/ecke.Solutions-Design-System](https://github.com/eckeSolutions/ecke.Solutions-Design-System)
— currently **`v0.3.4`**. This replaces the old hand-copied brand CSS values; the pin
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
- **React wrappers** — since `v0.3.0`, `stencil/react/` emits typed, router-agnostic
  React wrappers via `@stencil/react-output-target`. Phase 2 imports components from
  there rather than registering custom elements by hand.

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
  migrations/             # 1 file — the current-state schema, edited in place
  seed/                   # loaded by `db reset` in filename order
    00_dev_baseline.sql   #   dev admin + employee accounts, company profile
    10_dev_dummy_data.sql #   ~40 clients, 60 invoices, ~226 time entries
  functions/              # 4 Edge Functions (JMAP sync + PDF) + main/ dispatcher
infrastructure/supabase/  # the self-hosted stack (Hetzner + Coolify), project "ecke-crm"
  docker-compose.yml      # + NEW edge-functions service; containers ecke-crm-*
  kong.yml.example        # + NEW /functions/v1 route; copy to volumes/api/kong.yml
  .env.example            # copy to .env; generate real JWT_SECRET / keys
```

### Schema

Full reference — ER diagram, table-by-table columns, RLS matrix, invoice lifecycle:
[`docs/DATABASE_SCHEMA.md`](docs/DATABASE_SCHEMA.md).

> **Pre-production rule: one migration file, edited in place.** There is no data worth
> preserving yet, so a schema change is not migrated — edit
> `20260101000000_initial_schema.sql`, run `supabase db reset` to drop and rebuild the
> database from scratch, and let the seeds refill it. No incremental migration files
> until the app goes live; at that point this rule is void and the file freezes as the
> baseline. Details in [`docs/DATABASE_SCHEMA.md` §12](docs/DATABASE_SCHEMA.md#12-changing-the-schema).

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
Supabase stack (Postgres + GoTrue + Storage system migrations), then seeds it. Verified
6 Sep 2026 end to end: both dev accounts log in through GoTrue, and RLS scopes what
they see (admin 60 invoices, employee 26). Also confirmed: RLS on all 9 tables, 15-min
round-up, the `invoice_items` → `time_entries` sync, first-user-is-admin, GoBD
immutability.

### Dev data

`db reset` rebuilds a fully populated database — no manual user creation:

| Account | Password | Role |
|---|---|---|
| `admin@ecke.test` | `devpassword` | admin (first user inserted) |
| `employee@ecke.test` | `devpassword` | employee |

plus a filled-in `company_settings` row, ~40 clients, ~84 contacts, 8 service
templates, 60 invoices (numbers 422+, mostly paid), ~266 line items and ~226 time
entries — ~30 of them uninvoiced, so the billing screen has something to bill. The
dataset is randomised but deterministic (`setseed()`). Local dev only; `.test` emails
are non-routable by RFC 2606.

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

## App

React 19 + TypeScript, built with Vite. Feature-first under `src/` — each feature owns
its own `routes.tsx`, spread into `App.tsx`'s router; nothing lives outside `src/`
until Phase 3 needs it.

```
src/
  main.tsx        # imports @ds/styles.css + @ds/stencil/src/global/global.css, mounts
                  # BrowserRouter > QueryClientProvider > AuthProvider > App
  App.tsx         # <Routes> — spreads every feature's routes.tsx, never defines one itself
  lib/            # supabase.ts, queryClient.ts, formatters.ts (DE locale), money.ts (§19),
                  # invoiceStatus.ts, duration.ts, pickers.ts (client/service-template
                  # fetchers + hooks shared by >1 feature — see CLAUDE.md),
                  # database.types.ts (generated — see "Regenerating types" below)
  auth/           # AuthProvider (session + profile + advisory isAdmin), RequireAuth,
                  # RequireAdmin, LoginPage
  shell/          # AppShell (ecke-sidebar-nav <-> ecke-bottom-nav @ 768px), nav-items,
                  # useShellNavClick (SPA-intercepts the nav components' own <a> clicks),
                  # OfflineBanner, InstallPrompt
  features/       # dashboard, kunden, zeiterfassung, rechnungen, finanzen, einstellungen
                  # — every feature but dashboard is real; dashboard is still a
                  # placeholder screen (Phase 3's last one)
```

### Run it

```bash
npm install                          # also builds vendor/design-system/stencil via postinstall
cp .env.example .env.local           # defaults already point at the Supabase CLI's local stack
npx --yes supabase@latest start      # if it isn't already running
npm run dev                          # http://localhost:5173
```

Dev-account logins (seeded by `supabase db reset`, see "Dev data" above):
`admin@ecke.test` / `employee@ecke.test`, both `devpassword`.

```bash
npm run typecheck   # tsc -b --noEmit
npm run lint        # ESLint, scoped to src/ — see CLAUDE.md's App shell conventions
                     # for why supabase/functions/ and vendor/ are excluded
npm test            # Vitest, scoped to src/**/*.test.{ts,tsx}
npm run build       # tsc -b && vite build -> dist/
npm run gen:types   # regenerate src/lib/database.types.ts after any schema change
npm run test:e2e    # Playwright — builds, then serves dist/ via vite preview
```

The e2e suite needs a running Supabase CLI stack with the seeds loaded (it logs in as
the real dev accounts and writes real rows — `supabase db reset` clears the
`E2E Testkunde …` clients it leaves behind). `E2E_BASE_URL=https://… npm run test:e2e`
runs the same specs against a deployed instance instead of a local preview.

Two real bugs worth knowing about if something here seems to work halfway and then
break in a confusing way — both covered in more depth in `CLAUDE.md`'s "App shell
conventions" and ROADMAP.md's Phase 2 entry:

- **A duplicate React copy.** `vendor/design-system/stencil/react` has its own
  `node_modules`; without `vite.config.ts`'s `resolve.dedupe`, its React differs from
  this project's own and every `ecke-*` component's hooks throw "Invalid hook call".
- **Nav clicks need a real `addEventListener`, not a JSX `onClick`.** The sidebar/
  bottom-nav components render plain `<a href>` inside their own shadow DOM; a
  React-delegated synthetic click handler cannot reliably `preventDefault()` the
  browser's default navigation for it. See `src/shell/useShellNavClick.ts`.
- **`<EckeButton type="submit">` does not submit a form.** It renders its real
  `<button>` inside a shadow root, and the HTML form-owner algorithm doesn't cross
  that boundary — the click fires no submit event at all, and Enter-to-submit is dead
  for the same reason. Use `Form` / `SubmitButton` from `src/shell/Form.tsx`. Found by
  the Phase 4 e2e suite, after three forms had shipped looking fine.

---

## Deploy

The app ships as a static SPA in a container: a Node 24 build stage, then
`caddy:2-alpine` serving `dist/`. The backend is the separate self-hosted Supabase
stack in `infrastructure/supabase/`, not part of this image.

```bash
docker build -t ecke-crm   --build-arg VITE_SUPABASE_URL=https://<your-supabase-host>   --build-arg VITE_SUPABASE_ANON_KEY=<anon key> .
docker run --rm -p 8080:80 ecke-crm
```

Three things to get right in Coolify:

- **`VITE_*` are build arguments, not runtime environment variables.** Vite inlines
  them into the bundle at build time; setting them on the service instead yields a
  build with an undefined Supabase URL that only fails once a browser loads it.
  Neither value is a secret (see `.env.example`) — the service-role key must never be
  passed here.
- **Enable submodules on the clone.** `vendor/design-system` is a git submodule and
  `npm run setup` builds it in place during the image build.
- **SPA fallback is mandatory** — `Caddyfile`'s `try_files {path} /index.html`. Without
  it, a hard refresh on any non-root URL 404s, which dev never shows you because
  Vite's dev server does this for you.

`Caddyfile` also sets caching: content-hashed `/assets/*` are `immutable`, everything
else is `no-cache`. That "everything else" is deliberately expressed as *not*
`/assets/*` rather than as a list of filenames — Caddy evaluates a `header` matcher
against the request path before `try_files` rewrites it, so a matcher on
`/index.html` would silently miss `/`, `/clients` and every other fallback URL.

---

## Verify

### 1. Migrations + `config.toml` — via the Supabase CLI (its own bundled stack)

Isolated from any other stack: containers are `supabase_*_ecke-crm`, ports 54321-54324.
**No need to stop the old `supabase` compose stack for this.**

```bash
# from repo root; no global install needed
npx --yes supabase@latest start        # first run pulls images (multi-GB)
npx --yes supabase@latest db reset     # schema from scratch + both seed files
```

Expect 0 errors and two "Seeding data from ..." lines, then (Studio at
http://127.0.0.1:54323, or the printed DB URL):

```sql
select tablename, rowsecurity from pg_tables where schemaname='public' order by 1;
-- 9 tables, all rowsecurity = t
select role, count(*) from profiles group by role;   -- 1 admin, 1 employee
select count(*) from invoices;                        -- 60, numbered from 422
-- set an invoice's status = 'sent', then UPDATE its total_amount
--   -> rejected by enforce_invoice_immutability
```

Then log both dev accounts in and confirm RLS scopes them — the admin sees all 60
invoices, the employee only their own:

```bash
ANON=$(npx --yes supabase@latest status -o json | python -c "import sys,json;print(json.load(sys.stdin)['ANON_KEY'])")
TOKEN=$(curl -s -X POST "http://127.0.0.1:54321/auth/v1/token?grant_type=password"   -H "apikey: $ANON" -H "Content-Type: application/json"   -d '{"email":"employee@ecke.test","password":"devpassword"}'   | python -c "import sys,json;print(json.load(sys.stdin)['access_token'])")
curl -s "http://127.0.0.1:54321/rest/v1/invoices?select=id"   -H "apikey: $ANON" -H "Authorization: Bearer $TOKEN"   -H "Prefer: count=exact" -H "Range: 0-0" -D - -o /dev/null | grep -i content-range
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

## Phase 1 remainder — all done, 6 Sep 2026

Every item this section used to track is closed; full detail (what broke, what fixed
it, what was verified live) is in [`ROADMAP.md`](ROADMAP.md)'s Phase 1 section, not
repeated here.

- ✅ `supabase db reset` — clean on Postgres 17 (below), both dev accounts log in, RLS
  scopes them correctly.
- ✅ Live-tested all 4 Edge Functions through Kong (`set-jmap-secret`'s Vault
  round-trip, `sync-contacts`/`sync-calendar` failing only at the real-Stalwart
  boundary, `generate-pdf` producing a valid, readable-back PDF). `jmap.ts` dedupe was
  already done. `generate-pdf` font embedding — the one item still open before — is
  now also done: real design-system brand fonts (a build-time step, not a runtime
  embed; see the function's own header comment for why).
- ✅ Image set bumped to **Postgres 17** (`supabase/postgres:17.6.1.168`) and the
  latest stable tag of every other image (`gotrue`, `postgrest`, `realtime`,
  `storage-api`, `postgres-meta`, `edge-runtime`, `studio`, `kong`) — kept Kong rather
  than following upstream's move to Envoy + Supavisor + imgproxy, a config-format
  rewrite unrelated to the actual ask. Four real permission/config bugs the version
  jump surfaced are documented in ROADMAP, including one — `GOTRUE_JWT_AUD` — that
  silently broke every login and would hit the *old* Flutter repo's still-running
  stack too if it's ever bumped past gotrue v2.151.
- ✅ Realtime `invalid_schema_name` — fixed for free by the 5 Sep bring-up fix (same
  root cause), confirmed still fixed after today's bump.
- ✅ `supabase/edge-runtime` tag (now `v1.76.2`) and the `main` dispatcher confirmed
  aligned — that's exactly what the live Edge Function tests above exercised.

The one item genuinely left is secrets hygiene's Stalwart-key rotation, which needs
the Stalwart admin console — a manual, owner-only action in the *old* repo, not
something to automate here.
