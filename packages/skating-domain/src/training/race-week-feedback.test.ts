import { describe, expect, it } from "vitest";

import { trainingFeedbackKey } from "./analysis-feedback";
import { deriveRaceWeekFeedback, type RaceWeekEvent } from "./race-week-feedback";

// 2026-10-26 is a Monday, so the plan week runs 10-26 to 11-01 and the next one starts 11-02.
function event(overrides: Partial<RaceWeekEvent> = {}): RaceWeekEvent {
  return {
    eventId: "event-a",
    name: "Spring Open",
    dates: ["2026-10-31", "2026-11-01"],
    verification: "verified",
    ...overrides,
  };
}

describe("deriveRaceWeekFeedback thresholds", () => {
  const events = [event()];

  it("shows the card from the Monday of the race week", () => {
    expect(deriveRaceWeekFeedback(events, "2026-10-26", null)).toHaveLength(1);
  });

  it("shows it through the week, on the first race day, and on the last race day", () => {
    for (const today of ["2026-10-28", "2026-10-31", "2026-11-01"]) {
      expect(deriveRaceWeekFeedback(events, today, null)).toHaveLength(1);
    }
  });

  it("does not show it on the Sunday before the race week", () => {
    expect(deriveRaceWeekFeedback(events, "2026-10-25", null)).toEqual([]);
  });

  it("goes away the day after the last race day (here also the next plan week)", () => {
    expect(deriveRaceWeekFeedback(events, "2026-11-02", null)).toEqual([]);
  });

  it("goes away the day after the last race day inside the same plan week", () => {
    // One race day on Saturday; Sunday is still the same plan week but the race is over.
    const saturdayOnly = [event({ dates: ["2026-10-31"] })];
    expect(deriveRaceWeekFeedback(saturdayOnly, "2026-10-31", null)).toHaveLength(1);
    expect(deriveRaceWeekFeedback(saturdayOnly, "2026-11-01", null)).toEqual([]);
  });

  it("is not shown in a later plan week", () => {
    expect(deriveRaceWeekFeedback(events, "2026-11-09", null)).toEqual([]);
  });

  it("still shows when the first race day is the Monday or Tuesday of the week", () => {
    for (const first of ["2026-10-26", "2026-10-27"]) {
      expect(deriveRaceWeekFeedback([event({ dates: [first] })], "2026-10-26", null)).toHaveLength(1);
    }
  });

  it("goes by the first race day's week: an event that starts in the week before shows no card", () => {
    // Starts Saturday 10-24 (week of 10-19) and ends Monday 10-26. The rule is on the first day.
    const crossing = [event({ dates: ["2026-10-24", "2026-10-25", "2026-10-26"] })];
    expect(deriveRaceWeekFeedback(crossing, "2026-10-26", null)).toEqual([]);
    expect(deriveRaceWeekFeedback(crossing, "2026-10-24", null)).toHaveLength(1);
  });

  it("does not depend on the order of the dates", () => {
    const shuffled = [event({ dates: ["2026-11-01", "2026-10-31"] })];
    expect(deriveRaceWeekFeedback(shuffled, "2026-10-26", null)).toHaveLength(1);
    expect(deriveRaceWeekFeedback(shuffled, "2026-11-02", null)).toEqual([]);
  });
});

describe("deriveRaceWeekFeedback focus", () => {
  it("is not shown once this week's focus is already endurance", () => {
    expect(deriveRaceWeekFeedback([event()], "2026-10-28", "endurance")).toEqual([]);
  });

  it("is shown when no focus is chosen, or lean or bounce is", () => {
    for (const focus of [null, "lean", "bounce"] as const) {
      expect(deriveRaceWeekFeedback([event()], "2026-10-28", focus)).toHaveLength(1);
    }
  });
});

describe("deriveRaceWeekFeedback content", () => {
  it("suggests endurance and names the event and its days", () => {
    expect(deriveRaceWeekFeedback([event()], "2026-10-28", null)).toEqual([
      {
        type: "set-focus",
        focus: "endurance",
        sourceKind: "race",
        eventId: "event-a",
        eventName: "Spring Open",
        firstDay: "2026-10-31",
        lastDay: "2026-11-01",
        datesPending: false,
      },
    ]);
  });

  it("marks the dates as pending when the event is pending", () => {
    const [card] = deriveRaceWeekFeedback([event({ verification: "pending" })], "2026-10-28", null);
    expect(card?.datesPending).toBe(true);
  });

  it("is identified by the event id, in the same key format as the other suggestions", () => {
    const [card] = deriveRaceWeekFeedback([event({ eventId: "buffalo-1" })], "2026-10-28", null);
    expect(card && trainingFeedbackKey(card)).toBe("set-focus:race:buffalo-1");
    expect(
      trainingFeedbackKey({
        type: "set-focus",
        focus: "bounce",
        sourceKind: "pace",
        analysisId: "pace-1",
        createdAt: "2026-10-20T12:00:00.000Z",
      }),
    ).toBe("set-focus:pace:pace-1");
  });
});

describe("deriveRaceWeekFeedback input handling", () => {
  it("returns nothing for no events", () => {
    expect(deriveRaceWeekFeedback([], "2026-10-28", null)).toEqual([]);
  });

  it("does not trigger on an event without a valid day", () => {
    const bad = [
      event({ eventId: "none", dates: [] }),
      event({ eventId: "junk", dates: ["soon", "2026-13-01", "2026-02-30", ""] }),
    ];
    expect(deriveRaceWeekFeedback(bad, "2026-10-28", null)).toEqual([]);
  });

  it("drops an invalid day and uses the valid ones", () => {
    const mixed = [event({ dates: ["tbd", "2026-10-31", "2026-02-30"] })];
    const [card] = deriveRaceWeekFeedback(mixed, "2026-10-28", null);
    expect(card).toMatchObject({ firstDay: "2026-10-31", lastDay: "2026-10-31" });
  });

  it("returns nothing when today is not a real date", () => {
    expect(deriveRaceWeekFeedback([event()], "not-a-date", null)).toEqual([]);
  });

  it("returns at most one card: the event that starts first, ties by event id", () => {
    const events = [
      event({ eventId: "b", name: "B", dates: ["2026-10-31"] }),
      event({ eventId: "d", name: "D", dates: ["2026-10-29"] }),
      event({ eventId: "c", name: "C", dates: ["2026-10-29"] }),
    ];
    const cards = deriveRaceWeekFeedback(events, "2026-10-26", null);
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ eventId: "c" });
  });

  it("skips an event that qualifies for nobody and uses another that does", () => {
    const events = [
      event({ eventId: "past", dates: ["2026-10-24", "2026-10-25"] }),
      event({ eventId: "this-week", dates: ["2026-10-30"] }),
    ];
    expect(deriveRaceWeekFeedback(events, "2026-10-28", null)[0]).toMatchObject({ eventId: "this-week" });
  });

  it("does not change its input", () => {
    const events = [event({ dates: ["2026-11-01", "2026-10-31"] })];
    const copy = JSON.parse(JSON.stringify(events)) as unknown;
    deriveRaceWeekFeedback(events, "2026-10-28", null);
    expect(events).toEqual(copy);
  });
});

describe("deriveRaceWeekFeedback with the Buffalo event", () => {
  // The real event (2026-buffalo-short-track-championships-rpm6w8): days 10-24 and 10-25, still pending.
  const buffalo = event({
    eventId: "2026-buffalo-short-track-championships-rpm6w8",
    name: "Buffalo Short Track Championships",
    dates: ["2026-10-24", "2026-10-25"],
    verification: "pending",
  });

  it("is gone on 2026-10-30, because the race is over (the real case)", () => {
    expect(deriveRaceWeekFeedback([buffalo], "2026-10-30", null)).toEqual([]);
  });

  it("would have shown in its week, with the pending note", () => {
    const [card] = deriveRaceWeekFeedback([buffalo], "2026-10-21", null);
    expect(card).toMatchObject({ datesPending: true, firstDay: "2026-10-24", lastDay: "2026-10-25" });
    expect(deriveRaceWeekFeedback([buffalo], "2026-10-25", null)).toHaveLength(1);
    expect(deriveRaceWeekFeedback([buffalo], "2026-10-26", null)).toEqual([]);
  });
});
