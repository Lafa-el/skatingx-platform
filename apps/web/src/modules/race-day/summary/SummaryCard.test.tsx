// @vitest-environment happy-dom
import type { RaceEntry, RaceResult, RaceRosterEntry } from "@skatingx/schema";
import { buildRaceSummary } from "@skatingx/skating-domain";
import { describe, expect, it, vi } from "vitest";

import { render, screen, within } from "@/test/dom";

import { raceNumberById } from "../lib/summary";
import { SummaryCard } from "./SummaryCard";

const locale = vi.hoisted(() => ({ current: "zh" as "zh" | "en" }));
vi.mock("@/hooks/useLocale", () => ({ useLocale: () => locale.current }));

const prov = {
  verification: "pending" as const,
  source: "manual" as const,
  sourceNote: "",
  verifiedAt: null,
  schemaVersion: 1 as const,
};
const me: RaceRosterEntry = {
  rosterId: "me",
  displayName: "Test Skater",
  bib: "000",
  division: "Test Division",
  isSelf: true,
  isFollowed: false,
  athleteRefId: null,
  ...prov,
};
const race = (raceId: string, sortOrder: number, label: string, rosterIds = ["me"]): RaceEntry => ({
  raceId,
  distanceId: "500m",
  label,
  sortOrder,
  day: "2026-10-24",
  round: null,
  heat: null,
  scheduledAt: null,
  rosterIds,
  ...prov,
});
const result = (raceId: string, over: Partial<RaceResult> = {}): RaceResult => ({
  resultId: `${raceId}_me`,
  raceId,
  rosterId: "me",
  status: "finished",
  timeSeconds: 49.8,
  place: null,
  advanced: null,
  ...prov,
  ...over,
});

function setup(races: RaceEntry[], results: RaceResult[]) {
  const summary = buildRaceSummary({ self: me, races, results });
  render(<SummaryCard summary={summary} raceNumbers={raceNumberById(races)} />);
}

describe("SummaryCard", () => {
  it("names the athlete and shows the rules version", () => {
    setup([race("r1", 1, "500m")], []);
    expect(screen.getByRole("heading", { name: "Test Skater 的比赛总结" })).toBeTruthy();
    expect(screen.getByText("号码 000 · Test Division")).toBeTruthy();
    expect(screen.getByText("汇总规则版本：race-summary/1")).toBeTruthy();
  });

  it("with no results says so, and shows no pending banner and no confirmed claim", () => {
    setup([race("r1", 1, "500m")], []);
    expect(screen.getByText("还没有录入成绩。")).toBeTruthy();
    expect(screen.queryByTestId("pending-banner")).toBeNull();
    expect(screen.queryByText("已录入的成绩都已确认。")).toBeNull();
    expect(screen.getByText("还没有成绩")).toBeTruthy();
    expect(screen.queryByText("待确认")).toBeNull();
  });

  it("shows the pending count first and prominently when results are unconfirmed", () => {
    setup(
      [race("r1", 1, "500m"), race("r2", 2, "1000m")],
      [result("r1"), result("r2", { timeSeconds: 100.5 })],
    );
    const banner = screen.getByTestId("pending-banner");
    expect(banner.textContent).toContain("2 项成绩仍待确认");
    expect(banner.textContent).toContain("对照官方成绩");
    expect(screen.queryByText("已录入的成绩都已确认。")).toBeNull();
  });

  it("fastest counts only confirmed results", () => {
    setup(
      [race("r1", 1, "500m"), race("r2", 2, "1000m")],
      [
        result("r1", { timeSeconds: 40.0 }),
        result("r2", { timeSeconds: 50.5, verification: "verified", verifiedAt: "2026-10-24T12:00:00.000Z" }),
      ],
    );
    const fastest = screen.getByText("最快完赛时间（仅统计已确认成绩）").closest("div") as HTMLElement;
    expect(within(fastest).getByText("50.50")).toBeTruthy();
    expect(within(fastest).queryByText("40.00")).toBeNull();
    expect(screen.getByTestId("pending-banner").textContent).toContain("1 项成绩仍待确认");
  });

  it("with only unconfirmed finishes shows that there is no confirmed finish, not the fastest pending time", () => {
    setup([race("r1", 1, "500m")], [result("r1", { timeSeconds: 40.0 })]);
    const fastest = screen.getByText("最快完赛时间（仅统计已确认成绩）").closest("div") as HTMLElement;
    expect(within(fastest).getByText("暂无已确认的完赛成绩")).toBeTruthy();
    expect(within(fastest).queryByText("40.00")).toBeNull();
  });

  it("when every result is confirmed says so and shows no pending banner", () => {
    setup(
      [race("r1", 1, "500m")],
      [result("r1", { verification: "verified", verifiedAt: "2026-10-24T12:00:00.000Z" })],
    );
    expect(screen.getByText("已录入的成绩都已确认。")).toBeTruthy();
    expect(screen.queryByTestId("pending-banner")).toBeNull();
  });

  it("each row has its own marker, and rows without a result have none", () => {
    setup(
      [race("r1", 1, "500m"), race("r2", 2, "1000m"), race("r3", 3, "1500m")],
      [result("r1"), result("r2", { verification: "verified", verifiedAt: "2026-10-24T12:00:00.000Z" })],
    );
    const items = screen.getAllByRole("listitem");
    expect(within(items[0] as HTMLElement).getByText("待确认")).toBeTruthy();
    expect(within(items[1] as HTMLElement).getByText("已确认")).toBeTruthy();
    expect(within(items[2] as HTMLElement).queryByText(/待确认|已确认/)).toBeNull();
    expect(within(items[2] as HTMLElement).getByText("还没有成绩")).toBeTruthy();
  });

  it("shows time, place and advancement, and the status text for a race not finished", () => {
    setup(
      [race("r1", 1, "500m"), race("r2", 2, "1000m")],
      [
        result("r1", { timeSeconds: 49.123, place: 2, advanced: true }),
        result("r2", { status: "DNF", timeSeconds: null }),
      ],
    );
    const items = screen.getAllByRole("listitem");
    expect(within(items[0] as HTMLElement).getByText("49.123")).toBeTruthy();
    expect(within(items[0] as HTMLElement).getByText("第 2 名")).toBeTruthy();
    expect(within(items[0] as HTMLElement).getByText("晋级")).toBeTruthy();
    expect(within(items[1] as HTMLElement).getByText("未完赛（DNF）")).toBeTruthy();
  });

  it("numbers races as on the Schedule tab, including races the athlete is not in", () => {
    setup([race("r0", 1, "Other", []), race("r1", 2, "500m")], []);
    expect(screen.getByText(/#2 500m/)).toBeTruthy();
    expect(screen.queryByText(/Other/)).toBeNull();
  });

  it("says the athlete is on no race when that is so", () => {
    setup([race("r1", 1, "500m", [])], []);
    expect(screen.getByText(/还没有被安排到任何比赛/)).toBeTruthy();
  });

  it("states it is a factual summary with no advice, and makes no analysis claims", () => {
    setup([race("r1", 1, "500m")], [result("r1")]);
    expect(screen.getByText(/不含训练、医疗或技术建议/)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/AI|生物力学|3D|诊断/);
  });

  it("English locale", () => {
    locale.current = "en";
    setup([race("r1", 1, "500m")], [result("r1")]);
    expect(screen.getByRole("heading", { name: "Race summary for Test Skater" })).toBeTruthy();
    expect(screen.getByTestId("pending-banner").textContent).toContain("1 result(s) still pending");
    expect(screen.getByText(/no training, medical or technique advice/)).toBeTruthy();
    locale.current = "zh";
  });
});
