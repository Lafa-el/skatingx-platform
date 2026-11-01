// @vitest-environment happy-dom
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { todayDateString } from "@skatingx/schema";

import { act, renderHook, waitFor } from "@/test/dom";

import {
  FirestoreProvider,
  useAthleteProfile,
  useFirestoreStatus,
  useGamification,
  useReloadUserSettings,
  useTrainingState,
  useUserSettings,
} from "./FirestoreProvider";

const h = vi.hoisted(() => {
  const base = () => ({
    auth: { uid: "uid-1" as string | null, loading: false, firebaseReady: true },
    db: {} as object | null,
    bootstrap: (async () => undefined) as () => Promise<unknown>,
    language: undefined as string | undefined,
    deliverSettings: null as null | (() => void),
    failSettings: null as null | ((message: string) => void),
    /** The athlete id the next delivered settings carry. Absent: the document has none. */
    activeAthleteId: undefined as string | undefined,
    /** Athlete documents answer at once by default; a test can hold them to watch the loading state. */
    holdAthleteDocs: false,
    subs: [] as { ref: string; closed: boolean }[],
    ensureOpening: vi.fn(async (..._args: unknown[]) => undefined),
  });
  return { base, state: base() };
});

vi.mock("@/app/providers/AuthProvider", () => ({ useAuth: () => h.state.auth }));
vi.mock("@skatingx/firebase-client", () => ({
  getFirestoreDb: () => h.state.db,
  initFirestorePersistence: async () => undefined,
  bootstrapUserDocuments: () => h.state.bootstrap(),
  ensurePointsOpeningBalance: (...args: unknown[]) => h.state.ensureOpening(...args),
  settingsRef: () => "settings",
  athleteProfileRef: (_db: unknown, _uid: string, athleteId: string) => `profile:${athleteId}`,
  athleteGamificationRef: (_db: unknown, _uid: string, athleteId: string) => `gamification:${athleteId}`,
  trainingStateRef: (_db: unknown, _uid: string, athleteId: string) => `training:${athleteId}`,
  subscribeToDocument: (ref: string, onData: (data: unknown) => void, onError?: (message: string) => void) => {
    const sub = { ref, closed: false };
    h.state.subs.push(sub);
    if (ref === "settings") {
      // Settings arrive only when a test asks for them, to change the language or the athlete.
      h.state.deliverSettings = () =>
        onData({
          language: h.state.language,
          ...(h.state.activeAthleteId === undefined ? {} : { activeAthleteId: h.state.activeAthleteId }),
        });
      h.state.failSettings = (message) => onError?.(message);
    } else if (!h.state.holdAthleteDocs) {
      onData({});
    }
    return {
      unsubscribe: () => {
        sub.closed = true;
      },
    };
  },
}));

afterEach(() => {
  h.state = h.base();
});

const wrapper = ({ children }: { children: ReactNode }) => <FirestoreProvider>{children}</FirestoreProvider>;
const status = () => renderHook(() => useFirestoreStatus(), { wrapper });

describe("useFirestoreStatus: why the data service did not start", () => {
  it("Firebase not set up: says so in Chinese by default", async () => {
    h.state.auth = { uid: null, loading: false, firebaseReady: false };
    const { result } = status();
    await waitFor(() => expect(result.current.bootstrapError).toBe("Firebase 尚未配置。"));
    expect(result.current.connectivityError).toBe("Firebase 尚未配置。");
    expect(result.current.ready).toBe(false);
  });

  it("data service not available: says so in Chinese by default", async () => {
    h.state.db = null;
    const { result } = status();
    await waitFor(() => expect(result.current.bootstrapError).toBe("数据服务不可用。"));
  });

  it("a failure that is not an Error is reported as the documents failing to initialize", async () => {
    h.state.bootstrap = async () => {
      throw "boom";
    };
    const { result } = status();
    await waitFor(() => expect(result.current.bootstrapError).toBe("初始化数据失败。"));
    expect(result.current.ready).toBe(false);
  });

  it("a message from the data layer is shown as it arrived", async () => {
    h.state.bootstrap = async () => {
      throw new Error("permission-denied");
    };
    const { result } = status();
    await waitFor(() => expect(result.current.bootstrapError).toBe("permission-denied"));
  });

  it("is not an error while everything works", async () => {
    const { result } = status();
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.bootstrapError).toBeNull();
    expect(result.current.connectivityError).toBeNull();
    // The opening-balance read follows the athlete, which is known once settings have answered.
    await act(async () => {
      h.state.deliverSettings!();
    });
    await waitFor(() =>
      expect(h.state.ensureOpening).toHaveBeenCalledWith(h.state.db, "uid-1", "lindsay", todayDateString()),
    );
  });

  it("not signed in yet but Firebase is set up: nothing to report", async () => {
    h.state.auth = { uid: null, loading: false, firebaseReady: true };
    const { result } = status();
    await waitFor(() => expect(result.current.ready).toBe(false));
    expect(result.current.bootstrapError).toBeNull();
  });
});

describe("useFirestoreStatus: the language", () => {
  it("follows the language of the settings, also when it changes while the message is shown", async () => {
    // Settings are known first; then the data service goes away (a new sign-in finds no database).
    // The settings slice is not cleared on that path, so the language is still known.
    h.state.language = "en";
    const { result, rerender } = status();
    await waitFor(() => expect(result.current.ready).toBe(true));
    await act(async () => {
      h.state.deliverSettings!();
    });

    h.state.db = null;
    h.state.auth = { uid: "uid-2", loading: false, firebaseReady: true };
    rerender();
    await waitFor(() => expect(result.current.bootstrapError).toBe("Firestore is not available."));

    h.state.language = "zh";
    await act(async () => {
      h.state.deliverSettings!();
    });
    expect(result.current.bootstrapError).toBe("数据服务不可用。");
  });

  it("is Chinese while the language is not known yet, the app default", async () => {
    h.state.db = null;
    const { result } = status();
    await waitFor(() => expect(result.current.bootstrapError).toBe("数据服务不可用。"));
  });
});

describe("the athlete documents follow the active athlete", () => {
  const all = () =>
    renderHook(
      () => ({
        status: useFirestoreStatus(),
        settings: useUserSettings(),
        profile: useAthleteProfile(),
        gamification: useGamification(),
        training: useTrainingState(),
        reload: useReloadUserSettings(),
      }),
      { wrapper },
    );
  const open = () =>
    h.state.subs
      .filter((sub) => !sub.closed && sub.ref !== "settings")
      .map((sub) => sub.ref)
      .sort();
  const deliver = () =>
    act(async () => {
      h.state.deliverSettings!();
    });

  it("settings name another athlete: all three documents and the opening balance use that athlete", async () => {
    h.state.activeAthleteId = "athlete-9";
    const { result } = all();
    await waitFor(() => expect(result.current.status.ready).toBe(true));
    await deliver();
    await waitFor(() => expect(open()).toEqual(["gamification:athlete-9", "profile:athlete-9", "training:athlete-9"]));
    expect(h.state.ensureOpening).toHaveBeenCalledTimes(1);
    expect(h.state.ensureOpening).toHaveBeenCalledWith(h.state.db, "uid-1", "athlete-9", todayDateString());
  });

  it("settings without an athlete id: the default athlete", async () => {
    const { result } = all();
    await waitFor(() => expect(result.current.status.ready).toBe(true));
    await deliver();
    await waitFor(() => expect(open()).toEqual(["gamification:lindsay", "profile:lindsay", "training:lindsay"]));
    expect(h.state.ensureOpening).toHaveBeenCalledWith(h.state.db, "uid-1", "lindsay", todayDateString());
  });

  it("settings that fail to load: the default athlete", async () => {
    const { result } = all();
    await waitFor(() => expect(result.current.status.ready).toBe(true));
    await act(async () => {
      h.state.failSettings!("permission-denied");
    });
    await waitFor(() => expect(open()).toEqual(["gamification:lindsay", "profile:lindsay", "training:lindsay"]));
    expect(result.current.settings.error).toBe("permission-denied");
    expect(h.state.ensureOpening).toHaveBeenCalledWith(h.state.db, "uid-1", "lindsay", todayDateString());
  });

  it("settings still loading: no athlete document is read and the slices stay loading", async () => {
    const { result } = all();
    await waitFor(() => expect(result.current.status.ready).toBe(true));
    expect(open()).toEqual([]);
    expect(h.state.ensureOpening).not.toHaveBeenCalled();
    expect(result.current.profile.loading).toBe(true);
    expect(result.current.gamification.loading).toBe(true);
    expect(result.current.training.loading).toBe(true);
  });

  it("the athlete changes: the old reads stop, the slices go back to loading, the new reads start", async () => {
    h.state.activeAthleteId = "lindsay";
    const { result } = all();
    await waitFor(() => expect(result.current.status.ready).toBe(true));
    await deliver();
    await waitFor(() => expect(result.current.profile.loading).toBe(false));
    const first = [...h.state.subs];

    h.state.holdAthleteDocs = true;
    h.state.activeAthleteId = "athlete-9";
    // A settings snapshot with a new id, the way a settings write reaches the page.
    await deliver();
    await waitFor(() => expect(open()).toEqual(["gamification:athlete-9", "profile:athlete-9", "training:athlete-9"]));
    expect(first.filter((sub) => sub.ref !== "settings").every((sub) => sub.closed)).toBe(true);
    expect(result.current.profile).toEqual({ data: null, loading: true, error: null });
    expect(result.current.gamification).toEqual({ data: null, loading: true, error: null });
    expect(result.current.training).toEqual({ data: null, loading: true, error: null });
    expect(h.state.ensureOpening).toHaveBeenLastCalledWith(h.state.db, "uid-1", "athlete-9", todayDateString());
  });

  it("settings reload with the same athlete: the slices keep their data, the reads are renewed", async () => {
    h.state.activeAthleteId = "athlete-9";
    const { result } = all();
    await waitFor(() => expect(result.current.status.ready).toBe(true));
    await deliver();
    await waitFor(() => expect(result.current.profile.loading).toBe(false));

    h.state.holdAthleteDocs = true;
    await act(async () => {
      result.current.reload();
    });
    // While settings reload, nothing is read and nothing blanks.
    expect(result.current.settings.loading).toBe(true);
    expect(open()).toEqual([]);
    expect(result.current.profile).toEqual({ data: {}, loading: false, error: null });

    await deliver();
    await waitFor(() => expect(open()).toEqual(["gamification:athlete-9", "profile:athlete-9", "training:athlete-9"]));
    expect(result.current.profile).toEqual({ data: {}, loading: false, error: null });
    expect(result.current.gamification.loading).toBe(false);
    expect(result.current.training.loading).toBe(false);
  });
});
