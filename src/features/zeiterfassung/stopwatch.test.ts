import { beforeEach, describe, expect, it } from "vitest";

import { clearRunningTimer, elapsedMs, formatElapsed, loadRunningTimer, saveRunningTimer, type RunningTimer } from "./stopwatch";

/** An in-memory Storage-shaped fake — no DOM/localStorage needed for this module. */
function fakeStorage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
    clear: () => map.clear(),
    key: () => null,
    get length() {
      return map.size;
    },
  };
}

const TIMER: RunningTimer = {
  clientId: "c1",
  clientName: "Café Koch",
  hourlyRate: 60,
  description: "Beratung",
  startedAt: "2026-09-01T09:00:00.000Z",
};

describe("loadRunningTimer / saveRunningTimer / clearRunningTimer", () => {
  let storage: Storage;
  beforeEach(() => {
    storage = fakeStorage();
  });

  it("returns null when nothing is stored", () => {
    expect(loadRunningTimer(storage)).toBeNull();
  });

  it("round-trips a saved timer", () => {
    saveRunningTimer(storage, TIMER);
    expect(loadRunningTimer(storage)).toEqual(TIMER);
  });

  it("clears the stored timer", () => {
    saveRunningTimer(storage, TIMER);
    clearRunningTimer(storage);
    expect(loadRunningTimer(storage)).toBeNull();
  });

  it("returns null for malformed JSON rather than throwing", () => {
    storage.setItem("ecke-crm:running-timer", "{not json");
    expect(loadRunningTimer(storage)).toBeNull();
  });

  it("returns null for a shape missing required fields", () => {
    storage.setItem("ecke-crm:running-timer", JSON.stringify({ clientId: "c1" }));
    expect(loadRunningTimer(storage)).toBeNull();
  });

  it("returns null for an unparseable startedAt", () => {
    storage.setItem("ecke-crm:running-timer", JSON.stringify({ ...TIMER, startedAt: "not-a-date" }));
    expect(loadRunningTimer(storage)).toBeNull();
  });
});

describe("elapsedMs", () => {
  it("computes the span since startedAt", () => {
    const now = new Date("2026-09-01T09:00:05.000Z");
    expect(elapsedMs(TIMER, now)).toBe(5000);
  });

  it("floors at 0 rather than going negative", () => {
    const now = new Date("2026-09-01T08:59:00.000Z");
    expect(elapsedMs(TIMER, now)).toBe(0);
  });
});

describe("formatElapsed", () => {
  it("formats zero", () => {
    expect(formatElapsed(0)).toBe("00:00:00");
  });

  it("formats seconds and minutes", () => {
    expect(formatElapsed(65_000)).toBe("00:01:05");
  });

  it("formats over an hour", () => {
    expect(formatElapsed(3_661_000)).toBe("01:01:01");
  });

  it("does not wrap at 24 hours", () => {
    expect(formatElapsed(27 * 3600 * 1000)).toBe("27:00:00");
  });

  it("truncates a partial second rather than rounding", () => {
    expect(formatElapsed(1_999)).toBe("00:00:01");
  });
});
