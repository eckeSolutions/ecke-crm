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
- [ ] `supabase db reset` clean against a real stack; fix anything it surfaces.
- [ ] Bring the self-hosted stack up; `supabase functions deploy` all 4.
- [ ] **Live-test each Edge Function** through Kong with a real JWT — especially JMAP
      (`sync-contacts` / `sync-calendar`) against a running Stalwart, and
      `set-jmap-secret` writing a Vault secret.
- [ ] `generate-pdf`: add font embedding (Asap / Source Sans 3), text wrapping, and
      multi-page pagination. Confirm it is the **single** PDF renderer (no client-side
      builder — the old app's drift trap).
- [ ] Dedupe `resolveJmapCredentials()` into `supabase/functions/_shared/`.
- [ ] Bump the far-behind image set (`postgres:15.1.1.78`, `gotrue`, `postgrest`,
      `realtime`, `studio`); decide Postgres 15 → 17. Contained sub-task, DB backup
      first — don't let it block the function work.
- [ ] Secrets hygiene: obvious placeholders in every tracked `*.example`; rotate the
      real-looking Stalwart key in the git-ignored `supabase/functions/.env`.
- [ ] Realtime `invalid_schema_name` crash — **optional**, online-first doesn't need it.

**Done when:** a clean stack comes up, all 4 functions return correctly through Kong,
and `generate-pdf` produces a wrapped, paginated, §19-compliant A4 PDF into the
`invoice-pdfs` bucket.

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
