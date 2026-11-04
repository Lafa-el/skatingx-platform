import { describe, expect, it } from "vitest";

import { createDefaultAthleteProfile } from "./defaults";

describe("createDefaultAthleteProfile", () => {
  it("writes the signed-in user onto the default profile", () => {
    const profile = createDefaultAthleteProfile("lindsay", "user-1");
    expect(profile.athleteId).toBe("lindsay");
    expect(profile.userId).toBe("user-1");
    expect(profile.displayName).toBe("Lindsay Lin");
  });
});
