// @vitest-environment happy-dom
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  ctx: null as { db: object; userId: string } | null,
  athleteId: "lindsay",
  start: vi.fn(),
  stop: vi.fn(),
  log: vi.fn(),
}));

vi.mock("@skatingx/firebase-client", () => ({ startRaceRecordSync: h.start }));
vi.mock("@/app/providers/FirestoreProvider", () => ({ useActiveAthlete: () => ({ athleteId: h.athleteId }) }));
vi.mock("./useRaceDayData", () => ({ useRaceDayContext: () => h.ctx }));
vi.mock("../lib/errors", () => ({ logRaceDayError: h.log }));

import { useRaceRecordSync } from "./useRaceRecordSync";

beforeEach(() => {
  h.ctx = { db: {}, userId: "u1" };
  h.athleteId = "lindsay";
  h.start.mockReset();
  h.stop.mockReset();
  h.log.mockReset();
  h.start.mockReturnValue(h.stop);
});

describe("useRaceRecordSync", () => {
  it("starts for the signed-in user and the active athlete, and releases everything on unmount", () => {
    const view = renderHook(() => useRaceRecordSync());
    expect(h.start).toHaveBeenCalledTimes(1);
    expect(h.start.mock.calls[0]![0]).toMatchObject({ userId: "u1", athleteId: "lindsay" });
    expect(h.stop).not.toHaveBeenCalled();
    view.unmount();
    expect(h.stop).toHaveBeenCalledTimes(1);
  });

  it("does not start before Firestore is ready", () => {
    h.ctx = null;
    renderHook(() => useRaceRecordSync());
    expect(h.start).not.toHaveBeenCalled();
  });

  it("restarts for another athlete and stops the old run", () => {
    const view = renderHook(() => useRaceRecordSync());
    h.athleteId = "mia";
    view.rerender();
    expect(h.stop).toHaveBeenCalledTimes(1);
    expect(h.start).toHaveBeenCalledTimes(2);
    expect(h.start.mock.calls[1]![0]).toMatchObject({ athleteId: "mia" });
  });

  it("logs a sync failure with its operation and never throws into the page", () => {
    renderHook(() => useRaceRecordSync());
    const handlers = h.start.mock.calls[0]![1] as { onError: (op: string, error: unknown) => void };
    const error = Object.assign(new Error("boom"), { code: "unavailable" });
    expect(() => handlers.onError("reconcile", error)).not.toThrow();
    expect(h.log).toHaveBeenCalledWith("recordSync:reconcile", error);
  });
});
