# ecke-crm — working rules

Private, self-hosted CRM for a German Kleinunternehmer (§19 UStG). Stencil design
system + React PWA on Supabase. See [README.md](README.md) for the layout and
[ROADMAP.md](ROADMAP.md) for what's next.

## Database: no incremental migrations before production

There is **one** migration — `supabase/migrations/20260101000000_initial_schema.sql` —
and it is **edited in place**. Do not add a second migration file.

There is no data worth preserving yet, so a schema change is a rebuild, not a patch:

```bash
# 1. edit supabase/migrations/20260101000000_initial_schema.sql
npx --yes supabase@latest db reset                                            # 2. drop, re-apply, re-seed
npx --yes supabase@latest gen types typescript --local > supabase/database.types.ts   # 3.
# 4. update docs/DATABASE_SCHEMA.md in the same commit
```

`db reset` refills the database from `supabase/seed/*.sql` (filename order, wired by
`[db.seed]` in `config.toml`):

- `00_dev_baseline.sql` — `admin@ecke.test` and `employee@ecke.test`, both
  `devpassword`, plus a filled-in `company_settings` row. The **first** `auth.users`
  insert becomes the admin, so the order of those two statements is load-bearing.
- `10_dev_dummy_data.sql` — ~40 clients, 60 invoices, ~226 time entries.

Never propose a `20260102…_add_column.sql`. **This rule is void once the app is live**
— GoBD-relevant invoices cannot be dropped and re-created, and from that point schema
changes are new timestamped migrations applied with `supabase db push`.

`db reset` is unconditional and destroys whatever database it points at. Only ever run
it against the local CLI stack; the self-hosted stack is touched with
`supabase db push --db-url ...`.

## Keep the schema doc honest

[`docs/DATABASE_SCHEMA.md`](docs/DATABASE_SCHEMA.md) is the prose view of that migration
— ER diagram, per-table columns, RLS matrix, invoice lifecycle, trigger behaviour. The
migration wins any disagreement, so update the doc in the same commit as the schema.

## Design system

`vendor/design-system/` is a git submodule pinned to a tag (currently `v0.3.2`), never
a floating branch. Bump it deliberately:

```bash
git -C vendor/design-system fetch --tags
git -C vendor/design-system checkout vX.Y.Z
git add vendor/design-system
```

Every value in the app is a `var(--token)` from that submodule. Dark-only — no light
mode, no `prefers-color-scheme` branch. React components come from
`vendor/design-system/stencil/react/`, not hand-registered custom elements.

**A design-system bug is filed as a GitHub issue, never patched here.** When something
in `vendor/design-system/` is broken — a component that doesn't do what its props
promise, a style that can't be reached from outside its shadow DOM, a missing export —
open an issue on
[eckeSolutions/ecke.Solutions-Design-System](https://github.com/eckeSolutions/ecke.Solutions-Design-System/issues)
(`gh issue create -R eckeSolutions/ecke.Solutions-Design-System --label bug`), with a
minimal repro, the measured evidence, the suggested fix, and which surfaces in this app
it affects. The owner fixes it there and cuts a tag; this repo then bumps the pin. Never
edit the submodule's source in place to unblock yourself — the pin is a tag, so a local
edit is invisible to CI (which clones the tag) and is lost on the next checkout. An
app-side workaround is fine in the meantime as long as it names the issue it's standing
in for and can be retired when the bump lands. Two open examples: `ecke-button
type="submit"` not submitting its form (#3, worked around by `src/shell/Form.tsx`) and
`ecke-input` never filling its container (#4, no workaround possible).

## App shell conventions (Phase 2)

- **Path aliases:** `@/*` → `src/*`, `@ds/*` → `vendor/design-system/*`. Defined in
  both `vite.config.ts` (`resolve.alias`) and `tsconfig.app.json` (`paths`) — keep
  them in sync, or the editor and the bundler disagree about what resolves.
- **`resolve.dedupe: ["react", "react-dom"]` in `vite.config.ts` is load-bearing, not
  cosmetic.** `vendor/design-system/stencil/react` has its own, separate
  `node_modules` — without dedupe, its React copy differs from this project's and
  every `ecke-*` wrapper's hooks break ("Invalid hook call"). Don't remove it while
  investigating a hook bug; that's almost certainly the cause.
- **A nav/link click inside an `ecke-*` component needs a real
  `addEventListener` via a ref, never a JSX `onClick` on the wrapping element.**
  `ecke-sidebar-nav` / `ecke-bottom-nav` render plain `<a href>` in their own shadow
  DOM; a click's `composedPath()` still finds it, but React's root-delegated
  synthetic dispatch does not reliably let `preventDefault()` stop the browser's own
  default navigation for a composed/shadow-crossing event (confirmed live — see
  ROADMAP.md's Phase 2 entry). `src/shell/useShellNavClick.ts` is the working
  pattern; reuse it rather than re-deriving this per feature.
- **Form controls (`ecke-input`, `ecke-dropdown`, `ecke-textarea`, …) are
  controlled custom elements, not native inputs** — wire them through
  `react-hook-form`'s `Controller`, reading the value from the component's own
  `onEckeInput`/`onEckeChange` event `detail` (a string), not `event.target.value`.
  `src/auth/LoginPage.tsx` is the reference implementation.
- **A form is submitted through `src/shell/Form.tsx`, never by an
  `ecke-button type="submit"`.** `ecke-button` is `shadow: true` and renders a plain
  `<button type="submit">` inside its own shadow root; the HTML form-owner algorithm
  does not cross a shadow boundary, so that button's `.form` is `null`, it is not a
  form-associated custom element, and clicking it fires **zero** submit events on the
  surrounding `<form>` (confirmed live in Playwright against a production build —
  login, the client form and the contact modal were all silently inert). Implicit
  submission via Enter inside `ecke-input` is dead for the same reason. Use `<Form>` +
  `<SubmitButton>`, which bridge both paths with `form.requestSubmit()`. The durable
  fix is to make `ecke-button` form-associated in the design system; until that lands,
  never reintroduce the bare `type="submit"` shape.
- **Each feature owns its own `routes.tsx`**, exporting a `const xRoutes = <>...
  </>;` — a JSX value (not a component function) containing `<Route>` elements —
  spread directly into `App.tsx`'s top-level `<Routes>`. A feature never edits
  `App.tsx` to add its own routes, and `App.tsx` never contains a route path/element
  pair directly.
- **`useAuth().isAdmin` is advisory only** — gates which nav items/buttons render,
  never a real permission check. RLS is the only real gate; a client-side admin
  check bypassed by devtools must still fail server-side. Where a table's own RLS
  restricts an action to admin (`clients`/`contacts` delete, see
  docs/DATABASE_SCHEMA.md §6), hide that action's button for a non-admin rather than
  showing it and letting the request 403 — Kunden's `ContactsSection` is the
  reference.
- **A piece of logic more than one feature needs belongs in `lib/`, not the first
  feature that happened to need it first.** `lib/invoiceStatus.ts` (label + `ecke-badge`
  tone per invoice status) started life inside `features/rechnungen/` and moved once
  Kunden's detail screen needed it too — mirrors the old app, which kept the
  equivalent in `core/`, not inside its `invoicing` feature folder.
- **Testing a Stencil control by CSS attribute selector doesn't work in a driver
  script.** `ecke-field[label="X"]` / `ecke-button[tone="danger"]` match nothing —
  most `@Prop()`s aren't `reflect: true`, so they're JS properties, not DOM
  attributes. Use `Array.from(el.querySelectorAll(...)).find(e => e.label === "X")`.

## GoBD, always

An invoice that has left `draft` is immutable, and the database enforces it. Never
build a flow that edits a `sent`/`paid` invoice — a correction is `cancelled` plus a
new draft. Invoice numbers come only from the server; the preview RPC is display sugar
and the client must never compute or pass `invoice_number`.
