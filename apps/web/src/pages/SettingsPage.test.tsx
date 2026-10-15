// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";

import { render, screen, userEvent } from "@/test/dom";

import { SettingsPage } from "./SettingsPage";

const h = vi.hoisted(() => ({
  settings: { language: "zh", isPro: false, parentPinEnabled: false } as Record<string, unknown>,
  update: vi.fn(),
}));

vi.mock("@/app/providers/AuthProvider", () => ({
  useAuth: () => ({
    user: null,
    uid: "u1",
    isAnonymous: true,
    loading: false,
    authError: null,
    firebaseReady: true,
    clearAuthError: vi.fn(),
    linkEmailPassword: vi.fn(),
    signInEmailPassword: vi.fn(),
    logout: vi.fn(),
  }),
}));
vi.mock("@/app/providers/FirestoreProvider", () => ({
  useUserSettings: () => ({ data: h.settings, loading: false, error: null }),
}));
vi.mock("@skatingx/firebase-client", () => ({
  getFirestoreDb: () => ({}),
  updateUserSettings: (...args: unknown[]) => h.update(...args),
}));

beforeEach(() => {
  h.settings = { language: "zh", isPro: false, parentPinEnabled: false };
  h.update = vi.fn().mockResolvedValue(undefined);
});

describe("SettingsPage language", () => {
  it("shows the language choice with the saved language selected, above the PRO card", () => {
    render(<SettingsPage />);
    expect((screen.getByLabelText("中文") as HTMLInputElement).checked).toBe(true);
    const language = screen.getByRole("heading", { name: "语言 / Language" });
    const pro = screen.getByRole("heading", { name: "PRO membership" });
    expect(language.compareDocumentPosition(pro) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("choosing English saves language 'en' for the user and nothing else", async () => {
    const user = userEvent.setup();
    render(<SettingsPage />);
    await user.click(screen.getByLabelText("English"));
    expect(h.update).toHaveBeenCalledExactlyOnceWith(expect.anything(), "u1", { language: "en" });
  });

  it("shows English when the saved language is English", () => {
    h.settings = { ...h.settings, language: "en" };
    render(<SettingsPage />);
    expect((screen.getByLabelText("English") as HTMLInputElement).checked).toBe(true);
    expect(screen.getByRole("heading", { name: "Language / 语言" })).toBeTruthy();
  });

  it("leaves the PRO toggle working on its own (it saves isPro, not language)", async () => {
    const user = userEvent.setup();
    render(<SettingsPage />);
    await user.click(screen.getByRole("button", { name: "Enable PRO (dev)" }));
    expect(h.update).toHaveBeenCalledExactlyOnceWith(expect.anything(), "u1", { isPro: true });
  });
});
