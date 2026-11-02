// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";

import { render, screen, userEvent } from "@/test/dom";
import { formatCalendarDate } from "@/shared/i18n/format";

import { JournalCalendarPage } from "./JournalCalendarPage";

const state = vi.hoisted(() => ({
  db: { kind: "db" },
  save: vi.fn(async (_db: unknown, _userId: unknown, _documentId: unknown, _data: unknown) => undefined),
  days: [
    { id: "src-1", date: "2026-06-08", location: "Buffalo", overallFeeling: 4 },
  ] as { id: string; date: string; location?: string; overallFeeling?: number }[],
  sessions: [
    { id: "s1", date: "2026-06-09", sessionLabel: "冰上课" },
    { id: "s2", date: "2026-06-10" },
  ] as { id: string; date: string; sessionLabel?: string }[],
}));

vi.mock("@skatingx/schema", async () => {
  const actual = await vi.importActual<typeof import("@skatingx/schema")>("@skatingx/schema");
  return { ...actual, todayDateString: () => "2026-06-15" };
});

vi.mock("@/app/providers/AuthProvider", () => ({
  useAuth: () => ({ uid: "user-1", loading: false }),
}));

vi.mock("@/hooks/useLocale", () => ({ useLocale: () => "zh" }));

vi.mock("@skatingx/firebase-client", async () => {
  const actual = await vi.importActual<typeof import("@skatingx/firebase-client")>("@skatingx/firebase-client");
  return {
    ...actual,
    getFirestoreDb: () => state.db,
    subscribeToJournal: (_db: unknown, _uid: unknown, onData: (snapshot: unknown) => void) => {
      onData({ days: state.days, sessions: state.sessions, droppedDays: 0, droppedSessions: 0 });
      return () => {};
    },
    saveJournalDay: (db: unknown, userId: unknown, documentId: unknown, data: unknown) =>
      state.save(db, userId, documentId, data),
  };
});

afterEach(() => {
  state.save.mockClear();
});

const dayButton = (date: string) =>
  screen.getByRole("button", { name: new RegExp(formatCalendarDate(date, "zh").replace(/[()]/g, "\\$&")) });

describe("JournalCalendarPage", () => {
  it("dots a diary, a session-only day, and leaves an empty day unmarked", async () => {
    render(<JournalCalendarPage />);
    expect((await screen.findByRole("button", { name: /2026年6月8日/ })).getAttribute("aria-label")).toContain("有日记");
    expect(dayButton("2026-06-09").getAttribute("aria-label")).toContain("只有训练课");
    expect(dayButton("2026-06-11").getAttribute("aria-label")).toContain("无记录");
  });

  it("shows stored fields and skips the ones that were not stored", async () => {
    const user = userEvent.setup();
    render(<JournalCalendarPage />);
    await user.click(await screen.findByRole("button", { name: /2026年6月8日/ }));
    expect(screen.getByText("Buffalo")).toBeTruthy();
    const feeling = screen.getByText("整体感觉", { selector: "dt" });
    expect(feeling.nextElementSibling?.textContent).toBe("4");
    expect(screen.queryByText("酸痛", { selector: "dt" })).toBeNull();
    expect(screen.queryByText("教练反馈", { selector: "dt" })).toBeNull();
    expect(screen.queryByText("精力", { selector: "dt" })).toBeNull();
  });

  it("lists a session label and does not invent a diary", async () => {
    const user = userEvent.setup();
    render(<JournalCalendarPage />);
    await user.click(await screen.findByRole("button", { name: /2026年6月9日/ }));
    expect(screen.getByText("冰上课")).toBeTruthy();
    expect(screen.getByText("这一天还没有日记。")).toBeTruthy();
  });

  it("writes a new day under the date id and leaves blank fields off the payload", async () => {
    const user = userEvent.setup();
    render(<JournalCalendarPage />);
    await user.click(await screen.findByRole("button", { name: /2026年6月11日/ }));
    await user.selectOptions(screen.getByLabelText("整体感觉（1–5，必填）"), "5");
    await user.click(screen.getByRole("button", { name: "保存" }));
    expect(state.save).toHaveBeenCalledTimes(1);
    const [db, userId, documentId, data] = state.save.mock.calls[0]!;
    expect(db).toBe(state.db);
    expect(userId).toBe("user-1");
    expect(documentId).toBe("2026-06-11");
    expect(data).toMatchObject({ date: "2026-06-11", overallFeeling: 5, isCompleted: false });
    expect(data).not.toHaveProperty("energy");
    expect(data).not.toHaveProperty("trainingFocus");
    expect(data).not.toHaveProperty("parentNote");
    expect(data).not.toHaveProperty("lindsayReflection");
  });

  it("edits the existing document instead of creating a second one", async () => {
    const user = userEvent.setup();
    render(<JournalCalendarPage />);
    await user.click(await screen.findByRole("button", { name: /2026年6月8日/ }));
    await user.selectOptions(screen.getByLabelText("整体感觉（1–5，必填）"), "2");
    await user.click(screen.getByRole("button", { name: "保存" }));
    const [, , documentId, data] = state.save.mock.calls[0]!;
    expect(documentId).toBe("src-1");
    expect(data).toMatchObject({ overallFeeling: 2 });
    expect(data).not.toHaveProperty("isCompleted");
    expect(data).not.toHaveProperty("createdAt");
  });

  it("moves to the previous month and back", async () => {
    const user = userEvent.setup();
    render(<JournalCalendarPage />);
    expect(await screen.findByRole("button", { name: /2026年6月8日/ })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "上个月" }));
    expect(screen.queryByRole("button", { name: /2026年6月8日/ })).toBeNull();
    expect(screen.getByRole("button", { name: /2026年5月1日/ })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "下个月" }));
    expect(screen.getByRole("button", { name: /2026年6月8日/ })).toBeTruthy();
  });
});
