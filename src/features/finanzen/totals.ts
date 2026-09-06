import type { Database } from "@/lib/database.types";

type LedgerEntry = Database["public"]["Tables"]["ledger_entries"]["Row"];

/**
 * Ledger totals — `amount` is always stored positive (`CHECK (amount > 0)`,
 * see docs/DATABASE_SCHEMA.md §2); direction comes from `entry_type`, never
 * from the sign. Ported from the old app's
 * `features/ledger/presentation/cubit/ledger_state.dart` getters.
 */
export function totalIncome(entries: readonly LedgerEntry[]): number {
  return entries.filter((e) => e.entry_type === "income").reduce((sum, e) => sum + e.amount, 0);
}

export function totalExpense(entries: readonly LedgerEntry[]): number {
  return entries.filter((e) => e.entry_type === "expense").reduce((sum, e) => sum + e.amount, 0);
}

export function balance(entries: readonly LedgerEntry[]): number {
  return totalIncome(entries) - totalExpense(entries);
}
