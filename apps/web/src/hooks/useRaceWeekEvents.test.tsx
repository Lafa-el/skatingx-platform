// @vitest-environment happy-dom
import type { RaceEvent } from "@skatingx/schema";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { act, renderHook, waitFor } from "@/test/dom";

import { useRaceWeekEvents } from "./useRaceWeekEvents";

type Listener = {
  onData: (list: { items: unknown[]; invalid: unknown[] }) => void;
  onError: (error: { code: string; message: string }) => void;
  released: boolean;
};

const h = vi.hoisted(() => ({
  state: {
    uid: "uid-1" as string | null,
    db: {} as object | null,
    listeners: [] as Listener[],
  },
}));

vi.mock("@/app/providers/AuthProvider", () => ({ useAuth: () => ({ uid: h.state.uid }) }));
vi.mock("@skatingx/firebase-client", () => ({ getFirestoreDb: () => h.state.db }));
// The only read the hook may reach. Anything else on the client is missing here, so a write would throw.
vi.mock("@/hooks/raceWeekSubscribe", () => ({
  subscribeRaceWeekEvents: (_ctx: unknown, onData: Listener["onData"], onError: Listener["onError"]) => {
    const listener: Listener = { onData, onError, released: false };
    h.state.listeners.push(listener);
    return () => {
      listener.released = true;
    };
  },
}));

beforeEach(() => {
  vi.stubEnv("VITE_FEATURE_RACE_DAY", "true");
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  h.state.uid = "uid-1";
  h.state.db = {};
  h.state.listeners = [];
});

const event = (eventId: string): RaceEvent =>
  ({
    eventId,
    name: eventId,
    dates: ["2026-10-31"],
    timeZone: null,
    venue: null,
    verification: "pending",
    source: "manual",
    sourceNote: "",
    verifiedAt: null,
    schemaVersion: 1,
  }) as RaceEvent;

const active = () => h.state.listeners.filter((listener) => !listener.released);
const waitForListener = () => waitFor(() => expect(h.state.listeners.length).toBeGreaterThan(0));

describe("useRaceWeekEvents", () => {
  it("is off with the flag off: nothing is subscribed", async () => {
    vi.stubEnv("VITE_FEATURE_RACE_DAY", "");
    const { result } = renderHook(() => useRaceWeekEvents());
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current).toEqual({ status: "off" });
    expect(h.state.listeners).toHaveLength(0);
  });

  it("is loading until the list arrives, with exactly one listener", async () => {
    const { result } = renderHook(() => useRaceWeekEvents());
    expect(result.current).toEqual({ status: "loading" });
    await waitForListener();
    expect(active()).toHaveLength(1);
    expect(result.current).toEqual({ status: "loading" });
  });

  it("delivers the events", async () => {
    const { result } = renderHook(() => useRaceWeekEvents());
    await waitForListener();
    act(() => {
      h.state.listeners[0]?.onData({ items: [event("a"), event("b")], invalid: [] });
    });
    expect(result.current).toMatchObject({ status: "ready" });
    expect(result.current.status === "ready" && result.current.events.map((e) => e.eventId)).toEqual(["a", "b"]);
  });

  it("an empty list is ready and empty, which is different from a failed read", async () => {
    const { result } = renderHook(() => useRaceWeekEvents());
    await waitForListener();
    act(() => {
      h.state.listeners[0]?.onData({ items: [], invalid: [] });
    });
    expect(result.current).toEqual({ status: "ready", events: [] });
  });

  it("a failed read is an error, never an empty list, and only the code is logged", async () => {
    const { result } = renderHook(() => useRaceWeekEvents());
    await waitForListener();
    act(() => {
      h.state.listeners[0]?.onError({ code: "permission-denied", message: "users/uid-1/raceDay/secret-path" });
    });
    expect(result.current).toEqual({ status: "error" });
    expect(console.error).toHaveBeenCalledWith("[training-plan] read-race-events failed", {
      code: "permission-denied",
    });
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("secret-path");
  });

  it("releases the listener when the page unmounts", async () => {
    const view = renderHook(() => useRaceWeekEvents());
    await waitForListener();
    expect(active()).toHaveLength(1);
    view.unmount();
    expect(active()).toHaveLength(0);
  });

  it("does not subscribe at all when the page unmounts before the reader has loaded", async () => {
    const view = renderHook(() => useRaceWeekEvents());
    view.unmount();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(h.state.listeners).toHaveLength(0);
  });

  it("stays loading and subscribes to nothing without a user or a database", async () => {
    h.state.uid = null;
    const noUser = renderHook(() => useRaceWeekEvents());
    expect(noUser.result.current).toEqual({ status: "loading" });
    noUser.unmount();

    h.state.uid = "uid-1";
    h.state.db = null;
    const noDb = renderHook(() => useRaceWeekEvents());
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(noDb.result.current).toEqual({ status: "loading" });
    expect(h.state.listeners).toHaveLength(0);
  });

  it("never shows one user's events for another user", async () => {
    const view = renderHook(() => useRaceWeekEvents());
    await waitForListener();
    act(() => {
      h.state.listeners[0]?.onData({ items: [event("mine")], invalid: [] });
    });
    expect(view.result.current.status).toBe("ready");

    h.state.uid = "uid-2";
    view.rerender();
    expect(view.result.current).toEqual({ status: "loading" });
    expect(h.state.listeners[0]?.released).toBe(true);
    await waitFor(() => expect(h.state.listeners).toHaveLength(2));
    expect(active()).toHaveLength(1);
  });
});
