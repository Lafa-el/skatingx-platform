import { describe, expect, it } from "vitest";

import { formatDecimalDisplay, formatFixed } from "./decimal-display";

describe("decimal display", () => {
  it("rounds a float32 artifact to the value a person expects to read", () => {
    expect(formatDecimalDisplay("7.050000190734863")).toBe("7.05");
    expect(formatDecimalDisplay("9.100000381469727")).toBe("9.1");
    expect(formatDecimalDisplay("40")).toBe("40");
    expect(formatDecimalDisplay("32.5")).toBe("32.5");
    expect(formatDecimalDisplay("")).toBe("");
  });

  it("formats a finite number to a fixed number of places", () => {
    expect(formatFixed(0.30000000000000004, 1)).toBe("0.3");
    expect(formatFixed(7.050000190734863, 2)).toBe("7.05");
  });
});
