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

`vendor/design-system/` is a git submodule pinned to a tag (currently `v0.3.0`), never
a floating branch. Bump it deliberately:

```bash
git -C vendor/design-system fetch --tags
git -C vendor/design-system checkout vX.Y.Z
git add vendor/design-system
```

Every value in the app is a `var(--token)` from that submodule. Dark-only — no light
mode, no `prefers-color-scheme` branch. React components come from
`vendor/design-system/stencil/react/`, not hand-registered custom elements.

## GoBD, always

An invoice that has left `draft` is immutable, and the database enforces it. Never
build a flow that edits a `sent`/`paid` invoice — a correction is `cancelled` plus a
new draft. Invoice numbers come only from the server; the preview RPC is display sugar
and the client must never compute or pass `invoice_number`.
