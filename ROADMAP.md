# Roadmap

Living punch-list for the ecke-crm rebuild (Stencil design system + React PWA, off the
old Flutter/Dart app). The full architecture rationale is the plan referenced in
`README.md`; this file is the sequenced "what's next", updated in place as items close.

**Status (31 Aug 2026):** Phase 1 (backend) in progress. Phase 0 (design system) not
started. The React app (Phase 2+) does not exist yet.

---

## Decisions locked

| Area | Decision |
|---|---|
| Framework | **React** (Vite + TypeScript). PWA via `vite-plugin-pwa` (Workbox). |
| App shell | **React Router** (v6/v7) + **View Transitions API** or **Framer Motion** + headless overlays **from `ecke-ui`**. No `@ionic/react`, no Ionic platform layer — see the design system's `docs/ionic-framework-evaluation.md` Decision C (owner-confirmed 30 Aug 2026). `@ionic/core` `createGesture` may be imported standalone if a real gesture need appears. |
| Design system | Consumed as a **git submodule** at `vendor/design-system/`, pinned to a tag, built in place (`npm ci && npm run build` inside `vendor/design-system/stencil/`). Currently `v0.2.0`; Phase 2 pins `v0.3.0`. A private npm package is the documented fallback, not the plan. |
| Backend | Supabase (self-hosted, Hetzner + Coolify), reused essentially unchanged from the retired Flutter repo. Single-tenant: `admin` + `employee`, per-user RLS, no `organization_id`. |
| Data | `@tanstack/react-query` v5 · `@supabase/supabase-js` v2 · `react-hook-form` + `zod` · generated DB types. |
| Offline | Installable + **online-first**. Service-worker precache of shell + DS assets; Supabase GETs `NetworkFirst`. No sync engine, no offline writes. Running stopwatch persisted to `localStorage`. |
| GoBD / §19 | Every invoice shows the §19 UStG notice. Never build a flow that edits a `sent`/`paid` invoice — corrections are `cancelled` + a new draft. Invoice numbers come only from the server (RPC is preview-only). |

---

## Phase 0 — Design system ready to consume  *(in the design-system repo)*

`ecke-crm` is blocked on the DS cutting **`v0.3.0`** with a React output target and the
breaking prop renames done. Tracked in that repo's `ROADMAP.md`; summarised here
because Phase 2 pins the result.

- [ ] `@stencil/react-output-target` wired; `vendor/design-system/stencil/react` emits
      typed, router-agnostic wrappers.
- [ ] Prop-vocabulary alignment (breaking): `--*-tint-brand` → `-info`;
      `ecke-card` / `ecke-input` material axis `variant` → `surface`; `ecke-button`
      `variant` untangled into orthogonal `emphasis` + `tone`.
- [ ] New overlays the CRM needs: `ecke-toast`, `ecke-tooltip`, `ecke-combobox`;
      `ecke-dropdown` native `<select>` → real listbox.
- [ ] Interactive-contract tests (modal focus trap, tabs roving tabindex, table
      + form-control event payloads, the four new components).
- [ ] `v0.3.0` cut and pushed as an annotated tag.

**Done when:** `git -C vendor/design-system checkout v0.3.0` gives a buildable library
whose React wrappers render with the dark theme applied.

**Runs parallel to Phase 1.**

---

## Phase 1 — Backend: reuse + fix  *(this repo — in progress)*

- [x] Squash the old repo's 9 migrations into one current-state schema
      (`20260101000000_initial_schema.sql`) + the two folded fixes.
- [x] Adopt the Supabase CLI (`config.toml` — the old repo had none).
- [x] Wire an Edge Functions runtime container + Kong `/functions/v1` route into
      `infrastructure/supabase/`.
- [x] `supabase db reset` clean against a real stack; fix anything it surfaces.
- [x] Bring the self-hosted stack up; `supabase functions deploy` all 4. **Done 5 Sep
      2026** — surfaced and fixed real bugs along the way: `db`'s Postgres container was
      missing the standard `db-init/*.sql` scripts (now committed) that `ALTER USER ...
      WITH PASSWORD` the `supabase_auth_admin`/`storage_admin`/`authenticator`/
      `pgbouncer` roles and create the `_realtime`/`_supabase` schemas — without them
      `auth` and `storage` crash-loop on `password authentication failed` the moment
      they connect over the docker network (`127.0.0.1` uses `trust` in `pg_hba.conf`
      and masks this on a same-container test; every other source CIDR requires
      `scram-sha-256`, where it actually surfaces), and this **is** the Realtime
      `invalid_schema_name` crash noted below — now fixed, not just deemed optional.
      Also added the missing `db` host port (`5432:5432`, needed for `db push`) and a
      `db-config` named volume (persists pgsodium's key across restarts, so Vault
      secrets keep decrypting). README's own `cp ../kong.yml.example` path was wrong
      too (the file is at `infrastructure/supabase/kong.yml.example`, no `../`) — fixed.
- [x] **Live-test each Edge Function** through Kong with a real JWT. **Done 5 Sep
      2026**, against both the Supabase CLI's local stack and the actual self-hosted
      `infrastructure/supabase/docker-compose.yml` stack (the latter specifically
      exercises `supabase/functions/main/index.ts`'s `EdgeRuntime.userWorkers`
      dispatcher, which the CLI stack bypasses entirely): `set-jmap-secret`'s
      create-then-update Vault round-trip verified end to end; `sync-contacts` /
      `sync-calendar` verified through real auth + RLS + `resolveJmapCredentials()`,
      failing only at the expected boundary (no real Stalwart reachable from here);
      `generate-pdf` rendered a real 35-item, 2-page invoice with a wrapped long
      description — confirmed correct on read-back. Found and fixed two real bugs this
      surfaced: (1) PostgREST wasn't exposing the `vault` schema at all
      (`[api].schemas` / `PGRST_DB_SCHEMAS` — the self-hosted compose hardcoded a
      literal that ignored `.env`'s value entirely, also fixed), so every Vault call
      500'd with `Invalid schema: vault` before reaching Postgres; (2) `set-jmap-secret`
      called `vault.update_secret` with a param named `id` — the installed
      `supabase_vault` 0.3.1's actual signature uses `secret_id`, so PostgREST silently
      404'd on unnamed-parameter mismatch instead of erroring on a type mismatch.
- [ ] `generate-pdf`: add font embedding (Asap / Source Sans 3) — text wrapping and
      multi-page pagination are done (word-wrapped descriptions, page breaks that
      repeat the table header + footer). Confirm it is the **single** PDF renderer (no
      client-side builder — the old app's drift trap).
- [x] Dedupe `resolveJmapCredentials()` into `supabase/functions/_shared/`.
- [ ] Bump the far-behind image set (`postgres:15.1.1.78`, `gotrue`, `postgrest`,
      `realtime`, `studio`); decide Postgres 15 → 17. Contained sub-task, DB backup
      first — don't let it block the function work. **Checked 5 Sep 2026:** upstream
      `supabase/supabase`'s own compose has moved past a same-shape bump — Kong is
      replaced by `envoyproxy/envoy` (Kong kept only as a network alias for
      compatibility) and a `supavisor` pooler was added, Postgres now defaults to 17.x,
      and PostgREST/Realtime/Storage have each jumped 2+ major versions. Needs a
      deliberate pass against a running stack (`docker compose up` + `db reset` to
      verify), not a blind tag swap — do this with Docker available, not blocked-and-
      guessed.
- [ ] Secrets hygiene: obvious placeholders in every tracked `*.example`; rotate the
      real-looking Stalwart key in the git-ignored `supabase/functions/.env`. **Checked
      5 Sep 2026:** every tracked `*.example` in this repo is already a placeholder —
      no real secret is tracked. `supabase/functions/.env` doesn't exist in *this* repo;
      the real Stalwart key this bullet means is the one still sitting in
      `ecke.Solutions CRM_old/supabase/functions/.env` on this machine. Rotating it
      needs the Stalwart admin console — a manual, owner action, not something to do
      unattended from here.
- [x] Realtime `invalid_schema_name` crash — was going to be left **optional**
      (online-first doesn't need it), but turned out to be the same root cause as the
      self-hosted bring-up bug above and got fixed for free.

**Done when:** a clean stack comes up, all 4 functions return correctly through Kong,
and `generate-pdf` produces a wrapped, paginated, §19-compliant A4 PDF into the
`invoice-pdfs` bucket. **Met 5 Sep 2026** (font embedding is the one still-open item,
tracked above) — see the checked items for what was verified and fixed to get there.

---

## Phase 2 — App shell  *(this repo — greenfield)*

Depends on Phase 0's `v0.3.0` tag and a running Phase 1 backend.

- [ ] Scaffold Vite + React 18 + TypeScript (`pnpm`).
- [ ] Add the DS submodule at `vendor/design-system/`, pin `v0.3.0`; a `postinstall`
      (or `make setup`) builds its `stencil/`. Vite alias `@ds → vendor/design-system`.
- [ ] `import '../vendor/design-system/styles.css'` in `main.tsx` (tokens +
      `color-scheme: dark` + skeleton).
- [ ] React Router with every route from the routing table → placeholder screens;
      `<RequireAuth>`; `/einstellungen` admin-only.
- [ ] `AuthProvider` (session + profile + advisory `isAdmin`) + login screen.
- [ ] Port `appShellStage()` → `src/shell/AppShell.tsx` — `ecke-sidebar-nav` ↔
      `ecke-bottom-nav` swap at 768px (the shell owns the breakpoint).
- [ ] Route transitions via the View Transitions API (or Framer Motion).
- [ ] `vite-plugin-pwa` + `manifest.webmanifest` (`theme_color` / `background_color` =
      `--bg-page`, `display: standalone`); offline banner on `!navigator.onLine`.
- [ ] CI (`ci.yml`): `checkout` with `submodules: true` → build submodule `stencil/` →
      typecheck + ESLint + `vitest` + `vite build`.
- [ ] Slimmed `CLAUDE.md` / `AGENT.md` ported into this repo (keep the RLS / `is_admin()`
      / §19 / no-edit-after-sent / timestamped-migrations / secrets rules; drop the
      Flutter mandates).

**Done when:** log in, land on `/`, every nav target is a real URL, refresh on a deep
route restores it, and the 768px nav swap works.

---

## Phase 3 — Feature port  *(this repo)*

Dependency order: **Auth → Kunden (clients + contacts) → Zeiterfassung → Rechnungen →
Finanzen → Einstellungen → Dashboard**. Each feature: TanStack Query hooks, `ecke-ui`
screens, `zod` forms, ported business logic, Vitest coverage. Features can overlap
after Kunden lands.

Business logic to port (from the old repo) and the routing table live in the
architecture plan — mirror the "Business logic to port" table into feature tickets as
each is picked up.

- [ ] **New surface the old app never built:** a UI for the `contacts` table under
      `/kunden/:id`.
- [ ] Cross-screen handoff (time-tracking selection → invoice editor) via query params:
      `/rechnungen/neu?client=<id>&entries=<ids>`.
- [ ] Stats stay client-side aggregation initially (port from the old repo); flag for a
      later Postgres view / RPC.

**Done when:** all six feature areas work end to end against the live backend, with the
old cubit tests' intent reproduced as `useInvoiceEditor` / `totals` / `useStopwatch`
tests.

---

## Phase 4 — PDF wiring, polish, ship  *(this repo)*

- [ ] Invoice editor: HTML/CSS live preview (approximate) + "PDF erstellen" calls
      `generate-pdf` and streams the stored object from the bucket.
- [ ] Playwright e2e for the three critical flows: **Auth**, **Time Tracking**,
      **Invoicing**.
- [ ] Install prompt; app shell loads offline; data calls show the offline banner.
- [ ] Lighthouse PWA audit passes.
- [ ] Coolify deploy (static `dist/`, same infra as the backend).

**Done when:** the PWA is installed, deep-linkable, and produces a legally-correct
invoice PDF from a real time-tracking → invoice flow.

---

## Open questions

- **Submodule vs npm package** for the design system — submodule is the plan; revisit
  the private-package fallback if the "build the submodule on every clone/CI" step
  proves too heavy.
- **`@stencil/react-output-target` major** — confirm its React 18/19 prop-vs-attribute
  and event handling before Phase 0 freezes the wrapper API.
- **Postgres 15 → 17** — decide during the Phase 1 image bump.
- Keep the old repo's `okf/` knowledge bundle? (Phase 2 `CLAUDE.md` port.)
