// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it, vi } from "vitest";

import { AnalysisBiomechanicsPage } from "@/pages/analysis/AnalysisBiomechanicsPage";
import { render, screen, userEvent } from "@/test/dom";
import { legacyColourClasses } from "@/test/legacyLook";

const state = vi.hoisted(() => ({
  locale: "zh" as "zh" | "en",
  uid: "user-1" as string | null,
  db: {} as object | null,
  save: vi.fn((_db: unknown, _record: unknown) => Promise.resolve()),
  release: vi.fn(() => Promise.resolve()),
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
  POSE_SCRIPT_URL: "/mediapipe/pose/0.5.1675469404/pose.js",
}));

afterEach(() => {
  state.locale = "zh";
  state.uid = "user-1";
  state.db = {};
  state.save.mockClear();
  state.load.mockClear();
  state.release.mockClear();
});

describe("biomechanics page", () => {
  it("keeps the analyse button waiting for a video and shows the idle warmup line", () => {
    const view = render(<AnalysisBiomechanicsPage />);
    const button = screen.getByRole("button", { name: "请先上传视频" });
    expect(button.hasAttribute("disabled")).toBe(true);
    expect(screen.getByText(/正在预热模型\.\.\./)).toBeTruthy();
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
    expect(screen.getByText(/Warming the model/)).toBeTruthy();
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
  });
});
