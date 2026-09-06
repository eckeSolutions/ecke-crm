import { describe, expect, it } from "vitest";

import { roundMoney, sumLineTotals, USTG_NOTICE } from "./money";

describe("sumLineTotals", () => {
  it("sums the line_total field across items", () => {
    expect(sumLineTotals([{ line_total: 10.5 }, { line_total: 20 }, { line_total: 5.25 }])).toBe(35.75);
  });

  it("returns 0 for no items", () => {
    expect(sumLineTotals([])).toBe(0);
  });
});

describe("roundMoney", () => {
  it("rounds to 2 decimal places, correcting float drift", () => {
    expect(roundMoney(0.1 + 0.2)).toBe(0.3);
  });
});

describe("USTG_NOTICE", () => {
  it("is the exact §19 UStG wording every invoice must show", () => {
    expect(USTG_NOTICE).toBe("Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.");
  });
});
