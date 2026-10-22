// @vitest-environment happy-dom
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

import { HIDDEN_FEEDBACK_KEY, PLAN_FOCUS_KEY } from "@/modules/training/plan/plan-session";
import { legacyColourClasses } from "@/test/legacyLook";
import { render, screen, userEvent } from "@/test/dom";

import { AnalysisHubPage } from "./AnalysisHubPage";

type AnalysisRow = {
  kind: "pace" | "biomech";
  id: string;
  createdAt: string;
  findings: { code: string }[];
  biomech: { avgKnee: number | null; avgLean: number | null } | null;
  pace: { decayPercent: number | null; rating: "excellent" | "needs-work" | "moderate" | null } | null;
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
}));

vi.mock("@/hooks/useLocale", () => ({ useLocale: () => state.locale }));
vi.mock("@/app/providers/AuthProvider", () => ({
  useAuth: () => ({ uid: state.uid, loading: state.authLoading, firebaseReady: true }),
}));
vi.mock("@skatingx/firebase-client", () => ({
  getFirestoreDb: () => state.db,
  subscribeToSavedAnalyses: (
    _db: unknown,
    _uid: unknown,
    onData: (rows: AnalysisRow[]) => void,
    onError: (error: unknown) => void,
  ) => {
    if (state.analysesMode === "ready") onData(state.analyses);
    if (state.analysesMode === "error") onError(new Error("read"));
    return () => undefined;
  },
  subscribeToEquipmentHistory: (
    _db: unknown,
    _uid: unknown,
    _athlete: unknown,
    onData: (rows: EquipmentRow[]) => void,
    onError: (error: unknown) => void,
  ) => {
    if (state.equipmentMode === "ready") onData(state.equipment);
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
  state.locale = "zh";
  state.uid = "user-1";
  state.authLoading = false;
  state.db = {};
  state.analysesMode = "hold";
  state.equipmentMode = "hold";
  state.analyses = [];
  state.equipment = [];
  sessionStorage.clear();
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

  it("accepts with the same plan focus and ignores with the same hidden key", async () => {
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
    expect(sessionStorage.getItem(PLAN_FOCUS_KEY)).toBe("bounce");
    expect(screen.getByText(/已设为本周重点：速度窗口与500m配速/)).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "忽略" }));
    expect(screen.queryByTestId("hub-suggestion")).toBeNull();
    expect(JSON.parse(sessionStorage.getItem(HIDDEN_FEEDBACK_KEY) ?? "[]")).toEqual(["set-focus:pace:pace-1"]);
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
    expect(sessionStorage.getItem(PLAN_FOCUS_KEY)).toBeNull();
  });

  it("does not show empty calls to action when signed out", () => {
    state.uid = null;
    readyEmpty();
    render(renderHub());
    expect(screen.getByText("登录后才能显示你的分析。")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "去做动作分析" })).toBeNull();
  });
});
