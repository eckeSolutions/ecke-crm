# Roadmap

Living punch-list for the ecke-crm rebuild (Stencil design system + React PWA, off the
old Flutter/Dart app). The full architecture rationale is the plan referenced in
`README.md`; this file is the sequenced "what's next", updated in place as items close.

**Status (6 Sep 2026):** Phases 0-2 all **done** — design system at `v0.3.2`,
self-hosted stack on Postgres 17, the React app shell scaffolded and verified in a
real browser (login, routing, nav, RLS-scoped nav visibility, the 768px swap). Phase 3
(feature port) in progress — Kunden (clients + contacts) done, verified live.

---

## Decisions locked

| Area | Decision |
|---|---|
| Framework | **React 19** (Vite + TypeScript, `npm` — not `pnpm`, see Phase 2's first item). PWA via `vite-plugin-pwa` (Workbox). |
| App shell | **React Router v7** + **View Transitions API** (`navigate(href, { viewTransition: true })`) + headless overlays **from `ecke-ui`**. No `@ionic/react`, no Ionic platform layer — see the design system's `docs/ionic-framework-evaluation.md` Decision C (owner-confirmed 30 Aug 2026). `@ionic/core` `createGesture` may be imported standalone if a real gesture need appears. |
| Design system | Consumed as a **git submodule** at `vendor/design-system/`, pinned to a tag, built in place (`npm ci && npm run build` inside `vendor/design-system/stencil/`). Pinned to `v0.3.2` (bumped 6 Sep 2026 three times same-day — v0.3.0, then v0.3.1 for two nav icons Phase 2 needed, then v0.3.2 for eight more icons Phase 3's Kunden feature needed). A private npm package is the documented fallback, not the plan. |
| Backend | Supabase (self-hosted, Hetzner + Coolify), reused essentially unchanged from the retired Flutter repo. Single-tenant: `admin` + `employee`, per-user RLS, no `organization_id`. |
| Data | `@tanstack/react-query` v5 · `@supabase/supabase-js` v2 · `react-hook-form` + `zod` · generated DB types. |
| Offline | Installable + **online-first**. Service-worker precache of shell + DS assets; Supabase GETs `NetworkFirst`. No sync engine, no offline writes. Running stopwatch persisted to `localStorage`. |
| Schema changes | **No incremental migrations before production.** One migration file, edited in place; `supabase db reset` drops the DB, re-applies it and re-seeds `supabase/seed/*.sql` (dev accounts + ~40 clients / 60 invoices). Owner-confirmed 6 Sep 2026. Void the day real invoices exist. |
| GoBD / §19 | Every invoice shows the §19 UStG notice. Never build a flow that edits a `sent`/`paid` invoice — corrections are `cancelled` + a new draft. Invoice numbers come only from the server (RPC is preview-only). |

---

## Phase 0 — Design system ready to consume  *(in the design-system repo)*  ✅

`ecke-crm` was blocked on the DS cutting **`v0.3.0`** with a React output target and the
breaking prop renames done. Tracked in that repo's `ROADMAP.md`; summarised here
because Phase 2 pins the result.

- [x] `@stencil/react-output-target` wired; `vendor/design-system/stencil/react` emits
      typed, router-agnostic wrappers.
- [x] Prop-vocabulary alignment (breaking): `--*-tint-brand` → `-info`;
      `ecke-card` / `ecke-input` material axis `variant` → `surface`; `ecke-button`
      `variant` untangled into orthogonal `emphasis` + `tone` + `surface`.
- [x] New overlays the CRM needs: `ecke-toast`, `ecke-tooltip`, `ecke-combobox`;
      `ecke-dropdown` native `<select>` → APG select-only combobox (`native` prop keeps
      the old behaviour).
- [x] Interactive-contract tests (modal focus trap, tabs roving tabindex, table
      + form-control event payloads, the four new components) — 46 tests on the vitest
      browser project, wired into CI.
- [x] `v0.3.0` cut and pushed as an annotated tag.

**Done (5 Sep 2026, pin bumped here 6 Sep 2026, then to `v0.3.1` the same day —**
**two nav icons, `settings` + `wallet`, that Phase 2's app shell needed and the
fixed 19-name icon set didn't have).** `vendor/design-system` is checked out at
`v0.3.1`; see that repo's `CHANGELOG.md` for the full breaking-change list. Phase 2
must consume the renamed props (`emphasis`/`tone`/`surface`, `--*-tint-info`) from the
start — there is no compatibility shim.

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
- [x] `generate-pdf`: add font embedding (Asap / Source Sans 3). **Done 6 Sep
      2026.** Two real blockers, not a one-line change: (1) the design system's body
      face (`body.woff2`) is a *variable* font defaulting to wght 200 (ExtraLight) —
      pdf-lib/fontkit has no API to pick a different instance, so embedding it as-is
      renders the whole invoice too thin. Fixed by pre-instantiating static wght
      400 / 700 TTFs at build time with fontTools' `varLib.instancer`
      (`scripts/build-fonts.py`) — Deno's edge runtime has no fonttools/harfbuzz to do
      that at request time. (2) `supabase/edge-runtime` bundles a function's module
      graph before running it and does not carry sibling non-module files — a plain
      `Deno.readFile("./assets/*.ttf")` 404'd ("path not found:
      /var/tmp/sb-compile-edge-runtime/..."), so the fonts are inlined as base64
      string constants in a generated `.ts` module instead (part of the module graph,
      survives bundling). Also found while verifying the render with PyMuPDF: pdf-lib
      writes an embedded `.woff2`'s raw compressed bytes straight into the PDF's font
      stream instead of the decompressed sfnt the format requires — Chrome/Adobe
      tolerate it, MuPDF/FreeType don't (`unknown file format`) — so every font,
      including the three already-static wordmark faces, is repacked to plain `.ttf`
      by the same script. The invoice header now renders the real three-part
      `ecke`/`.`/`Solutions` wordmark (matching `components.css .wordmark`, one
      dedicated static face per part) instead of Helvetica standing in for it. Text
      wrapping and multi-page pagination (word-wrapped descriptions, page breaks that
      repeat the table header + footer) were already done. It remains the **single**
      PDF renderer — no client-side builder.
- [x] Dedupe `resolveJmapCredentials()` into `supabase/functions/_shared/`.
- [x] Bump the far-behind image set (`postgres:15.1.1.78`, `gotrue`, `postgrest`,
      `realtime`, `studio`); decide Postgres 15 → 17. **Done 6 Sep 2026 — Postgres
      17** (`supabase/postgres:17.6.1.168`), latest stable tag on every other image
      (`gotrue:v2.196.0`, `postgrest:v16.2`, `realtime:v2.134.6`,
      `storage-api:v1.73.0`, `postgres-meta:v0.99.0`, `edge-runtime:v1.76.2`,
      `studio:2026.09.04-sha-5a67366`). Verified live against both the Supabase CLI's
      local stack and the self-hosted `infrastructure/supabase` stack — schema +
      seeds load clean on Postgres 17, both dev accounts log in, RLS scopes them
      correctly (admin sees all 60 invoices, employee 26), all 4 Edge Functions and
      all 4 RPCs return through Kong. **Kept Kong** (bumped 3.4 → 3.9.3) rather than
      following upstream's move to Envoy + a Supavisor pooler + imgproxy — that's a
      config-format rewrite (Envoy's listener/route/cluster model, not Kong's
      declarative YAML), not a same-shape tag bump, and nothing in this repo's
      `kong.yml` uses a plugin Kong 3.9 deprecated. Revisit only if Kong itself is
      ever the problem. Four real bugs surfaced by the version jump, not just a tag
      edit:
      - `storage`'s `DATABASE_URL` connected as the plain `postgres` role, which
        pg17's stricter default grants no longer give USAGE on the `storage` schema
        (`permission denied for schema storage`) — reconnected as
        `supabase_storage_admin`, the same pattern `auth` already used.
      - `realtime`'s `DB_USER` was also plain `postgres`, same class of failure
        against the `_realtime` schema — changed to `supabase_admin` (confirmed
        against upstream's own compose; `supabase_admin`, not `postgres`, is the
        actual superuser role on this image).
      - `realtime` v2.134.6 hard-requires `METRICS_JWT_SECRET` at boot (new metrics
        endpoint auth) — without it the release config fails to evaluate at all,
        before ever touching the DB. Added, reusing `JWT_SECRET`.
      - `GOTRUE_JWT_DEFAULT_GROUP_NAME` (which this compose set) is deprecated as of
        gotrue v2.196.0 and silently no longer applied — its replacement,
        `GOTRUE_JWT_AUD`, was never set, so every password-grant login ran
        `... WHERE aud = ''` against users whose `aud = 'authenticated'`, matched
        zero rows, and 400'd "Invalid login credentials" — indistinguishable from a
        wrong password. Found by setting `GOTRUE_LOG_LEVEL=debug` and reading the
        actual SQL GoTrue issued. Fixed by adding `GOTRUE_JWT_AUD: authenticated`
        explicitly; this is very likely a live bug in the *old* Flutter repo's
        still-running self-hosted stack too if it's ever bumped past gotrue v2.151.
      `supabase/config.toml`'s `major_version` bumped 15 → 17 to match, re-verified
      `db reset` clean.
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
`invoice-pdfs` bucket, with the design system's own brand fonts. **Fully met 6 Sep
2026** — see the checked items for what was verified and fixed to get there. The one
remaining Phase 1 line is secrets hygiene's manual, owner-only Stalwart-key rotation
in the *old* repo.

---

## Phase 2 — App shell  *(this repo — greenfield)*  ✅

Depends on Phase 0's `v0.3.1` tag and a running Phase 1 backend. **Done 6 Sep 2026** —
every item below verified against a real browser (Puppeteer against the dev server),
not just "it compiles": login → dashboard → nav → sign-out, an employee vs. admin
account seeing different nav, a direct `/einstellungen` URL hit bouncing a non-admin,
a hard reload on a 2-level-deep route (`/kunden/:id/bearbeiten`) restoring correctly,
and the 768px sidebar↔bottom-nav swap, all screenshotted and read, not just asserted.

- [x] Scaffold Vite + React + TypeScript (`npm`, not `pnpm` — the plan's original
      choice; deviated because `pnpm` needed a manual global install with no lockfile
      benefit over `npm` once installed, and everything below was verified end-to-end
      under `npm`, including a subtle module-resolution bug switching package
      managers again could plausibly reintroduce, see the `resolve.dedupe` item
      below). **React 19**, not React 18 as the plan originally named — the design
      system's own `stencil/react` peer range already covers `^18 || ^19`, and 19 is
      current `create-vite`'s default now.
- [x] Add the DS submodule at `vendor/design-system/`, pin `v0.3.1`.
- [x] `postinstall` runs `npm --prefix vendor/design-system/stencil ci && ... run
      build:all` (package.json's `setup` script). Vite alias `@ds → vendor/design-system`
      (`vite.config.ts`, mirrored in `tsconfig.app.json`'s `paths` for editor/tsc
      resolution).
      **Real bug found and fixed:** `vendor/design-system/stencil/react` has its own,
      separate `node_modules` (its own `npm ci`, no workspace link to this project) —
      react/react-dom there resolve to a *different copy* of the same version than
      this project's, which breaks every hook the wrapper components call ("Invalid
      hook call" / "Cannot read properties of null (reading 'useRef')", confirmed
      live). Fixed with Vite's `resolve.dedupe: ["react", "react-dom"]`.
- [x] `main.tsx` imports `@ds/styles.css` (tokens + `components.css`) **and**
      `@ds/stencil/src/global/global.css` (`color-scheme: dark` + the
      `:not(:defined)` skeleton) — `styles.css` alone does **not** include the
      latter (it only `@import`s `tokens/*.css` + `components.css`); tracked as a
      design-system gap worth folding into `styles.css` itself, not duplicated by
      hand here (its skeleton tag list would then drift from the component list).
      PWA icons: the design system's own `assets/favicon/*` set (a real brand mark,
      the "e." dot logo) — the old Flutter app's `web/icons/*` were never
      customized past the generic Flutter logo, so there was nothing to "port" per
      the plan's original wording; used the DS's set directly instead.
- [x] React Router with every route from the routing table → `PlaceholderScreen`;
      `<RequireAuth>` (redirects to `/login`, stashes the attempted path);
      `<RequireAdmin>` on `/einstellungen` (redirects to `/`) — verified both the nav
      item hides for a non-admin **and** a direct URL hit is still blocked.
- [x] `AuthProvider` (session + profile via TanStack Query, keyed on `session.user.id`
      + advisory `isAdmin`) + `LoginPage` (`react-hook-form` + `zod`, `ecke-input` /
      `ecke-field` / `ecke-button` via a `Controller`-per-field pattern other forms
      can copy).
- [x] Ported `appShellStage()` → `src/shell/AppShell.tsx` + `AppShell.css` — same
      768px breakpoint, same structure, `ecke-sidebar-nav` ↔ `ecke-bottom-nav`.
      **Real bug found and fixed:** neither nav component's own `<a href>` is a
      React Router `<Link>` (they're plain anchors inside each component's shadow
      DOM, by design — see their source). A JSX `onClick` on the wrapping element
      does **not** reliably intercept them: React's root-delegated listener replay
      calls `preventDefault()` on the native event (confirmed `defaultPrevented ===
      true` in both places) yet the browser still followed the link anyway — same
      DOM, same `composedPath()`, only the *attachment method* differed from a
      working control test. Fixed with a real `addEventListener` via a ref
      (`useShellNavClick`) instead of a JSX prop; that reliably intercepts, checks
      modifier keys / non-left-clicks / `target="_blank"` / external hrefs same as a
      plain `<a>`, and calls `navigate(href, { viewTransition: true })`.
      Two of the six nav icons (Finanzen, Einstellungen) didn't exist in the design
      system's fixed 19-icon set — `settings` + `wallet` added there, released as
      `v0.3.1` (already reflected in the pin above; see that repo's own
      `CHANGELOG.md`). The sidebar's own footer renders a logout glyph but wires no
      event (decorative only, confirmed in its source) — real sign-out is a
      separate, always-visible icon button in `AppShell`, not a hack reaching into
      that shadow-internal element.
- [x] Route transitions via the View Transitions API — `navigate(href, {
      viewTransition: true })` in `useShellNavClick` (React Router's own
      integration, which `flushSync`s internally; hand-wrapping
      `document.startViewTransition()` around a bare `navigate()` call does not
      work correctly since React's state update isn't synchronous). No-ops safely
      without browser support.
- [x] `vite-plugin-pwa`: manifest (`theme_color`/`background_color` = `--bg-page`
      `#061b2b`, `display: standalone`, the DS's real icon set), Supabase REST GETs
      `NetworkFirst`; `OfflineBanner` (`ecke-notification`, tone `warning`) shows on
      `!navigator.onLine`, rendered once above the router so it survives a route
      change or a bounce to `/login` — screenshotted with `navigator.onLine` forced
      false to confirm it actually renders, not just that the hook compiles.
      **Deployment note for Phase 4:** a hard refresh on a deep route only works
      today because Vite's dev server has SPA fallback built in — the static file
      server Coolify serves `dist/` from needs the same (serve `index.html` for any
      unmatched path) or production refreshes will 404 where dev didn't.
- [x] `ci.yml`: `checkout` with `submodules: true` → `npm ci` (runs the
      design-system build via `postinstall`) → typecheck → ESLint → `vitest` →
      `vite build`.
- [x] `eslint.config.js` scoped to `src/` (flat config, ESLint 10 + typescript-eslint
      + react-hooks + react-refresh) — deliberately excludes `supabase/functions/**`
      (Deno Edge Functions: different runtime/globals, their own linter) and
      `vendor/` (the design system lints itself). Running unscoped surfaced 2
      pre-existing issues in `supabase/functions/` now visible for a future pass
      (`set-jmap-secret`'s unused `secretId` assignment, an `any` in
      `sync-calendar`) — not fixed here since they're outside a Deno-aware lint
      config's actual jurisdiction; noted for whenever this repo sets one up.
      `eslint-plugin-react-hooks@7`'s own `"recommended-latest"` export still uses
      the legacy eslintrc `plugins: ["react-hooks"]` shape, which ESLint 10's flat
      config rejects outright — worked around by registering the plugin object
      directly and spreading just its `rules`.
- [x] `vitest.config.ts` scoped to `src/**/*.test.{ts,tsx}` — the unscoped default
      also swept in `vendor/design-system/stencil/dist/**/*.cmp.test.js`, that
      submodule's own compiled browser-mode test output, which isn't meant for this
      project's jsdom environment (84 of them timed out before this was scoped).
      18 tests today: `formatEuro`/`formatDecimalDe`/`formatDateDe`/
      `formatDateShortDe`/`formatMonthAbbrevDe`, `sumLineTotals`/`roundMoney`, and
      the ledger `totalIncome`/`totalExpense`/`balance` trio.
- [x] `CLAUDE.md` (already existed from Phase 1, extended here) keeps the
      RLS/`is_admin()`/§19/no-edit-after-sent/one-migration-file/secrets rules and
      gains the app-shell conventions below — no separate `AGENT.md`, no Flutter
      mandates to drop (there were none in this repo to begin with).

**Done when:** log in, land on `/`, every nav target is a real URL, refresh on a deep
route restores it, and the 768px nav swap works. **Met.**

---

## Phase 3 — Feature port  *(this repo)*

Dependency order: **Auth → Kunden (clients + contacts) → Zeiterfassung → Rechnungen →
Finanzen → Einstellungen → Dashboard**. Each feature: TanStack Query hooks, `ecke-ui`
screens, `zod` forms, ported business logic, Vitest coverage. Features can overlap
after Kunden lands.

Business logic to port (from the old repo) and the routing table live in the
architecture plan — mirror the "Business logic to port" table into feature tickets as
each is picked up.

### Kunden (clients + contacts)  ✅  *(6 Sep 2026)*

List (search + "Alle"/"Mit offenen Rechnungen" filter chips + pagination), create/edit
form (company default hourly rate pre-filled via `get_default_hourly_rate()` RPC on
create), and detail (Stammdaten/Konditionen + 4 stat cards + a 6-month revenue bar
chart + recent invoices/time entries, all client-side aggregated from `invoices` +
`time_entries` — `clientDetailStats.ts`, unit-tested, ported from the old app's
`ContactsRepositoryImpl.getClientDetail`). All CRUD verified live against the seeded
40-client dataset with a real headless-browser run — create (rate pre-fill confirmed),
edit, delete (with cascade to contacts), search, pagination, filter — not just typechecked.

- [x] **New surface the old app never built:** a UI for the `contacts` table under
      `/kunden/:id` — an "Ansprechpartner" card with add/edit (any authenticated
      user)/delete (admin only, matching `contacts`' RLS — the delete button itself is
      hidden for a non-admin, not just left to fail server-side) via a modal, not its
      own route (no deep-link case for "editing contact X" on its own).
- [x] Stats stay client-side aggregation (ported from the old repo, not an RPC yet) —
      flagged here, as planned, as a candidate for a later Postgres view once data
      volume makes the client-side fetch (100 invoices + a year of time entries per
      client-detail visit) worth moving server-side.

Two things found while building this, beyond the feature itself:

- **`features/rechnungen/status.ts` moved to `lib/invoiceStatus.ts`.** Kunden's detail
  screen needs the same invoice-status label/tone mapping Rechnungen will — the old
  app kept the equivalent (`invoice_status_display.dart`) in `core/`, not inside its
  `invoicing` feature folder, for the exact same reason: this repo's extensibility
  contract forbids one feature reaching into another's internals, so anything more
  than one feature needs belongs in `lib/`, not the first feature that happened to
  need it.
- **Testing a Stencil form control by CSS attribute selector doesn't work.**
  `ecke-field[label="X"]` / `ecke-button[tone="danger"]` match nothing — most
  `@Prop()`s aren't `reflect: true`, so they're JS properties, not DOM attributes.
  Verification scripts need `Array.from(el.querySelectorAll(...)).find(e => e.label
  === "X")`, not an attribute selector. Not an app bug, but worth recording since it
  cost real time to isolate mid-verification.

### Remaining feature areas

- [ ] Zeiterfassung, Rechnungen, Finanzen, Einstellungen, Dashboard.
- [ ] Cross-screen handoff (time-tracking selection → invoice editor) via query params:
      `/rechnungen/neu?client=<id>&entries=<ids>`.

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
- Keep the old repo's `okf/` knowledge bundle? (Phase 2 `CLAUDE.md` port.)
- **UUIDv7 primary keys** — raised 6 Sep 2026, not decided. Every table currently
  uses `uuid_generate_v4()` (see `docs/DATABASE_SCHEMA.md` §2 for the full column
  reference). UUIDv7 embeds a millisecond timestamp in its high bits, so IDs sort
  roughly by creation time — the appeal for this app specifically is a future
  offline-write path: a client generating its own PK offline (a time-tracking
  stopwatch stopped on a plane, say) gets an ID that's already correctly ordered
  against server-generated rows once synced, without a separate `created_at`
  tiebreak or a server round-trip to get an ID before the row can be shown locally.
  Weighed against adopting it now: Postgres 17 (just bumped, above) has no native
  `uuidv7()` — needs `pg_uuidv7`/`pgcrypto`-adjacent extension or an app-side
  generator; `sortable-but-not-sequential` still leaks a rough creation-time signal
  clients can observe (irrelevant for a two-person internal tool, worth naming
  anyway); and this repo has **no offline-write path today** — [ROADMAP.md](#decisions-locked)'s
  own "Offline" row is explicitly online-first, no offline writes, so switching now
  buys nothing yet and only pays the migration cost once, later, when Phase 4+ or a
  post-launch phase actually adds one. Recommendation if that day comes: it's a
  one-column-type schema change (`uuid` stays `uuid`, only the generator changes),
  cheap under the current "no incremental migrations, `db reset` from scratch"
  rule — revisit `public.uuid_generate_v4()`'s callers in
  `20260101000000_initial_schema.sql` then, not before.
