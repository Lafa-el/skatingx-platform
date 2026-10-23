import { describe, expect, it } from "vitest";

import { groupLedgerMonth, planLedgerNote, reconcilePoints, type LedgerEvent } from "./ledger-model";

const october = { year: 2026, month: 10 };

function event(partial: Partial<LedgerEvent> & Pick<LedgerEvent, "id" | "dateId" | "delta" | "reason">): LedgerEvent {
  return { createdAt: `${partial.dateId}T00:00:00.000Z`, ...partial };
}

describe("groupLedgerMonth", () => {
  it("groups a month by day, subtotals each day, and orders events by time", () => {
    const groups = groupLedgerMonth(
      [
        event({ id: "later", dateId: "2026-10-19", delta: 50, reason: "daily-bonus-add", createdAt: "2026-10-19T02:00:00.000Z" }),
        event({ id: "earlier", dateId: "2026-10-19", delta: 20, reason: "task-complete", createdAt: "2026-10-19T01:00:00.000Z" }),
        event({ id: "plan", dateId: "2026-10-22", delta: -30, reason: "plan-uncheckin", refId: "jd_tech_mon" }),
      ],
      october,
    );
    expect(groups.map((group) => group.dateId)).toEqual(["2026-10-19", "2026-10-22"]);
    expect(groups[0]?.subtotal).toBe(70);
    expect(groups[0]?.events.map((item) => item.id)).toEqual(["earlier", "later"]);
    expect(groups[1]?.subtotal).toBe(-30);
  });

  it("keeps an opening line in the month of its date and out of the other month", () => {
    const events = [
      event({ id: "opening", dateId: "2026-09-02", delta: 80, reason: "opening-balance" }),
      event({ id: "task", dateId: "2026-10-19", delta: 20, reason: "task-complete" }),
    ];
    expect(groupLedgerMonth(events, october).map((group) => group.dateId)).toEqual(["2026-10-19"]);
    expect(groupLedgerMonth(events, { year: 2026, month: 9 }).map((group) => group.events[0]?.reason)).toEqual([
      "opening-balance",
    ]);
  });
});

describe("planLedgerNote", () => {
  it("names a plan day and leaves every other reference unnamed", () => {
    expect(planLedgerNote("plan-checkin", "jd_tech_mon")).toEqual({ focus: "lean", weekday: "mon" });
    expect(planLedgerNote("plan-uncheckin", "jd_speed_wed")).toEqual({ focus: "bounce", weekday: "wed" });
    expect(planLedgerNote("plan-checkin", "not-a-day")).toBeNull();
    expect(planLedgerNote("task-complete", "jd_tech_mon")).toBeNull();
    expect(planLedgerNote("reward-redeem", "reward_ice_cream")).toBeNull();
  });
});

describe("reconcilePoints", () => {
  it("matches when the balance is the opening line plus every later delta", () => {
    expect(reconcilePoints(180, 180, 80)).toEqual({ points: 180, opening: 80, net: 100, gap: 0 });
  });

  it("keeps a positive or negative gap instead of hiding it", () => {
    expect(reconcilePoints(200, 180, 80).gap).toBe(20);
    expect(reconcilePoints(100, 180, 80)).toMatchObject({ net: 100, gap: -80 });
  });

  it("treats a missing number as zero", () => {
    expect(reconcilePoints(Number.NaN, 10, Number.POSITIVE_INFINITY)).toEqual({
      points: 0,
      opening: 0,
      net: 10,
      gap: -10,
    });
  });
});
