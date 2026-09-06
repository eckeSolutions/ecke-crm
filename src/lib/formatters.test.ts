import { describe, expect, it } from "vitest";

import { formatDateDe, formatDateShortDe, formatDecimalDe, formatEuro, formatMonthAbbrevDe } from "./formatters";

describe("formatEuro", () => {
  it("groups thousands with '.' and uses ',' for decimals", () => {
    expect(formatEuro(1234.5)).toBe("1.234,50 €");
  });

  it("handles small amounts with no grouping", () => {
    expect(formatEuro(49)).toBe("49,00 €");
  });

  it("keeps the minus sign on the outside of the grouped digits", () => {
    expect(formatEuro(-1234.5)).toBe("-1.234,50 €");
  });

  it("groups multiple thousands correctly", () => {
    expect(formatEuro(1234567.89)).toBe("1.234.567,89 €");
  });
});

describe("formatDecimalDe", () => {
  it("uses a comma decimal separator", () => {
    expect(formatDecimalDe(84.5, 1)).toBe("84,5");
  });

  it("defaults to 1 decimal place", () => {
    expect(formatDecimalDe(2)).toBe("2,0");
  });
});

describe("formatDateDe", () => {
  it("formats as DD.MM.YYYY", () => {
    expect(formatDateDe(new Date(2026, 6, 25))).toBe("25.07.2026");
  });

  it("pads single-digit day and month", () => {
    expect(formatDateDe(new Date(2026, 0, 5))).toBe("05.01.2026");
  });
});

describe("formatDateShortDe", () => {
  it("formats as DD.MM. with no year", () => {
    expect(formatDateShortDe(new Date(2026, 6, 25))).toBe("25.07.");
  });
});

describe("formatMonthAbbrevDe", () => {
  it("uses the German abbreviation, including the umlaut months", () => {
    expect(formatMonthAbbrevDe(new Date(2026, 2, 1))).toBe("Mär");
    expect(formatMonthAbbrevDe(new Date(2026, 4, 1))).toBe("Mai");
    expect(formatMonthAbbrevDe(new Date(2026, 9, 1))).toBe("Okt");
    expect(formatMonthAbbrevDe(new Date(2026, 11, 1))).toBe("Dez");
  });
});
