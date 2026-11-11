// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { render, screen, userEvent } from "@/test/dom";

import { CampStatsPage } from "./CampStatsPage";

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

const camp: Camp = {
  id: "camp-1",
  name: "八月营",
  type: "夏令营",
  startDate: "2026-07-01",
  endDate: "2026-07-14",
  createdAt: "2026-06-01T00:00:00.000Z",
  updatedAt: "2026-06-01T00:00:00.000Z",
  location: "上海",
};

const state = vi.hoisted(() => ({
  camp: null as Camp | null,
  hold: false,
  failSubs: false,
  emit: false,
  journal: { days: [] as { date: string }[], sessions: [] as { date: string; sessionType?: string; durationMinutes?: number }[], droppedDays: 0, droppedSessions: 0 },
  notes: { notes: [] as { date: string; technicalTags?: string[] }[], dropped: 0 },
}));

const useTrainingRecords = vi.fn();

vi.mock("@/hooks/useLocale", () => ({ useLocale: () => "zh" }));
vi.mock("@/app/providers/AuthProvider", () => ({
  useAuth: () => ({ uid: "user-1", loading: false, firebaseReady: true }),
}));
vi.mock("@/hooks/useTrainingRecords", () => ({
  useTrainingRecords: () => useTrainingRecords(),
}));
vi.mock("@skatingx/firebase-client", () => ({
  COACH_NOTE_TAGS: ["edges"],
  getFirestoreDb: () => db,
  getCamp: () => (state.hold ? new Promise(() => undefined) : Promise.resolve(state.camp)),
  subscribeToJournal: (
    _db: unknown,
    _uid: unknown,
    onData: (snapshot: unknown) => void,
    onError: (error: unknown) => void,
  ) => {
    if (state.failSubs) onError(new Error("no"));
    else if (state.emit) onData(state.journal);
    return () => undefined;
  },
  subscribeToCoachNotes: (
    _db: unknown,
    _uid: unknown,
    onData: (snapshot: unknown) => void,
    onError: (error: unknown) => void,
  ) => {
    if (state.failSubs) onError(new Error("no"));
    else if (state.emit) onData(state.notes);
    return () => undefined;
  },
}));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/analysis/camps/camp-1"]}>
      <Routes>
        <Route path="/analysis/camps/:campId" element={<CampStatsPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("CampStatsPage", () => {
  beforeEach(() => {
    state.camp = camp;
    state.hold = false;
    state.failSubs = false;
    state.emit = true;
    state.journal = { days: [], sessions: [], droppedDays: 0, droppedSessions: 0 };
    state.notes = { notes: [], dropped: 0 };
    useTrainingRecords.mockReset();
    useTrainingRecords.mockReturnValue({ recordsByDistance: {}, loading: false, error: null });
  });

  it("shows the camp and the numbers derived for its dates", async () => {
    state.journal = {
      days: [{ date: "2026-07-05" }],
      sessions: [{ date: "2026-07-02", sessionType: "ice", durationMinutes: 45 }],
      droppedDays: 0,
      droppedSessions: 0,
    };
    state.notes = { notes: [{ date: "2026-07-03", technicalTags: ["edges"] }], dropped: 0 };
    useTrainingRecords.mockReturnValue({
      loading: false,
      error: null,
      recordsByDistance: {
        "500m": {
          distanceId: "500m",
          label: "500m",
          unit: "seconds",
          entries: [
            { date: "2026-06-01", timeSeconds: 42 },
            { date: "2026-07-04", timeSeconds: 40.5 },
            { date: "2026-07-20", timeSeconds: 10 },
          ],
        },
      },
    });
    renderPage();
    expect(await screen.findByRole("heading", { level: 1, name: "八月营" })).toBeTruthy();
    expect(screen.getByText("上海")).toBeTruthy();
    expect(screen.getByText("总天数").nextElementSibling?.textContent).toBe("14");
    expect(screen.getByText("训练天数").nextElementSibling?.textContent).toBe("2");
    expect(screen.getByText("冰上课").nextElementSibling?.textContent).toBe("1");
    expect(screen.getByText("总分钟").nextElementSibling?.textContent).toBe("45 分钟");
    expect(screen.getByText("总课次").nextElementSibling?.textContent).toBe("1");
    const change = screen.getByText(/42\.000/);
    expect(change.textContent).toContain("40.500");
    expect(change.textContent).toContain("营内新最好");
    expect(change.textContent).not.toContain("10.000");
    expect(screen.getByText(/刃/)).toBeTruthy();
  });

  it("links back when the camp does not exist", async () => {
    state.camp = null;
    renderPage();
    expect(await screen.findByText("没有找到这个训练营。")).toBeTruthy();
    expect(screen.getByRole("link", { name: "回到训练营" }).getAttribute("href")).toBe("/analysis/camps");
  });

  it("shows loading, then a read failure, then an empty range after retry", async () => {
    state.hold = true;
    state.emit = false;
    const pending = renderPage();
    expect(screen.getByText("正在计算这次训练营。")).toBeTruthy();
    pending.unmount();

    state.hold = false;
    state.failSubs = true;
    const user = userEvent.setup();
    renderPage();
    expect(await screen.findByText("这次训练营的统计没有算出来。")).toBeTruthy();
    state.failSubs = false;
    state.emit = true;
    await user.click(screen.getByRole("button", { name: "重试" }));
    expect(await screen.findByText("这个日期范围内还没有日记、训练课、教练笔记或成绩。")).toBeTruthy();
  });
});
