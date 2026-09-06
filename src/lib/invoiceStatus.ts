// The `status` column is `text CHECK (status IN (...))` (docs/DATABASE_SCHEMA.md
// §3), not a native Postgres enum, so `supabase gen types` widens it to plain
// `string` in database.types.ts — this literal union is hand-kept in sync with
// that CHECK constraint instead, for real exhaustiveness checking here.
export type InvoiceStatus = "draft" | "sent" | "paid" | "cancelled";

/**
 * Shared German label + `ecke-badge` tone mapping for an invoice's status —
 * used everywhere a status is displayed (Kundendetails, Zeiterfassung
 * selection bar, Rechnungen list/editor). Ported from the old app's
 * `core/presentation/invoice_status_display.dart` — which lived in `core/`,
 * not inside its `invoicing` feature folder either, for the same reason
 * this lives in `lib/` and not `features/rechnungen/`: more than one
 * feature displays an invoice's status, and this repo's extensibility
 * contract (README/ROADMAP's Part C) forbids one feature reaching into
 * another's internals.
 */
export const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = {
  draft: "Entwurf",
  sent: "Offen",
  paid: "Bezahlt",
  cancelled: "Storniert",
};

export const INVOICE_STATUS_TONE: Record<InvoiceStatus, "neutral" | "warning" | "success" | "danger"> = {
  draft: "neutral",
  sent: "warning",
  paid: "success",
  cancelled: "danger",
};
