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
    expect(screen.getByText("47%")).toBeTruthy();
    expect(screen.getByText("45:55")).toBeTruthy();
    expect(screen.getByText(/总成绩 47\.60s，比 Junior D 标杆快 2\.40s/)).toBeTruthy();
    await waitFor(() => expect(state.configs).toHaveLength(1));
  });

  it("shows the Junior D factory benchmarks for each distance", async () => {
    const user = userEvent.setup();
    render(<AnalysisPacingPage />);
    const read = (label: string) => (screen.getByLabelText(label) as HTMLInputElement).value;
    expect([
      read("起跑前半圈"),
      read("Lap 1"),
      read("Lap 2"),
      read("Lap 3"),
      read("Lap 4"),
    ]).toEqual(["8.00", "10.30", "10.40", "10.50", "10.80"]);

    await user.click(screen.getByRole("button", { name: "777m" }));
    expect([
      read("起跑圈"),
      read("第1圈"),
      read("第2圈"),
      read("第3圈"),
      read("第4圈"),
      read("第5圈"),
      read("冲刺圈"),
    ]).toEqual(["13.80", "10.50", "10.60", "10.70", "10.90", "11.20", "12.30"]);

    await user.click(screen.getByRole("button", { name: "1000m" }));
    expect([
      read("起跑圈"),
      read("第1圈"),
      read("第2圈"),
      read("第3圈"),
      read("第4圈"),
      read("第5圈"),
      read("第6圈"),
      read("第7圈"),
      read("冲刺圈"),
    ]).toEqual(["14.10", "11.60", "11.60", "11.60", "11.50", "11.30", "11.10", "11.30", "10.90"]);
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

  describe("the benchmark is a snapshot taken when the curve is generated", () => {
    const generated = [8, 10.3, 10.4, 10.5, 10.8];
    const settle = () => new Promise((resolve) => setTimeout(resolve, 50));
    const benchmarkSeries = () => {
      const config = state.configs.at(-1) as { data: { datasets: { data: number[] }[] } };
      return config.data.datasets[0]?.data;
    };
    const savedPace = () =>
      (state.save.mock.calls.at(-1)?.[1] as { pace: { benchmarkTotalSeconds: number; totalSeconds: number } }).pace;

    async function editLap1Benchmark(user: ReturnType<typeof userEvent.setup>, value: string) {
      const input = screen.getByLabelText("Lap 1");
      await user.clear(input);
      await user.type(input, value);
    }

    it("keeps the chart, the report and a saved record on the generated benchmark when a box is edited", async () => {
      state.uid = "alice";
      const user = userEvent.setup();
      render(<AnalysisPacingPage />);
      await fillSynthetic500m(user);
      await user.click(screen.getByRole("button", { name: "生成配速衰减曲线" }));
      await waitFor(() => expect(state.configs).toHaveLength(1));
      expect(benchmarkSeries()).toEqual(generated);

      await editLap1Benchmark(user, "9.00");
      await settle();

      // No new chart, and the one on screen still plots the benchmark it was generated with.
      expect(state.configs).toHaveLength(1);
      expect(benchmarkSeries()).toEqual(generated);
      expect(screen.getByText(/总成绩 47\.60s，比 Junior D 标杆快 2\.40s/)).toBeTruthy();
      expect(screen.getByText("需强化")).toBeTruthy();
      expect(screen.getByText("47%")).toBeTruthy();

      await user.click(screen.getByRole("button", { name: "保存本次配速" }));
      await waitFor(() => expect(state.save).toHaveBeenCalledTimes(1));
      expect(savedPace().benchmarkTotalSeconds).toBeCloseTo(50, 5);
      expect(savedPace().totalSeconds).toBeCloseTo(47.6, 5);
    });

    it("the reset button only resets the box: the chart waits for the next generate too", async () => {
      const user = userEvent.setup();
      render(<AnalysisPacingPage />);
      await fillSynthetic500m(user);
      await editLap1Benchmark(user, "9.00");
      await user.click(screen.getByRole("button", { name: "生成配速衰减曲线" }));
      await waitFor(() => expect(state.configs).toHaveLength(1));
      expect(benchmarkSeries()).toEqual([8, 9, 10.4, 10.5, 10.8]);

      await user.click(screen.getByRole("button", { name: "恢复默认标准" }));
      await settle();
      expect((screen.getByLabelText("Lap 1") as HTMLInputElement).value).toBe("10.30");
      expect(state.configs).toHaveLength(1);
      expect(benchmarkSeries()).toEqual([8, 9, 10.4, 10.5, 10.8]);

      await user.click(screen.getByRole("button", { name: "生成配速衰减曲线" }));
      await waitFor(() => expect(state.configs).toHaveLength(2));
      expect(benchmarkSeries()).toEqual(generated);
    });

    it("follows the new benchmark, in the chart and in a saved record, once it is generated again", async () => {
      state.uid = "alice";
      const user = userEvent.setup();
      render(<AnalysisPacingPage />);
      await fillSynthetic500m(user);
      await user.click(screen.getByRole("button", { name: "生成配速衰减曲线" }));
      await waitFor(() => expect(state.configs).toHaveLength(1));

      await editLap1Benchmark(user, "9.00");
      await user.click(screen.getByRole("button", { name: "生成配速衰减曲线" }));
      await waitFor(() => expect(state.configs).toHaveLength(2));
      expect(benchmarkSeries()).toEqual([8, 9, 10.4, 10.5, 10.8]);
      expect(screen.getByText(/总成绩 47\.60s，比 Junior D 标杆快 1\.10s/)).toBeTruthy();

      await user.click(screen.getByRole("button", { name: "保存本次配速" }));
      await waitFor(() => expect(state.save).toHaveBeenCalledTimes(1));
      expect(savedPace().benchmarkTotalSeconds).toBeCloseTo(48.7, 5);
    });

    it("drops the snapshot with the chart when a generate fails", async () => {
      const user = userEvent.setup();
      render(<AnalysisPacingPage />);
      await fillSynthetic500m(user);
      await user.click(screen.getByRole("button", { name: "生成配速衰减曲线" }));
      await waitFor(() => expect(state.configs).toHaveLength(1));

      await editLap1Benchmark(user, "0");
      await user.click(screen.getByRole("button", { name: "生成配速衰减曲线" }));
      expect(screen.getByText("请先填写完整且大于 0 的 Junior D 标准，再生成曲线。")).toBeTruthy();
      // The failed generate cleared the chart together with the analysis.
      expect(screen.getByText("输入分段后生成配速衰减曲线")).toBeTruthy();

      await user.click(screen.getByRole("button", { name: "生成配速衰减曲线" }));
      expect(screen.getByText("输入分段后生成配速衰减曲线")).toBeTruthy();
      expect(state.configs).toHaveLength(1);
    });
  });
});
