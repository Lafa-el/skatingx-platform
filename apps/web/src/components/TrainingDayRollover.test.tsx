// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import source from "./TrainingDayRollover.tsx?raw";

import { render, waitFor } from "@/test/dom";
import { denied, watchUnhandledRejections } from "@/test/unhandledRejections";

import { TrainingDayRollover } from "./TrainingDayRollover";

const h = vi.hoisted(() => ({
  uid: "u1" as string | null,
  rollover: vi.fn(),
  generate: vi.fn(),
  locale: "zh" as "zh" | "en",
  // An old date: any day after it needs the rollover.
  training: { lastLoginDate: "2020-01-01", todayTasks: [] } as Record<string, unknown>,
}));

vi.mock("@skatingx/firebase-client", () => ({
  getFirestoreDb: () => ({}),
  normalizeTrainingState: (state: unknown) => state,
  runDayRolloverIfNeeded: (...args: unknown[]) => h.rollover(...args),
  generatePlanTasksIfNeeded: (...args: unknown[]) => h.generate(...args),
}));
vi.mock("@/hooks/useLocale", () => ({ useLocale: () => h.locale }));
vi.mock("@/app/providers/AuthProvider", () => ({ useAuth: () => ({ uid: h.uid }) }));
vi.mock("@/app/providers/FirestoreProvider", () => ({
  useFirestoreStatus: () => ({ ready: true }),
  useUserSettings: () => ({ data: { activeAthleteId: "a1" } }),
  useTrainingState: () => ({ data: h.training, loading: false }),
}));

beforeEach(() => {
  h.uid = "u1";
  h.locale = "zh";
  h.training = { lastLoginDate: "2020-01-01", todayTasks: [] };
  h.rollover = vi.fn().mockResolvedValue(undefined);
  h.generate = vi.fn().mockResolvedValue({ generated: 3, skipped: null });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("TrainingDayRollover", () => {
  it("runs the rollover once for the user, athlete and day", async () => {
    const view = render(<TrainingDayRollover />);
    await waitFor(() => expect(h.rollover).toHaveBeenCalledTimes(1));
    expect(h.rollover.mock.calls[0]?.[0]).toMatchObject({ userId: "u1", athleteId: "a1" });
    view.rerender(<TrainingDayRollover />);
    expect(h.rollover).toHaveBeenCalledTimes(1);
  });

  // It runs in the background, with no click to report to, so a failure used to surface only as
  // "Uncaught (in promise)" with nothing to say which step failed.
  it("a failed rollover is logged with its code and is not an unhandled rejection", async () => {
    const watcher = watchUnhandledRejections();
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    h.rollover = vi.fn().mockRejectedValue(denied());
    render(<TrainingDayRollover />);
    await waitFor(() => expect(h.rollover).toHaveBeenCalledTimes(1));
    expect(await watcher.settled()).toEqual([]);
    watcher.stop();
    expect(log).toHaveBeenCalledExactlyOnceWith("[training-rollover] runDayRolloverIfNeeded failed", {
      code: "permission-denied",
    });
  });

  it("a failed rollover is not remembered as done, so the next change of data tries again", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    h.rollover = vi.fn().mockRejectedValueOnce(denied()).mockResolvedValue(undefined);
    const view = render(<TrainingDayRollover />);
    await waitFor(() => expect(h.rollover).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 25));
    // A new user value forces the effect to run again.
    h.uid = "u1b";
    view.rerender(<TrainingDayRollover />);
    await waitFor(() => expect(h.rollover).toHaveBeenCalledTimes(2));
  });
});

// 2026-10-28 is a Wednesday; the week's Monday is 2026-10-26.
const WEDNESDAY = new Date(2026, 9, 28, 12, 0, 0);
const SUNDAY = new Date(2026, 10, 1, 12, 0, 0);

function readyWeek(over: Record<string, unknown> = {}) {
  return {
    lastLoginDate: "2026-10-28",
    planFocus: "lean",
    planFocusWeek: "2026-10-26",
    todayTasks: [],
    ...over,
  };
}

describe("TrainingDayRollover: plan task generation", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(WEDNESDAY);
  });

  it("generates today's tasks for the focus on the state, in the user's language", async () => {
    h.training = readyWeek();
    render(<TrainingDayRollover />);
    await waitFor(() => expect(h.generate).toHaveBeenCalledTimes(1));
    const [ctx, input, today] = h.generate.mock.calls[0] as [unknown, { focus: string; candidates: { planEntryId: string; text: string }[] }, string];
    expect(ctx).toMatchObject({ userId: "u1", athleteId: "a1" });
    expect(today).toBe("2026-10-28");
    expect(input.focus).toBe("lean");
    // Wednesday of the lean week has four entries, written as strings in Chinese.
    expect(input.candidates.map((c) => c.planEntryId)).toEqual([
      "jd_tech_wed.1",
      "jd_tech_wed.2",
      "jd_tech_wed.3",
      "jd_tech_wed.4",
    ]);
    expect(input.candidates.every((c) => typeof c.text === "string" && c.text.length > 0)).toBe(true);
    expect(input.candidates[0]?.text).toMatch(/[\u4e00-\u9fff]/);
    // A day that is already today's needs no rollover.
    expect(h.rollover).not.toHaveBeenCalled();
  });

  // The race-week suggestion only sets this focus (docs/design/race-day-linkages.md 2.c); the tasks
  // come from this same generation, from the race template.
  it("generates the race-week template when the chosen focus is endurance", async () => {
    h.training = readyWeek({ planFocus: "endurance" });
    render(<TrainingDayRollover />);
    await waitFor(() => expect(h.generate).toHaveBeenCalledTimes(1));
    const input = h.generate.mock.calls[0]?.[1] as { focus: string; candidates: { planEntryId: string; text: string }[] };
    expect(input.focus).toBe("endurance");
    expect(input.candidates.length).toBeGreaterThan(0);
    expect(input.candidates.every((c) => c.planEntryId.startsWith("jd_race_wed."))).toBe(true);
  });

  it("writes the candidates in English when the language is English", async () => {
    h.locale = "en";
    h.training = readyWeek();
    render(<TrainingDayRollover />);
    await waitFor(() => expect(h.generate).toHaveBeenCalledTimes(1));
    const input = h.generate.mock.calls[0]?.[1] as { candidates: { text: string }[] };
    expect(input.candidates[0]?.text).not.toMatch(/[\u4e00-\u9fff]/);
  });

  it("still calls on a rest day with no candidates, so the day is marked and not retried", async () => {
    vi.setSystemTime(SUNDAY);
    h.training = readyWeek({ lastLoginDate: "2026-11-01" });
    render(<TrainingDayRollover />);
    await waitFor(() => expect(h.generate).toHaveBeenCalledTimes(1));
    expect((h.generate.mock.calls[0]?.[1] as { candidates: unknown[] }).candidates).toEqual([]);
  });

  it("calls once while the same state keeps arriving", async () => {
    h.training = readyWeek();
    h.generate = vi.fn(() => new Promise(() => undefined));
    const view = render(<TrainingDayRollover />);
    await waitFor(() => expect(h.generate).toHaveBeenCalledTimes(1));
    view.rerender(<TrainingDayRollover />);
    h.training = readyWeek({ todayTasks: [{ id: "x" }] });
    view.rerender(<TrainingDayRollover />);
    expect(h.generate).toHaveBeenCalledTimes(1);
  });

  it("does not call again once the state says today was generated", async () => {
    h.training = readyWeek({ planGeneratedDate: "2026-10-28" });
    render(<TrainingDayRollover />);
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(h.generate).not.toHaveBeenCalled();
  });

  it.each([
    ["no focus was chosen", { planFocus: undefined, planFocusWeek: undefined }],
    ["the focus was chosen in an earlier week", { planFocusWeek: "2026-10-19" }],
    ["the focus has no week on it", { planFocusWeek: undefined }],
  ])("does not call when %s", async (_name, over) => {
    h.training = readyWeek(over);
    render(<TrainingDayRollover />);
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(h.generate).not.toHaveBeenCalled();
  });

  it("rolls the day over first and does not generate into yesterday's list", async () => {
    h.training = readyWeek({ lastLoginDate: "2026-10-27" });
    render(<TrainingDayRollover />);
    await waitFor(() => expect(h.rollover).toHaveBeenCalledTimes(1));
    expect(h.generate).not.toHaveBeenCalled();
  });

  it("generates when a focus is chosen, because that is a change of the training state", async () => {
    h.training = readyWeek({ planFocus: undefined, planFocusWeek: undefined });
    const view = render(<TrainingDayRollover />);
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(h.generate).not.toHaveBeenCalled();

    h.training = readyWeek();
    view.rerender(<TrainingDayRollover />);
    await waitFor(() => expect(h.generate).toHaveBeenCalledTimes(1));
  });

  it("a failed generation is logged with its code, is not an unhandled rejection, and is tried again on the next change", async () => {
    const watcher = watchUnhandledRejections();
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    h.training = readyWeek();
    h.generate = vi.fn().mockRejectedValueOnce(denied()).mockResolvedValue({ generated: 3, skipped: null });
    const view = render(<TrainingDayRollover />);
    await waitFor(() => expect(h.generate).toHaveBeenCalledTimes(1));
    expect(await watcher.settled()).toEqual([]);
    watcher.stop();
    expect(log).toHaveBeenCalledExactlyOnceWith("[training-rollover] generatePlanTasksIfNeeded failed", {
      code: "permission-denied",
    });

    await new Promise((resolve) => setTimeout(resolve, 25));
    h.training = readyWeek({ todayTasks: [{ id: "m" }] });
    view.rerender(<TrainingDayRollover />);
    await waitFor(() => expect(h.generate).toHaveBeenCalledTimes(2));
  });

  it("does not read the PRO flag, so generation is the same for every user", () => {
    expect(source).not.toMatch(/isPro|useIsPro/);
  });

  it("is the only caller: the plan page does not generate", async () => {
    const page = (await import("@/modules/training/plan/PlanPage.tsx?raw")).default;
    expect(page).not.toMatch(/generatePlanTasksIfNeeded/);
  });
});
