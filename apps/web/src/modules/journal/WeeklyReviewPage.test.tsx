// @vitest-environment happy-dom
import { addDaysToDateString, mondayOfWeek } from "@skatingx/skating-domain";
import { todayDateString } from "@skatingx/schema";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { render, screen, userEvent, waitFor } from "@/test/dom";

import { WeeklyReviewPage } from "./WeeklyReviewPage";

const thisMonday = mondayOfWeek(todayDateString());
const lastMonday = addDaysToDateString(thisMonday, -7);
const thisDay = addDaysToDateString(thisMonday, 1);

const db = {};
const journalSnapshot = {
  days: [] as unknown[],
  sessions: [
    { id: "now", date: thisDay, sessionType: "ice", durationMinutes: 60, focusTags: ["start"] },
    { id: "old-1", date: lastMonday, sessionType: "dryland", durationMinutes: 20, focusTags: ["edges"] },
    { id: "old-2", date: lastMonday, sessionType: "ice", durationMinutes: 30 },
  ],
  droppedDays: 0,
  droppedSessions: 0,
};
const noteSnapshot = { notes: [] as unknown[], dropped: 0 };
const subscribeToJournal = vi.fn();
const subscribeToCoachNotes = vi.fn();
const subscribeToWeeklyReview = vi.fn();
const saveWeeklyReview = vi.fn(
  async (..._args: unknown[]): Promise<{ ok: true } | { ok: false; field: "weekStart" }> => ({ ok: true }),
);
const useTrainingRecords = vi.fn();

vi.mock("@skatingx/firebase-client", () => ({
  SESSION_FOCUS_TAGS: ["start", "500m", "edges"],
  COACH_NOTE_TAGS: ["edges"],
  getFirestoreDb: () => db,
  subscribeToJournal: (...args: unknown[]) => subscribeToJournal(...args),
  subscribeToCoachNotes: (...args: unknown[]) => subscribeToCoachNotes(...args),
  subscribeToWeeklyReview: (...args: unknown[]) => subscribeToWeeklyReview(...args),
  saveWeeklyReview: (...args: unknown[]) => saveWeeklyReview(...args),
}));

vi.mock("@/hooks/useTrainingRecords", () => ({
  useTrainingRecords: () => useTrainingRecords(),
}));

vi.mock("@/hooks/useLocale", () => ({ useLocale: () => "zh" }));
vi.mock("@/app/providers/AuthProvider", () => ({ useAuth: () => ({ uid: "user-1" }) }));

function emit() {
  subscribeToJournal.mockImplementation((_db, _uid, onData: (snapshot: unknown) => void) => {
    onData(journalSnapshot);
    return () => undefined;
  });
  subscribeToCoachNotes.mockImplementation((_db, _uid, onData: (snapshot: unknown) => void) => {
    onData(noteSnapshot);
    return () => undefined;
  });
  subscribeToWeeklyReview.mockImplementation((_db, _uid, _week, onData: (review: null) => void) => {
    onData(null);
    return () => undefined;
  });
}

beforeEach(() => {
  subscribeToJournal.mockReset();
  subscribeToCoachNotes.mockReset();
  subscribeToWeeklyReview.mockReset();
  saveWeeklyReview.mockReset();
  useTrainingRecords.mockReset();
  saveWeeklyReview.mockResolvedValue({ ok: true });
  useTrainingRecords.mockReturnValue({
    recordsByDistance: {
      "500m": {
        distanceId: "500m",
        label: "500m",
        unit: "seconds",
        entries: [
          { id: "fast", date: thisDay, timeSeconds: 45.2, createdAt: "t" },
          { id: "older", date: lastMonday, timeSeconds: 40, createdAt: "t" },
        ],
      },
    },
    loading: false,
    error: null,
  });
  emit();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("WeeklyReviewPage", () => {
  it("recomputes the week instead of keeping the previous numbers", async () => {
    const user = userEvent.setup();
    render(<WeeklyReviewPage />);
    expect(screen.getByText("总课次").nextElementSibling?.textContent).toBe("1");
    expect(screen.getByText(/起跑/)).toBeTruthy();
    expect(screen.getByText(/45\.200/)).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "上周" }));
    expect(screen.getByText("总课次").nextElementSibling?.textContent).toBe("2");
    expect(screen.queryByText(/起跑/)).toBeNull();
    expect(screen.getByText(/刃/)).toBeTruthy();
    expect(screen.getByText(/40\.000/)).toBeTruthy();
    expect(screen.queryByText(/45\.200/)).toBeNull();
  });

  it("shows the empty state for a week with nothing in it", async () => {
    const user = userEvent.setup();
    render(<WeeklyReviewPage />);
    await user.click(screen.getByRole("button", { name: "下周" }));
    expect(screen.getByText("这一周还没有训练、笔记或成绩。")).toBeTruthy();
    expect(screen.queryByText("总课次")).toBeNull();
  });

  it("saves the three sentences and keeps the form open when saving fails", async () => {
    const user = userEvent.setup();
    render(<WeeklyReviewPage />);
    await user.type(screen.getByLabelText("本周最好的一刻"), "起跑干净");
    await user.type(screen.getByLabelText("下周重点"), "弯道");
    await user.type(screen.getByLabelText("给家长的话"), "状态稳");
    await user.click(screen.getByRole("button", { name: "保存" }));
    expect(saveWeeklyReview).toHaveBeenCalledWith(
      expect.anything(),
      "user-1",
      thisMonday,
      { bestMoment: "起跑干净", nextWeekFocus: "弯道", parentSummary: "状态稳" },
      expect.any(String),
    );
    expect((screen.getByLabelText("本周最好的一刻") as HTMLTextAreaElement).value).toBe("起跑干净");

    saveWeeklyReview.mockRejectedValueOnce(new Error("offline"));
    await user.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("没有保存成功。"));
    expect(screen.getByRole("heading", { name: "手写复盘" })).toBeTruthy();
    expect((screen.getByLabelText("本周最好的一刻") as HTMLTextAreaElement).value).toBe("起跑干净");
    expect(console.error).toHaveBeenCalled();
  });
});
