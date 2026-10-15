import { describe, expect, it } from "vitest";

import { parseFeatureFlag } from "./features";

describe("parseFeatureFlag", () => {
  it("is on only for the text 'true'", () => {
    expect(parseFeatureFlag("true")).toBe(true);
    expect(parseFeatureFlag(" TRUE ")).toBe(true);
  });

  it("is off when unset, empty, or anything else (default-safe)", () => {
    for (const raw of [undefined, "", "false", "1", "yes", "on", "truee"]) {
      expect(parseFeatureFlag(raw)).toBe(false);
    }
  });
});
