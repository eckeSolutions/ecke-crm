import type { InvoiceStatus } from "@/lib/invoiceStatus";

/**
 * The GoBD state machine from docs/DATABASE_SCHEMA.md §3, as pure data —
 * the old app's `InvoiceListPage` offered every OTHER status as a quick-menu
 * option regardless of the current one (`for (status in InvoiceStatus.values)
 * if (status != current)`) and relied on the backend to reject an illegal
 * one; `markSent()` existed on its cubit but was never wired to any button
 * at all. This is the real fix: only ever offer a legal next state.
 *
 *   draft -> sent -> paid -> cancelled
 *                  \-> cancelled ------^
 *
 * No transition ever leads back to `draft`, and `cancelled` is terminal.
 */
const TRANSITIONS: Record<InvoiceStatus, readonly InvoiceStatus[]> = {
  draft: ["sent"],
  sent: ["paid", "cancelled"],
  paid: ["cancelled"],
  cancelled: [],
};

export function nextStatuses(current: InvoiceStatus): readonly InvoiceStatus[] {
  return TRANSITIONS[current];
}

export function canTransition(from: InvoiceStatus, to: InvoiceStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/**
 * Whether the line items (and client/date_issued/total) may still change.
 * Matches `enforce_invoice_items_immutability()` / `enforce_invoice_immutability()`
 * exactly: both freeze everything but `status`/`notes`/`pdf_storage_path`
 * the moment an invoice leaves `draft`.
 */
export function isEditable(status: InvoiceStatus): boolean {
  return status === "draft";
}
