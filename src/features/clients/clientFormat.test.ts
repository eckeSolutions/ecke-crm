import { describe, expect, it } from "vitest";

import { formatClientAddress } from "./clientFormat";

describe("formatClientAddress", () => {
  it("joins street and 'zip city' with a comma", () => {
    expect(formatClientAddress({ street: "Bahnhofstraße 1", zip_code: "78462", city: "Konstanz" })).toBe(
      "Bahnhofstraße 1, 78462 Konstanz",
    );
  });

  it("omits a missing street", () => {
    expect(formatClientAddress({ street: null, zip_code: "78462", city: "Konstanz" })).toBe("78462 Konstanz");
  });

  it("omits missing zip/city entirely, not a stray space", () => {
    expect(formatClientAddress({ street: "Bahnhofstraße 1", zip_code: null, city: null })).toBe("Bahnhofstraße 1");
  });

  it("returns an empty string when everything is missing", () => {
    expect(formatClientAddress({ street: null, zip_code: null, city: null })).toBe("");
  });

  it("handles zip without city and city without zip", () => {
    expect(formatClientAddress({ street: null, zip_code: "78462", city: null })).toBe("78462");
    expect(formatClientAddress({ street: null, zip_code: null, city: "Konstanz" })).toBe("Konstanz");
  });
});
