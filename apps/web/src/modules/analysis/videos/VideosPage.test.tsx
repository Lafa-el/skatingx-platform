// @vitest-environment happy-dom
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { render, screen, userEvent, waitFor } from "@/test/dom";

import { VideosPage } from "./VideosPage";

const db = {};

const state = vi.hoisted(() => ({
  videos: {
    videos: [] as {
      id: string;
      title: string;
      createdAt: string;
      updatedAt: string;
      fileName?: string;
      externalUrl?: string;
      technicalTags?: string[];
      linkedSessionId?: string;
      notes?: string;
    }[],
    dropped: 0,
  },
  analyses: [] as { kind: string; id: string; videoId?: string; createdAt: string }[],
  create: vi.fn(async (..._args: unknown[]) => ({ ok: true as const, id: "new-1" })),
  update: vi.fn(async (..._args: unknown[]) => ({ ok: true as const })),
  remove: vi.fn(async (..._args: unknown[]) => undefined),
}));

vi.mock("@/hooks/useLocale", () => ({ useLocale: () => "zh" }));
vi.mock("@/app/providers/AuthProvider", () => ({
  useAuth: () => ({ uid: "user-1", loading: false, firebaseReady: true }),
}));
vi.mock("@/app/providers/FirestoreProvider", () => ({
  useUserSettings: () => ({ data: { activeAthleteId: "lindsay" }, loading: false, error: null }),
}));
vi.mock("@skatingx/firebase-client", () => ({
  VIDEO_TAGS: ["edge", "turn", "jump", "spin", "footwork", "flow", "step_sequence", "combo", "alignment", "speed", "other"],
  getFirestoreDb: () => db,
  subscribeToVideos: (
    _db: unknown,
    _uid: unknown,
    onData: (snapshot: typeof state.videos) => void,
  ) => {
    onData(state.videos);
    return () => undefined;
  },
  subscribeToSavedAnalyses: (
    _db: unknown,
    _uid: unknown,
    _athleteId: unknown,
    onData: (sources: typeof state.analyses) => void,
  ) => {
    onData(state.analyses);
    return () => undefined;
  },
  createVideo: (...args: unknown[]) => state.create(...args),
  updateVideo: (...args: unknown[]) => state.update(...args),
  deleteVideo: (...args: unknown[]) => state.remove(...args),
}));

const older = {
  id: "b",
  title: "旧",
  createdAt: "2026-06-01T00:00:00.000Z",
  updatedAt: "2026-06-01T00:00:00.000Z",
};
const newer = {
  id: "a",
  title: "新",
  fileName: "clip.mp4",
  externalUrl: "https://example.com/v",
  technicalTags: ["edge", "spin"],
  linkedSessionId: "sess-1",
  notes: "备注",
  createdAt: "2026-06-10T00:00:00.000Z",
  updatedAt: "2026-06-10T00:00:00.000Z",
};

function renderPage() {
  return render(
    <MemoryRouter>
      <VideosPage />
    </MemoryRouter>,
  );
}

describe("VideosPage", () => {
  it("lists newest first, filters by status and tag, and links an analyzed video", async () => {
    state.videos = { videos: [older, newer], dropped: 0 };
    state.analyses = [{ kind: "biomech", id: "analysis-1", videoId: "a", createdAt: "2026-06-11T00:00:00.000Z" }];
    const user = userEvent.setup();
    renderPage();
    const titles = await screen.findAllByRole("heading", { level: 3 });
    expect(titles.map((title) => title.textContent)).toEqual(["新", "旧"]);
    expect(screen.getByRole("link", { name: "https://example.com/v" }).getAttribute("href")).toBe("https://example.com/v");
    expect(screen.getByText("sess-1")).toBeTruthy();
    expect(screen.getByRole("link", { name: "已分析 → 查看分析记录" }).getAttribute("href")).toBe(
      "/analysis/biomechanics/analysis-1",
    );
    expect(screen.getAllByRole("link", { name: "分析这条" })[0]?.getAttribute("href")).toBe(
      "/analysis/biomechanics?video=a",
    );

    await user.click(screen.getByRole("button", { name: "已分析" }));
    await user.click(screen.getByRole("button", { name: "刃" }));
    expect(screen.getAllByRole("heading", { level: 3 }).map((title) => title.textContent)).toEqual(["新"]);

    await user.click(screen.getByRole("button", { name: "未分析" }));
    expect(screen.getByText("没有符合的视频。")).toBeTruthy();
  });

  it("creates, edits, and deletes a video", async () => {
    state.videos = { videos: [newer], dropped: 0 };
    state.analyses = [];
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole("heading", { level: 3, name: "新" });

    await user.click(screen.getByRole("button", { name: "新增视频" }));
    await user.type(screen.getByLabelText("标题"), "练习");
    await user.click(screen.getByRole("checkbox", { name: "刃" }));
    await user.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(state.create).toHaveBeenCalled());
    expect((state.create.mock.calls[0]?.[2] as { title: string; technicalTags: string[] }).technicalTags).toEqual(["edge"]);
    expect(screen.queryByRole("heading", { name: "新增视频" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "编辑" }));
    const title = screen.getByLabelText("标题") as HTMLInputElement;
    await user.clear(title);
    await user.type(title, "改过");
    await user.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(state.update).toHaveBeenCalled());
    expect(state.update.mock.calls[0]?.[2]).toBe("a");

    await user.click(screen.getByRole("button", { name: "删除" }));
    await user.click(screen.getByRole("button", { name: "确认删除" }));
    await waitFor(() => expect(state.remove).toHaveBeenCalled());
    expect(state.remove.mock.calls[0]?.[2]).toBe("a");
  });

  it("shows the empty library", async () => {
    state.videos = { videos: [], dropped: 0 };
    state.analyses = [];
    renderPage();
    expect(await screen.findByText("还没有视频记录。")).toBeTruthy();
  });

  it("keeps the form open when saving fails", async () => {
    state.videos = { videos: [], dropped: 0 };
    state.analyses = [];
    state.create.mockRejectedValueOnce(new Error("offline"));
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: "新增视频" }));
    await user.type(screen.getByLabelText("标题"), "练习");
    await user.click(screen.getByRole("button", { name: "保存" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "新增视频" })).toBeTruthy();
  });
});
