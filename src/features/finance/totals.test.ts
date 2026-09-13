import { describe, expect, it } from "vitest";

import type { Database } from "@/lib/database.types";

import { balance, totalExpense, totalIncome } from "./totals";

type LedgerEntry = Database["public"]["Tables"]["ledger_entries"]["Row"];

function entry(overrides: Partial<LedgerEntry>): LedgerEntry {
  return {
    id: "00000000-0000-0000-0000-000000000000",
    profile_id: "00000000-0000-0000-0000-000000000000",
    entry_date: "2026-01-01",
    entry_type: "expense",
    category: null,
    description: "test",
    amount: 0,
    receipt_storage_path: null,
    created_at: null,
    updated_at: null,
    ...overrides,
  };
}

describe("ledger totals", () => {
  const entries = [
    entry({ entry_type: "income", amount: 500 }),
    entry({ entry_type: "income", amount: 250 }),
    entry({ entry_type: "expense", amount: 100 }),
  ];

  it("sums income only from income entries", () => {
    expect(totalIncome(entries)).toBe(750);
  });

  it("sums expense only from expense entries", () => {
    expect(totalExpense(entries)).toBe(100);
  });

  it("balance is income minus expense, direction from entry_type not the sign", () => {
    expect(balance(entries)).toBe(650);
  });

  it("returns 0 for an empty ledger", () => {
    expect(totalIncome([])).toBe(0);
    expect(totalExpense([])).toBe(0);
    expect(balance([])).toBe(0);
  });
});
