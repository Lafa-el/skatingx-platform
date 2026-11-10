// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";

import { formatCalendarDate } from "@/shared/i18n/format";
import { render, screen, userEvent, within } from "@/test/dom";

import { CoachNotesPage } from "./CoachNotesPage";

type Note = {
  id: string;
  date: string;
  priority: "high" | "medium" | "low";
  note: string;
  coachName?: string;
  technicalTags?: string[];
  followUpTomorrow?: string;
  linkedSessionId?: string;
};

const older: Note = {
  id: "n-old",
  date: "2026-06-01",
  priority: "high",
  coachName: "李教练",
  note: "入弯要收",
  technicalTags: ["corner_entry"],
  followUpTomorrow: "再收一次",
  linkedSessionId: "自由-课",
};

const newer: Note = {
  id: "n-new",
  date: "2026-06-08",
  priority: "low",
  note: "直道放稳",
  coachName: "王教练",
};

const state = vi.hoisted(() => ({
  db: { kind: "db" },
  notes: [] as Note[],
  create: vi.fn(
    async (..._args: unknown[]): Promise<{ ok: true; id: string } | { ok: false; field: "date" }> => ({
      ok: true,
      id: "made-1",
    }),
  ),
  update: vi.fn(async (..._args: unknown[]) => ({ ok: true as const })),
  remove: vi.fn(async (..._args: unknown[]) => undefined),
  journal: vi.fn((..._args: unknown[]) => undefined),
}));

vi.mock("@/app/providers/AuthProvider", () => ({
  useAuth: () => ({ uid: "user-1", loading: false }),
}));

vi.mock("@/hooks/useLocale", () => ({ useLocale: () => "zh" }));

vi.mock("@skatingx/firebase-client", async () => {
  const actual = await vi.importActual<typeof import("@skatingx/firebase-client")>("@skatingx/firebase-client");
  return {
    ...actual,
    getFirestoreDb: () => state.db,
    subscribeToCoachNotes: (_db: unknown, _uid: unknown, onData: (snapshot: unknown) => void) => {
      onData({ notes: state.notes, dropped: 0 });
      return () => {};
    },
    subscribeToJournal: (...args: unknown[]) => state.journal(...args),
    createCoachNote: (db: unknown, userId: unknown, input: unknown, now: unknown) =>
      state.create(db, userId, input, now),
    updateCoachNote: (db: unknown, userId: unknown, noteId: unknown, input: unknown, now: unknown) =>
      state.update(db, userId, noteId, input, now),
    deleteCoachNote: (db: unknown, userId: unknown, noteId: unknown) => state.remove(db, userId, noteId),
  };
});

afterEach(() => {
  state.create.mockReset();
  state.update.mockReset();
  state.remove.mockReset();
  state.journal.mockReset();
  state.create.mockResolvedValue({ ok: true, id: "made-1" });
  state.update.mockResolvedValue({ ok: true });
  state.notes = [];
});

describe("CoachNotesPage", () => {
  it("lists notes newest day first and leaves a day without a diary alone", async () => {
    state.notes = [older, newer];
    render(<CoachNotesPage />);
    const cards = await screen.findAllByRole("article");
    expect(cards.map((card) => within(card).getByRole("heading", { level: 3 }).textContent)).toEqual([
      formatCalendarDate("2026-06-08", "zh"),
      formatCalendarDate("2026-06-01", "zh"),
    ]);
    const first = within(cards[1]!);
    expect(first.getByText("李教练")).toBeTruthy();
    expect(first.getByText("高")).toBeTruthy();
    expect(first.getByText("入弯要收")).toBeTruthy();
    expect(first.getByText("入弯")).toBeTruthy();
    expect(first.getByText(/再收一次/)).toBeTruthy();
    expect(first.getByText(/自由-课/).closest("a")).toBeNull();
    expect(within(cards[0]!).getByText("低")).toBeTruthy();
    expect(screen.queryByText("这一天还没有日记。")).toBeNull();
    expect(state.journal).not.toHaveBeenCalled();
  });

  it("shows Anonymous when the coach name is missing", async () => {
    state.notes = [{ id: "n-anon", date: "2026-05-02", priority: "medium", note: "无名" }];
    render(<CoachNotesPage />);
    expect(await screen.findByText("匿名")).toBeTruthy();
  });

  it("filters by priority and coach together", async () => {
    state.notes = [older, newer];
    const user = userEvent.setup();
    render(<CoachNotesPage />);
    await screen.findByText("入弯要收");
    await user.click(screen.getByRole("button", { name: "高" }));
    expect(screen.getByText("入弯要收")).toBeTruthy();
    expect(screen.queryByText("直道放稳")).toBeNull();
    await user.click(screen.getByRole("button", { name: "全部" }));
    await user.type(screen.getByLabelText("筛选教练"), "王");
    expect(screen.getByText("直道放稳")).toBeTruthy();
    expect(screen.queryByText("入弯要收")).toBeNull();
    await user.click(screen.getByRole("button", { name: "高" }));
    expect(screen.getByText("没有符合的笔记。")).toBeTruthy();
    expect(screen.queryByRole("article")).toBeNull();
  });

  it("creates a note from the shared form", async () => {
    const user = userEvent.setup();
    render(<CoachNotesPage />);
    await user.click(await screen.findByRole("button", { name: "新增笔记" }));
    const form = screen.getByRole("form", { name: "新增笔记" });
    const date = within(form).getByLabelText("日期");
    await user.clear(date);
    await user.type(date, "2026-06-08");
    await user.type(within(form).getByLabelText("教练姓名"), "李教练");
    expect(within(form).getByRole("button", { name: "中" }).getAttribute("aria-pressed")).toBe("true");
    await user.type(within(form).getByLabelText("笔记"), "入弯要收");
    await user.click(within(form).getByRole("checkbox", { name: "入弯" }));
    await user.type(within(form).getByLabelText("明日跟进"), "再收一次");
    await user.type(within(form).getByLabelText("关联训练课"), "自由-课");
    await user.click(within(form).getByRole("button", { name: "保存" }));
    expect(state.create).toHaveBeenCalledTimes(1);
    const [db, userId, input, now] = state.create.mock.calls[0]!;
    expect(db).toBe(state.db);
    expect(userId).toBe("user-1");
    expect(input).toEqual({
      date: "2026-06-08",
      coachName: "李教练",
      priority: "medium",
      note: "入弯要收",
      technicalTags: ["corner_entry"],
      followUpTomorrow: "再收一次",
      linkedSessionId: "自由-课",
    });
    expect(now).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(state.update).not.toHaveBeenCalled();
    expect(state.remove).not.toHaveBeenCalled();
  });

  it("edits the existing note and does not create another", async () => {
    state.notes = [newer];
    const user = userEvent.setup();
    render(<CoachNotesPage />);
    await user.click(await screen.findByRole("button", { name: "编辑" }));
    const form = screen.getByRole("form", { name: "编辑笔记" });
    expect((within(form).getByLabelText("日期") as HTMLInputElement).value).toBe("2026-06-08");
    expect((within(form).getByLabelText("教练姓名") as HTMLInputElement).value).toBe("王教练");
    const body = within(form).getByLabelText("笔记");
    await user.clear(body);
    await user.type(body, "改过的直道");
    await user.click(within(form).getByRole("button", { name: "保存" }));
    expect(state.update).toHaveBeenCalledTimes(1);
    const [db, userId, noteId, input] = state.update.mock.calls[0]!;
    expect(db).toBe(state.db);
    expect(userId).toBe("user-1");
    expect(noteId).toBe("n-new");
    expect(input).toMatchObject({ date: "2026-06-08", note: "改过的直道", priority: "low", coachName: "王教练" });
    expect(state.create).not.toHaveBeenCalled();
  });

  it("asks before deleting and leaves the linked session alone", async () => {
    state.notes = [older];
    const user = userEvent.setup();
    render(<CoachNotesPage />);
    await user.click(await screen.findByRole("button", { name: "删除" }));
    const dialog = screen.getByRole("alertdialog");
    expect(within(dialog).getByText("只删除这条笔记，不删除关联的训练课。")).toBeTruthy();
    await user.click(within(dialog).getByRole("button", { name: "取消" }));
    expect(state.remove).not.toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).toBeNull();

    await user.click(screen.getByRole("button", { name: "删除" }));
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "确认删除" }));
    expect(state.remove).toHaveBeenCalledTimes(1);
    expect(state.remove.mock.calls[0]).toEqual([state.db, "user-1", "n-old"]);
    expect(state.update).not.toHaveBeenCalled();
  });

  it("shows the empty state instead of a blank list", async () => {
    render(<CoachNotesPage />);
    expect(await screen.findByText("还没有教练笔记。")).toBeTruthy();
    expect(screen.queryByRole("article")).toBeNull();
    expect(screen.queryByText("这一天还没有日记。")).toBeNull();
  });

  it("shows a date error and a save error without closing the form", async () => {
    const user = userEvent.setup();
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    render(<CoachNotesPage />);
    await user.click(await screen.findByRole("button", { name: "新增笔记" }));
    const form = screen.getByRole("form", { name: "新增笔记" });
    state.create.mockResolvedValueOnce({ ok: false, field: "date" });
    await user.click(within(form).getByRole("button", { name: "保存" }));
    expect((await screen.findByRole("alert")).textContent).toBe("日期要写成 YYYY-MM-DD，而且是真实的一天。");
    expect(screen.getByRole("form", { name: "新增笔记" })).toBeTruthy();

    state.create.mockRejectedValueOnce(new Error("write"));
    await user.click(within(form).getByRole("button", { name: "保存" }));
    expect((await screen.findByText("没有保存成功。"))).toBeTruthy();
    expect(screen.getByRole("form", { name: "新增笔记" })).toBeTruthy();
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
});
