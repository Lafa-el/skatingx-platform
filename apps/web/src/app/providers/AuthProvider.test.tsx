// @vitest-environment happy-dom
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { act, renderHook, waitFor } from "@/test/dom";

import { AuthProvider, useAuth } from "./AuthProvider";

const sdkError = (code: string, message = `Firebase: Error (${code}).`) =>
  Object.assign(new Error(message), { code });

const h = vi.hoisted(() => {
  const base = () => ({
    auth: {} as object | null,
    listener: null as null | ((user: unknown) => void | Promise<void>),
  });
  return {
    base,
    state: base(),
    signInAnonymouslyIfNeeded: vi.fn(async (_auth: unknown) => ({ uid: "guest" })),
    signInWithEmailPassword: vi.fn(async (..._args: unknown[]) => ({ uid: "u1", email: "a@b.c" })),
    linkAnonymousWithEmailPassword: vi.fn(async (..._args: unknown[]) => ({ uid: "u1", email: "a@b.c" })),
    signOutUser: vi.fn(async (_auth: unknown) => undefined),
  };
});

vi.mock("@skatingx/firebase-client", () => ({
  initFirebase: () => undefined,
  getFirebaseAuth: () => h.state.auth,
  subscribeToAuthState: (_auth: unknown, listener: (user: unknown) => void) => {
    h.state.listener = listener;
    return () => undefined;
  },
  isAnonymousUser: (user: { email?: string } | null) => !user?.email,
  userNeedsAuthRefresh: () => false,
  refreshAuthUser: vi.fn(),
  signInAnonymouslyIfNeeded: h.signInAnonymouslyIfNeeded,
  signInWithEmailPassword: h.signInWithEmailPassword,
  linkAnonymousWithEmailPassword: h.linkAnonymousWithEmailPassword,
  signOutUser: h.signOutUser,
}));

const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);

beforeEach(() => {
  h.state = h.base();
});

afterEach(() => {
  logged.mockClear();
  h.signInAnonymouslyIfNeeded.mockReset().mockImplementation(async () => ({ uid: "guest" }));
  h.signInWithEmailPassword.mockReset().mockImplementation(async () => ({ uid: "u1", email: "a@b.c" }));
  h.linkAnonymousWithEmailPassword.mockReset().mockImplementation(async () => ({ uid: "u1", email: "a@b.c" }));
  h.signOutUser.mockReset().mockImplementation(async () => undefined);
});

const wrapper = ({ children }: { children: ReactNode }) => <AuthProvider>{children}</AuthProvider>;
const mount = () => renderHook(() => useAuth(), { wrapper });

describe("AuthProvider: Firebase is not set up", () => {
  it("says so with the setup hint and is not ready", async () => {
    h.state.auth = null;
    const { result } = mount();
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.firebaseReady).toBe(false);
    expect(result.current.authError).toEqual({ key: "auth.error.notConfiguredSetup" });
  });

  it("signing in or linking without Firebase sets the short message and does not throw", async () => {
    h.state.auth = null;
    const { result } = mount();
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.clearAuthError());

    await act(async () => {
      await result.current.signInEmailPassword("a@b.c", "secret1");
    });
    expect(result.current.authError).toEqual({ key: "auth.error.notConfigured" });

    act(() => result.current.clearAuthError());
    await act(async () => {
      await result.current.linkEmailPassword("a@b.c", "secret1");
    });
    expect(result.current.authError).toEqual({ key: "auth.error.notConfigured" });
  });
});

describe("AuthProvider: errors are kept as what happened", () => {
  it("a failed anonymous sign-in on load is reported by its code and ends the loading", async () => {
    const { result } = mount();
    await waitFor(() => expect(h.state.listener).not.toBeNull());
    h.signInAnonymouslyIfNeeded.mockRejectedValue(sdkError("auth/network-request-failed"));
    await act(async () => {
      await h.state.listener!(null);
    });
    expect(result.current.authError).toEqual({ key: "auth.error.network" });
    expect(result.current.loading).toBe(false);
    expect(logged).toHaveBeenCalledWith("[auth] anonymous sign-in failed", {
      code: "auth/network-request-failed",
    });
  });

  it("a failed sign-in throws to the page and keeps the error", async () => {
    const { result } = mount();
    h.signInWithEmailPassword.mockRejectedValue(sdkError("auth/wrong-password"));
    await act(async () => {
      await expect(result.current.signInEmailPassword("a@b.c", "bad")).rejects.toThrow();
    });
    expect(result.current.authError).toEqual({ key: "auth.error.wrongCredential" });
  });

  it("a failed link throws to the page and keeps the error", async () => {
    const { result } = mount();
    h.linkAnonymousWithEmailPassword.mockRejectedValue(sdkError("auth/email-already-in-use"));
    await act(async () => {
      await expect(result.current.linkEmailPassword("a@b.c", "secret1")).rejects.toThrow();
    });
    expect(result.current.authError).toEqual({ key: "auth.error.emailInUse" });
  });

  it("a failed sign-out keeps the error and ends the loading", async () => {
    const { result } = mount();
    h.signOutUser.mockRejectedValue(sdkError("auth/network-request-failed"));
    await act(async () => {
      await result.current.logout();
    });
    expect(result.current.authError).toEqual({ key: "auth.error.network" });
    expect(result.current.loading).toBe(false);
    expect(logged).toHaveBeenCalledExactlyOnceWith("[auth] sign-out failed", {
      code: "auth/network-request-failed",
    });
  });

  it("an error without a known code keeps its own message; one that is not an Error gets the general text", async () => {
    const { result } = mount();
    h.signInWithEmailPassword.mockRejectedValueOnce(new Error("No signed-in user to refresh."));
    await act(async () => {
      await expect(result.current.signInEmailPassword("a@b.c", "x")).rejects.toThrow();
    });
    expect(result.current.authError).toEqual({ received: "No signed-in user to refresh." });

    h.signInWithEmailPassword.mockRejectedValueOnce("boom");
    await act(async () => {
      await expect(result.current.signInEmailPassword("a@b.c", "x")).rejects.toBe("boom");
    });
    expect(result.current.authError).toEqual({ key: "auth.error.failed" });
  });

  it("clearing removes the error, and a new attempt starts without it", async () => {
    const { result } = mount();
    h.signInWithEmailPassword.mockRejectedValueOnce(sdkError("auth/wrong-password"));
    await act(async () => {
      await expect(result.current.signInEmailPassword("a@b.c", "bad")).rejects.toThrow();
    });
    act(() => result.current.clearAuthError());
    expect(result.current.authError).toBeNull();

    h.signInWithEmailPassword.mockRejectedValueOnce(sdkError("auth/wrong-password"));
    await act(async () => {
      await expect(result.current.signInEmailPassword("a@b.c", "bad")).rejects.toThrow();
    });
    await act(async () => {
      await result.current.signInEmailPassword("a@b.c", "good");
    });
    expect(result.current.authError).toBeNull();
  });
});

describe("AuthProvider: what is written to the log", () => {
  it("is the operation and the error code, never the email, the password or the message", async () => {
    const { result } = mount();
    h.signInWithEmailPassword.mockRejectedValue(
      sdkError("auth/wrong-password", "Firebase: secret-person@example.com"),
    );
    await act(async () => {
      await expect(result.current.signInEmailPassword("secret-person@example.com", "hunter2")).rejects.toThrow();
    });
    expect(logged).toHaveBeenCalledExactlyOnceWith("[auth] sign-in failed", { code: "auth/wrong-password" });
    const everything = JSON.stringify(logged.mock.calls);
    expect(everything).not.toContain("secret-person");
    expect(everything).not.toContain("hunter2");
  });

  it("logs a missing code as null", async () => {
    const { result } = mount();
    h.linkAnonymousWithEmailPassword.mockRejectedValue(new Error("plain"));
    await act(async () => {
      await expect(result.current.linkEmailPassword("a@b.c", "secret1")).rejects.toThrow();
    });
    expect(logged).toHaveBeenCalledExactlyOnceWith("[auth] account link failed", { code: null });
  });
});

describe("AuthProvider: working", () => {
  it("signs in with the email trimmed and keeps the user", async () => {
    const { result } = mount();
    await act(async () => {
      await result.current.signInEmailPassword("  a@b.c  ", "good");
    });
    expect(h.signInWithEmailPassword).toHaveBeenCalledExactlyOnceWith(h.state.auth, "a@b.c", "good");
    expect(result.current.uid).toBe("u1");
    expect(result.current.authError).toBeNull();
    expect(logged).not.toHaveBeenCalled();
  });
});
