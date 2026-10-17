import { describe, expect, it } from "vitest";

import { localized } from "./localized";

describe("localized", () => {
  it("returns the value written for the active language", () => {
    expect(localized("zh", { zh: "周一", en: "Mon" })).toBe("周一");
    expect(localized("en", { zh: "周一", en: "Mon" })).toBe("Mon");
  });

  it("works for values that are not text", () => {
    expect(localized("en", { zh: 1, en: 2 })).toBe(2);
    expect(localized("zh", { zh: [1], en: [2] })).toEqual([1]);
  });

  it("an empty string in the active language is returned as it is, not replaced by the other one", () => {
    expect(localized("zh", { zh: "", en: "x" })).toBe("");
    expect(localized("en", { zh: "x", en: "" })).toBe("");
  });
});
