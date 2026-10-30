// @vitest-environment happy-dom
import type { RaceEntry, RaceEvent, RaceResult, RaceRosterEntry } from "@skatingx/schema";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { act, renderHook } from "@/test/dom";

import { useRaceOverview } from "./useRaceOverview";

type Listener = {
  kind: "events" | "roster" | "races" | "results";
  eventId: string | null;
  onData: (list: { items: unknown[]; invalid: { id: string; reason: string }[] }) => void;
  onError: (error: { code: string; message: string }) => void;
  released: boolean;
};

const h = vi.hoisted(() => ({
  state: {
    uid: "uid-1" as string | null,
    ready: true,
    db: {} as object | null,
    listeners: [] as Listener[],
  },
}));

function record(kind: Listener["kind"], eventId: string | null, onData: Listener["onData"], onError: Listener["onError"]) {
  const listener: Listener = { kind, eventId, onData, onError, released: false };
  h.state.listeners.push(listener);
  return () => {
    listener.released = true;
  };
}

vi.mock("@/app/providers/AuthProvider", () => ({ useAuth: () => ({ uid: h.state.uid }) }));
vi.mock("@/hooks/firestore", () => ({ useFirestoreStatus: () => ({ ready: h.state.ready }) }));
// Only the four read subscriptions exist here: a write call would be `undefined is not a function`.
vi.mock("@skatingx/firebase-client", () => ({
  getFirestoreDb: () => h.state.db,
  subscribeToRaceEvents: (_ctx: unknown, onData: Listener["onData"], onError: Listener["onError"]) =>
    record("events", null, onData, onError),
  subscribeToRoster: (_ctx: unknown, eventId: string, onData: Listener["onData"], onError: Listener["onError"]) =>
    record("roster", eventId, onData, onError),
  subscribeToRaces: (_ctx: unknown, eventId: string, onData: Listener["onData"], onError: Listener["onError"]) =>
    record("races", eventId, onData, onError),
  subscribeToRaceResults: (_ctx: unknown, eventId: string, onData: Listener["onData"], onError: Listener["onError"]) =>
    record("results", eventId, onData, onError),
}));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
  // 2026-10-30 12:00 in New York
  vi.setSystemTime(new Date("2026-10-30T16:00:00.000Z"));
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  h.state.uid = "uid-1";
  h.state.ready = true;
  h.state.db = {};
  h.state.listeners = [];
});

const prov = {
  verification: "verified" as const,
  source: "manual" as const,
  sourceNote: "",
  verifiedAt: null,
  schemaVersion: 1 as const,
};
const event = (eventId: string, dates: string[], over: Partial<RaceEvent> = {}): RaceEvent =>
  ({ eventId, name: eventId, dates, timeZone: "America/New_York", venue: null, ...prov, ...over }) as RaceEvent;
const roster = (rosterId: string, over: Partial<RaceRosterEntry> = {}): RaceRosterEntry =>
  ({ rosterId, displayName: rosterId, bib: "1", division: "Senior A", isSelf: true, isFollowed: false, athleteRefId: "lindsay", ...prov, ...over }) as RaceRosterEntry;
const race = (raceId: string, day: string): RaceEntry =>
  ({ raceId, distanceId: "500m", label: raceId, sortOrder: 0, day, round: null, heat: null, scheduledAt: null, rosterIds: ["me"], ...prov }) as RaceEntry;
const res = (raceId: string, over: Partial<RaceResult> = {}): RaceResult =>
  ({ resultId: `${raceId}_me`, raceId, rosterId: "me", status: "finished", timeSeconds: 48.5, place: 2, advanced: null, ...prov, ...over }) as RaceResult;

const active = () => h.state.listeners.filter((l) => !l.released);
const of = (kind: Listener["kind"], eventId: string | null = null) =>
  h.state.listeners.filter((l) => l.kind === kind && l.eventId === eventId && !l.released);
const send = (listener: Listener | undefined, items: unknown[], invalid: { id: string; reason: string }[] = []) => {
  act(() => {
    listener?.onData({ items, invalid });
  });
};

const BUFFALO = event("buffalo", ["2026-10-24", "2026-10-25"]);
const NEXT = event("nationals", ["2026-11-07", "2026-11-08"], { venue: "Salt Lake City" });

describe("useRaceOverview: loading and errors", () => {
  it("is loading, and subscribes to nothing, until the user and the database are ready", () => {
    h.state.ready = false;
    const { result } = renderHook(() => useRaceOverview());
    expect(result.current).toEqual({ status: "loading" });
    expect(h.state.listeners).toHaveLength(0);
  });

  it("is loading until the event list arrives", () => {
    const { result } = renderHook(() => useRaceOverview());
    expect(result.current).toEqual({ status: "loading" });
    expect(active().map((l) => l.kind)).toEqual(["events"]);
  });

  it("a failed event read is an error, never 'no events'; permission denied is told apart", () => {
    const { result } = renderHook(() => useRaceOverview());
    act(() => {
      of("events")[0]?.onError({ code: "permission-denied", message: "path/with/ids" });
    });
    expect(result.current).toEqual({ status: "error", permissionDenied: true });

    const other = renderHook(() => useRaceOverview());
    act(() => {
      h.state.listeners.filter((l) => l.kind === "events" && !l.released).at(-1)?.onError({ code: "unavailable", message: "x" });
    });
    expect(other.result.current).toEqual({ status: "error", permissionDenied: false });
  });

  it("logs only the error code, never the message (it can hold document paths)", () => {
    renderHook(() => useRaceOverview());
    act(() => {
      of("events")[0]?.onError({ code: "permission-denied", message: "artifacts/x/users/uid-1/raceDay" });
    });
    const logged = JSON.stringify(vi.mocked(console.error).mock.calls);
    expect(logged).toContain("permission-denied");
    expect(logged).not.toContain("artifacts");
  });
});

describe("useRaceOverview: ready", () => {
  it("no events: ready and empty, with nothing else subscribed", () => {
    const { result } = renderHook(() => useRaceOverview());
    send(of("events")[0], []);
    expect(result.current).toEqual({ status: "ready", eventCount: 0, hiddenCount: 0, next: null, previous: null });
    expect(active()).toHaveLength(1);
  });

  it("counts event documents that failed validation instead of ignoring them", () => {
    const { result } = renderHook(() => useRaceOverview());
    send(of("events")[0], [BUFFALO], [{ id: "bad", reason: "wrong shape" }]);
    expect(result.current).toMatchObject({ status: "ready", eventCount: 1, hiddenCount: 1 });
  });

  it("the Buffalo event is the previous one on Oct 30, and there is no next one", () => {
    const { result } = renderHook(() => useRaceOverview());
    send(of("events")[0], [BUFFALO]);
    expect(result.current).toMatchObject({ status: "ready", next: null, previous: { pick: { event: { eventId: "buffalo" } } } });
    // The event list plus the previous event's roster, schedule and results.
    expect(active().map((l) => `${l.kind}:${l.eventId ?? ""}`).sort()).toEqual([
      "events:",
      "races:buffalo",
      "results:buffalo",
      "roster:buffalo",
    ]);
  });

  it("never holds more than five listeners (events, next roster, previous roster, races, results)", () => {
    renderHook(() => useRaceOverview());
    send(of("events")[0], [BUFFALO, NEXT, event("old", ["2026-01-01"])]);
    expect(active()).toHaveLength(5);
    expect(of("roster", "nationals")).toHaveLength(1);
    expect(of("races", "nationals")).toHaveLength(0);
    expect(of("results", "nationals")).toHaveLength(0);
  });

  it("shows the next event's division from the own roster row, and the previous event's three newest own results", () => {
    const { result } = renderHook(() => useRaceOverview());
    send(of("events")[0], [BUFFALO, NEXT]);
    send(of("roster", "nationals")[0], [roster("me", { division: "Senior B" })]);
    send(of("roster", "buffalo")[0], [roster("me")]);
    send(of("races", "buffalo")[0], [race("a", "2026-10-24"), race("b", "2026-10-25"), race("c", "2026-10-25"), race("d", "2026-10-25")]);
    send(of("results", "buffalo")[0], [res("a"), res("b"), res("c"), res("d", { verification: "pending" })]);

    expect(result.current).toMatchObject({
      status: "ready",
      next: { pick: { event: { eventId: "nationals" }, daysUntil: 8 }, division: "Senior B", detail: "ready" },
      previous: { detail: "ready" },
    });
    if (result.current.status !== "ready") throw new Error("not ready");
    expect(result.current.previous?.results.map((row) => row.result.raceId)).toEqual(["b", "c", "d"]);
  });

  it("a failed results read is a detail error, not an empty list; the card itself stays up", () => {
    const { result } = renderHook(() => useRaceOverview());
    send(of("events")[0], [BUFFALO]);
    send(of("roster", "buffalo")[0], [roster("me")]);
    send(of("races", "buffalo")[0], [race("a", "2026-10-24")]);
    act(() => {
      of("results", "buffalo")[0]?.onError({ code: "permission-denied", message: "x" });
    });
    expect(result.current).toMatchObject({ status: "ready", previous: { detail: "error", results: [] } });
  });

  it("the previous event's results stay 'loading' until roster, schedule and results have all arrived", () => {
    const { result } = renderHook(() => useRaceOverview());
    send(of("events")[0], [BUFFALO]);
    send(of("roster", "buffalo")[0], [roster("me")]);
    send(of("results", "buffalo")[0], [res("a")]);
    expect(result.current).toMatchObject({ previous: { detail: "loading" } });
    send(of("races", "buffalo")[0], [race("a", "2026-10-24")]);
    expect(result.current).toMatchObject({ previous: { detail: "ready" } });
  });

  it("no division is shown when the own roster row is missing or has an empty division", () => {
    const { result } = renderHook(() => useRaceOverview());
    send(of("events")[0], [NEXT]);
    send(of("roster", "nationals")[0], [roster("me", { isSelf: false })]);
    expect(result.current).toMatchObject({ next: { division: null, detail: "ready" } });
    send(of("roster", "nationals")[0], [roster("me", { division: "  " })]);
    expect(result.current).toMatchObject({ next: { division: null } });
  });

  it("when the chosen event changes, the old event's listeners are released and its data is not reused", () => {
    const { result } = renderHook(() => useRaceOverview());
    send(of("events")[0], [BUFFALO]);
    send(of("roster", "buffalo")[0], [roster("me")]);
    send(of("races", "buffalo")[0], [race("a", "2026-10-24")]);
    send(of("results", "buffalo")[0], [res("a")]);
    const oldOnes = h.state.listeners.filter((l) => l.eventId === "buffalo");

    const later = event("worlds", ["2026-10-27"]);
    send(of("events")[0], [BUFFALO, later]);
    expect(oldOnes.every((l) => l.released)).toBe(true);
    expect(of("roster", "worlds")).toHaveLength(1);
    // Nothing of Buffalo's carries over to the new event.
    expect(result.current).toMatchObject({ previous: { pick: { event: { eventId: "worlds" } }, detail: "loading", results: [] } });
  });
});

describe("useRaceOverview: release", () => {
  it("releases every listener and the clock on unmount", () => {
    const { unmount } = renderHook(() => useRaceOverview());
    send(of("events")[0], [BUFFALO, NEXT]);
    expect(active().length).toBeGreaterThan(1);
    expect(vi.getTimerCount()).toBe(1);

    unmount();
    expect(active()).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("the clock moves the day on: an event that was upcoming becomes the previous one", () => {
    const soon = event("soon", ["2026-10-31"]);
    const { result } = renderHook(() => useRaceOverview());
    send(of("events")[0], [soon]);
    expect(result.current).toMatchObject({ next: { pick: { status: "upcoming", daysUntil: 1 } }, previous: null });

    act(() => {
      vi.setSystemTime(new Date("2026-11-01T16:00:00.000Z"));
      vi.advanceTimersByTime(60_000);
    });
    expect(result.current).toMatchObject({ next: null, previous: { pick: { event: { eventId: "soon" } } } });
  });
});
