// @vitest-environment happy-dom
import { todayDateString } from "@skatingx/schema";
import { mondayOfWeek } from "@skatingx/skating-domain";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

import { TrainingPlanPage } from "@/pages/training/TrainingPlanPage";
import { formatCalendarDate } from "@/shared/i18n/format";
import { act, render, screen, userEvent, waitFor, within } from "@/test/dom";

/**
 * The race-week suggestion on the plan page (docs/design/race-day-linkages.md 2.c). The thresholds
 * themselves are tested on the pure function; here: what the page does with the card.
 */

type RaceListener = {
  onData: (list: { items: unknown[]; invalid: unknown[] }) => void;
  onError: (error: { code: string; message: string }) => void;
  released: boolean;
};

const state = vi.hoisted(() => ({
  locale: "zh" as "zh" | "en",
  uid: "user-1" as string | null,
  db: {} as object | null,
  onAnalyses: null as
    | ((rows: { kind: "pace" | "biomech"; id: string; createdAt: string; findings: { code: string }[] }[]) => void)
    | null,
  raceListeners: [] as RaceListener[],
  training: {
    value: null as Record<string, unknown> | null,
    loading: false,
    error: null as string | null,
    listeners: new Set<() => void>(),
  },
  setPlanFocus: vi.fn(),
}));

const thisMonday = () => mondayOfWeek(todayDateString());

function setTraining(value: Record<string, unknown> | null) {
  act(() => {
    state.training.value = value;
    for (const listener of state.training.listeners) listener();
  });
}

vi.mock("@/hooks/useLocale", () => ({ useLocale: () => state.locale }));
vi.mock("@/app/providers/AuthProvider", () => ({
  useAuth: () => ({ uid: state.uid, loading: false, firebaseReady: Boolean(state.uid) }),
}));
vi.mock("@/app/providers/FirestoreProvider", async () => {
  const { useSyncExternalStore } = await import("react");
  return {
    useTrainingState: () => ({
      data: useSyncExternalStore(
        (listener) => {
          state.training.listeners.add(listener);
          return () => state.training.listeners.delete(listener);
        },
        () => state.training.value,
      ),
      loading: state.training.loading,
      error: state.training.error,
    }),
    useUserSettings: () => ({ data: { activeAthleteId: "lindsay" }, loading: false, error: null }),
  };
});
// Reads and the one focus write the page already had. Nothing else exists here, so any other write throws.
vi.mock("@skatingx/firebase-client", () => ({
  getFirestoreDb: () => state.db,
  setPlanFocus: async (ctx: unknown, focus: string) => {
    state.setPlanFocus(ctx, focus);
    state.training.value = { ...(state.training.value ?? {}), planFocus: focus, planFocusWeek: thisMonday(), todayTasks: [] };
    for (const listener of state.training.listeners) listener();
  },
  subscribeToTaskHistoryMonth: () => () => undefined,
  subscribeToSavedAnalyses: (
    _db: unknown,
    _uid: unknown,
    onData: (rows: { kind: "pace" | "biomech"; id: string; createdAt: string; findings: { code: string }[] }[]) => void,
  ) => {
    state.onAnalyses = onData;
    onData([]);
    return () => undefined;
  },
  subscribeToEquipmentHistory: (_db: unknown, _uid: unknown, _athlete: unknown, onData: (rows: never[]) => void) => {
    onData([]);
    return () => undefined;
  },
}));
vi.mock("@/hooks/raceWeekSubscribe", () => ({
  subscribeRaceWeekEvents: (_ctx: unknown, onData: RaceListener["onData"], onError: RaceListener["onError"]) => {
    const listener: RaceListener = { onData, onError, released: false };
    state.raceListeners.push(listener);
    return () => {
      listener.released = true;
    };
  },
}));

// 2026-10-26 is a Monday. The race below is Saturday 10-31 and Sunday 11-01.
const day = (month: number, date: number) => new Date(2026, month - 1, date, 12, 0, 0);
const MONDAY = day(10, 26);
const RACE_SATURDAY = day(10, 31);

const raceEvent = (over: Record<string, unknown> = {}) => ({
  eventId: "spring-open",
  name: "Spring Open",
  dates: ["2026-10-31", "2026-11-01"],
  timeZone: null,
  venue: null,
  verification: "verified",
  source: "manual",
  sourceNote: "",
  verifiedAt: null,
  schemaVersion: 1,
  ...over,
});

beforeEach(() => {
  vi.stubEnv("VITE_FEATURE_RACE_DAY", "true");
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(MONDAY);
  // A focus has been read: no chosen focus yet, not loading.
  state.training.value = { todayTasks: [] };
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
  state.locale = "zh";
  state.uid = "user-1";
  state.db = {};
  state.training.value = null;
  state.training.loading = false;
  state.training.error = null;
  state.setPlanFocus.mockClear();
  state.onAnalyses = null;
  state.raceListeners = [];
  sessionStorage.clear();
});

const renderPage = () =>
  render(
    <MemoryRouter>
      <TrainingPlanPage />
    </MemoryRouter>,
  );

const active = () => state.raceListeners.filter((listener) => !listener.released);

/** Waits for the page to subscribe (the reader loads on demand), then delivers the event list. */
async function deliver(items: unknown[]) {
  await waitFor(() => expect(state.raceListeners.length).toBeGreaterThan(0));
  act(() => {
    state.raceListeners.at(-1)?.onData({ items, invalid: [] });
  });
}

const raceRegion = (name = "比赛周建议") => screen.queryByRole("region", { name });

describe("race week suggestion on the plan page", () => {
  it("shows the card in the week of the race, with the event name and days, and the accept and hide buttons", async () => {
    renderPage();
    await deliver([raceEvent()]);

    const region = raceRegion();
    expect(region).toBeTruthy();
    const card = within(region as HTMLElement);
    expect(card.getByText("将本周侧重设为『比赛周与恢复管理』")).toBeTruthy();
    const range = `${formatCalendarDate("2026-10-31", "zh")} – ${formatCalendarDate("2026-11-01", "zh")}`;
    expect(card.getByText(`来自比赛日赛事「Spring Open」，${range}`)).toBeTruthy();
    expect(card.getByRole("button", { name: "采纳" })).toBeTruthy();
    expect(card.getByRole("button", { name: "忽略" })).toBeTruthy();
    // A confirmed event has no pending note.
    expect(card.queryByText("赛事日期待确认")).toBeNull();
  });

  it("says the event dates are pending when they are", async () => {
    renderPage();
    await deliver([raceEvent({ verification: "pending" })]);
    expect(within(raceRegion() as HTMLElement).getByText("赛事日期待确认")).toBeTruthy();
  });

  it("writes a single day as one date", async () => {
    renderPage();
    await deliver([raceEvent({ dates: ["2026-10-31"] })]);
    expect(within(raceRegion() as HTMLElement).getByText(`来自比赛日赛事「Spring Open」，${formatCalendarDate("2026-10-31", "zh")}`)).toBeTruthy();
  });

  it("is in English when the language is English", async () => {
    state.locale = "en";
    renderPage();
    await deliver([raceEvent({ verification: "pending" })]);
    const card = within(raceRegion("Race week suggestion") as HTMLElement);
    expect(card.getByText("Set this week's focus to \"Race week and recovery\"")).toBeTruthy();
    expect(card.getByText(/From the Race Day event "Spring Open"/)).toBeTruthy();
    expect(card.getByText("Event dates to be confirmed")).toBeTruthy();
    expect(card.getByRole("button", { name: "Use this" })).toBeTruthy();
    expect(card.getByRole("button", { name: "Hide for now" })).toBeTruthy();
  });

  it("is still there on the race day itself, and gone the day after the last race day", async () => {
    vi.setSystemTime(RACE_SATURDAY);
    state.training.value = { todayTasks: [] };
    const view = renderPage();
    await deliver([raceEvent({ dates: ["2026-10-31"] })]);
    expect(raceRegion()).toBeTruthy();
    view.unmount();

    // Sunday: the same plan week, but the race is over.
    state.raceListeners = [];
    vi.setSystemTime(day(11, 1));
    renderPage();
    await deliver([raceEvent({ dates: ["2026-10-31"] })]);
    expect(raceRegion()).toBeNull();
  });

  it("is gone in the next plan week", async () => {
    vi.setSystemTime(day(11, 2));
    renderPage();
    await deliver([raceEvent()]);
    expect(raceRegion()).toBeNull();
  });

  it("is not shown when the week's focus is already endurance", async () => {
    setTraining({ planFocus: "endurance", planFocusWeek: thisMonday(), todayTasks: [] });
    renderPage();
    await deliver([raceEvent()]);
    expect(raceRegion()).toBeNull();
  });

  it("is shown when another focus is chosen this week", async () => {
    setTraining({ planFocus: "lean", planFocusWeek: thisMonday(), todayTasks: [] });
    renderPage();
    await deliver([raceEvent()]);
    expect(raceRegion()).toBeTruthy();
  });

  it("is not shown for an event without a valid day", async () => {
    renderPage();
    await deliver([raceEvent({ dates: [] }), raceEvent({ eventId: "junk", dates: ["soon", "2026-02-30"] })]);
    expect(raceRegion()).toBeNull();
  });

  it("is not shown for the Buffalo event today (2026-10-30): the race was on 10-24 and 10-25", async () => {
    vi.setSystemTime(day(10, 30));
    renderPage();
    await deliver([
      raceEvent({
        eventId: "2026-buffalo-short-track-championships-rpm6w8",
        name: "Buffalo Short Track Championships",
        dates: ["2026-10-24", "2026-10-25"],
        verification: "pending",
      }),
    ]);
    expect(raceRegion()).toBeNull();
    expect(screen.queryByText(/Buffalo/)).toBeNull();
  });

  it("does not show a card before this week's focus has been read, so an endurance week does not flash it", async () => {
    state.training.loading = true;
    state.training.value = null;
    renderPage();
    await deliver([raceEvent()]);
    expect(raceRegion()).toBeNull();

    state.training.loading = false;
    setTraining({ planFocus: "endurance", planFocusWeek: thisMonday(), todayTasks: [] });
    expect(raceRegion()).toBeNull();
  });

  it("does not show a card when the training state could not be read, because the focus is unknown", async () => {
    state.training.error = "unavailable";
    renderPage();
    await deliver([raceEvent()]);
    expect(raceRegion()).toBeNull();
  });
});

describe("adopting and hiding", () => {
  it("adopting selects the endurance focus through the same write as the focus buttons, then the card is gone", async () => {
    const user = userEvent.setup({ advanceTimers: () => undefined });
    renderPage();
    await deliver([raceEvent()]);

    await user.click(within(raceRegion() as HTMLElement).getByRole("button", { name: "采纳" }));

    expect(state.setPlanFocus).toHaveBeenCalledTimes(1);
    expect(state.setPlanFocus).toHaveBeenCalledWith({ db: {}, userId: "user-1", athleteId: "lindsay" }, "endurance");
    expect(screen.getByRole("button", { name: /比赛周与恢复管理/ }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("heading", { name: /第 1 周周期微循环：比赛周与恢复管理/ })).toBeTruthy();
    expect(raceRegion()).toBeNull();
  });

  it("hiding keeps it away for this session, including after a reload, and writes no data", async () => {
    const user = userEvent.setup({ advanceTimers: () => undefined });
    const view = renderPage();
    await deliver([raceEvent()]);

    await user.click(within(raceRegion() as HTMLElement).getByRole("button", { name: "忽略" }));

    expect(raceRegion()).toBeNull();
    expect(sessionStorage.getItem("skatingx.plan.feedback.hidden")).toBe(JSON.stringify(["set-focus:race:spring-open"]));
    expect(state.setPlanFocus).not.toHaveBeenCalled();

    // A reload in the same session: the page mounts again with the same sessionStorage.
    view.unmount();
    state.raceListeners = [];
    renderPage();
    await deliver([raceEvent()]);
    expect(raceRegion()).toBeNull();
  });

  it("comes back in a new session", async () => {
    const user = userEvent.setup({ advanceTimers: () => undefined });
    const view = renderPage();
    await deliver([raceEvent()]);
    await user.click(within(raceRegion() as HTMLElement).getByRole("button", { name: "忽略" }));
    view.unmount();

    sessionStorage.clear();
    state.raceListeners = [];
    renderPage();
    await deliver([raceEvent()]);
    expect(raceRegion()).toBeTruthy();
  });

  it("hiding the race card leaves an analysis suggestion alone, and the other way round", async () => {
    const user = userEvent.setup({ advanceTimers: () => undefined });
    renderPage();
    await deliver([raceEvent()]);
    act(() => {
      state.onAnalyses?.([
        { kind: "pace", id: "pace-1", createdAt: "2026-10-20T12:00:00.000Z", findings: [{ code: "pace.decay.back-half" }] },
      ]);
    });

    await user.click(within(raceRegion() as HTMLElement).getByRole("button", { name: "忽略" }));
    expect(raceRegion()).toBeNull();
    expect(screen.getByText("将本周侧重设为『速度窗口与500m配速』")).toBeTruthy();
  });
});

describe("order, errors, and the flag", () => {
  it("puts the race card before the analysis suggestions", async () => {
    renderPage();
    await deliver([raceEvent()]);
    act(() => {
      state.onAnalyses?.([
        { kind: "pace", id: "pace-1", createdAt: "2026-10-20T12:00:00.000Z", findings: [{ code: "pace.decay.back-half" }] },
      ]);
    });
    const race = raceRegion() as HTMLElement;
    const analysis = screen.getByRole("region", { name: "来自分析的建议" });
    expect(race.compareDocumentPosition(analysis) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("says it could not read, and does not call that 'no race'; analysis suggestions are untouched", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    renderPage();
    await waitFor(() => expect(state.raceListeners.length).toBeGreaterThan(0));
    act(() => {
      state.raceListeners[0]?.onError({ code: "permission-denied", message: "users/user-1/raceDay" });
    });
    act(() => {
      state.onAnalyses?.([
        { kind: "pace", id: "pace-1", createdAt: "2026-10-20T12:00:00.000Z", findings: [{ code: "pace.decay.back-half" }] },
      ]);
    });

    const region = within(raceRegion() as HTMLElement);
    expect(region.getByText("比赛周建议暂时读不出来。计划本身没有被改动。")).toBeTruthy();
    expect(region.queryByRole("article")).toBeNull();
    expect(screen.getByText("将本周侧重设为『速度窗口与500m配速』")).toBeTruthy();
    vi.restoreAllMocks();
  });

  it("with the flag off the page is as it was: no listener, no race section", async () => {
    vi.stubEnv("VITE_FEATURE_RACE_DAY", "");
    renderPage();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(state.raceListeners).toHaveLength(0);
    expect(raceRegion()).toBeNull();
    expect(screen.queryByText(/比赛周建议/)).toBeNull();
  });

  it("releases its listener when the page unmounts", async () => {
    const view = renderPage();
    await deliver([raceEvent()]);
    expect(active()).toHaveLength(1);
    view.unmount();
    expect(active()).toHaveLength(0);
  });
});
