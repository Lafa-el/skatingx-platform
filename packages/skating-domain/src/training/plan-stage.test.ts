import { describe, expect, it } from "vitest";

import { stageIdForRealAge } from "./plan-stage";

describe("stageIdForRealAge", () => {
  it("maps each whole year onto one stage, and leaves the edges empty", () => {
    expect(stageIdForRealAge(3)).toBeNull();
    expect(stageIdForRealAge(4)).toBe("age4_7");
    expect(stageIdForRealAge(7)).toBe("age4_7");
    expect(stageIdForRealAge(8)).toBe("age8_10");
    expect(stageIdForRealAge(10)).toBe("age8_10");
    expect(stageIdForRealAge(11)).toBe("age11_13");
    expect(stageIdForRealAge(13)).toBe("age11_13");
    expect(stageIdForRealAge(14)).toBe("age14_16");
    expect(stageIdForRealAge(16)).toBe("age14_16");
    expect(stageIdForRealAge(17)).toBe("age17_18");
    expect(stageIdForRealAge(18)).toBe("age17_18");
    expect(stageIdForRealAge(19)).toBeNull();
    expect(stageIdForRealAge(null)).toBeNull();
  });
});
