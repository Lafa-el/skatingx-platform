import { describe, expect, it } from "vitest";

import { createDefaultUserSettings } from "./defaults";

describe("createDefaultUserSettings", () => {
  it("does not name a current athlete", () => {
    const settings = createDefaultUserSettings();
    expect(settings).toEqual({
      language: "zh",
      theme: "system",
      isPro: false,
      parentPinEnabled: false,
    });
    expect(settings).not.toHaveProperty("activeAthleteId");
  });
});
