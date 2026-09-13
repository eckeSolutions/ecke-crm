import { describe, expect, it } from "vitest";

import { computeInvoiceTotal, computeLineTotal } from "./totals";

describe("computeLineTotal", () => {
  it("multiplies quantity by unit price", () => {
    expect(computeLineTotal(3, 60)).toBe(180);
  });

  it("rounds to the nearest cent", () => {
    expect(computeLineTotal(0.75, 60)).toBe(45);
    expect(computeLineTotal(3, 33.335)).toBeCloseTo(100.01, 2);
  });

  it("handles a zero quantity", () => {
    expect(computeLineTotal(0, 60)).toBe(0);
  });
});

describe("computeInvoiceTotal", () => {
  it("sums line totals", () => {
    expect(computeInvoiceTotal([{ line_total: 100 }, { line_total: 50 }])).toBe(150);
  });

  it("returns 0 for no items", () => {
    expect(computeInvoiceTotal([])).toBe(0);
  });

  it("avoids float drift across many small lines", () => {
    const items = Array.from({ length: 10 }, () => ({ line_total: 0.1 }));
    expect(computeInvoiceTotal(items)).toBe(1);
  });
});
