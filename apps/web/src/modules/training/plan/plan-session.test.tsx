// @vitest-environment happy-dom
import { todayDateString } from "@skatingx/schema";
import { mondayOfWeek } from "@skatingx/skating-domain";
import { afterEach, describe, expect, it, vi } from "vitest";

import { act, renderHook } from "@/test/dom";

import { HIDDEN_FEEDBACK_KEY, readHiddenFeedback, useHiddenFeedback, usePlanFocus, writeHiddenFeedback } from "./plan-session";

const focusState = vi.hoisted(() => ({
  settings: { activeAthleteId: "athlete-9" } as { activeAthleteId?: string } | null,
  calls: [] as unknown[],
}));

vi.mock("@/app/providers/AuthProvider", () => ({
  useAuth: () => ({ uid: "user-1", loading: false, firebaseReady: true }),
}));
vi.mock("@/app/providers/FirestoreProvider", () => ({
  useUserSettings: () => ({ data: focusState.settings, loading: false, error: null }),
  useTrainingState: () => ({ data: null, loading: false, error: null }),
}));
vi.mock("@skatingx/firebase-client", () => ({
  getFirestoreDb: () => ({}),
  setPlanFocus: async (ctx: unknown, focus: string) => {
    focusState.calls.push({ ctx, focus });
  },
}));

const week = () => mondayOfWeek(todayDateString());

function previousMonday(monday: string): string {
  const [year, month, day] = monday.split("-").map(Number);
  const date = new Date(year ?? 0, (month ?? 1) - 1, day ?? 1);
  date.setDate(date.getDate() - 7);
  const nextMonth = String(date.getMonth() + 1).padStart(2, "0");
  const nextDay = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${nextMonth}-${nextDay}`;
}

function store(value: unknown) {
  window.localStorage.setItem(HIDDEN_FEEDBACK_KEY, JSON.stringify(value));
}

afterEach(() => {
  window.localStorage.removeItem(HIDDEN_FEEDBACK_KEY);
  sessionStorage.removeItem(HIDDEN_FEEDBACK_KEY);
  focusState.settings = { activeAthleteId: "athlete-9" };
  focusState.calls.length = 0;
});

describe("readHiddenFeedback", () => {
  it("returns this week's hidden keys", () => {
    store({ week: week(), hidden: ["set-focus:pace:pace-1"] });
    expect([...readHiddenFeedback()]).toEqual(["set-focus:pace:pace-1"]);
  });

  it("returns an empty set for last week and leaves that value stored", () => {
    const lastWeek = { week: previousMonday(week()), hidden: ["set-focus:pace:pace-1"] };
    store(lastWeek);
    expect(readHiddenFeedback().size).toBe(0);
    expect(JSON.parse(window.localStorage.getItem(HIDDEN_FEEDBACK_KEY) ?? "null")).toEqual(lastWeek);
  });

  it("returns an empty set for malformed JSON", () => {
    window.localStorage.setItem(HIDDEN_FEEDBACK_KEY, "{not json");
    expect(readHiddenFeedback().size).toBe(0);
  });
});

describe("writeHiddenFeedback", () => {
  it("overwrites last week's value with this Monday and the new set", () => {
    store({ week: previousMonday(week()), hidden: ["old"] });
    writeHiddenFeedback(new Set(["set-focus:race:spring-open"]));
    expect(JSON.parse(window.localStorage.getItem(HIDDEN_FEEDBACK_KEY) ?? "null")).toEqual({
      week: week(),
      hidden: ["set-focus:race:spring-open"],
    });
    expect([...readHiddenFeedback()]).toEqual(["set-focus:race:spring-open"]);
  });
});

describe("useHiddenFeedback", () => {
  it("updates when a storage event for this key arrives from another tab", () => {
    const { result } = renderHook(() => useHiddenFeedback());
    expect(result.current[0].size).toBe(0);

    store({ week: week(), hidden: ["from-other-tab"] });
    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: HIDDEN_FEEDBACK_KEY }));
    });

    expect([...result.current[0]]).toEqual(["from-other-tab"]);
  });

  it("updates immediately when this tab writes", () => {
    const { result } = renderHook(() => useHiddenFeedback());
    act(() => {
      result.current[1](new Set(["from-this-tab"]));
    });
    expect([...result.current[0]]).toEqual(["from-this-tab"]);
    expect(JSON.parse(window.localStorage.getItem(HIDDEN_FEEDBACK_KEY) ?? "null")).toEqual({
      week: week(),
      hidden: ["from-this-tab"],
    });
  });
});

describe("usePlanFocus", () => {
  it("does not write a lindsay path when there is no current athlete", () => {
    focusState.settings = {};
    const { result } = renderHook(() => usePlanFocus());
    act(() => {
      result.current[1]("lean");
    });
    expect(focusState.calls).toEqual([]);
  });

  it("writes the current athlete, not lindsay", async () => {
    focusState.settings = { activeAthleteId: "athlete-9" };
    const { result } = renderHook(() => usePlanFocus());
    await act(async () => {
      result.current[1]("lean");
    });
    expect(focusState.calls).toEqual([
      { ctx: { db: {}, userId: "user-1", athleteId: "athlete-9" }, focus: "lean" },
    ]);
  });
});
