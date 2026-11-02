import { describe, expect, it } from "vitest";

import { classifyPoseIssue } from "./legacy-pose";

describe("classifyPoseIssue pelvis height", () => {
  const rest = { kneeAngle: 90, leanAngle: 40 };

  it("flags a low y-percent as high off the ice", () => {
    expect(classifyPoseIssue({ ...rest, pelvisHeight: 30 })).toBe("骨盆高度偏高");
  });

  it("does not flag the 38 boundary (strict less-than)", () => {
    expect(classifyPoseIssue({ ...rest, pelvisHeight: 38 })).toBe("姿态可接受");
  });

  it("does not flag a crouched high y-percent that used to count as high", () => {
    expect(classifyPoseIssue({ ...rest, pelvisHeight: 70 })).toBe("姿态可接受");
  });
});
