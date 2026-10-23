// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AnalysisPacingPage } from "@/pages/analysis/AnalysisPacingPage";
import { render, screen, userEvent, waitFor } from "@/test/dom";
import { legacyColourClasses } from "@/test/legacyLook";

const state = vi.hoisted(() => ({
  locale: "zh" as "zh" | "en",
  uid: null as string | null,
  db: {} as object | null,
  save: vi.fn((_db: unknown, _record: unknown) => Promise.resolve()),
  configs: [] as unknown[],
  destroyed: 0,
}));

vi.mock("@/hooks/useLocale", () => ({ useLocale: () => state.locale }));
vi.mock("@/app/providers/AuthProvider", () => ({
  useAuth: () => ({ uid: state.uid, loading: false, firebaseReady: Boolean(state.uid) }),
}));
vi.mock("@skatingx/firebase-client", () => ({
  getFirestoreDb: () => state.db,
  savePaceAnalysisRecord: (db: unknown, record: unknown) => state.save(db, record),
}));
vi.mock("chart.js", () => {
  class Chart {
    static register() {}
    destroy() {
      state.destroyed += 1;
    }
    constructor(_ctx: unknown, config: unknown) {
      state.configs.push(config);
    }
  }
  return {
    Chart,
    LineController: class {},
    LineElement: class {},
    PointElement: class {},
    LinearScale: class {},
    CategoryScale: class {},
    Legend: class {},
    Tooltip: class {},
    Filler: class {},
  };
});

const splits = ["7.2", "9.3", "9.5", "10.4", "11.2"];

async function fillSynthetic500m(user: ReturnType<typeof userEvent.setup>) {
  const labels = ["起跑前半圈 (s)", "Lap 1 (s)", "Lap 2 (s)", "Lap 3 (s)", "Lap 4 (s)"];
  for (const [index, label] of labels.entries()) {
    await user.type(screen.getByLabelText(label), splits[index] ?? "");
  }
}

describe("pacing page", () => {
  beforeEach(() => {
    state.locale = "zh";
    state.uid = null;
    state.db = {};
    state.save.mockReset();
    state.configs.length = 0;
    state.destroyed = 0;
    HTMLCanvasElement.prototype.getContext = (() =>
      ({})) as unknown as typeof HTMLCanvasElement.prototype.getContext;
  });

  afterEach(() => {
    state.locale = "zh";
  });

  it("shows the legacy Chinese pacing screen, with a 44px generate control", () => {
    const view = render(<AnalysisPacingPage />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("分析 · 配速");
    expect(screen.getByRole("heading", { level: 1 }).className).toContain("text-brand-navy");
    expect(screen.getByText("Junior D 配速衰减分析")).toBeTruthy();
    expect(screen.getByText("请在左侧选择距离并填写实际分段，然后点击“生成配速衰减曲线”进行分析。")).toBeTruthy();
    expect(screen.getByRole("button", { name: "生成配速衰减曲线" }).className).toContain("min-h-11");
    expect(view.container.textContent).not.toContain("生物力学");
    expect(legacyColourClasses(view.container)).toEqual([]);
    expect(view.container.querySelector("svg")).not.toBeNull();
  });

  it("saves an even pace with no findings, so it does not carry a focus signal", async () => {
    state.uid = "alice";
    const user = userEvent.setup();
    render(<AnalysisPacingPage />);
    const benchmarkLabels = ["起跑前半圈", "Lap 1", "Lap 2", "Lap 3", "Lap 4"];
    const athleteLabels = ["起跑前半圈 (s)", "Lap 1 (s)", "Lap 2 (s)", "Lap 3 (s)", "Lap 4 (s)"];
    for (const [index, label] of athleteLabels.entries()) {
      const benchmark = screen.getByLabelText(benchmarkLabels[index] ?? "");
      await user.type(screen.getByLabelText(label), (benchmark as HTMLInputElement).value);
    }
    await user.click(screen.getByRole("button", { name: "生成配速衰减曲线" }));
    expect(screen.getByText("优秀")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "保存本次配速" }));
    await waitFor(() => expect(state.save).toHaveBeenCalledTimes(1));
    const record = state.save.mock.calls[0]?.[1] as {
      findings: { code: string }[];
      pace: { findings: { code: string }[] };
    };
    expect(record.findings).toEqual([]);
    expect(record.pace.findings).toEqual([]);
  });

  it("rejects an empty split list with the legacy message", async () => {
    const user = userEvent.setup();
    render(<AnalysisPacingPage />);
    await user.click(screen.getByRole("button", { name: "生成配速衰减曲线" }));
    expect(screen.getByRole("alert").textContent).toBe("请输入完整且大于 0 的圈速数据后再生成曲线。");
  });

  it("rates the synthetic 500m splits the same way the locked calculation does", async () => {
    const user = userEvent.setup();
    render(<AnalysisPacingPage />);
    await fillSynthetic500m(user);
    await user.click(screen.getByRole("button", { name: "生成配速衰减曲线" }));
    expect(screen.getByText("需强化")).toBeTruthy();
    expect(screen.getByText("72%")).toBeTruthy();
    expect(screen.getByText("45:55")).toBeTruthy();
    expect(screen.getByText(/总成绩 47\.60s，比 Junior D 标杆慢 1\.88s/)).toBeTruthy();
    await waitFor(() => expect(state.configs).toHaveLength(1));
  });

  it("switches to 777m labels", async () => {
    const user = userEvent.setup();
    render(<AnalysisPacingPage />);
    await user.click(screen.getByRole("button", { name: "777m" }));
    expect(screen.getByLabelText("起跑圈 (s)")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "777m 配速标杆比对" })).toBeTruthy();
  });

  it("saves a lindsay record through the repository and destroys the chart on unmount", async () => {
    state.uid = "alice";
    const user = userEvent.setup();
    const view = render(<AnalysisPacingPage />);
    await fillSynthetic500m(user);
    await user.click(screen.getByRole("button", { name: "生成配速衰减曲线" }));
    await waitFor(() => expect(state.configs).toHaveLength(1));
    await user.click(screen.getByRole("button", { name: "保存本次配速" }));
    await waitFor(() => expect(state.save).toHaveBeenCalledTimes(1));
    const record = state.save.mock.calls[0]?.[1] as {
      athleteId: string;
      createdAt: string;
      provenance: { algorithmVersion: string; schemaVersion: string };
      pace: { rating: string };
    } | undefined;
    expect(record).toBeTruthy();
    if (!record) return;
    expect(record.athleteId).toBe("lindsay");
    expect(record.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(record.provenance.schemaVersion).toBe("skatingx-analysis-contract-v1");
    expect(record.provenance.algorithmVersion).toBe("legacy-pace-port-1");
    expect(record.pace.rating).toBe("needs-work");
    expect(screen.getByText("已保存到你的分析记录。")).toBeTruthy();
    const destroyedBeforeUnmount = state.destroyed;
    view.unmount();
    expect(state.destroyed).toBe(destroyedBeforeUnmount + 1);
  });

  it("does not save when nobody is signed in", async () => {
    const user = userEvent.setup();
    render(<AnalysisPacingPage />);
    await fillSynthetic500m(user);
    await user.click(screen.getByRole("button", { name: "生成配速衰减曲线" }));
    await user.click(screen.getByRole("button", { name: "保存本次配速" }));
    expect(screen.getByRole("alert").textContent).toBe("请先登录后再保存。");
    expect(state.save).not.toHaveBeenCalled();
  });

  it("uses the English draft and does not show the Chinese rating label", async () => {
    state.locale = "en";
    const user = userEvent.setup();
    const view = render(<AnalysisPacingPage />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Analysis · Pacing");
    await user.click(screen.getByRole("button", { name: "Generate the pace-decay curve" }));
    expect(screen.getByRole("alert").textContent).toMatch(/greater than 0/);
    expect(view.container.textContent).not.toContain("生物力学");
    expect(view.container.textContent).not.toContain("需强化");
  });
});
