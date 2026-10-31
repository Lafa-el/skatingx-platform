// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it, vi } from "vitest";

import { fireEvent } from "@testing-library/react";

import { AnalysisBiomechanicsPage } from "@/pages/analysis/AnalysisBiomechanicsPage";
import { act, render, screen, userEvent, waitFor } from "@/test/dom";
import { legacyColourClasses } from "@/test/legacyLook";

const state = vi.hoisted(() => ({
  locale: "zh" as "zh" | "en",
  uid: "user-1" as string | null,
  db: {} as object | null,
  save: vi.fn((_db: unknown, _record: unknown) => Promise.resolve()),
  release: vi.fn(() => Promise.resolve()),
  prefetch: vi.fn(),
  load: vi.fn((_onResults: (landmarks: unknown) => void) =>
    Promise.resolve({ send: vi.fn(), close: () => state.release() }),
  ),
}));

vi.mock("@/hooks/useLocale", () => ({ useLocale: () => state.locale }));
vi.mock("@/app/providers/AuthProvider", () => ({
  useAuth: () => ({ uid: state.uid, loading: false, firebaseReady: Boolean(state.uid) }),
}));
vi.mock("@skatingx/firebase-client", () => ({
  getFirestoreDb: () => state.db,
  saveBiomechAnalysisRecord: (db: unknown, record: unknown) => state.save(db, record),
}));
vi.mock("@/modules/analysis/biomechanics/pose-engine", () => ({
  loadPoseEngine: (onResults: (landmarks: unknown) => void) => state.load(onResults),
  releasePoseEngine: () => state.release(),
  prefetchPoseAssets: () => state.prefetch(),
  POSE_WARMUP_TIMEOUT_MS: 60_000,
  POSE_SCRIPT_URL: "/mediapipe/pose/0.5.1675469404/pose.js",
}));

afterEach(() => {
  state.locale = "zh";
  state.uid = "user-1";
  state.db = {};
  state.save.mockClear();
  state.load.mockClear();
  state.release.mockClear();
  state.prefetch.mockClear();
  vi.useRealTimers();
});

describe("biomechanics page", () => {
  it("keeps the analyse button waiting for a video and shows the idle warmup line", () => {
    const view = render(<AnalysisBiomechanicsPage />);
    const button = screen.getByRole("button", { name: "请先上传视频" });
    expect(button.hasAttribute("disabled")).toBe(true);
    expect(screen.getByText(/正在加载引擎/)).toBeTruthy();
    expect(screen.getByText("标定纠错：3D Normal Projection Active")).toBeTruthy();
    expect(screen.getByText(/● 已连接/)).toBeTruthy();
    const grid = screen.getByRole("checkbox");
    expect((grid as HTMLInputElement).checked).toBe(false);
    const roll = screen.getByRole("slider", { name: /Roll/ });
    expect(roll.getAttribute("min")).toBe("-15");
    expect(roll.getAttribute("max")).toBe("15");
    expect(view.container.textContent).not.toContain("jsdelivr");
    expect(legacyColourClasses(view.container)).toEqual([]);
    expect(state.load).not.toHaveBeenCalled();
    expect(state.prefetch).toHaveBeenCalledTimes(1);
  });

  it("loads the local pose script only after the video is chosen and analysis starts", async () => {
    const user = userEvent.setup();
    render(<AnalysisBiomechanicsPage />);
    const input = document.querySelector("input[type=file]") as HTMLInputElement;
    const file = new File(["video"], "clip.mp4", { type: "video/mp4" });
    await user.upload(input, file);
    const start = screen.getByRole("button", { name: "启动 Edge 视觉引擎分析" });
    expect(start.hasAttribute("disabled")).toBe(false);
    expect(state.load).not.toHaveBeenCalled();
    await user.click(start);
    expect(state.load).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "采样当前帧" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "暂停" })).toBeTruthy();
  });

  it("uses the English draft when the locale is English", () => {
    state.locale = "en";
    render(<AnalysisBiomechanicsPage />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Analysis · Biomechanics");
    expect(screen.getByRole("button", { name: "Choose a video first" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByText(/Loading the engine/)).toBeTruthy();
  });

  it("closes Pose when the video is reset and when the page unmounts", async () => {
    state.release.mockClear();
    const user = userEvent.setup();
    const view = render(<AnalysisBiomechanicsPage />);
    const input = document.querySelector("input[type=file]") as HTMLInputElement;
    await user.upload(input, new File(["video"], "clip.mp4", { type: "video/mp4" }));
    await user.click(screen.getByRole("button", { name: "启动 Edge 视觉引擎分析" }));
    await screen.findByText(/就绪并缓存在本地/);
    await user.click(screen.getByRole("button", { name: "替换或重置测试视频" }));
    expect(state.release).toHaveBeenCalledTimes(1);
    view.unmount();
    expect(state.release).toHaveBeenCalledTimes(2);
  });

  it("calls Pose.close and keeps locateFile on the same origin", () => {
    const source = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "pose-engine.ts"),
      "utf8",
    );
    expect(source).toMatch(/\.close\s*\(/);
    expect(source).not.toMatch(/https?:\/\//);
    expect(source).toContain("POSE_ASSET_DIRECTORY");
    expect(source).toContain("pose.js");
    expect(source).toContain("modelComplexity: 1");
    expect(source).toContain("smoothLandmarks: true");
    expect(source).toContain("POSE_WARMUP_TIMEOUT_MS = 60_000");
    expect(source).toContain("pose_solution_simd_wasm_bin.wasm");
    expect(source).toContain("pose_landmark_full.tflite");
    expect(source).toContain("pose_solution_packed_assets.data");
    const page = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "BiomechanicsPage.tsx"),
      "utf8",
    );
    expect(page).toContain("prefetchPoseAssets()");
  });

  describe("the save button after a save", () => {
    const saveButton = () => screen.getByRole("button", { name: "保存本次分析" }) as HTMLButtonElement;

    afterEach(() => {
      vi.restoreAllMocks(); // the stage's bounding-box stub and the console spy
    });

    /** Starts the page, locks a target and takes one keyframe: the engine's callback delivers the frame. */
    async function started() {
      const user = userEvent.setup();
      vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
        left: 0,
        top: 0,
        right: 160,
        bottom: 90,
        width: 160,
        height: 90,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      });
      const view = render(<AnalysisBiomechanicsPage />);
      const input = document.querySelector("input[type=file]") as HTMLInputElement;
      await user.upload(input, new File(["video"], "clip.mp4", { type: "video/mp4" }));
      await user.click(screen.getByRole("button", { name: "启动 Edge 视觉引擎分析" }));
      await screen.findByText(/就绪并缓存在本地/);
      const stage = view.container.querySelector("video")!.parentElement!;
      fireEvent.click(stage, { clientX: 80, clientY: 45 });
      const onResults = state.load.mock.calls[0]![0];
      const takeKeyframe = async () => {
        await user.click(screen.getByRole("button", { name: "采样当前帧" }));
        act(() => onResults(null));
      };
      return { user, takeKeyframe };
    }

    it("is disabled with no keyframe, locks after a successful save, and a new keyframe frees it", async () => {
      const { user, takeKeyframe } = await started();
      expect(saveButton().disabled).toBe(true);

      await takeKeyframe();
      expect(screen.getByText("1 / 10")).toBeTruthy();
      expect(saveButton().disabled).toBe(false);

      await user.click(saveButton());
      await screen.findByText("已保存这次分析。");
      expect(state.save).toHaveBeenCalledTimes(1);
      expect(saveButton().disabled).toBe(true);

      await user.click(saveButton());
      expect(state.save).toHaveBeenCalledTimes(1);

      await takeKeyframe();
      expect(screen.getByText("2 / 10")).toBeTruthy();
      expect(saveButton().disabled).toBe(false);
      await user.click(saveButton());
      await waitFor(() => expect(state.save).toHaveBeenCalledTimes(2));
    });

    it("stays clickable when the save fails, and can be retried", async () => {
      const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
      state.save.mockRejectedValueOnce(new Error("cloud down"));
      const { user, takeKeyframe } = await started();
      await takeKeyframe();

      await user.click(saveButton());
      await screen.findByText("云端保存失败。");
      expect(saveButton().disabled).toBe(false);

      await user.click(saveButton());
      await screen.findByText("已保存这次分析。");
      expect(state.save).toHaveBeenCalledTimes(2);
      expect(saveButton().disabled).toBe(true);
      log.mockRestore();
    });
  });

  it("shows a retry after the warmup waits past the operational timeout", async () => {
    state.load.mockImplementation(() => new Promise(() => undefined));
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    render(<AnalysisBiomechanicsPage />);
    const input = document.querySelector("input[type=file]") as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [new File(["video"], "clip.mp4", { type: "video/mp4" })] } });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "启动 Edge 视觉引擎分析" }));
    });
    expect(state.load).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(screen.getByText(/模型脚本加载失败/)).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "重试" }));
      await Promise.resolve();
    });
    expect(state.load).toHaveBeenCalledTimes(2);
    expect(state.release.mock.invocationCallOrder[0]).toBeLessThan(
      state.load.mock.invocationCallOrder[1] ?? Number.POSITIVE_INFINITY,
    );
  });
});
