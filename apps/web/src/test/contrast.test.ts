import { describe, expect, it } from "vitest";

import { contrastRatio, hue, hueDistance } from "./contrast";

describe("contrastRatio", () => {
  it("matches the WCAG reference values", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
    // 4.48:1 is the commonly quoted figure for #777777 on white.
    expect(contrastRatio("#777777", "#ffffff")).toBeCloseTo(4.48, 2);
  });

  it("does not depend on which colour is passed first", () => {
    expect(contrastRatio("#081c33", "#ff3e2c")).toBe(contrastRatio("#ff3e2c", "#081c33"));
  });

  it("rejects anything that is not a 6-digit hex colour", () => {
    expect(() => contrastRatio("red", "#fff")).toThrow(/6-digit hex/);
  });
});

describe("hue", () => {
  it("returns the primary hues", () => {
    expect(hue("#ff0000")).toBeCloseTo(0, 5);
    expect(hue("#00ff00")).toBeCloseTo(120, 5);
    expect(hue("#0000ff")).toBeCloseTo(240, 5);
  });

  it("measures the short way round the wheel", () => {
    expect(hueDistance("#ff0020", "#ff2000")).toBeCloseTo(15, 0);
  });
});
