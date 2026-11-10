// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it, vi } from "vitest";

import { fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { AnalysisBiomechanicsPage } from "@/pages/analysis/AnalysisBiomechanicsPage";
import { tBiomech } from "@/shared/i18n/biomech-messages";
import { act, render, screen, userEvent, waitFor } from "@/test/dom";
import { legacyColourClasses } from "@/test/legacyLook";

const state = vi.hoisted(() => ({
  locale: "zh" as "zh" | "en",
  uid: "user-1" as string | null,
  settings: { activeAthleteId: "lindsay" } as { activeAthleteId?: string } | null,
  db: {} as object | null,
  save: vi.fn((_db: unknown, _record: unknown) => Promise.resolve()),
  library: vi.fn(async (..._args: unknown[]) => null as {
    id: string;
    title: string;
    fileName?: string;
    externalUrl?: string;
    createdAt: string;
    updatedAt: string;
  } | null),
  release: vi.fn(() => Promise.resolve()),
  prefetch: vi.fn(),
  forcedAngles: null as { lean: number | null; knee: number | null } | null,
  loadEngine: (_onResults: (landmarks: unknown) => void): Promise<unknown> =>
    Promise.resolve({ send: vi.fn(), close: () => state.release() }),
  load: vi.fn(),
}));
state.load.mockImplementation(state.loadEngine);

vi.mock("@/hooks/useLocale", () => ({ useLocale: () => state.locale }));
vi.mock("@/app/providers/AuthProvider", () => ({
  useAuth: () => ({ uid: state.uid, loading: false, firebaseReady: Boolean(state.uid) }),
}));
vi.mock("@/app/providers/FirestoreProvider", () => ({
  useUserSettings: () => ({ data: state.settings, loading: false, error: null }),
}));
vi.mock("@skatingx/firebase-client", () => ({
  getFirestoreDb: () => state.db,
  saveBiomechAnalysisRecord: (db: unknown, record: unknown) => state.save(db, record),
  getVideoEntry: (...args: unknown[]) => state.library(...args),
}));
// Real sampling, except when a test names the angles of the next frame: a readable frame can still
// miss one angle, and no hand-made set of landmarks gives that reliably.
vi.mock("@skatingx/skating-domain", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@skatingx/skating-domain")>();
  return {
    ...actual,
    samplePoseFrame: (input: Parameters<typeof actual.samplePoseFrame>[0]) => {
      const result = actual.samplePoseFrame(input);
      const forced = state.forcedAngles;
      if (!forced) return result;
      return {
        ...result,
        sample: { ...result.sample, readable: true, unreadableReason: null, leanAngle: forced.lean, kneeAngle: forced.knee },
      };
    },
  };
});
vi.mock("@/modules/analysis/biomechanics/pose-engine", () => ({
  loadPoseEngine: (onResults: (landmarks: unknown) => void) => state.load(onResults),
  releasePoseEngine: () => state.release(),
  prefetchPoseAssets: () => state.prefetch(),
  POSE_WARMUP_TIMEOUT_MS: 60_000,
  POSE_SCRIPT_URL: "/mediapipe/pose/0.5.1675469404/pose.js",
}));

afterEach(() => {
  Reflect.deleteProperty(HTMLVideoElement.prototype, "videoWidth");
  Reflect.deleteProperty(HTMLVideoElement.prototype, "videoHeight");
  state.locale = "zh";
  state.uid = "user-1";
  state.settings = { activeAthleteId: "lindsay" };
  state.db = {};
  state.save.mockClear();
  state.library.mockReset();
  state.library.mockResolvedValue(null);
  state.load.mockReset(); // also drops any mockImplementationOnce a failing test never consumed
  // A test may leave the engine waiting for ever (the warmup timeout one); the next must not inherit it.
  state.load.mockImplementation(state.loadEngine);
  state.release.mockClear();
  state.prefetch.mockClear();
  state.forcedAngles = null;
  vi.useRealTimers();
  vi.restoreAllMocks(); // the stage's bounding-box stub and the console spy
});

/**
 * happy-dom has no decoded frames and no 2D canvas. The video gets a readyState, and only the hidden
 * send canvas gets a context (a loose stand-in: the page only draws a frame into it), so the page's
 * own paint canvas stays context-less as before.
 */
function stubBrowser(readyState: number) {
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
  vi.spyOn(HTMLMediaElement.prototype, "readyState", "get").mockReturnValue(readyState);
  // A paused video stops the page's frame loop at its first tick, so only the sample under test sends.
  vi.spyOn(HTMLMediaElement.prototype, "paused", "get").mockReturnValue(true);
  const sendContext = { drawImage: vi.fn() };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (this: HTMLCanvasElement) {
    return (this.classList.contains("hidden") ? sendContext : null) as never;
  });
}

// happy-dom's video element has no videoWidth / videoHeight at all, so they are defined on the prototype
// (removed again after each test). 0 is what a browser reports for a file with no video track.
function stubVideoSize(width: number, height: number) {
  Object.defineProperty(HTMLVideoElement.prototype, "videoWidth", { configurable: true, get: () => width });
  Object.defineProperty(HTMLVideoElement.prototype, "videoHeight", { configurable: true, get: () => height });
}

/** The browser has read the chosen file's metadata: it has a video track of this width unless told otherwise. */
function metadataArrives(width = 640) {
  stubVideoSize(width, width > 0 ? 360 : 0);
  act(() => {
    fireEvent.loadedMetadata(document.querySelector("video")!);
  });
}

const deliver = (onResults: (landmarks: unknown) => void) => act(() => onResults(null));

/** Uploads a clip, starts the analysis and clicks the skater. Optionally waits for the model. */
function renderPage(path = "/analysis/biomechanics") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AnalysisBiomechanicsPage />
    </MemoryRouter>,
  );
}

async function begin({ waitReady = true, readyState = 4, path = "/analysis/biomechanics" } = {}) {
  const user = userEvent.setup();
  stubBrowser(readyState);
  const view = renderPage(path);
  const input = document.querySelector("input[type=file]") as HTMLInputElement;
  await user.upload(input, new File(["video"], "clip.mp4", { type: "video/mp4" }));
  metadataArrives();
  await user.click(screen.getByRole("button", { name: "启动 Edge 视觉引擎分析" }));
  if (waitReady) await screen.findByText(/就绪并缓存在本地/);
  const stage = view.container.querySelector("video")!.parentElement!;
  fireEvent.click(stage, { clientX: 80, clientY: 45 });
  return { user, view, onResults: () => state.load.mock.calls[0]![0] as (landmarks: unknown) => void };
}

/**
 * Starts the page, locks a target and takes one keyframe: the engine's callback delivers the frame.
 * Each call moves the paused video to a later moment. The same time would replace the previous
 * sample instead of adding one.
 */
async function started(options?: { path?: string }) {
  const { user, onResults } = await begin(options);
  let moment = 0;
  const takeKeyframe = async () => {
    const video = document.querySelector("video");
    if (video) video.currentTime = moment;
    moment += 1;
    await user.click(screen.getByRole("button", { name: "采样当前帧" }));
    deliver(onResults());
  };
  return { user, takeKeyframe };
}

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function fakeEngine(send: () => Promise<void> | void = () => undefined) {
  return { send: vi.fn(send), close: vi.fn(() => state.release()) };
}

describe("biomechanics page", () => {
  it("keeps the analyse button waiting for a video and shows the idle warmup line", () => {
    const view = renderPage();
    const button = screen.getByRole("button", { name: "请先上传视频" });
    expect(button.hasAttribute("disabled")).toBe(true);
    expect(screen.getByText(/未启动/)).toBeTruthy();
    expect(screen.getByText("标定纠错：3D Normal Projection Active")).toBeTruthy();
    expect(screen.getByText(/● 已登录/)).toBeTruthy();
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
    renderPage();
    const input = document.querySelector("input[type=file]") as HTMLInputElement;
    const file = new File(["video"], "clip.mp4", { type: "video/mp4" });
    await user.upload(input, file);
    metadataArrives();
    const start = screen.getByRole("button", { name: "启动 Edge 视觉引擎分析" });
    expect(start.hasAttribute("disabled")).toBe(false);
    expect(state.load).not.toHaveBeenCalled();
    await user.click(start);
    expect(state.load).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/正在加载引擎|就绪并缓存在本地/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "采样当前帧" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "暂停" })).toBeTruthy();
  });

  it("starts from idle, shows loading-engine while the model loads, and reset returns to idle", async () => {
    const pending = new Promise<ReturnType<typeof fakeEngine>>(() => undefined);
    state.load.mockImplementationOnce(() => pending);
    const user = userEvent.setup();
    stubBrowser(4);
    renderPage();
    expect(screen.getByText(/未启动/)).toBeTruthy();
    const input = document.querySelector("input[type=file]") as HTMLInputElement;
    await user.upload(input, new File(["video"], "clip.mp4", { type: "video/mp4" }));
    metadataArrives();
    await user.click(screen.getByRole("button", { name: "启动 Edge 视觉引擎分析" }));
    expect(screen.getByText(/正在加载引擎/)).toBeTruthy();
    expect(screen.queryByText(/未启动/)).toBeNull();
  });

  it("reset after a ready engine returns the console to idle", async () => {
    const user = userEvent.setup();
    stubBrowser(4);
    renderPage();
    const input = document.querySelector("input[type=file]") as HTMLInputElement;
    await user.upload(input, new File(["video"], "clip.mp4", { type: "video/mp4" }));
    metadataArrives();
    await user.click(screen.getByRole("button", { name: "启动 Edge 视觉引擎分析" }));
    await screen.findByText(/就绪并缓存在本地/);
    await user.click(screen.getByRole("button", { name: "替换或重置测试视频" }));
    expect(screen.getByText(/未启动/)).toBeTruthy();
  });

  it("has the signed-in line and the lean tolerance band, in both languages", () => {
    expect(tBiomech("zh", "biomech.sync.on")).toBe("● 已登录");
    expect(tBiomech("en", "biomech.sync.on")).toBe("● Signed in");
    expect(tBiomech("zh", "biomech.metric.leanHint")).toBe("NDP标准：< 48°（> 52° 判偏大）");
    expect(tBiomech("en", "biomech.metric.leanHint")).toBe("NDP reference: under 48° (flagged above 52°)");
  });

  it("uses the English draft when the locale is English", () => {
    state.locale = "en";
    renderPage();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Analysis · Biomechanics");
    expect(screen.getByRole("button", { name: "Choose a video first" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByText(/Not started/)).toBeTruthy();
  });

  it("closes Pose when the video is reset and when the page unmounts", async () => {
    state.release.mockClear();
    const user = userEvent.setup();
    const view = renderPage();
    const input = document.querySelector("input[type=file]") as HTMLInputElement;
    await user.upload(input, new File(["video"], "clip.mp4", { type: "video/mp4" }));
    metadataArrives();
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

    it("is disabled with no keyframe, locks after a successful save, and a new keyframe frees it", async () => {
      state.forcedAngles = { lean: 12, knee: 100 }; // readable frames: one click saves, no confirmation
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
      expect(screen.queryByText("已保存这次分析。")).toBeNull();
      expect(saveButton().disabled).toBe(false);
      await user.click(saveButton());
      await waitFor(() => expect(state.save).toHaveBeenCalledTimes(2));
    });

    it("a failed save stays on screen when another frame is sampled (guard)", async () => {
      const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
      state.save.mockRejectedValueOnce(new Error("cloud down"));
      state.forcedAngles = { lean: 12, knee: 100 };
      const { user, takeKeyframe } = await started();
      await takeKeyframe();
      await user.click(saveButton());
      expect(await screen.findByText("云端保存失败。")).toBeTruthy();
      await takeKeyframe();
      expect(screen.getByText("云端保存失败。")).toBeTruthy();
      log.mockRestore();
    });

    it("stays clickable when the save fails, and can be retried", async () => {
      const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
      state.save.mockRejectedValueOnce(new Error("cloud down"));
      state.forcedAngles = { lean: 12, knee: 100 };
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

  describe("saving a session with no readable frame", () => {
    const SAVE = "保存本次分析";
    const CONFIRM = "确认保存（无有效帧）";
    const button = (name: string) => screen.getByRole("button", { name }) as HTMLButtonElement;

    it("the first click only asks: nothing is written and no saved state shows; the second click saves", async () => {
      const { user, takeKeyframe } = await started(); // frames that could not be read
      await takeKeyframe();

      await user.click(button(SAVE));
      expect(button(CONFIRM)).toBeTruthy();
      expect(button(CONFIRM).disabled).toBe(false);
      expect(state.save).not.toHaveBeenCalled();
      expect(screen.queryByText("已保存这次分析。")).toBeNull();

      await user.click(button(CONFIRM));
      await screen.findByText("已保存这次分析。");
      expect(state.save).toHaveBeenCalledTimes(1);
      expect(button(SAVE).disabled).toBe(true); // the saved lock, and the confirmation is gone
    });

    it("a new keyframe lapses the confirmation: it has to be confirmed again", async () => {
      const { user, takeKeyframe } = await started();
      await takeKeyframe();
      await user.click(button(SAVE));
      expect(button(CONFIRM)).toBeTruthy();

      await takeKeyframe();
      expect(screen.getByText("2 / 10")).toBeTruthy();
      expect(screen.queryByRole("button", { name: CONFIRM })).toBeNull();

      await user.click(button(SAVE));
      expect(state.save).not.toHaveBeenCalled();
      expect(button(CONFIRM)).toBeTruthy();
    });

    it("clearing the samples lapses the confirmation and disables the button again", async () => {
      const { user, takeKeyframe } = await started();
      await takeKeyframe();
      await user.click(button(SAVE));
      await user.click(screen.getByRole("button", { name: "清空" }));
      expect(button(SAVE).disabled).toBe(true);
      expect(state.save).not.toHaveBeenCalled();
    });

    it("a failed save lifts the confirmation, so a retry asks again", async () => {
      const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
      state.save.mockRejectedValueOnce(new Error("cloud down"));
      const { user, takeKeyframe } = await started();
      await takeKeyframe();
      await user.click(button(SAVE));
      await user.click(button(CONFIRM));
      await screen.findByText("云端保存失败。");
      expect(state.save).toHaveBeenCalledTimes(1);

      expect(screen.queryByRole("button", { name: CONFIRM })).toBeNull();
      await user.click(button(SAVE));
      expect(state.save).toHaveBeenCalledTimes(1);
      await user.click(button(CONFIRM));
      await screen.findByText("已保存这次分析。");
      expect(state.save).toHaveBeenCalledTimes(2);
      log.mockRestore();
    });

    it("saves the current athlete, and does not save when there is none", async () => {
      state.settings = { activeAthleteId: "ann-k3x9a2" };
      state.forcedAngles = { lean: 12, knee: 100 };
      const { user, takeKeyframe } = await started();
      await takeKeyframe();
      await user.click(button(SAVE));
      await screen.findByText("已保存这次分析。");
      expect(state.save.mock.calls[0]?.[1]).toMatchObject({ athleteId: "ann-k3x9a2" });

      state.settings = {};
      state.save.mockClear();
      await takeKeyframe();
      await user.click(button(SAVE));
      expect(state.save).not.toHaveBeenCalled();
    });

    it("with at least one readable frame a single click saves, with no confirmation", async () => {
      state.forcedAngles = { lean: 12, knee: 100 };
      const { user, takeKeyframe } = await started();
      await takeKeyframe();
      await user.click(button(SAVE));
      await screen.findByText("已保存这次分析。");
      expect(state.save).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole("button", { name: CONFIRM })).toBeNull();
    });

    it("a frame that is readable but misses an angle still counts as not readable here (the page's own aggregate)", async () => {
      state.forcedAngles = { lean: null, knee: 45 };
      const { user, takeKeyframe } = await started();
      await takeKeyframe();
      await user.click(button(SAVE));
      expect(state.save).not.toHaveBeenCalled();
      expect(button(CONFIRM)).toBeTruthy();
    });

    it("has a Chinese and an English label", () => {
      expect(tBiomech("zh", "biomech.action.confirmSaveNoReadable")).toBe(CONFIRM);
      expect(tBiomech("en", "biomech.action.confirmSaveNoReadable")).toBe("Save anyway (no readable frames)");
    });
  });

  it("shows a retry after the warmup waits past the operational timeout", async () => {
    state.load.mockImplementation(() => new Promise(() => undefined));
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    renderPage();
    const input = document.querySelector("input[type=file]") as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [new File(["video"], "clip.mp4", { type: "video/mp4" })] } });
    });
    metadataArrives();
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

describe("the keyframe rows when an angle is missing", () => {
  const rowText = () => document.querySelector("ul li")?.textContent ?? "";

  async function keyframeWith(lean: number | null, knee: number | null) {
    state.forcedAngles = { lean, knee };
    const { takeKeyframe } = await started();
    await takeKeyframe();
    expect(screen.getByText("1 / 10")).toBeTruthy();
  }

  it("a missing lean shows --°, and the knee keeps its value", async () => {
    await keyframeWith(null, 45);
    expect(rowText()).toContain("倾角 --°，膝角 45°");
    expect(rowText()).not.toContain("0°，");
  });

  it("a missing knee shows --°, and the lean keeps its value", async () => {
    await keyframeWith(12, null);
    expect(rowText()).toContain("倾角 12°，膝角 --°");
  });

  it("both missing show --° twice, never 0°", async () => {
    await keyframeWith(null, null);
    expect(rowText()).toContain("倾角 --°，膝角 --°");
    expect(rowText()).not.toMatch(/(?<![\d.])0°/);
  });

  it("both present show their values, and a measured 0° is still 0°", async () => {
    await keyframeWith(0, 45);
    expect(rowText()).toContain("倾角 0°，膝角 45°");
    expect(rowText()).not.toContain("--");
  });
});

describe("sampling is refused before it changes anything", () => {
  const sampleButton = () => screen.getByRole("button", { name: "采样当前帧" });
  const NOT_READY = /引擎或视频画面还没准备好/;
  const IN_FLIGHT = /上一帧还在计算/;

  it("with no engine yet: says so, does not pause, and the next frame result is not taken as a sample", async () => {
    state.load.mockImplementation(() => new Promise(() => undefined));
    const pause = vi.spyOn(HTMLMediaElement.prototype, "pause");
    const { user, onResults } = await begin({ waitReady: false });

    await user.click(sampleButton());

    expect(screen.getByText(NOT_READY)).toBeTruthy();
    expect(screen.getByText("0 / 10")).toBeTruthy();
    expect(pause).not.toHaveBeenCalled();
    deliver(onResults()); // a pending flag left behind would turn this frame into a keyframe
    expect(screen.getByText("0 / 10")).toBeTruthy();
  });

  it("with a video frame not decoded yet: says so, sends nothing, and a later result is not taken", async () => {
    const engine = fakeEngine();
    state.load.mockImplementation(() => Promise.resolve(engine));
    const pause = vi.spyOn(HTMLMediaElement.prototype, "pause");
    const { user, onResults } = await begin({ readyState: 1 });

    await user.click(sampleButton());

    expect(screen.getByText(NOT_READY)).toBeTruthy();
    expect(pause).not.toHaveBeenCalled();
    expect(engine.send).not.toHaveBeenCalled();
    deliver(onResults());
    expect(screen.getByText("0 / 10")).toBeTruthy();
  });

  it("while a send is in flight: refuses outright, does not queue, and the original send yields one keyframe", async () => {
    const first = deferred();
    const engine = fakeEngine(() => first.promise);
    state.load.mockImplementation(() => Promise.resolve(engine));
    const pause = vi.spyOn(HTMLMediaElement.prototype, "pause");
    const { user, onResults } = await begin();

    await user.click(sampleButton());
    expect(engine.send).toHaveBeenCalledTimes(1);
    expect(pause).toHaveBeenCalledTimes(1);

    await user.click(sampleButton());
    expect(screen.getByText(IN_FLIGHT)).toBeTruthy();
    expect(engine.send).toHaveBeenCalledTimes(1);
    expect(pause).toHaveBeenCalledTimes(1);

    await act(async () => {
      first.resolve();
      await first.promise;
    });
    deliver(onResults());
    expect(screen.getByText("1 / 10")).toBeTruthy();
    deliver(onResults()); // nothing is pending any more, nothing was queued
    expect(screen.getByText("1 / 10")).toBeTruthy();

    await user.click(sampleButton()); // the refusal did not wedge the next sample
    expect(engine.send).toHaveBeenCalledTimes(2);
  });


  it("disables sampling at 10 frames and says so; nine frames stay usable", async () => {
    state.forcedAngles = { lean: 12, knee: 100 };
    const { takeKeyframe } = await started();
    const sample = () => screen.getByRole("button", { name: "采样当前帧" }) as HTMLButtonElement;
    for (let n = 0; n < 9; n += 1) await takeKeyframe();
    expect(screen.getByText("9 / 10")).toBeTruthy();
    expect(sample().disabled).toBe(false);
    expect(screen.queryByText(/已达到采样上限/)).toBeNull();
    await takeKeyframe();
    expect(screen.getByText("10 / 10")).toBeTruthy();
    expect(sample().disabled).toBe(true);
    expect(screen.getByText(/已达到采样上限（10 帧）/)).toBeTruthy();
    expect(tBiomech("en", "biomech.keyframes.full")).toBe("Sampling limit reached (10 frames)");
  });

  it("with the target locked, the engine ready and nothing in flight: one send, one keyframe", async () => {
    const engine = fakeEngine();
    state.load.mockImplementation(() => Promise.resolve(engine));
    const { user, onResults } = await begin();

    await user.click(sampleButton());
    expect(engine.send).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(NOT_READY)).toBeNull();
    expect(screen.queryByText(IN_FLIGHT)).toBeNull();

    deliver(onResults());
    expect(screen.getByText("1 / 10")).toBeTruthy();
    expect(screen.getByText(/等待计算结果/)).toBeTruthy();
  });

  it("still asks for a target first, and a failed send still clears pending", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const engine = fakeEngine(() => Promise.reject(new Error("send failed")));
    state.load.mockImplementation(() => Promise.resolve(engine));
    stubBrowser(4);
    const user = userEvent.setup();
    renderPage();
    await user.upload(document.querySelector("input[type=file]") as HTMLInputElement, new File(["v"], "clip.mp4", { type: "video/mp4" }));
    metadataArrives();
    await user.click(screen.getByRole("button", { name: "启动 Edge 视觉引擎分析" }));
    await screen.findByText(/就绪并缓存在本地/);

    await user.click(sampleButton()); // no target locked yet
    expect(screen.getByText(/请先点击目标运动员/)).toBeTruthy();
    expect(engine.send).not.toHaveBeenCalled();

    fireEvent.click(document.querySelector("video")!.parentElement!, { clientX: 80, clientY: 45 });
    await user.click(sampleButton());
    await screen.findByText(/当前帧分析失败/);
    deliver(state.load.mock.calls[0]![0] as (landmarks: unknown) => void);
    expect(screen.getByText("0 / 10")).toBeTruthy();
    log.mockRestore();
  });

  it("has a Chinese and an English line for each new refusal", () => {
    for (const key of ["biomech.feedback.engineNotReady", "biomech.feedback.sendInFlight"] as const) {
      const zh = tBiomech("zh", key);
      const en = tBiomech("en", key);
      expect(zh.length).toBeGreaterThan(0);
      expect(en.length).toBeGreaterThan(0);
      expect(en).not.toBe(zh);
      expect(en).not.toBe(key);
    }
  });
});

describe("a warmup from an older round never closes the newer engine", () => {
  const resetButton = () => screen.getByRole("button", { name: "替换或重置测试视频" });
  const startButton = () => screen.getByRole("button", { name: "启动 Edge 视觉引擎分析" });
  const clip = () => new File(["video"], "clip.mp4", { type: "video/mp4" });
  const fileInput = () => document.querySelector("input[type=file]") as HTMLInputElement;

  it("reset during warmup then an immediate restart: the old warmup finishing leaves the new engine open and usable", async () => {
    const older = deferred<ReturnType<typeof fakeEngine>>();
    const newer = deferred<ReturnType<typeof fakeEngine>>();
    const engineA = fakeEngine();
    const engineB = fakeEngine();
    state.load.mockImplementationOnce(() => older.promise).mockImplementationOnce(() => newer.promise);
    stubBrowser(4);
    const user = userEvent.setup();
    const view = renderPage();

    await user.upload(fileInput(), clip());
    metadataArrives();
    await user.click(startButton());
    expect(state.load).toHaveBeenCalledTimes(1);

    state.release.mockClear();
    await user.click(resetButton());
    expect(state.release).toHaveBeenCalledTimes(1); // released although no engine existed yet

    await user.upload(fileInput(), clip());
    metadataArrives();
    await user.click(startButton());
    expect(state.load).toHaveBeenCalledTimes(2);
    await act(async () => {
      newer.resolve(engineB);
      await newer.promise;
    });
    await screen.findByText(/就绪并缓存在本地/);

    const releasedSoFar = state.release.mock.calls.length;
    await act(async () => {
      older.resolve(engineA);
      await older.promise;
    });

    expect(engineA.close).not.toHaveBeenCalled();
    expect(engineB.close).not.toHaveBeenCalled();
    expect(state.release).toHaveBeenCalledTimes(releasedSoFar);
    expect(screen.getByText(/就绪并缓存在本地/)).toBeTruthy();

    fireEvent.click(view.container.querySelector("video")!.parentElement!, { clientX: 80, clientY: 45 });
    await user.click(screen.getByRole("button", { name: "采样当前帧" }));
    expect(engineB.send).toHaveBeenCalledTimes(1);
    deliver(state.load.mock.calls[1]![0] as (landmarks: unknown) => void);
    expect(screen.getByText("1 / 10")).toBeTruthy();
  });

  describe("after the operational timeout", () => {
    async function expiredWarmup() {
      const pending = deferred<ReturnType<typeof fakeEngine>>();
      state.load.mockImplementation(() => pending.promise);
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
      renderPage();
      await act(async () => {
        fireEvent.change(fileInput(), { target: { files: [clip()] } });
      });
      metadataArrives();
      await act(async () => {
        fireEvent.click(startButton());
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(60_000);
      });
      expect(screen.getByText(/模型脚本加载失败/)).toBeTruthy();
      return pending;
    }

    it("an expired warmup whose round has since changed does not call close", async () => {
      const pending = await expiredWarmup();
      const engine = fakeEngine();

      await act(async () => {
        fireEvent.click(resetButton());
      });
      state.release.mockClear();
      await act(async () => {
        pending.resolve(engine);
        await pending.promise;
      });

      expect(engine.close).not.toHaveBeenCalled();
      expect(state.release).not.toHaveBeenCalled();
    });

    it("an expired warmup in the current round closes its own instance, once, and stays failed", async () => {
      const pending = await expiredWarmup();
      const engine = fakeEngine();

      await act(async () => {
        pending.resolve(engine);
        await pending.promise;
      });

      expect(engine.close).toHaveBeenCalledTimes(1);
      expect(screen.getByText(/模型脚本加载失败/)).toBeTruthy();
      expect(screen.queryByText(/就绪并缓存在本地/)).toBeNull();
    });

    it("an older round that throws after a retry began leaves the new round's own timeout in place", async () => {
      const pending = await expiredWarmup();
      // The retry is round two: its load never settles, so only its page timer can end it.
      state.load.mockImplementationOnce(() => new Promise(() => undefined));
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "重试" }));
        await Promise.resolve();
      });
      expect(state.load).toHaveBeenCalledTimes(2);
      expect(screen.queryByText(/模型脚本加载失败/)).toBeNull();

      await act(async () => {
        pending.reject(new Error("older round failed"));
        await pending.promise.catch(() => undefined);
      });
      expect(screen.queryByText(/模型脚本加载失败/)).toBeNull(); // the older round does not decide round two

      await act(async () => {
        await vi.advanceTimersByTimeAsync(60_000);
      });
      expect(screen.getByText(/模型脚本加载失败/)).toBeTruthy();
    });
  });

  it("a load that throws in the current round still ends in failed, and is logged (guard)", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    state.load.mockImplementation(() => Promise.reject(new Error("load failed")));
    await begin({ waitReady: false });
    expect(await screen.findByText(/模型脚本加载失败/)).toBeTruthy();
    expect(screen.queryByText(/就绪并缓存在本地/)).toBeNull();
    expect(log).toHaveBeenCalled();
  });
});

describe("the start gate waits for a video that can be decoded", () => {
  const UNPLAYABLE = "视频无法播放，请换一个视频文件再试";
  const clip = (name = "clip.mp4") => new File(["video"], name, { type: "video/mp4" });
  const fileInput = () => document.querySelector("input[type=file]") as HTMLInputElement;
  const startButton = () => screen.getByRole("button", { name: "启动 Edge 视觉引擎分析" });
  const waitingButton = () => screen.getByRole("button", { name: "请先上传视频" });

  async function chosen() {
    const user = userEvent.setup();
    stubBrowser(4);
    renderPage();
    await user.upload(fileInput(), clip());
    return user;
  }

  it("a chosen file alone keeps the start button disabled until the video reports a video track", async () => {
    await chosen();
    expect(waitingButton().hasAttribute("disabled")).toBe(true);
    expect(screen.queryByRole("alert")).toBeNull();

    metadataArrives();
    expect(startButton().hasAttribute("disabled")).toBe(false);
  });

  it("an error event disables the start button and shows the unplayable line where the user can see it", async () => {
    await chosen();
    act(() => {
      fireEvent.error(document.querySelector("video")!);
    });
    expect(waitingButton().hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("alert").textContent).toBe(UNPLAYABLE);
  });

  it("metadata with no video track (width 0, e.g. an audio-only file) is treated as an error", async () => {
    await chosen();
    metadataArrives(0);
    expect(waitingButton().hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("alert").textContent).toBe(UNPLAYABLE);
  });

  it("a new file resets the verdict to unknown: the old pass does not carry over, and the old failure line goes", async () => {
    const user = await chosen();
    metadataArrives();
    expect(startButton().hasAttribute("disabled")).toBe(false);

    await user.upload(fileInput(), clip("second.mp4"));
    expect(waitingButton().hasAttribute("disabled")).toBe(true); // metadata of the new file not here yet

    act(() => {
      fireEvent.error(document.querySelector("video")!);
    });
    expect(screen.getByRole("alert")).toBeTruthy();

    await user.upload(fileInput(), clip("third.mp4"));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(waitingButton().hasAttribute("disabled")).toBe(true);
    metadataArrives();
    expect(startButton().hasAttribute("disabled")).toBe(false);
  });

  it("removing the file resets the verdict, and clearing the element's src is not reported as an error", async () => {
    const user = await chosen();
    metadataArrives();
    await user.click(screen.getByRole("button", { name: "移除视频" }));
    act(() => {
      fireEvent.error(document.querySelector("video")!); // what a cleared src can raise
    });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(waitingButton().hasAttribute("disabled")).toBe(true);
  });

  it("has a Chinese and an English line for the unplayable video", () => {
    expect(tBiomech("zh", "biomech.feedback.videoUnplayable")).toBe(UNPLAYABLE);
    expect(tBiomech("en", "biomech.feedback.videoUnplayable")).toBe("This video can't be played. Try another video file.");
  });

  describe("when play() is refused after the start", () => {
    const pauseButton = () => screen.queryByRole("button", { name: "暂停" });

    it("falls back to the start state with the error, never starts the loop, and a second start can retry", async () => {
      const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
      const frames = vi.spyOn(window, "requestAnimationFrame");
      const play = vi.spyOn(HTMLMediaElement.prototype, "play");
      play.mockRejectedValueOnce(new DOMException("blocked", "NotSupportedError"));
      const user = await chosen();
      metadataArrives();

      await user.click(startButton());
      await screen.findByRole("alert");

      expect(screen.getByRole("alert").textContent).toBe(UNPLAYABLE);
      expect(startButton().hasAttribute("disabled")).toBe(false); // back to the start state, still usable
      expect(screen.queryByRole("button", { name: "替换或重置测试视频" })).toBeNull();
      expect(pauseButton()).toBeNull(); // paused stayed true: no pause button shown for a video that is not playing
      expect(frames).not.toHaveBeenCalled();
      expect(log).toHaveBeenCalled(); // the developer-facing record is kept

      play.mockResolvedValue(undefined);
      await user.click(startButton());
      await screen.findByRole("button", { name: "替换或重置测试视频" });
      expect(screen.queryByRole("alert")).toBeNull();
      expect(pauseButton()).toBeTruthy();
      expect(frames).toHaveBeenCalledTimes(1);
      log.mockRestore();
    });

    it("a play() that succeeds behaves as before: pause button, loop running, no error", async () => {
      const frames = vi.spyOn(window, "requestAnimationFrame");
      const user = await chosen();
      metadataArrives();

      await user.click(startButton());
      await screen.findByText(/就绪并缓存在本地/);

      expect(pauseButton()).toBeTruthy();
      expect(frames).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole("alert")).toBeNull();
      expect(screen.queryByText(UNPLAYABLE)).toBeNull();
    });
  });
});

describe("library video", () => {
  const entry = {
    id: "Vid-1",
    title: "冰上练习",
    fileName: "clip.mp4",
    externalUrl: "https://example.com/a",
    createdAt: "2026-06-08T00:00:00.000Z",
    updatedAt: "2026-06-08T00:00:00.000Z",
  };

  it("shows the library banner and writes that videoId when the file name matches", async () => {
    state.library.mockResolvedValue(entry);
    state.forcedAngles = { lean: 12, knee: 100 };
    const { user, takeKeyframe } = await started({ path: "/analysis/biomechanics?video=Vid-1" });
    expect(await screen.findByText("冰上练习")).toBeTruthy();
    expect(screen.getByText(/外链视频无法直接分析/)).toBeTruthy();
    expect(screen.getByText("文件名与这条记录一致。")).toBeTruthy();
    await takeKeyframe();
    await user.click(screen.getByRole("button", { name: "保存本次分析" }));
    await screen.findByText("已保存这次分析。");
    expect(state.save.mock.calls[0]?.[1]).toMatchObject({ videoId: "Vid-1" });
  });

  it("warns when the chosen file name differs, and still keeps the library id", async () => {
    state.library.mockResolvedValue({ ...entry, fileName: "other.mp4" });
    stubBrowser(4);
    const user = userEvent.setup();
    renderPage("/analysis/biomechanics?video=Vid-1");
    expect(await screen.findByText("冰上练习")).toBeTruthy();
    const input = document.querySelector("input[type=file]") as HTMLInputElement;
    await user.upload(input, new File(["video"], "clip.mp4", { type: "video/mp4" }));
    expect(screen.getByText("你选的文件名与这条记录的文件名不同，请确认是不是同一段视频。")).toBeTruthy();
  });

  it("shows no banner when the library entry is missing", async () => {
    state.library.mockResolvedValue(null);
    renderPage("/analysis/biomechanics?video=missing");
    await waitFor(() => {
      expect(state.library).toHaveBeenCalled();
    });
    expect(screen.queryByText(/外链视频无法直接分析/)).toBeNull();
  });

  it("does not write videoId when the page was opened on its own", async () => {
    state.forcedAngles = { lean: 12, knee: 100 };
    const { user, takeKeyframe } = await started();
    await takeKeyframe();
    await user.click(screen.getByRole("button", { name: "保存本次分析" }));
    await screen.findByText("已保存这次分析。");
    expect(state.save.mock.calls[0]?.[1]).not.toHaveProperty("videoId");
    expect(state.library).not.toHaveBeenCalled();
  });
});
