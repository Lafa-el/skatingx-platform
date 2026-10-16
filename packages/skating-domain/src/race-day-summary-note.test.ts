import { describe, expect, it } from "vitest";

import { prepareRaceSummaryNoteInput, RACE_DAY_LIMITS } from "./race-day-input";
import { RACE_SUMMARY_VERSION } from "./race-day";

describe("prepareRaceSummaryNoteInput", () => {
  it("trims the note", () => {
    const r = prepareRaceSummaryNoteInput("  Good start, tired last lap  ");
    expect(r.errors).toEqual([]);
    expect(r.value).toEqual({ coachNote: "Good start, tired last lap" });
  });

  it.each(["", "   ", "\n\t ", "\u200b", " \u200b \u3000 "])("stores an empty note (%j) as null, not as an empty string", (raw) => {
    const r = prepareRaceSummaryNoteInput(raw);
    expect(r.errors).toEqual([]);
    expect(r.value.coachNote).toBeNull();
  });

  it("keeps line breaks inside the note", () => {
    expect(prepareRaceSummaryNoteInput("one\ntwo").value.coachNote).toBe("one\ntwo");
  });

  it("accepts exactly the limit and rejects one more", () => {
    const limit = RACE_DAY_LIMITS.summaryCoachNote;
    expect(prepareRaceSummaryNoteInput("n".repeat(limit)).errors).toEqual([]);
    expect(prepareRaceSummaryNoteInput("n".repeat(limit + 1)).errors).toEqual([
      { field: "coachNote", code: "tooLong" },
    ]);
  });

  it("the stored summary version fits the version limit in the rules", () => {
    expect(RACE_SUMMARY_VERSION.length).toBeLessThanOrEqual(RACE_DAY_LIMITS.summaryVersion);
  });
});
