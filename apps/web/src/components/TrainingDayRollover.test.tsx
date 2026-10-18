// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { render, waitFor } from "@/test/dom";
import { denied, watchUnhandledRejections } from "@/test/unhandledRejections";

import { TrainingDayRollover } from "./TrainingDayRollover";

const h = vi.hoisted(() => ({
  uid: "u1" as string | null,
  rollover: vi.fn(),
}));

vi.mock("@skatingx/firebase-client", () => ({
  getFirestoreDb: () => ({}),
  normalizeTrainingState: (state: unknown) => state,
  runDayRolloverIfNeeded: (...args: unknown[]) => h.rollover(...args),
}));
vi.mock("@/app/providers/AuthProvider", () => ({ useAuth: () => ({ uid: h.uid }) }));
vi.mock("@/app/providers/FirestoreProvider", () => ({
  useFirestoreStatus: () => ({ ready: true }),
  useUserSettings: () => ({ data: { activeAthleteId: "a1" } }),
  // An old date: any day after it needs the rollover.
  useTrainingState: () => ({ data: { lastLoginDate: "2020-01-01", todayTasks: [] }, loading: false }),
}));

beforeEach(() => {
  h.uid = "u1";
  h.rollover = vi.fn().mockResolvedValue(undefined);
});

afterEach(() => vi.restoreAllMocks());

describe("TrainingDayRollover", () => {
  it("runs the rollover once for the user, athlete and day", async () => {
    const view = render(<TrainingDayRollover />);
    await waitFor(() => expect(h.rollover).toHaveBeenCalledTimes(1));
    expect(h.rollover.mock.calls[0]?.[0]).toMatchObject({ userId: "u1", athleteId: "a1" });
    view.rerender(<TrainingDayRollover />);
    expect(h.rollover).toHaveBeenCalledTimes(1);
  });

  // It runs in the background, with no click to report to, so a failure used to surface only as
  // "Uncaught (in promise)" with nothing to say which step failed.
  it("a failed rollover is logged with its code and is not an unhandled rejection", async () => {
    const watcher = watchUnhandledRejections();
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    h.rollover = vi.fn().mockRejectedValue(denied());
    render(<TrainingDayRollover />);
    await waitFor(() => expect(h.rollover).toHaveBeenCalledTimes(1));
    expect(await watcher.settled()).toEqual([]);
    watcher.stop();
    expect(log).toHaveBeenCalledExactlyOnceWith("[training-rollover] runDayRolloverIfNeeded failed", {
      code: "permission-denied",
    });
  });

  it("a failed rollover is not remembered as done, so the next change of data tries again", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    h.rollover = vi.fn().mockRejectedValueOnce(denied()).mockResolvedValue(undefined);
    const view = render(<TrainingDayRollover />);
    await waitFor(() => expect(h.rollover).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 25));
    // A new user value forces the effect to run again.
    h.uid = "u1b";
    view.rerender(<TrainingDayRollover />);
    await waitFor(() => expect(h.rollover).toHaveBeenCalledTimes(2));
  });
});
