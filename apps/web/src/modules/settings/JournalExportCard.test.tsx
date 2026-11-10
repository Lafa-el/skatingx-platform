// @vitest-environment happy-dom
import { todayDateString } from "@skatingx/skating-domain";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { render, screen, userEvent } from "@/test/dom";

import { JournalExportCard } from "./JournalExportCard";

const db = {};

const state = vi.hoisted(() => ({
  read: vi.fn(async (..._args: unknown[]) => ({
    days: [] as { id: string; date: string; note?: string }[],
    sessions: [] as { id: string; date: string }[],
    coachNotes: [] as { id: string; date: string }[],
    bodyStatus: [] as { id: string; date: string }[],
    weeklyReviews: [] as { id: string; weekStart: string }[],
    videos: [] as { id: string; title: string; createdAt: string }[],
    failedCollections: [] as string[],
    dropped: 0,
  })),
  download: vi.fn((..._args: unknown[]) => undefined),
}));

vi.mock("@/hooks/useLocale", () => ({ useLocale: () => "zh" }));
vi.mock("@/app/providers/AuthProvider", () => ({
  useAuth: () => ({ uid: "user-1", loading: false, firebaseReady: true }),
}));
vi.mock("@skatingx/firebase-client", () => ({
  getFirestoreDb: () => db,
  readJournalExport: (...args: unknown[]) => state.read(...args),
}));
vi.mock("@/shared/utils/downloadFile", () => ({
  downloadFile: (...args: unknown[]) => state.download(...args),
}));

const empty = {
  days: [],
  sessions: [],
  coachNotes: [],
  bodyStatus: [],
  weeklyReviews: [],
  videos: [],
  failedCollections: [],
  dropped: 0,
};

describe("JournalExportCard", () => {
  beforeEach(() => {
    state.read.mockReset();
    state.read.mockResolvedValue(empty);
    state.download.mockClear();
  });

  it("renders the export card", () => {
    render(<JournalExportCard />);
    expect(screen.getByRole("heading", { name: "导出日志" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "全部" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "JSON" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("does not download when the date range is not usable", async () => {
    const user = userEvent.setup();
    render(<JournalExportCard />);
    await user.click(screen.getByRole("button", { name: "日期范围" }));
    await user.click(screen.getByRole("button", { name: "下载" }));
    expect(screen.getByRole("alert").textContent).toContain("开始不能晚于结束");
    expect(state.download).not.toHaveBeenCalled();
    expect(state.read).not.toHaveBeenCalled();
  });

  it("downloads one JSON file named with today's date", async () => {
    state.read.mockResolvedValueOnce({
      ...empty,
      days: [{ id: "d1", date: "2026-06-08", note: "记" }],
    });
    const user = userEvent.setup();
    render(<JournalExportCard />);
    await user.click(screen.getByRole("button", { name: "下载" }));
    expect(await screen.findByRole("status")).toBeTruthy();
    expect(state.download).toHaveBeenCalledTimes(1);
    expect(state.download.mock.calls[0]?.[0]).toBe(`skatingx-journal-${todayDateString()}.json`);
    const parsed = JSON.parse(String(state.download.mock.calls[0]?.[1])) as { days: unknown[] };
    expect(Object.keys(parsed).sort()).toEqual([
      "bodyStatus",
      "coachNotes",
      "days",
      "exportedAt",
      "sessions",
      "videos",
      "weeklyReviews",
    ]);
    expect(parsed.days).toEqual([{ id: "d1", date: "2026-06-08", note: "记" }]);
  });

  it("downloads one CSV file for each collection that has rows", async () => {
    state.read.mockResolvedValueOnce({
      ...empty,
      days: [
        { id: "d1", date: "2026-06-08" },
        { id: "d2", date: "2026-06-09", note: "多出来" },
      ],
      sessions: [{ id: "s1", date: "2026-06-08" }],
    });
    const user = userEvent.setup();
    render(<JournalExportCard />);
    await user.click(screen.getByRole("button", { name: "CSV" }));
    await user.click(screen.getByRole("button", { name: "下载" }));
    expect(await screen.findByText("教练笔记 这个范围内没有内容，未下载。")).toBeTruthy();
    const day = todayDateString();
    const names = state.download.mock.calls.map((call) => call[0]);
    expect(names).toEqual([`skatingx-journal-days-${day}.csv`, `skatingx-journal-sessions-${day}.csv`]);
    expect(String(state.download.mock.calls[0]?.[1]).split("\r\n")[0]).toBe("id,date,note");
  });

  it("names a collection that could not be read, and still downloads the rest", async () => {
    state.read.mockResolvedValueOnce({
      ...empty,
      days: [{ id: "d1", date: "2026-06-08" }],
      failedCollections: ["videos"],
    });
    const user = userEvent.setup();
    render(<JournalExportCard />);
    await user.click(screen.getByRole("button", { name: "下载" }));
    expect(await screen.findByText("视频 未能读取，本次导出为空。")).toBeTruthy();
    expect(state.download).toHaveBeenCalledTimes(1);
  });
});
