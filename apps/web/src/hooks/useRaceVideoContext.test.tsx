// @vitest-environment happy-dom
import type { RaceEntry, RaceEvent, RaceVideoRef } from "@skatingx/schema";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { act, renderHook } from "@/test/dom";

import { useRaceVideoContext } from "./useRaceVideoContext";

type Listener = {
  kind: "events" | "races" | "videos";
  eventId: string | null;
  onData: (list: { items: unknown[]; invalid: unknown[] }) => void;
  onError: (error: { code: string; message: string }) => void;
  released: boolean;
};

const h = vi.hoisted(() => ({
  state: { uid: "uid-1" as string | null, db: {} as object | null, listeners: [] as Listener[] },
}));

vi.mock("@/app/providers/AuthProvider", () => ({ useAuth: () => ({ uid: h.state.uid }) }));
// Only the three readers exist on this mock. A write call would be `undefined(...)` and fail the test.
vi.mock("@skatingx/firebase-client", () => {
  const make =
    (kind: Listener["kind"]) =>
    (_ctx: unknown, ...rest: unknown[]) => {
      const eventId = kind === "events" ? null : (rest[0] as string);
      const [onData, onError] = (kind === "events" ? rest : rest.slice(1)) as [Listener["onData"], Listener["onError"]];
      const listener: Listener = { kind, eventId, onData, onError, released: false };
      h.state.listeners.push(listener);
      return () => {
        listener.released = true;
      };
    };
  return {
    getFirestoreDb: () => h.state.db,
    subscribeToRaceEvents: make("events"),
    subscribeToRaces: make("races"),
    subscribeToRaceVideos: make("videos"),
  };
});

const prov = { verification: "verified" as const, source: "manual" as const, sourceNote: "", verifiedAt: null, schemaVersion: 1 as const };
const audit = { schemaVersion: 1 as const, createdAt: "2026-10-24T10:00:00.000Z", updatedAt: "2026-10-24T10:00:00.000Z" };
const event = (over: Partial<RaceEvent> = {}): RaceEvent =>
  ({ eventId: "buffalo-1", name: "Buffalo Championships", dates: ["2026-10-24"], timeZone: null, venue: null, ...prov, ...over }) as RaceEvent;
const race = (over: Partial<RaceEntry> = {}): RaceEntry =>
  ({ raceId: "r1", distanceId: "500m", label: "500m", sortOrder: 1, day: null, round: null, heat: null, scheduledAt: null, rosterIds: [], ...prov, ...over }) as RaceEntry;
const video = (over: Partial<RaceVideoRef> = {}): RaceVideoRef => ({
  videoId: "v1",
  raceId: "r1",
  rosterId: "ann",
  label: "Final A",
  externalUrl: "https://drive.example.com/x",
  storedWhere: "Camera roll",
  note: "private note",
  ...audit,
  ...over,
});

const LINK = { eventId: "buffalo-1", videoId: "v1" };
const active = () => h.state.listeners.filter((l) => !l.released);
const by = (kind: Listener["kind"]) => h.state.listeners.filter((l) => l.kind === kind);

function deliver(kind: Listener["kind"], items: unknown[]) {
  act(() => {
    for (const l of by(kind)) l.onData({ items, invalid: [] });
  });
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
  h.state.uid = "uid-1";
  h.state.db = {};
  h.state.listeners = [];
});

describe("useRaceVideoContext", () => {
  it("mounts at most three listeners, for this event only, and releases them on unmount", () => {
    const { unmount } = renderHook(() => useRaceVideoContext(LINK));
    expect(active()).toHaveLength(3);
    expect(by("events")).toHaveLength(1);
    expect(by("races")[0]?.eventId).toBe("buffalo-1");
    expect(by("videos")[0]?.eventId).toBe("buffalo-1");
    unmount();
    expect(active()).toHaveLength(0);
  });

  it("is null until all three lists have arrived, then returns plain values", () => {
    const { result } = renderHook(() => useRaceVideoContext(LINK));
    expect(result.current).toBeNull();
    deliver("events", [event()]);
    deliver("races", [race()]);
    expect(result.current).toBeNull();
    deliver("videos", [video()]);
    expect(result.current).toEqual({
      eventName: "Buffalo Championships",
      eventPending: false,
      raceLabel: "500m",
      racePending: false,
      videoLabel: "Final A",
      storedWhere: "Camera roll",
      externalUrl: "https://drive.example.com/x",
    });
  });

  it("does not expose the video note, roster id or any audit field", () => {
    const { result } = renderHook(() => useRaceVideoContext(LINK));
    deliver("events", [event()]);
    deliver("races", [race()]);
    deliver("videos", [video()]);
    const json = JSON.stringify(result.current);
    expect(json).not.toContain("private note");
    expect(json).not.toContain("ann");
    expect(json).not.toContain("createdAt");
  });

  it("marks anything that is not exactly verified as pending", () => {
    const { result } = renderHook(() => useRaceVideoContext(LINK));
    deliver("events", [event({ verification: "pending" })]);
    deliver("races", [race({ verification: "pending" })]);
    deliver("videos", [video()]);
    expect(result.current?.eventPending).toBe(true);
    expect(result.current?.racePending).toBe(true);
  });

  it.each([
    ["the event is missing", () => deliver("events", [event({ eventId: "other" })])],
    ["the video is missing", () => deliver("videos", [video({ videoId: "other" })])],
    ["the race the video points at is missing", () => deliver("races", [race({ raceId: "other" })])],
  ])("is null when %s", (_name, breakOne) => {
    const { result } = renderHook(() => useRaceVideoContext(LINK));
    deliver("events", [event()]);
    deliver("races", [race()]);
    deliver("videos", [video()]);
    expect(result.current).not.toBeNull();
    breakOne();
    expect(result.current).toBeNull();
  });

  it.each(["events", "races", "videos"] as const)("a failed %s read gives null and logs only the code", (kind) => {
    const { result } = renderHook(() => useRaceVideoContext(LINK));
    deliver("events", [event()]);
    deliver("races", [race()]);
    deliver("videos", [video()]);
    act(() => {
      by(kind)[0]?.onError({ code: "permission-denied", message: "users/uid-1/raceDay/buffalo-1 secret path" });
    });
    expect(result.current).toBeNull();
    const logged = JSON.stringify(vi.mocked(console.error).mock.calls);
    expect(logged).toContain("permission-denied");
    expect(logged).not.toContain("secret path");
    expect(logged).not.toContain("Final A");
  });

  it("subscribes to nothing when signed out or the database is not ready", () => {
    h.state.uid = null;
    renderHook(() => useRaceVideoContext(LINK));
    expect(h.state.listeners).toHaveLength(0);
    h.state.uid = "uid-1";
    h.state.db = null;
    renderHook(() => useRaceVideoContext(LINK));
    expect(h.state.listeners).toHaveLength(0);
  });

  it("re-subscribes for another event and never shows the previous event's record", () => {
    const { result, rerender } = renderHook(({ link }) => useRaceVideoContext(link), { initialProps: { link: LINK } });
    deliver("events", [event(), event({ eventId: "other", name: "Other" })]);
    deliver("races", [race()]);
    deliver("videos", [video()]);
    expect(result.current?.eventName).toBe("Buffalo Championships");
    rerender({ link: { eventId: "other", videoId: "v1" } });
    expect(result.current).toBeNull();
    expect(active()).toHaveLength(3);
    expect(by("races").filter((l) => !l.released)[0]?.eventId).toBe("other");
  });
});
