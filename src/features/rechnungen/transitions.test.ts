import { describe, expect, it } from "vitest";

import { canTransition, isEditable, nextStatuses } from "./transitions";

describe("nextStatuses", () => {
  it("draft can only become sent", () => {
    expect(nextStatuses("draft")).toEqual(["sent"]);
  });

  it("sent can become paid or cancelled", () => {
    expect(nextStatuses("sent")).toEqual(["paid", "cancelled"]);
  });

  it("paid can only become cancelled", () => {
    expect(nextStatuses("paid")).toEqual(["cancelled"]);
  });

  it("cancelled is terminal", () => {
    expect(nextStatuses("cancelled")).toEqual([]);
  });
});

describe("canTransition", () => {
  it("allows every documented forward transition", () => {
    expect(canTransition("draft", "sent")).toBe(true);
    expect(canTransition("sent", "paid")).toBe(true);
    expect(canTransition("sent", "cancelled")).toBe(true);
    expect(canTransition("paid", "cancelled")).toBe(true);
  });

  it("never allows a transition back to draft", () => {
    expect(canTransition("sent", "draft")).toBe(false);
    expect(canTransition("paid", "draft")).toBe(false);
    expect(canTransition("cancelled", "draft")).toBe(false);
  });

  it("never allows skipping a state", () => {
    expect(canTransition("draft", "paid")).toBe(false);
    expect(canTransition("draft", "cancelled")).toBe(false);
  });

  it("never allows a transition out of cancelled", () => {
    expect(canTransition("cancelled", "sent")).toBe(false);
    expect(canTransition("cancelled", "paid")).toBe(false);
  });

  it("rejects a same-state no-op transition", () => {
    expect(canTransition("draft", "draft")).toBe(false);
    expect(canTransition("sent", "sent")).toBe(false);
  });
});

describe("isEditable", () => {
  it("only draft is editable", () => {
    expect(isEditable("draft")).toBe(true);
    expect(isEditable("sent")).toBe(false);
    expect(isEditable("paid")).toBe(false);
    expect(isEditable("cancelled")).toBe(false);
  });
});
