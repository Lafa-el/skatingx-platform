// @vitest-environment happy-dom
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

import { HIDDEN_FEEDBACK_KEY } from "@/modules/training/plan/plan-session";
import { legacyColourClasses } from "@/test/legacyLook";
import { render, screen, userEvent, waitFor } from "@/test/dom";

import { AnalysisHubPage } from "./AnalysisHubPage";

type AnalysisRow = {
  kind: "pace" | "biomech";
  id: string;
  createdAt: string;
  /** Absent in older fixtures, which stand for records saved before distance was stored. */
  distance?: "500" | "777" | "1000" | null;
  findings: { code: string }[];
  biomech: { avgKnee: number | null; avgLean: number | null; readableFrames?: number } | null;
  pace: {
    decayPercent: number | null;
    stabilityIndexPercent?: number | null;
    rating: "excellent" | "needs-work" | "moderate" | null;
    /** Absent in older fixtures, which stand for records saved before the totals were read. */
    totalSeconds?: number | null;
    benchmarkTotalSeconds?: number | null;
    trainingEmphasisRatio?: string | null;
  } | null;
};

type EquipmentRow = {
  id: string;
  createdAt: string;
  symptomKey: string;
  symptomText: string;
  findings?: { code: string }[];
};

const state = vi.hoisted(() => ({
  locale: "zh" as "zh" | "en",
  uid: "user-1" as string | null,
  authLoading: false,
  db: {} as object | null,
  analysesMode: "hold" as "hold" | "ready" | "error",
  equipmentMode: "hold" as "hold" | "ready" | "error",
  analyses: [] as AnalysisRow[],
  equipment: [] as EquipmentRow[],
  // Documents each snapshot left out whole, as the subscription reports them.
  analysesDropped: 0,
  equipmentDropped: 0,
  // Settings as the page reads them: the default names the athlete, a test can leave it out or change it.
  settings: { activeAthleteId: "lindsay" } as { activeAthleteId?: string } | null,
  // The athlete id each equipment subscription was opened for.
  equipmentAthletes: [] as unknown[],
  // The training state the plan focus is stored on (ADR-008). A tiny store so a write re-renders.
  training: { value: null as Record<string, unknown> | null, listeners: new Set<() => void>() },
  setPlanFocus: vi.fn(),
  setPlanFocusFails: false,
}));

vi.mock("@/hooks/useLocale", () => ({ useLocale: () => state.locale }));
vi.mock("@/app/providers/AuthProvider", () => ({
  useAuth: () => ({ uid: state.uid, loading: state.authLoading, firebaseReady: true }),
}));
vi.mock("@/app/providers/FirestoreProvider", async () => {
  const { useSyncExternalStore } = await import("react");
  return {
    useTrainingState: () => ({
      data: useSyncExternalStore(
        (listener) => {
          state.training.listeners.add(listener);
          return () => state.training.listeners.delete(listener);
        },
        () => state.training.value,
      ),
      loading: false,
      error: null,
    }),
    useUserSettings: () => ({ data: state.settings, loading: false, error: null }),
  };
});
vi.mock("@skatingx/firebase-client", () => ({
  getFirestoreDb: () => state.db,
  setPlanFocus: async (ctx: unknown, focus: string) => {
    state.setPlanFocus(ctx, focus);
    if (state.setPlanFocusFails) throw new Error("write");
    const { mondayOfWeek } = await import("@skatingx/skating-domain");
    const { todayDateString } = await import("@skatingx/schema");
    state.training.value = { planFocus: focus, planFocusWeek: mondayOfWeek(todayDateString()), todayTasks: [] };
    for (const listener of state.training.listeners) listener();
  },
  subscribeToSavedAnalyses: (
    _db: unknown,
    _uid: unknown,
    onData: (rows: AnalysisRow[], dropped: number) => void,
    onError: (error: unknown) => void,
  ) => {
    if (state.analysesMode === "ready") onData(state.analyses, state.analysesDropped);
    if (state.analysesMode === "error") onError(new Error("read"));
    return () => undefined;
  },
  subscribeToEquipmentHistory: (
    _db: unknown,
    _uid: unknown,
    athlete: unknown,
    onData: (rows: EquipmentRow[], dropped: number) => void,
    onError: (error: unknown) => void,
  ) => {
    state.equipmentAthletes.push(athlete);
    if (state.equipmentMode === "ready") onData(state.equipment, state.equipmentDropped);
    if (state.equipmentMode === "error") onError(new Error("read"));
    return () => undefined;
  },
}));

function renderHub(): ReactElement {
  return (
    <MemoryRouter>
      <AnalysisHubPage />
    </MemoryRouter>
  );
}

function readyEmpty() {
  state.analysesMode = "ready";
  state.equipmentMode = "ready";
  state.analyses = [];
  state.equipment = [];
}

afterEach(() => {
  state.training.value = null;
  state.setPlanFocus.mockClear();
  state.setPlanFocusFails = false;
  state.locale = "zh";
  state.uid = "user-1";
  state.authLoading = false;
  state.db = {};
  state.analysesMode = "hold";
  state.equipmentMode = "hold";
  state.analyses = [];
  state.equipment = [];
  state.analysesDropped = 0;
  state.equipmentDropped = 0;
  state.settings = { activeAthleteId: "lindsay" };
  state.equipmentAthletes = [];
  sessionStorage.clear();
  window.localStorage.removeItem(HIDDEN_FEEDBACK_KEY);
});

describe.each(["zh", "en"] as const)("analysis hub (%s)", (locale) => {
  it("shows the section title while data is still loading", () => {
    state.locale = locale;
    render(renderHub());
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(locale === "zh" ? "分析" : "Analysis");
    expect(screen.getByText(locale === "zh" ? "动作分析、配速图表和装备追踪。" : "Biomechanics, pacing charts, and equipment tracking.")).toBeTruthy();
    expect(screen.getAllByRole("status").length).toBeGreaterThan(0);
    expect(screen.queryByRole("link", { name: locale === "zh" ? "去做动作分析" : "Record movement" })).toBeNull();
  });
});

describe("analysis hub: wording", () => {
  it("English does not call the hub a lab", () => {
    state.locale = "en";
    readyEmpty();
    const view = render(renderHub());
    expect(view.container.textContent).not.toMatch(/\blab\b/i);
  });

  it("names the cockpit card 生物力学 and the tool card 动作分析", () => {
    readyEmpty();
    render(renderHub());
    expect(screen.getByRole("heading", { name: "生物力学" })).toBeTruthy();
    expect(screen.getByText("动作分析")).toBeTruthy();
    expect(screen.getByRole("link", { name: /去做动作分析/ })).toBeTruthy();
  });
});

describe("analysis hub: states", () => {
  it("uses the UI v1 look", () => {
    readyEmpty();
    const view = render(renderHub());
    expect(legacyColourClasses(view.container)).toEqual([]);
    expect(screen.getByRole("heading", { level: 1 }).className).toContain("text-brand-navy");
    expect(view.container.querySelector("svg")).not.toBeNull();
  });

  it("shows an error with retry on the failed source and keeps the other source", async () => {
    state.analysesMode = "error";
    state.equipmentMode = "ready";
    state.equipment = [
      {
        id: "eq-1",
        createdAt: "2026-10-20T00:00:00.000Z",
        symptomKey: "slide",
        symptomText: "左弯发飘",
        findings: [{ code: "equipment.symptom.slide" }],
      },
    ];
    render(renderHub());
    expect(screen.getAllByText("动作分析和配速这次没有读出来。").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "重试生物力学" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "去做动作分析" })).toBeNull();
    expect(screen.getAllByText(/左弯发飘/).length).toBeGreaterThan(0);
    expect(screen.queryByText("还没有分析记录。")).toBeNull();
    expect(screen.getByText("还有一类记录这次没有读出来，所以没有列在这里。")).toBeTruthy();

    state.analysesMode = "ready";
    state.analyses = [
      {
        kind: "biomech",
        id: "bio-1",
        createdAt: "2026-10-18T00:00:00.000Z",
        findings: [],
        biomech: { avgKnee: 108, avgLean: 42 },
        pace: null,
      },
    ];
    await userEvent.setup().click(screen.getByRole("button", { name: "重试生物力学" }));
    expect(screen.getByText("42°")).toBeTruthy();
    expect(screen.queryByText("与上一次相差")).toBeNull();
    expect(document.querySelector("#hub-biomech polyline, [data-testid='hub-biomech'] polyline")).toBeNull();
  });

  describe("an empty lane whose source had documents it could not read", () => {
    const NOTE = "有部分记录无法读取";
    const inside = (view: ReturnType<typeof render>, testId: string) =>
      view.container.querySelector(`[data-testid='${testId}']`)?.textContent ?? "";

    it("the biomechanics, pace and equipment cards each add the note to their usual empty text and link", () => {
      readyEmpty();
      state.analysesDropped = 2;
      state.equipmentDropped = 1;
      const view = render(renderHub());
      for (const [testId, body, cta] of [
        ["hub-biomech", "还没有可显示的动作分析。", "去做动作分析"],
        ["hub-pace", "还没有可显示的配速。", "去记配速"],
        ["hub-equipment", "还没有可显示的装备记录。", "去记装备"],
      ] as const) {
        expect(inside(view, testId)).toContain(NOTE);
        expect(inside(view, testId)).toContain(body); // the plain text stays
        expect(inside(view, testId)).toContain(cta); // and so does the link
      }
    });

    it("each note follows its own source: unreadable analyses do not mark the equipment card", () => {
      readyEmpty();
      state.analysesDropped = 1;
      const view = render(renderHub());
      expect(inside(view, "hub-biomech")).toContain(NOTE);
      expect(inside(view, "hub-pace")).toContain(NOTE);
      expect(inside(view, "hub-equipment")).not.toContain(NOTE);
    });

    it("nothing dropped: the empty lanes have no note", () => {
      readyEmpty();
      const view = render(renderHub());
      expect(view.container.textContent).not.toContain(NOTE);
      expect(inside(view, "hub-biomech")).toContain("还没有可显示的动作分析。");
    });

    it("a lane that has records gets no note, only the empty case is told apart", () => {
      state.analysesMode = "ready";
      state.equipmentMode = "ready";
      state.analysesDropped = 3;
      state.analyses = [
        { kind: "biomech", id: "b1", createdAt: "2026-10-18T00:00:00.000Z", findings: [], biomech: { avgKnee: 108, avgLean: 42 }, pace: null },
      ];
      const view = render(renderHub());
      expect(inside(view, "hub-biomech")).not.toContain(NOTE);
      expect(inside(view, "hub-pace")).toContain(NOTE); // pace is still empty
    });

    it("a failed read keeps the existing error and retry, with no note on top", () => {
      state.analysesMode = "error";
      state.equipmentMode = "error";
      state.analysesDropped = 5;
      state.equipmentDropped = 5;
      const view = render(renderHub());
      expect(screen.getByRole("button", { name: "重试生物力学" })).toBeTruthy();
      expect(screen.getByRole("button", { name: "重试装备" })).toBeTruthy();
      expect(view.container.textContent).not.toContain(NOTE);
    });

    it("shows the English note in English", () => {
      state.locale = "en";
      readyEmpty();
      state.equipmentDropped = 1;
      const view = render(renderHub());
      expect(inside(view, "hub-equipment")).toContain("Some records could not be read");
    });
  });

  describe("an equipment record whose findings were never stored", () => {
    const old = (over: Record<string, unknown>) => ({
      id: "eq-old",
      createdAt: "2026-10-20T00:00:00.000Z",
      symptomKey: "slide",
      symptomText: "左弯发飘",
      ...over,
    });

    it("still gives the review hero, from the recorded symptom", () => {
      state.analysesMode = "ready";
      state.equipmentMode = "ready";
      state.equipment = [old({})];
      render(renderHub());
      expect(screen.getByTestId("hub-suggestion").getAttribute("data-status")).toBe("ready");
      expect(screen.getByText("复查装备。这不会改本周计划。")).toBeTruthy();
      expect(screen.getByRole("link", { name: "打开装备页" })).toBeTruthy();
    });

    it("gives no hero when the recorded symptom is not a known one", () => {
      state.analysesMode = "ready";
      state.equipmentMode = "ready";
      state.equipment = [old({ symptomKey: "constructor" })];
      render(renderHub());
      expect(screen.queryByTestId("hub-suggestion")).toBeNull();
    });

    it("a record saved with findings behaves as before", () => {
      state.analysesMode = "ready";
      state.equipmentMode = "ready";
      state.equipment = [old({ findings: [{ code: "equipment.symptom.slide" }] })];
      render(renderHub());
      expect(screen.getByText("复查装备。这不会改本周计划。")).toBeTruthy();
    });
  });

  describe("the no-readable-frames mark on biomechanics", () => {
    const BADGE = "无有效帧";
    const bio = (id: string, createdAt: string, readableFrames: number, avg: number | null) => ({
      kind: "biomech" as const,
      id,
      createdAt,
      findings: [],
      biomech: { avgKnee: avg, avgLean: avg, readableFrames },
      pace: null,
    });
    const inside = (view: ReturnType<typeof render>, testId: string) =>
      view.container.querySelector(`[data-testid='${testId}']`)?.textContent ?? "";

    it("a record with 0 readable frames is marked on the card and in the history row, next to its (missing) values", () => {
      state.analysesMode = "ready";
      state.equipmentMode = "ready";
      state.analyses = [bio("bio-0", "2026-10-18T00:00:00.000Z", 0, null)];
      const view = render(renderHub());
      expect(inside(view, "hub-biomech")).toContain(BADGE);
      expect(inside(view, "hub-recent")).toContain(BADGE);
      expect(inside(view, "hub-biomech")).toContain("—"); // the missing values are still shown, not replaced
      expect(inside(view, "hub-recent")).toContain("— · —");
    });

    it("a record with readable frames has no mark anywhere", () => {
      state.analysesMode = "ready";
      state.equipmentMode = "ready";
      state.analyses = [bio("bio-3", "2026-10-18T00:00:00.000Z", 3, 100)];
      const view = render(renderHub());
      expect(view.container.textContent).not.toContain(BADGE);
    });

    it("the card follows the latest record, and the older unreadable record keeps its mark in the history", () => {
      state.analysesMode = "ready";
      state.equipmentMode = "ready";
      state.analyses = [
        bio("bio-old", "2026-10-01T00:00:00.000Z", 0, null),
        bio("bio-new", "2026-10-08T00:00:00.000Z", 4, 100),
      ];
      const view = render(renderHub());
      expect(inside(view, "hub-biomech")).not.toContain(BADGE);
      expect(inside(view, "hub-recent").split(BADGE)).toHaveLength(2); // exactly one row marked

      state.analyses = [
        bio("bio-old", "2026-10-01T00:00:00.000Z", 4, 100),
        bio("bio-new", "2026-10-08T00:00:00.000Z", 0, null),
      ];
      view.unmount();
      const again = render(renderHub());
      expect(inside(again, "hub-biomech")).toContain(BADGE);
    });

    it("a record without a count (not known) is not marked, and a pace record never is", () => {
      state.analysesMode = "ready";
      state.equipmentMode = "ready";
      state.analyses = [
        {
          kind: "biomech",
          id: "bio-unknown",
          createdAt: "2026-10-18T00:00:00.000Z",
          findings: [],
          biomech: { avgKnee: null, avgLean: null },
          pace: null,
        },
        {
          kind: "pace",
          id: "pace-1",
          createdAt: "2026-10-19T00:00:00.000Z",
          findings: [],
          biomech: null,
          pace: { decayPercent: 4, rating: "moderate" },
        },
      ];
      const view = render(renderHub());
      expect(view.container.textContent).not.toContain(BADGE);
    });

    it("shows the English mark in English", () => {
      state.locale = "en";
      state.analysesMode = "ready";
      state.equipmentMode = "ready";
      state.analyses = [bio("bio-0", "2026-10-18T00:00:00.000Z", 0, null)];
      const view = render(renderHub());
      expect(inside(view, "hub-biomech")).toContain("No readable frames");
      expect(inside(view, "hub-recent")).toContain("No readable frames");
    });
  });

  it("draws a delta and a sparkline only when a kind has two records", () => {
    state.analysesMode = "ready";
    state.equipmentMode = "ready";
    state.analyses = [
      {
        kind: "biomech",
        id: "bio-old",
        createdAt: "2026-10-01T00:00:00.000Z",
        findings: [],
        biomech: { avgKnee: 100, avgLean: 40 },
        pace: null,
      },
      {
        kind: "biomech",
        id: "bio-new",
        createdAt: "2026-10-08T00:00:00.000Z",
        findings: [{ code: "biomech.knee.high" }],
        biomech: { avgKnee: 100, avgLean: 50 },
        pace: null,
      },
    ];
    const view = render(renderHub());
    const biomech = view.container.querySelector("[data-testid='hub-biomech']");
    expect(biomech?.textContent).toContain("与上一次相差 ↑ +10");
    expect(biomech?.querySelectorAll("polyline")).toHaveLength(2);
    expect(screen.queryByTestId("hub-suggestion")).toBeTruthy();
  });

  it("accepts with the same plan focus, and the accepted suggestion is gone (no inferred 'accepted' line)", async () => {
    state.analysesMode = "ready";
    state.equipmentMode = "ready";
    state.analyses = [
      {
        kind: "pace",
        id: "pace-1",
        createdAt: "2026-10-20T00:00:00.000Z",
        findings: [{ code: "pace.decay.back-half" }],
        biomech: null,
        pace: { decayPercent: 6.5, rating: "needs-work" },
      },
    ];
    const user = userEvent.setup();
    const view = render(renderHub());
    expect(view.container.querySelector(".sx-energy-gradient")).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "接受" }));
    expect(state.setPlanFocus).toHaveBeenCalledWith({ db: {}, userId: "user-1", athleteId: "lindsay" }, "bounce");
    expect(state.training.value).toMatchObject({ planFocus: "bounce" });
    // The focus store updates asynchronously, so wait for the absence instead of reading it once.
    await waitFor(() => expect(screen.queryByTestId("hub-suggestion")).toBeNull());
    expect(screen.queryByText(/已设为本周重点/)).toBeNull();
    expect(screen.queryByRole("button", { name: "接受" })).toBeNull();
  });

  it("ignores with the same hidden key", async () => {
    paceSuggestion();
    const user = userEvent.setup();
    render(renderHub());
    await user.click(screen.getByRole("button", { name: "忽略" }));
    expect(screen.queryByTestId("hub-suggestion")).toBeNull();
    expect(JSON.parse(window.localStorage.getItem(HIDDEN_FEEDBACK_KEY) ?? "null")).toMatchObject({
      hidden: ["set-focus:pace:pace-1"],
    });
  });

  it("after accepting one focus, the hero moves on to the next suggestion instead of going empty", async () => {
    state.analysesMode = "ready";
    state.equipmentMode = "ready";
    state.analyses = [
      {
        kind: "pace",
        id: "pace-1",
        createdAt: "2026-10-20T00:00:00.000Z",
        findings: [{ code: "pace.decay.back-half" }],
        biomech: null,
        pace: { decayPercent: 6.5, rating: "needs-work" },
      },
      {
        kind: "biomech",
        id: "bio-1",
        createdAt: "2026-10-19T00:00:00.000Z",
        findings: [{ code: "biomech.lean.high" }],
        biomech: { avgKnee: 100, avgLean: 55, readableFrames: 3 },
        pace: null,
      },
    ];
    const user = userEvent.setup();
    render(renderHub());
    expect(screen.getByText("将本周侧重设为「速度窗口与500m配速」。")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "接受" }));

    expect(screen.queryByText("将本周侧重设为「速度窗口与500m配速」。")).toBeNull();
    expect(screen.getByText("将本周侧重设为「技术基础与弯道控制」。")).toBeTruthy();
    expect(screen.getByText(/来自生物力学分析 bio-1/)).toBeTruthy();
    expect(screen.queryByText(/已设为本周重点/)).toBeNull();
  });

  const paceSuggestion = () => {
    state.analysesMode = "ready";
    state.equipmentMode = "ready";
    state.analyses = [
      {
        kind: "pace",
        id: "pace-1",
        createdAt: "2026-10-20T00:00:00.000Z",
        findings: [{ code: "pace.decay.back-half" }],
        biomech: null,
        pace: { decayPercent: 6.5, rating: "needs-work" },
      },
    ];
  };

  it("a focus saved earlier this week (set on the plan page, say) removes that suggestion, with no 'accepted' line", async () => {
    paceSuggestion();
    const { mondayOfWeek } = await import("@skatingx/skating-domain");
    const { todayDateString } = await import("@skatingx/schema");
    state.training.value = { planFocus: "bounce", planFocusWeek: mondayOfWeek(todayDateString()), todayTasks: [] };
    render(renderHub());
    expect(screen.queryByTestId("hub-suggestion")).toBeNull();
    expect(screen.queryByText(/已设为本周重点/)).toBeNull();
  });

  it("a different focus set this week does not remove the suggestion for another focus", async () => {
    paceSuggestion();
    const { mondayOfWeek } = await import("@skatingx/skating-domain");
    const { todayDateString } = await import("@skatingx/schema");
    state.training.value = { planFocus: "lean", planFocusWeek: mondayOfWeek(todayDateString()), todayTasks: [] };
    render(renderHub());
    expect(screen.getByRole("button", { name: "接受" })).toBeTruthy();
  });

  it("does not treat a focus from an earlier week as accepted: the suggestion is back", () => {
    paceSuggestion();
    state.training.value = { planFocus: "bounce", planFocusWeek: "2020-01-06", todayTasks: [] };
    render(renderHub());
    expect(screen.queryByText(/已设为本周重点/)).toBeNull();
    expect(screen.getByRole("button", { name: "接受" })).toBeTruthy();
  });

  it("says so when the accepted focus could not be saved, and does not claim it was accepted", async () => {
    paceSuggestion();
    state.setPlanFocusFails = true;
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const user = userEvent.setup();
    render(renderHub());
    await user.click(screen.getByRole("button", { name: "接受" }));
    expect(await screen.findByText("侧重没有保存成功，请再试一次。")).toBeTruthy();
    expect(screen.queryByText(/已设为本周重点/)).toBeNull();
    error.mockRestore();
  });

  it("shows the decay row only when the saved pace record has one", () => {
    state.analysesMode = "ready";
    state.equipmentMode = "ready";
    state.analyses = [
      {
        kind: "pace",
        id: "pace-old",
        createdAt: "2026-10-01T00:00:00.000Z",
        findings: [],
        biomech: null,
        pace: { decayPercent: null, stabilityIndexPercent: 80, rating: "excellent" },
      },
    ];
    const oldView = render(renderHub());
    const oldPace = oldView.container.querySelector("[data-testid='hub-pace']");
    expect(oldPace?.textContent).toContain("优秀");
    expect(oldPace?.textContent).toContain("稳定指数");
    expect(oldPace?.textContent).toContain("80%");
    expect(oldPace?.textContent).not.toContain("后程衰减");
    expect(oldPace?.textContent).not.toContain("—");
    oldView.unmount();

    state.analyses = [
      {
        kind: "pace",
        id: "pace-new",
        createdAt: "2026-10-09T00:00:00.000Z",
        distance: "500",
        findings: [],
        biomech: null,
        pace: { decayPercent: 6.5, stabilityIndexPercent: 72, rating: "needs-work" },
      },
    ];
    const next = render(renderHub());
    const pace = next.container.querySelector("[data-testid='hub-pace']");
    expect(pace?.textContent).toContain("需强化");
    expect(pace?.textContent).toContain("稳定指数");
    expect(pace?.textContent).toContain("72%");
    expect(pace?.textContent).toContain("500m 后程衰减");
    expect(pace?.textContent).toContain("6.5%");
  });

  it("draws one decay row per distance that has records", () => {
    state.analysesMode = "ready";
    state.equipmentMode = "ready";
    const paceRow = (id: string, createdAt: string, distance: "500" | "777" | "1000", decayPercent: number): AnalysisRow => ({
      kind: "pace",
      id,
      createdAt,
      distance,
      findings: [],
      biomech: null,
      pace: { decayPercent, stabilityIndexPercent: 75, rating: "moderate" },
    });
    state.analyses = [
      paceRow("p1", "2026-10-01T00:00:00.000Z", "1000", 9),
      paceRow("p2", "2026-10-02T00:00:00.000Z", "500", 4),
      paceRow("p3", "2026-10-03T00:00:00.000Z", "500", 6),
    ];
    const view = render(renderHub());
    const pace = view.container.querySelector("[data-testid='hub-pace']");
    const row500 = view.container.querySelector("[data-testid='hub-pace-decay-500']");
    const row1000 = view.container.querySelector("[data-testid='hub-pace-decay-1000']");
    expect(row500?.textContent).toContain("500m 后程衰减");
    expect(row500?.textContent).toContain("6%");
    expect(row1000?.textContent).toContain("1000m 后程衰减");
    expect(row1000?.textContent).toContain("9%");
    expect(view.container.querySelector("[data-testid='hub-pace-decay-777']")).toBeNull();
    expect(pace?.querySelectorAll("[data-testid^='hub-pace-decay-']")).toHaveLength(2);
  });

  it("keeps the headline and draws no trend rows when every pace record is from before distance was stored", () => {
    state.analysesMode = "ready";
    state.equipmentMode = "ready";
    state.analyses = [
      {
        kind: "pace",
        id: "pace-legacy-1",
        createdAt: "2026-10-01T00:00:00.000Z",
        findings: [],
        biomech: null,
        pace: { decayPercent: 4, stabilityIndexPercent: 80, rating: "excellent" },
      },
      {
        kind: "pace",
        id: "pace-legacy-2",
        createdAt: "2026-10-02T00:00:00.000Z",
        distance: null,
        findings: [],
        biomech: null,
        pace: { decayPercent: 5, stabilityIndexPercent: 72, rating: "needs-work" },
      },
    ];
    const view = render(renderHub());
    const pace = view.container.querySelector("[data-testid='hub-pace']");
    expect(pace?.textContent).toContain("需强化");
    expect(pace?.textContent).toContain("72%");
    expect(pace?.textContent).not.toContain("后程衰减");
    expect(pace?.querySelectorAll("[data-testid^='hub-pace-decay-']")).toHaveLength(0);
  });

  it("opens equipment for a review suggestion and does not set a focus", () => {
    state.analysesMode = "ready";
    state.equipmentMode = "ready";
    state.equipment = [
      {
        id: "eq-1",
        createdAt: "2026-10-20T00:00:00.000Z",
        symptomKey: "slide",
        symptomText: "",
        findings: [{ code: "equipment.symptom.slide" }],
      },
    ];
    render(renderHub());
    const link = screen.getByRole("link", { name: "打开装备页" });
    expect(link.getAttribute("href")).toBe("/analysis/equipment");
    expect(screen.queryByRole("button", { name: "接受" })).toBeNull();
    expect(state.setPlanFocus).not.toHaveBeenCalled();
  });

  it("does not show empty calls to action when signed out", () => {
    state.uid = null;
    readyEmpty();
    render(renderHub());
    expect(screen.getByText("登录后才能显示你的分析。")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "去做动作分析" })).toBeNull();
  });
});

describe("analysis hub: which athlete the equipment history is read for", () => {
  it("reads the athlete in settings", () => {
    readyEmpty();
    state.settings = { activeAthleteId: "athlete-9" };
    render(renderHub());
    expect(state.equipmentAthletes).toEqual(["athlete-9"]);
  });

  it("reads lindsay when settings name no athlete, or are not available", () => {
    readyEmpty();
    state.settings = {};
    const first = render(renderHub());
    expect(state.equipmentAthletes).toEqual(["lindsay"]);
    first.unmount();
    state.settings = null;
    render(renderHub());
    expect(state.equipmentAthletes).toEqual(["lindsay", "lindsay"]);
  });

  it("opens a new equipment subscription when the athlete changes", () => {
    readyEmpty();
    const view = render(renderHub());
    expect(state.equipmentAthletes).toEqual(["lindsay"]);
    state.settings = { activeAthleteId: "athlete-9" };
    view.rerender(renderHub());
    expect(state.equipmentAthletes).toEqual(["lindsay", "athlete-9"]);
  });
});

describe("analysis hub: the pace totals a saved record stores", () => {
  const paceRow = (id: string, createdAt: string, pace: NonNullable<AnalysisRow["pace"]>): AnalysisRow => ({
    kind: "pace",
    id,
    createdAt,
    distance: "500",
    findings: [],
    biomech: null,
    pace,
  });
  const full = { decayPercent: 6.5, stabilityIndexPercent: 80, rating: "excellent" as const, totalSeconds: 52.3, benchmarkTotalSeconds: 50, trainingEmphasisRatio: "60:40" };
  const show = (rows: AnalysisRow[], locale: "zh" | "en" = "zh") => {
    state.locale = locale;
    state.analysesMode = "ready";
    state.equipmentMode = "ready";
    state.analyses = rows;
    const view = render(renderHub());
    return {
      card: view.container.querySelector("[data-testid='hub-pace']")?.textContent ?? "",
      recent: view.container.querySelector("[data-testid='hub-recent']")?.textContent ?? "",
      view,
    };
  };

  it("the card has the total, benchmark total and emphasis rows, with two decimals and an s", () => {
    const { card } = show([paceRow("p1", "2026-10-09T00:00:00.000Z", full)]);
    expect(card).toContain("总成绩");
    expect(card).toContain("52.30s");
    expect(card).toContain("标杆总成绩");
    expect(card).toContain("50.00s");
    expect(card).toContain("训练侧重");
    expect(card).toContain("60:40");
  });

  it("the card has English labels in English", () => {
    const { card } = show([paceRow("p1", "2026-10-09T00:00:00.000Z", full)], "en");
    expect(card).toContain("Total");
    expect(card).toContain("52.30s");
    expect(card).toContain("Benchmark total");
    expect(card).toContain("Training emphasis");
    expect(card).toContain("60:40");
  });

  it("a row whose field is missing is not drawn, and the others are", () => {
    const { card } = show([paceRow("p1", "2026-10-09T00:00:00.000Z", { ...full, benchmarkTotalSeconds: null, trainingEmphasisRatio: null })]);
    expect(card).toContain("52.30s");
    expect(card).not.toContain("标杆总成绩");
    expect(card).not.toContain("训练侧重");
    expect(card).not.toContain("—");
  });

  it("a record saved before the totals were read draws none of the three rows (guard)", () => {
    const { card } = show([paceRow("p0", "2026-10-01T00:00:00.000Z", { decayPercent: 6.5, stabilityIndexPercent: 80, rating: "excellent" })]);
    expect(card).toContain("优秀");
    expect(card).toContain("80%");
    expect(card).toContain("500m 后程衰减");
    expect(card).not.toContain("总成绩");
    expect(card).not.toContain("训练侧重");
  });

  it("the list title starts with the total when the total is there", () => {
    expect(show([paceRow("p1", "2026-10-09T00:00:00.000Z", full)]).recent).toContain("52.30s · 优秀 · 稳定指数 80%");
  });

  it("the list title in English", () => {
    expect(show([paceRow("p1", "2026-10-09T00:00:00.000Z", full)], "en").recent).toContain("52.30s · Strong · Stability index 80%");
  });

  it("the list title without a stability index is the total and the rating", () => {
    expect(show([paceRow("p1", "2026-10-09T00:00:00.000Z", { ...full, stabilityIndexPercent: null })]).recent).toContain("52.30s · 优秀");
    expect(show([paceRow("p1", "2026-10-09T00:00:00.000Z", { ...full, stabilityIndexPercent: null })]).recent).not.toContain("稳定指数");
  });

  it("the list title without a total is what it was: the rating and the stability index, or the rating alone (guard)", () => {
    const old = { decayPercent: null, stabilityIndexPercent: 80, rating: "excellent" as const };
    const withStability = show([paceRow("p0", "2026-10-01T00:00:00.000Z", old)]);
    expect(withStability.recent).toContain("优秀 · 稳定指数 80%");
    expect(withStability.recent).not.toContain("s ·");
    withStability.view.unmount();
    const ratingOnly = show([paceRow("p0", "2026-10-01T00:00:00.000Z", { ...old, stabilityIndexPercent: null })]);
    expect(ratingOnly.recent).toContain("优秀");
    expect(ratingOnly.recent).not.toContain("稳定指数");
    expect(ratingOnly.recent).not.toContain("·");
  });

  it("a biomechanics card and the other lanes do not change when pace records carry totals", () => {
    state.equipment = [{ id: "eq-1", createdAt: "2026-10-08T00:00:00.000Z", symptomKey: "slide", symptomText: "左脚打滑", findings: [] }];
    const biomech: AnalysisRow = {
      kind: "biomech",
      id: "bio-1",
      createdAt: "2026-10-07T00:00:00.000Z",
      findings: [],
      biomech: { avgKnee: 120, avgLean: 15, readableFrames: 4 },
      pace: null,
    };
    state.locale = "zh";
    state.analysesMode = "ready";
    state.equipmentMode = "ready";
    state.analyses = [biomech, paceRow("p1", "2026-10-09T00:00:00.000Z", full)];
    const { container } = render(renderHub());
    const bio = container.querySelector("[data-testid='hub-biomech']")?.textContent ?? "";
    expect(bio).toContain("15°");
    expect(bio).toContain("120°");
    expect(bio).not.toContain("总成绩");
    expect(bio).not.toMatch(/\d\.\d{2}s/);
    const equipment = container.querySelector("[data-testid='hub-equipment']")?.textContent ?? "";
    expect(equipment).toContain("左脚打滑");
    expect(equipment).not.toContain("总成绩");
    const recent = container.querySelector("[data-testid='hub-recent']")?.textContent ?? "";
    expect(recent).toContain("15°");
    expect(recent).toContain("左脚打滑");
  });
});

describe("analysis hub: unparseable dates stay out, and unknown symptoms use the other-feedback line", () => {
  it("a record whose createdAt is not a date is not on the card or in the list", () => {
    state.analysesMode = "ready";
    state.equipmentMode = "ready";
    state.analyses = [
      {
        kind: "biomech",
        id: "bad-date",
        createdAt: "not-a-date",
        findings: [],
        biomech: { avgKnee: 100, avgLean: 20, readableFrames: 2 },
        pace: null,
      },
      {
        kind: "biomech",
        id: "good",
        createdAt: "2026-10-09T00:00:00.000Z",
        findings: [],
        biomech: { avgKnee: 110, avgLean: 15, readableFrames: 2 },
        pace: null,
      },
    ];
    const { container } = render(renderHub());
    const bio = container.querySelector("[data-testid='hub-biomech']")?.textContent ?? "";
    expect(bio).toContain("15°");
    expect(bio).toContain("110°");
    expect(bio).not.toContain("20°");
    const recent = container.querySelector("[data-testid='hub-recent']")?.textContent ?? "";
    expect(recent).toContain("15°");
    expect(recent).not.toContain("20°");
  });

  it("an unknown symptom with text uses the other-feedback line; a known key stays; empty text stays empty", () => {
    state.analysesMode = "ready";
    state.equipmentMode = "ready";
    state.equipment = [
      { id: "eq-1", createdAt: "2026-10-09T00:00:00.000Z", symptomKey: "mystery", symptomText: "左脚发软" },
    ];
    const first = render(renderHub());
    expect(first.container.querySelector("[data-testid='hub-equipment']")?.textContent).toContain("其它反馈 · 左脚发软");
    first.unmount();

    state.equipment = [
      { id: "eq-2", createdAt: "2026-10-09T00:00:00.000Z", symptomKey: "slide", symptomText: "弯道咬冰不足，弯中有向外侧滑的感觉。" },
    ];
    const known = render(renderHub());
    expect(known.container.querySelector("[data-testid='hub-equipment']")?.textContent).toContain("弯道咬冰不足");
    expect(known.container.querySelector("[data-testid='hub-equipment']")?.textContent).not.toContain("其它反馈");
    known.unmount();

    state.equipment = [{ id: "eq-3", createdAt: "2026-10-09T00:00:00.000Z", symptomKey: "mystery", symptomText: "" }];
    const empty = render(renderHub());
    expect(empty.container.querySelector("[data-testid='hub-equipment']")?.textContent).toContain("未记录具体反馈");
    expect(empty.container.querySelector("[data-testid='hub-equipment']")?.textContent).not.toContain("其它反馈");
  });
});

describe("analysis hub: a biomechanics record can open its frames", () => {
  it("links the biomechanics card and the biomechanics row, and not pace or equipment", () => {
    state.analysesMode = "ready";
    state.equipmentMode = "ready";
    state.analyses = [
      {
        kind: "biomech",
        id: "b1",
        createdAt: "2026-10-18T00:00:00.000Z",
        findings: [],
        biomech: { avgKnee: 108, avgLean: 42, readableFrames: 2 },
        pace: null,
      },
      {
        kind: "pace",
        id: "p1",
        createdAt: "2026-10-17T00:00:00.000Z",
        findings: [],
        biomech: null,
        pace: { decayPercent: 4, rating: "moderate", stabilityIndexPercent: 70 },
      },
    ];
    state.equipment = [
      { id: "eq-1", createdAt: "2026-10-16T00:00:00.000Z", symptomKey: "slide", symptomText: "左脚打滑", findings: [] },
    ];
    render(renderHub());
    const links = screen.getAllByRole("link", { name: "查看逐帧" });
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/analysis/biomechanics/b1",
      "/analysis/biomechanics/b1",
    ]);
    const rows = [...screen.getByTestId("hub-recent").querySelectorAll("li")];
    const pace = rows.find((row) => row.textContent?.includes("配速"));
    const equipment = rows.find((row) => row.textContent?.includes("装备"));
    expect(pace?.textContent).not.toContain("查看逐帧");
    expect(equipment?.textContent).not.toContain("查看逐帧");
    expect(screen.getByTestId("hub-pace").textContent).not.toContain("查看逐帧");
    expect(screen.getByTestId("hub-equipment").textContent).not.toContain("查看逐帧");
  });
});
