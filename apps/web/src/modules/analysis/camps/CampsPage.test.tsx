// @vitest-environment happy-dom
import { fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

import { render, screen, userEvent, waitFor } from "@/test/dom";

import { CampsPage } from "./CampsPage";

function renderPage() {
  return render(
    <MemoryRouter>
      <CampsPage />
    </MemoryRouter>,
  );
}

const db = {};

type Camp = {
  id: string;
  name: string;
  type: string;
  startDate: string;
  endDate: string;
  createdAt: string;
  updatedAt: string;
  location?: string;
};

const state = vi.hoisted(() => ({
  camps: null as Camp[] | null,
  fail: false,
  create: vi.fn(
    async (..._args: unknown[]): Promise<{ ok: true; id: string } | { ok: false; field: string }> => ({
      ok: true,
      id: "new-1",
    }),
  ),
  update: vi.fn(async (..._args: unknown[]): Promise<{ ok: true } | { ok: false; field: string }> => ({ ok: true })),
  remove: vi.fn(async (..._args: unknown[]) => undefined),
}));

vi.mock("@/hooks/useLocale", () => ({ useLocale: () => "zh" }));
vi.mock("@/app/providers/AuthProvider", () => ({
  useAuth: () => ({ uid: "user-1", loading: false, firebaseReady: true }),
}));
vi.mock("@skatingx/firebase-client", () => ({
  CAMP_TYPES: ["夏令营", "冬令营", "回国集训", "赛前集训", "海外拉练"],
  getFirestoreDb: () => db,
  subscribeToCamps: (
    _db: unknown,
    _uid: unknown,
    onData: (snapshot: { camps: Camp[]; dropped: number }) => void,
    onError: (error: unknown) => void,
  ) => {
    if (state.fail) onError(new Error("no"));
    else if (state.camps) onData({ camps: state.camps, dropped: 0 });
    return () => undefined;
  },
  createCamp: (...args: unknown[]) => state.create(...args),
  updateCamp: (...args: unknown[]) => state.update(...args),
  deleteCamp: (...args: unknown[]) => state.remove(...args),
}));

const later: Camp = {
  id: "late",
  name: "八月营",
  type: "夏令营",
  startDate: "2026-08-01",
  endDate: "2026-08-10",
  createdAt: "2026-06-01T00:00:00.000Z",
  updatedAt: "2026-06-01T00:00:00.000Z",
  location: "上海",
};
const earlier: Camp = {
  id: "early",
  name: "六月营",
  type: "回国集训",
  startDate: "2026-06-01",
  endDate: "2026-06-05",
  createdAt: "2026-05-01T00:00:00.000Z",
  updatedAt: "2026-05-01T00:00:00.000Z",
};

describe("CampsPage", () => {
  beforeEach(() => {
    state.camps = null;
    state.fail = false;
    state.create.mockReset();
    state.create.mockResolvedValue({ ok: true, id: "new-1" });
    state.update.mockReset();
    state.update.mockResolvedValue({ ok: true });
    state.remove.mockReset();
    state.remove.mockResolvedValue(undefined);
  });

  it("lists camps newest start date first", async () => {
    state.camps = [earlier, later];
    renderPage();
    const titles = await screen.findAllByRole("heading", { level: 3 });
    expect(titles.map((title) => title.textContent)).toEqual(["八月营", "六月营"]);
    expect(screen.getAllByRole("link", { name: "查看统计" }).map((link) => link.getAttribute("href"))).toEqual([
      "/analysis/camps/late",
      "/analysis/camps/early",
    ]);
    expect(screen.getByText("上海")).toBeTruthy();
    expect(screen.getByText("回国集训")).toBeTruthy();
  });

  it("shows the empty and loading states", async () => {
    const pending = renderPage();
    expect(screen.getByText("正在读取训练营。")).toBeTruthy();
    pending.unmount();
    state.camps = [];
    renderPage();
    expect(await screen.findByText("还没有训练营。")).toBeTruthy();
  });

  it("creates, edits, and deletes a camp", async () => {
    state.camps = [later];
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole("heading", { level: 3, name: "八月营" });

    await user.click(screen.getByRole("button", { name: "新增训练营" }));
    await user.type(screen.getByLabelText("名称"), "新营");
    await user.type(screen.getByLabelText("类型"), "自己的类型");
    fireEvent.change(screen.getByLabelText("开始日期"), { target: { value: "2026-07-01" } });
    fireEvent.change(screen.getByLabelText("结束日期"), { target: { value: "2026-07-14" } });
    await user.type(screen.getByLabelText("地点"), "北京");
    await user.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(state.create).toHaveBeenCalled());
    expect(state.create.mock.calls[0]?.[2]).toMatchObject({
      name: "新营",
      type: "自己的类型",
      startDate: "2026-07-01",
      endDate: "2026-07-14",
      location: "北京",
    });
    expect(screen.queryByRole("heading", { name: "新增训练营" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "编辑" }));
    const name = screen.getByLabelText("名称") as HTMLInputElement;
    await user.clear(name);
    await user.type(name, "改过");
    await user.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(state.update).toHaveBeenCalled());
    expect(state.update.mock.calls[0]?.[2]).toBe("late");

    await user.click(screen.getByRole("button", { name: "删除" }));
    await user.click(screen.getByRole("button", { name: "确认删除" }));
    await waitFor(() => expect(state.remove).toHaveBeenCalled());
    expect(state.remove.mock.calls[0]?.[2]).toBe("late");
  });

  it("keeps the form open when the dates are refused", async () => {
    state.camps = [];
    state.create.mockResolvedValueOnce({ ok: false, field: "dates" });
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: "新增训练营" }));
    await user.type(screen.getByLabelText("名称"), "新营");
    await user.type(screen.getByLabelText("类型"), "夏令营");
    fireEvent.change(screen.getByLabelText("开始日期"), { target: { value: "2026-07-20" } });
    fireEvent.change(screen.getByLabelText("结束日期"), { target: { value: "2026-07-01" } });
    await user.click(screen.getByRole("button", { name: "保存" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("开始不能晚于结束");
    expect(screen.getByRole("heading", { name: "新增训练营" })).toBeTruthy();
  });

  it("shows a read failure and a retry", async () => {
    state.fail = true;
    const user = userEvent.setup();
    renderPage();
    expect(await screen.findByText("训练营没有读出来。")).toBeTruthy();
    state.fail = false;
    state.camps = [];
    await user.click(screen.getByRole("button", { name: "重试" }));
    expect(await screen.findByText("还没有训练营。")).toBeTruthy();
  });
});
