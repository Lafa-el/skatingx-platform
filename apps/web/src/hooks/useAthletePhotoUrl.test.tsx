// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";

import { renderHook, waitFor } from "@/test/dom";

import { useAthletePhotoUrl } from "./useAthletePhotoUrl";

const h = vi.hoisted(() => ({
  storage: {} as object | null,
  url: vi.fn(async () => "https://example.test/avatar.png"),
}));

vi.mock("@skatingx/firebase-client", () => ({
  getFirebaseStorage: () => h.storage,
}));
vi.mock("firebase/storage", () => ({
  ref: () => ({ path: "avatars/u/a/avatar" }),
  getDownloadURL: () => h.url(),
}));

describe("useAthletePhotoUrl", () => {
  it("returns the download URL, and a failed read stays empty", async () => {
    h.storage = {};
    h.url.mockResolvedValueOnce("https://example.test/avatar.png");
    const ready = renderHook(() => useAthletePhotoUrl("avatars/u/a/avatar"));
    await waitFor(() => expect(ready.result.current).toBe("https://example.test/avatar.png"));

    h.url.mockRejectedValueOnce(new Error("denied"));
    const failed = renderHook(() => useAthletePhotoUrl("avatars/u/a/other"));
    await waitFor(() => expect(failed.result.current).toBeNull());

    const missing = renderHook(() => useAthletePhotoUrl(null));
    expect(missing.result.current).toBeNull();
  });
});
