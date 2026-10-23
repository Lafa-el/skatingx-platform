// @vitest-environment happy-dom
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { todayDateString } from "@skatingx/schema";

import { act, renderHook, waitFor } from "@/test/dom";

import { FirestoreProvider, useFirestoreStatus } from "./FirestoreProvider";

const h = vi.hoisted(() => {
  const base = () => ({
    auth: { uid: "uid-1" as string | null, loading: false, firebaseReady: true },
    db: {} as object | null,
    bootstrap: (async () => undefined) as () => Promise<unknown>,
    language: undefined as string | undefined,
    deliverSettings: null as null | (() => void),
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
  athleteProfileRef: () => "profile",
  athleteGamificationRef: () => "gamification",
  trainingStateRef: () => "training",
  subscribeToDocument: (ref: string, onData: (data: unknown) => void) => {
    if (ref === "settings") {
      // Settings arrive only when a test asks for them, to change the language afterwards.
      h.state.deliverSettings = () => onData({ language: h.state.language });
    } else {
      onData({});
    }
    return { unsubscribe: () => undefined };
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
