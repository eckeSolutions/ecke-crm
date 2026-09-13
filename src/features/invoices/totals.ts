import { roundMoney, sumLineTotals } from "@/lib/money";

/**
 * Pure math for the invoice editor's item list. `computeLineTotal` is the
 * one new piece — `sumLineTotals`/`roundMoney` already exist in `lib/money`
 * (the §19 UStG "no VAT anywhere" module) and are reused here rather than
 * re-implemented, per CLAUDE.md's "more than one feature needs it" rule
 * working the other direction: this is the second consumer of an
 * already-shared function, not a reason to fork it.
 */

/** `quantity * unit_price`, rounded to cents — `invoice_items.line_total` is stored, not computed (docs/DATABASE_SCHEMA.md §2), so this is run once at add/edit time, not on every render. */
export function computeLineTotal(quantity: number, unitPrice: number): number {
  return roundMoney(quantity * unitPrice);
}

/** The invoice's `total_amount` — same rounding as a line total, so a run of already-rounded cents doesn't drift from float summation. */
export function computeInvoiceTotal(items: readonly { line_total: number }[]): number {
  return roundMoney(sumLineTotals(items));
}
