// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";

import { render, screen, userEvent, waitFor } from "@/test/dom";

import { SessionsPage } from "./SessionsPage";

const subscribeToJournal = vi.fn();
const createJournalSession = vi.fn(
  async (..._args: unknown[]): Promise<{ ok: true; id: string } | { ok: false; field: "date" }> => ({
    ok: true,
    id: "new-1",
  }),
);
const updateJournalSession = vi.fn(async (..._args: unknown[]): Promise<{ ok: true }> => ({ ok: true }));
const deleteJournalSession = vi.fn(async (..._args: unknown[]) => undefined);

vi.mock("@skatingx/firebase-client", () => ({
  SESSION_FOCUS_TAGS: [
    "start",
    "500m",
    "1000m",
    "1500m",
    "corner_entry",
    "corner_drift",
    "follow_skating",
    "footwork",
    "edges",
    "jumps",
    "spins",
    "program",
    "speed_work",
    "endurance",
  ],
  SESSION_TYPES: ["ice", "dryland", "private_lesson", "competition", "recovery", "rest"],
  getFirestoreDb: () => ({}),
  subscribeToJournal: (...args: unknown[]) => subscribeToJournal(...args),
  createJournalSession: (...args: unknown[]) => createJournalSession(...args),
  updateJournalSession: (...args: unknown[]) => updateJournalSession(...args),
  deleteJournalSession: (...args: unknown[]) => deleteJournalSession(...args),
}));

vi.mock("@/hooks/useLocale", () => ({ useLocale: () => "zh" }));
vi.mock("@/app/providers/AuthProvider", () => ({ useAuth: () => ({ uid: "user-1" }) }));

function emit(sessions: unknown[]) {
  subscribeToJournal.mockImplementation((_db, _uid, onData: (snapshot: unknown) => void) => {
    onData({ days: [], sessions, droppedDays: 0, droppedSessions: 0 });
    return () => undefined;
  });
}

beforeEach(() => {
  subscribeToJournal.mockReset();
  createJournalSession.mockReset();
  updateJournalSession.mockReset();
  deleteJournalSession.mockReset();
  createJournalSession.mockResolvedValue({ ok: true, id: "new-1" });
  updateJournalSession.mockResolvedValue({ ok: true });
  deleteJournalSession.mockResolvedValue(undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("SessionsPage", () => {
  it("groups sessions by date, newest day first, and shows the fields the calendar hides", () => {
    emit([
      { id: "b", date: "2026-06-08", sessionLabel: "早课" },
      {
        id: "a1",
        date: "2026-06-10",
        sessionType: "dryland",
        coachName: "李",
        location: "Buffalo",
        intensity: 4,
        durationMinutes: 90,
        iceTimeMinutes: 60,
        drylandMinutes: 20,
        focusTags: ["start"],
        technicalFocus: "入弯",
        mainSet: "8圈",
        notes: "收着",
        cornerFocus: false,
      },
      {
        id: "a2",
        date: "2026-06-10",
        sessionLabel: "第二节",
        startsPractice: true,
        lapTimesNote: "32.1",
        equipmentNote: "新刀",
        recoveryNote: "拉伸",
      },
    ]);
    render(<SessionsPage />);
    const headings = screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent);
    expect(headings).toEqual(["2026年6月10日", "2026年6月8日"]);
    const titles = screen.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent);
    expect(titles).toEqual(["第二节", "陆地", "早课"]);
    const second = screen.getByRole("heading", { name: "第二节" }).closest("article")!;
    expect(second.textContent).toContain("起跑");
    expect(second.textContent).toContain("圈速备注: 32.1");
    expect(second.textContent).toContain("装备备注: 新刀");
    expect(second.textContent).toContain("恢复备注: 拉伸");
    const dryland = screen.getByRole("heading", { name: "陆地" }).closest("article")!;
    expect(dryland.textContent).toContain("李");
    expect(dryland.textContent).toContain("Buffalo");
    expect(dryland.textContent).toContain("4 / 5");
    expect(dryland.textContent).toContain("入弯");
    expect(dryland.textContent).toContain("8圈");
    expect(dryland.textContent).toContain("收着");
    expect(dryland.textContent).not.toContain("弯道");
  });

  it("lets the same day hold two sessions", async () => {
    emit([]);
    const user = userEvent.setup();
    render(<SessionsPage />);
    await user.click(screen.getByRole("button", { name: "新增训练课" }));
    await user.type(screen.getByLabelText("标题"), "第一节");
    await user.click(screen.getByRole("button", { name: "保存" }));
    await user.click(screen.getByRole("button", { name: "新增训练课" }));
    await user.type(screen.getByLabelText("标题"), "第二节");
    await user.click(screen.getByRole("button", { name: "保存" }));
    expect(createJournalSession).toHaveBeenCalledTimes(2);
    const first = createJournalSession.mock.calls[0]![2] as { date: string; sessionLabel: string; sessionType: string };
    const second = createJournalSession.mock.calls[1]![2] as { date: string; sessionLabel: string };
    expect(first.date).toBe(second.date);
    expect(first.sessionType).toBe("ice");
    expect(first.sessionLabel).toBe("第一节");
    expect(second.sessionLabel).toBe("第二节");
    expect(updateJournalSession).not.toHaveBeenCalled();
  });

  it("edits one session and deletes another only after confirmation", async () => {
    emit([{ id: "s1", date: "2026-06-10", sessionLabel: "早课", notes: "旧" }]);
    const user = userEvent.setup();
    render(<SessionsPage />);
    await user.click(screen.getByRole("button", { name: "编辑" }));
    const notes = screen.getByLabelText("备注");
    await user.clear(notes);
    await user.type(notes, "改过");
    await user.click(screen.getByRole("button", { name: "保存" }));
    expect(updateJournalSession).toHaveBeenCalledWith(
      expect.anything(),
      "user-1",
      "s1",
      expect.objectContaining({ notes: "改过" }),
      expect.any(String),
    );
    expect(createJournalSession).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "删除" }));
    expect(screen.getByText("只删除这条训练课，不删除当天的日记。")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "取消" }));
    expect(deleteJournalSession).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "删除" }));
    await user.click(screen.getByRole("button", { name: "确认删除" }));
    expect(deleteJournalSession).toHaveBeenCalledWith(expect.anything(), "user-1", "s1");
  });

  it("shows the empty state when there are no sessions", () => {
    emit([]);
    render(<SessionsPage />);
    expect(screen.getByText("还没有训练课。")).toBeTruthy();
    expect(screen.queryByRole("heading", { level: 3 })).toBeNull();
  });

  it("keeps the form open when the date is illegal or the save fails", async () => {
    emit([]);
    const user = userEvent.setup();
    render(<SessionsPage />);
    await user.click(screen.getByRole("button", { name: "新增训练课" }));
    createJournalSession.mockResolvedValueOnce({ ok: false, field: "date" });
    const date = screen.getByLabelText("日期");
    await user.clear(date);
    await user.type(date, "2026-02-31");
    await user.click(screen.getByRole("button", { name: "保存" }));
    expect((await screen.findByRole("alert")).textContent).toBe("日期要写成 YYYY-MM-DD，而且是真实的一天。");
    expect(screen.getByRole("heading", { name: "新增训练课" })).toBeTruthy();

    createJournalSession.mockRejectedValueOnce(new Error("offline"));
    await user.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("没有保存成功。"));
    expect(screen.getByRole("heading", { name: "新增训练课" })).toBeTruthy();
    expect(console.error).toHaveBeenCalled();
  });
});
