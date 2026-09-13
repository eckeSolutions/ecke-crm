import { describe, expect, it } from "vitest";

import { computeDurationMinutes, durationHours } from "./duration";

describe("computeDurationMinutes", () => {
  it("returns the whole-minute span between two instants", () => {
    const start = new Date("2026-09-01T09:00:00Z");
    const end = new Date("2026-09-01T09:44:00Z");
    expect(computeDurationMinutes(start, end)).toBe(44);
  });

  it("rounds a partial-minute span to the nearest minute", () => {
    const start = new Date("2026-09-01T09:00:00.000Z");
    const end = new Date("2026-09-01T09:00:30.400Z");
    expect(computeDurationMinutes(start, end)).toBe(1);
  });

  it("floors at 1 minute for a zero-length span", () => {
    const t = new Date("2026-09-01T09:00:00Z");
    expect(computeDurationMinutes(t, t)).toBe(1);
  });

  it("floors at 1 minute for an end before the start", () => {
    const start = new Date("2026-09-01T09:00:00Z");
    const end = new Date("2026-09-01T08:00:00Z");
    expect(computeDurationMinutes(start, end)).toBe(1);
  });
});

describe("durationHours", () => {
  it("converts 45 minutes to 0.75 hours", () => {
    expect(durationHours(45)).toBe(0.75);
  });

  it("converts 15 minutes to 0.25 hours", () => {
    expect(durationHours(15)).toBe(0.25);
  });

  it("converts 0 minutes to 0 hours", () => {
    expect(durationHours(0)).toBe(0);
  });
});
