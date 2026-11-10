// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";

import { formatCalendarDate } from "@/shared/i18n/format";
import { render, screen, userEvent, within } from "@/test/dom";

import { BodyStatusPage } from "./BodyStatusPage";

type Entry = {
  id: string;
  date: string;
  sleepHours?: number;
  fatigueLevel?: number;
  mood?: number;
  sorenessAreas?: string[];
  bodyWeightLb?: number;
  heightCm?: number;
  injuryNote?: string;
};

const state = vi.hoisted(() => ({
  db: { kind: "db" },
  entries: [] as Entry[],
  create: vi.fn(
    async (..._args: unknown[]): Promise<{ ok: true; id: string } | { ok: false; field: "date" }> => ({
      ok: true,
      id: "made-1",
    }),
  ),
  update: vi.fn(async (..._args: unknown[]) => ({ ok: true as const })),
  remove: vi.fn(async (..._args: unknown[]) => undefined),
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
    subscribeToBodyStatus: (_db: unknown, _uid: unknown, onData: (snapshot: unknown) => void) => {
      onData({ entries: state.entries, dropped: 0 });
      return () => {};
    },
    createBodyStatus: (db: unknown, userId: unknown, input: unknown, now: unknown) =>
      state.create(db, userId, input, now),
    updateBodyStatus: (db: unknown, userId: unknown, statusId: unknown, input: unknown, now: unknown) =>
      state.update(db, userId, statusId, input, now),
    deleteBodyStatus: (db: unknown, userId: unknown, statusId: unknown) => state.remove(db, userId, statusId),
  };
});

afterEach(() => {
  state.create.mockReset();
  state.update.mockReset();
  state.remove.mockReset();
  state.create.mockResolvedValue({ ok: true, id: "made-1" });
  state.update.mockResolvedValue({ ok: true });
  state.entries = [];
});

function dated(day: number, extra: Partial<Entry> = {}): Entry {
  return { id: `s-${day}`, date: `2026-06-${String(day).padStart(2, "0")}`, ...extra };
}

describe("BodyStatusPage", () => {
  it("shows only the latest seven and the mood and fatigue of a stored row", async () => {
    state.entries = [
      dated(1),
      dated(10, {
        mood: 6,
        fatigueLevel: 4,
        sleepHours: 7.5,
        bodyWeightLb: 120.5,
        heightCm: 160,
        sorenessAreas: ["knees"],
        injuryNote: "旧伤",
      }),
      dated(3),
      dated(4),
      dated(5),
      dated(6),
      dated(7),
      dated(8),
      dated(9, { heightCm: 170 }),
    ];
    render(<BodyStatusPage />);
    const cards = await screen.findAllByRole("article");
    expect(cards).toHaveLength(7);
    expect(screen.getByText("仅显示最近 7 条。")).toBeTruthy();
    expect(screen.queryByText(formatCalendarDate("2026-06-01", "zh"))).toBeNull();
    expect(screen.queryByText(formatCalendarDate("2026-06-03", "zh"))).toBeNull();
    const newest = within(cards[0]!);
    expect(newest.getByRole("heading", { level: 3 }).textContent).toBe(formatCalendarDate("2026-06-10", "zh"));
    expect(newest.getByText("很旺")).toBeTruthy();
    expect(newest.getByText("🔥")).toBeTruthy();
    expect(newest.getByText(/4 \/ 5/)).toBeTruthy();
    expect(newest.getByText("7.5 小时")).toBeTruthy();
    expect(newest.getByText(/120\.5 磅/)).toBeTruthy();
    expect(newest.getByText(/160 厘米/)).toBeTruthy();
    expect(newest.getByText("膝盖")).toBeTruthy();
    expect(newest.getByText("旧伤")).toBeTruthy();
    expect(screen.queryByText(/170 厘米/)).toBeNull();
  });

  it("shows the empty state instead of a blank list", async () => {
    render(<BodyStatusPage />);
    expect(await screen.findByText("还没有身体状态。")).toBeTruthy();
    expect(screen.queryByRole("article")).toBeNull();
    expect(screen.queryByText("仅显示最近 7 条。")).toBeNull();
  });

  it("lets the same day be saved twice", async () => {
    const user = userEvent.setup();
    render(<BodyStatusPage />);
    for (const note of ["第一条", "第二条"]) {
      await user.click(await screen.findByRole("button", { name: "新增记录" }));
      const form = screen.getByRole("form", { name: "新增记录" });
      const date = within(form).getByLabelText("日期");
      await user.clear(date);
      await user.type(date, "2026-06-10");
      await user.type(within(form).getByLabelText("伤病备注"), note);
      await user.click(within(form).getByRole("button", { name: "保存" }));
    }
    expect(state.create).toHaveBeenCalledTimes(2);
    const first = state.create.mock.calls[0]!;
    const second = state.create.mock.calls[1]!;
    expect(first[0]).toBe(state.db);
    expect(first[1]).toBe("user-1");
    expect(first[2]).toMatchObject({ date: "2026-06-10", injuryNote: "第一条", fatigueLevel: 3, mood: 3 });
    expect(second[2]).toMatchObject({ date: "2026-06-10", injuryNote: "第二条" });
    expect(String(first[3])).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(state.update).not.toHaveBeenCalled();
  });

  it("edits the existing row and does not create another", async () => {
    state.entries = [dated(10, { mood: 3, fatigueLevel: 3, injuryNote: "旧伤" })];
    const user = userEvent.setup();
    render(<BodyStatusPage />);
    await user.click(await screen.findByRole("button", { name: "编辑" }));
    const form = screen.getByRole("form", { name: "编辑记录" });
    expect((within(form).getByLabelText("日期") as HTMLInputElement).value).toBe("2026-06-10");
    expect(within(form).getByRole("button", { name: "3" }).getAttribute("aria-pressed")).toBe("true");
    const injury = within(form).getByLabelText("伤病备注");
    await user.clear(injury);
    await user.type(injury, "改过");
    await user.click(within(form).getByRole("group", { name: "心情" }).querySelector("button")!);
    await user.click(within(form).getByRole("button", { name: "保存" }));
    expect(state.update).toHaveBeenCalledTimes(1);
    const [db, userId, statusId, input] = state.update.mock.calls[0]!;
    expect(db).toBe(state.db);
    expect(userId).toBe("user-1");
    expect(statusId).toBe("s-10");
    expect(input).toMatchObject({ date: "2026-06-10", injuryNote: "改过", mood: 1 });
    expect(state.create).not.toHaveBeenCalled();
  });

  it("asks before deleting", async () => {
    state.entries = [dated(10, { injuryNote: "旧伤" })];
    const user = userEvent.setup();
    render(<BodyStatusPage />);
    await user.click(await screen.findByRole("button", { name: "删除" }));
    const dialog = screen.getByRole("alertdialog");
    expect(within(dialog).getByText("只删除这条身体状态。")).toBeTruthy();
    await user.click(within(dialog).getByRole("button", { name: "取消" }));
    expect(state.remove).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "删除" }));
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "确认删除" }));
    expect(state.remove).toHaveBeenCalledTimes(1);
    expect(state.remove.mock.calls[0]).toEqual([state.db, "user-1", "s-10"]);
  });

  it("shows a date error and a save error without closing the form", async () => {
    const user = userEvent.setup();
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    render(<BodyStatusPage />);
    await user.click(await screen.findByRole("button", { name: "新增记录" }));
    const form = screen.getByRole("form", { name: "新增记录" });
    state.create.mockResolvedValueOnce({ ok: false, field: "date" });
    await user.click(within(form).getByRole("button", { name: "保存" }));
    expect((await screen.findByRole("alert")).textContent).toBe("日期要写成 YYYY-MM-DD，而且是真实的一天。");
    expect(screen.getByRole("form", { name: "新增记录" })).toBeTruthy();

    state.create.mockRejectedValueOnce(new Error("write"));
    await user.click(within(form).getByRole("button", { name: "保存" }));
    expect(await screen.findByText("没有保存成功。")).toBeTruthy();
    expect(screen.getByRole("form", { name: "新增记录" })).toBeTruthy();
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
});
