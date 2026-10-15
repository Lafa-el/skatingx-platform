// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";

import { act, renderHook } from "@/test/dom";

import { useLanguageSetting } from "./useLanguageSetting";

const h = vi.hoisted(() => ({
  uid: "u1" as string | null,
  settings: { language: "zh" } as { language?: string } | null,
  loading: false,
  db: {} as unknown,
  update: vi.fn(),
}));

vi.mock("@/app/providers/AuthProvider", () => ({ useAuth: () => ({ uid: h.uid }) }));
vi.mock("@/app/providers/FirestoreProvider", () => ({
  useUserSettings: () => ({ data: h.settings, loading: h.loading, error: null }),
}));
vi.mock("@skatingx/firebase-client", () => ({
  getFirestoreDb: () => h.db,
  updateUserSettings: (...args: unknown[]) => h.update(...args),
}));

beforeEach(() => {
  h.uid = "u1";
  h.settings = { language: "zh" };
  h.loading = false;
  h.db = {};
  h.update = vi.fn().mockResolvedValue(undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("useLanguageSetting", () => {
  it("reads the saved language, defaulting to Chinese for anything but 'en'", () => {
    h.settings = { language: "en" };
    expect(renderHook(() => useLanguageSetting()).result.current.language).toBe("en");
    h.settings = { language: "fr" };
    expect(renderHook(() => useLanguageSetting()).result.current.language).toBe("zh");
    h.settings = null;
    expect(renderHook(() => useLanguageSetting()).result.current.language).toBe("zh");
  });

  it("saves the new language through updateUserSettings for the signed-in user", () => {
    const { result } = renderHook(() => useLanguageSetting());
    act(() => {
      result.current.setLanguage("en");
    });
    expect(h.update).toHaveBeenCalledExactlyOnceWith(h.db, "u1", { language: "en" });
    expect(result.current.failed).toBe(false);
  });

  it("does not write when the language is unchanged", () => {
    const { result } = renderHook(() => useLanguageSetting());
    act(() => {
      result.current.setLanguage("zh");
    });
    expect(h.update).not.toHaveBeenCalled();
  });

  it("does not wait for the server: it returns before the write settles", () => {
    h.update = vi.fn().mockReturnValue(new Promise(() => undefined));
    const { result } = renderHook(() => useLanguageSetting());
    act(() => {
      result.current.setLanguage("en");
    });
    expect(h.update).toHaveBeenCalledTimes(1);
    expect(result.current.failed).toBe(false);
  });

  it("flags a failed save, logs only the error code, and clears the flag on the next try", async () => {
    h.update = vi
      .fn()
      .mockRejectedValueOnce(
        Object.assign(new Error("users/u1/settings/main denied"), { code: "permission-denied" }),
      )
      .mockResolvedValue(undefined);
    const { result } = renderHook(() => useLanguageSetting());
    await act(async () => {
      result.current.setLanguage("en");
    });
    expect(result.current.failed).toBe(true);
    const args = vi.mocked(console.error).mock.calls.flat();
    // An Error object would print its message (which can hold a document path), so none may be logged.
    expect(args.some((a) => a instanceof Error)).toBe(false);
    expect(JSON.stringify(args)).toContain("permission-denied");
    expect(JSON.stringify(args)).not.toContain("users/u1");

    await act(async () => {
      result.current.setLanguage("en");
    });
    expect(result.current.failed).toBe(false);
  });

  it("reports failure instead of throwing when Firestore is not configured", () => {
    h.db = null;
    const { result } = renderHook(() => useLanguageSetting());
    act(() => {
      result.current.setLanguage("en");
    });
    expect(h.update).not.toHaveBeenCalled();
    expect(result.current.failed).toBe(true);
  });

  it("is disabled, and writes nothing, with no user or while settings load", () => {
    h.uid = null;
    const noUser = renderHook(() => useLanguageSetting());
    expect(noUser.result.current.disabled).toBe(true);
    act(() => {
      noUser.result.current.setLanguage("en");
    });
    expect(h.update).not.toHaveBeenCalled();

    h.uid = "u1";
    h.loading = true;
    expect(renderHook(() => useLanguageSetting()).result.current.disabled).toBe(true);
  });
});
