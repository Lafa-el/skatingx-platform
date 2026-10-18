// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { render, screen, userEvent, within } from "@/test/dom";
import { controlsBelowTapTarget } from "@/test/tapTarget";
import { watchUnhandledRejections } from "@/test/unhandledRejections";

import { SettingsPage } from "./SettingsPage";

const h = vi.hoisted(() => {
  const baseAuth = () => ({
    user: null as { email: string | null } | null,
    uid: "u1234567890" as string | null,
    isAnonymous: true,
    loading: false,
    authError: null as { key: string } | { received: string } | null,
    firebaseReady: true,
    clearAuthError: vi.fn(),
    linkEmailPassword: vi.fn(),
    signInEmailPassword: vi.fn(),
    logout: vi.fn(),
  });
  return {
    baseAuth,
    auth: baseAuth(),
    settings: { language: "zh", isPro: false, parentPinEnabled: false } as Record<string, unknown>,
    update: vi.fn(),
  };
});

vi.mock("@/app/providers/AuthProvider", () => ({ useAuth: () => h.auth }));
vi.mock("@/app/providers/FirestoreProvider", () => ({
  useUserSettings: () => ({ data: h.settings, loading: false, error: null }),
}));
vi.mock("@skatingx/firebase-client", () => ({
  getFirestoreDb: () => ({}),
  updateUserSettings: (...args: unknown[]) => h.update(...args),
}));

beforeEach(() => {
  h.auth = h.baseAuth();
  h.settings = { language: "zh", isPro: false, parentPinEnabled: false };
  h.update = vi.fn().mockResolvedValue(undefined);
});

const originalConfirm = window.confirm;

afterEach(() => {
  vi.restoreAllMocks();
  window.confirm = originalConfirm;
});

/** happy-dom has no usable `window.confirm`, so the test provides one. */
const stubConfirm = (answer: boolean) => {
  const confirm = vi.fn().mockReturnValue(answer);
  window.confirm = confirm as unknown as typeof window.confirm;
  return confirm;
};

const setEnglish = () => {
  h.settings = { ...h.settings, language: "en" };
};
const registered = () => {
  h.auth.isAnonymous = false;
  h.auth.user = { email: "person@example.com" };
};
const dd = (label: string) => screen.getByText(label, { selector: "dt" }).parentElement?.querySelector("dd")?.textContent;

describe("SettingsPage language", () => {
  it("shows the language choice with the saved language selected, as the first card, above the parent settings", () => {
    render(<SettingsPage />);
    expect((screen.getByLabelText("中文") as HTMLInputElement).checked).toBe(true);
    const language = screen.getByRole("heading", { name: "语言 / Language" });
    const parent = screen.getByRole("heading", { name: "家长设置" });
    expect(language.compareDocumentPosition(parent) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("choosing English saves language 'en' for the user and nothing else", async () => {
    const user = userEvent.setup();
    render(<SettingsPage />);
    await user.click(screen.getByLabelText("English"));
    expect(h.update).toHaveBeenCalledExactlyOnceWith(expect.anything(), "u1234567890", { language: "en" });
  });

  it("shows English when the saved language is English", () => {
    setEnglish();
    render(<SettingsPage />);
    expect((screen.getByLabelText("English") as HTMLInputElement).checked).toBe(true);
    expect(screen.getByRole("heading", { name: "Language / 语言" })).toBeTruthy();
  });

  it("has no PRO switch: nothing here can write isPro", async () => {
    const user = userEvent.setup();
    render(<SettingsPage />);
    await user.click(screen.getByLabelText("English"));
    expect(h.update).toHaveBeenCalledExactlyOnceWith(expect.anything(), "u1234567890", { language: "en" });
    expect(screen.queryByRole("button", { name: /\bPRO\b/ })).toBeNull();
  });
});

describe("SettingsPage text", () => {
  it("Chinese: title, intro and every card title", () => {
    render(<SettingsPage />);
    expect(screen.getByRole("heading", { level: 1, name: "设置" })).toBeTruthy();
    expect(screen.getByText("账户与登录。个人资料和运动员数据同步将在后续阶段提供。")).toBeTruthy();
    for (const title of ["家长设置", "当前用户", "绑定邮箱和密码", "登录已有账户"]) {
      expect(screen.getByRole("heading", { level: 3, name: title }), title).toBeTruthy();
    }
  });

  it("English: the previous wording", () => {
    setEnglish();
    render(<SettingsPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Settings" })).toBeTruthy();
    expect(
      screen.getByText("Account and authentication. Profile and athlete data sync come in a later phase."),
    ).toBeTruthy();
    for (const title of [
      "Parent settings",
      "Current user",
      "Link email & password",
      "Sign in to existing account",
    ]) {
      expect(screen.getByRole("heading", { level: 3, name: title }), title).toBeTruthy();
    }
  });

  // The PRO switch was a development tool. Whoever opens PRO for a user does it in the Firebase
  // console, and nothing in Settings may suggest otherwise or show a plan the app cannot verify.
  it.each([
    ["zh", false],
    ["en", true],
  ])("no PRO card, plan status or development wording (%s)", (_language, english) => {
    if (english) setEnglish();
    h.settings = { ...h.settings, isPro: true };
    const { container } = render(<SettingsPage />);
    expect(container.textContent).not.toMatch(/\bPRO\b|开发|\bdev(elopment)?\b|免费版|Free plan/i);
    expect(screen.queryByRole("heading", { name: /\bPRO\b/ })).toBeNull();
  });

  it("parent card: the sentence is built around the field name, which is not translated", () => {
    const { container } = render(<SettingsPage />);
    const note = container.querySelector("code")?.parentElement;
    expect(note?.textContent).toBe(
      "家长 PIN 锁在 M6 中尚未实现。PIN 不会以明文保存。PIN 安全功能上线后，只会把哈希值保存在 settings/main 中。",
    );
    expect(container.querySelector("code")?.textContent).toBe("settings/main");
  });

  it("parent card, English: the previous sentence", () => {
    setEnglish();
    const { container } = render(<SettingsPage />);
    expect(container.querySelector("code")?.parentElement?.textContent).toBe(
      "Parent PIN lock is not implemented in M6. PINs are not stored in plaintext. When PIN security ships, only a hash will be saved on settings/main.",
    );
  });
});

describe("SettingsPage details", () => {
  // The raw field was a debug line that parents and athletes could see in Production.
  it.each([true, false, 1, undefined])(
    "never shows the internal parentPinEnabled field, whatever is stored (%s), in either language",
    (stored) => {
      h.settings = { ...h.settings, parentPinEnabled: stored };
      const zh = render(<SettingsPage />);
      expect(zh.container.textContent).not.toMatch(/parentPinEnabled/);
      zh.unmount();

      setEnglish();
      const en = render(<SettingsPage />);
      expect(en.container.textContent).not.toMatch(/parentPinEnabled/);
    },
  );
});

// The provider shows the reason and logs the code (AuthProvider.test.tsx), then rethrows so the
// form can tell the call failed. The page swallows that on purpose; this pins that it does, that
// nothing typed is lost, and that the page does not log the same failure a second time.
describe("SettingsPage forms: a failed sign-in or link", () => {
  const fail = () => Object.assign(new Error("auth/wrong-password"), { code: "auth/wrong-password" });

  it.each([
    ["link", "绑定账户", "linkEmailPassword", "123456"],
    ["sign-in", "登录", "signInEmailPassword", "secret"],
  ] as const)("%s: no unhandled rejection, the fields keep their text, the button is usable again", async (_name, button, method, password) => {
    const watcher = watchUnhandledRejections();
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    h.auth[method] = vi.fn().mockRejectedValue(fail());
    const user = userEvent.setup();
    render(<SettingsPage />);
    const submit = screen.getByRole("button", { name: button }) as HTMLButtonElement;
    const form = submit.closest("form") as HTMLElement;
    await user.type(within(form).getByLabelText("邮箱"), "a@example.com");
    await user.type(within(form).getByLabelText("密码"), password);
    await user.click(submit);
    expect(await watcher.settled()).toEqual([]);
    watcher.stop();
    expect((within(form).getByLabelText("邮箱") as HTMLInputElement).value).toBe("a@example.com");
    expect((within(form).getByLabelText("密码") as HTMLInputElement).value).toBe(password);
    expect((screen.getByRole("button", { name: button }) as HTMLButtonElement).disabled).toBe(false);
    expect(log).not.toHaveBeenCalled();
    log.mockRestore();
  });
});

describe("SettingsPage account", () => {
  it("Chinese: account status in each state", () => {
    const states: Array<[() => void, string]> = [
      [() => undefined, "访客（匿名）"],
      [registered, "已注册用户"],
      [() => (h.auth.loading = true), "加载中…"],
      [() => (h.auth.firebaseReady = false), "服务未配置"],
    ];
    for (const [setup, expected] of states) {
      h.auth = h.baseAuth();
      setup();
      const view = render(<SettingsPage />);
      expect(within(screen.getByRole("heading", { level: 3, name: "当前用户" }).closest("article") as HTMLElement).getByText(expected)).toBeTruthy();
      view.unmount();
    }
  });

  it("English: the previous account status text in each state", () => {
    setEnglish();
    const states: Array<[() => void, string]> = [
      [() => undefined, "Guest (anonymous)"],
      [registered, "Registered User"],
      [() => (h.auth.loading = true), "Loading…"],
      [() => (h.auth.firebaseReady = false), "Firebase not configured"],
    ];
    for (const [setup, expected] of states) {
      h.auth = h.baseAuth();
      setup();
      const view = render(<SettingsPage />);
      expect(within(screen.getByRole("heading", { level: 3, name: "Current user" }).closest("article") as HTMLElement).getByText(expected)).toBeTruthy();
      view.unmount();
    }
  });

  it("current user card: labels, yes/no and the email as stored", () => {
    registered();
    render(<SettingsPage />);
    expect(dd("UID")).toBe("u1234567890");
    expect(dd("匿名")).toBe("否");
    expect(dd("邮箱")).toBe("person@example.com");
  });

  it("current user card: anonymous, no email", () => {
    render(<SettingsPage />);
    expect(dd("匿名")).toBe("是");
    expect(dd("邮箱")).toBe("—");
  });

  it("English yes/no", () => {
    setEnglish();
    render(<SettingsPage />);
    expect(dd("Anonymous")).toBe("Yes");
    expect(dd("Email")).toBe("—");
  });

  it("an authentication error is shown as an alert in the language of the page", () => {
    h.auth.authError = { key: "auth.error.wrongCredential" };
    const zh = render(<SettingsPage />);
    expect(screen.getByRole("alert").textContent).toBe("邮箱或密码不正确。");
    zh.unmount();

    setEnglish();
    render(<SettingsPage />);
    expect(screen.getByRole("alert").textContent).toBe("Incorrect email or password.");
  });

  it("an authentication error follows a change of language while it is shown", () => {
    h.auth.authError = { key: "auth.error.wrongCredential" };
    const view = render(<SettingsPage />);
    setEnglish();
    view.rerender(<SettingsPage />);
    expect(screen.getByRole("alert").textContent).toBe("Incorrect email or password.");
  });

  it("a message that did not come from a known error is shown as received, in either language", () => {
    h.auth.authError = { received: "No signed-in user to link." };
    const zh = render(<SettingsPage />);
    expect(screen.getByRole("alert").textContent).toBe("No signed-in user to link.");
    zh.unmount();

    setEnglish();
    render(<SettingsPage />);
    expect(screen.getByRole("alert").textContent).toBe("No signed-in user to link.");
  });

  it("a guest sees the first eight characters of the guest id", () => {
    h.auth.user = { email: null };
    render(<SettingsPage />);
    expect(screen.getByText("访客 UID（前 8 位）：u1234567")).toBeTruthy();
  });

  it("guest id line in English", () => {
    setEnglish();
    h.auth.user = { email: null };
    render(<SettingsPage />);
    expect(screen.getByText("Guest UID (first 8 chars): u1234567")).toBeTruthy();
  });
});

describe("SettingsPage forms", () => {
  it("link form, Chinese: labelled fields, help text and a submit button that waits for valid input", async () => {
    const user = userEvent.setup();
    render(<SettingsPage />);
    expect(screen.getByText("把当前访客会话变成永久账户。密码至少 6 个字符。")).toBeTruthy();
    const submit = screen.getByRole("button", { name: "绑定账户" }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    const form = submit.closest("form") as HTMLElement;
    await user.type(within(form).getByLabelText("邮箱"), "a@example.com");
    await user.type(within(form).getByLabelText("密码"), "12345");
    expect(submit.disabled).toBe(true);
    await user.type(within(form).getByLabelText("密码"), "6");
    expect(submit.disabled).toBe(false);
  });

  it("link form says it is busy while the account is being linked", async () => {
    h.auth.linkEmailPassword = vi.fn().mockReturnValue(new Promise(() => undefined));
    const user = userEvent.setup();
    render(<SettingsPage />);
    const submit = screen.getByRole("button", { name: "绑定账户" });
    const form = submit.closest("form") as HTMLElement;
    await user.type(within(form).getByLabelText("邮箱"), "a@example.com");
    await user.type(within(form).getByLabelText("密码"), "123456");
    await user.click(submit);
    expect(await screen.findByRole("button", { name: "绑定中…" })).toBeTruthy();
  });

  it("link form, English: the previous wording", () => {
    setEnglish();
    render(<SettingsPage />);
    expect(
      screen.getByText("Turn this guest session into a permanent account. Password must be at least 6 characters."),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Link account" })).toBeTruthy();
  });

  it("sign-in form, Chinese: help text, labelled fields and a busy state", async () => {
    h.auth.signInEmailPassword = vi.fn().mockReturnValue(new Promise(() => undefined));
    const user = userEvent.setup();
    render(<SettingsPage />);
    expect(
      screen.getByText("使用已注册的邮箱和密码登录。登录会替换当前会话（访客数据不会自动合并）。"),
    ).toBeTruthy();
    const submit = screen.getByRole("button", { name: "登录" });
    const form = submit.closest("form") as HTMLElement;
    await user.type(within(form).getByLabelText("邮箱"), "a@example.com");
    await user.type(within(form).getByLabelText("密码"), "secret");
    await user.click(submit);
    expect(await screen.findByRole("button", { name: "登录中…" })).toBeTruthy();
  });

  it("sign-in form, English: the previous wording", () => {
    setEnglish();
    render(<SettingsPage />);
    expect(
      screen.getByText(
        "Use a registered email and password. Signing in replaces the current session (guest data is not merged automatically).",
      ),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeTruthy();
  });

  it("the link and sign-in forms are hidden when the service is not configured", () => {
    h.auth.firebaseReady = false;
    render(<SettingsPage />);
    expect(screen.queryByRole("button", { name: "绑定账户" })).toBeNull();
    expect(screen.queryByRole("button", { name: "登录" })).toBeNull();
  });
});

describe("SettingsPage sign out", () => {
  const ZH_CONFIRM =
    "要退出登录吗？你会回到一个新的访客会话。除非你之前已经绑定账户，否则这台设备上未保存的访客数据不会转移到已注册账户。";
  const EN_CONFIRM =
    "Sign out? You will return to a new guest session. Unsaved guest data on this device will not carry over to a registered account unless you linked first.";

  it("asks in the active language, and signs out only when confirmed (Chinese)", async () => {
    registered();
    const confirm = stubConfirm(false);
    const user = userEvent.setup();
    render(<SettingsPage />);
    await user.click(screen.getByRole("button", { name: "退出登录" }));
    expect(confirm).toHaveBeenCalledExactlyOnceWith(ZH_CONFIRM);
    expect(h.auth.logout).not.toHaveBeenCalled();

    confirm.mockReturnValue(true);
    await user.click(screen.getByRole("button", { name: "退出登录" }));
    expect(h.auth.logout).toHaveBeenCalledTimes(1);
  });

  it("asks with the previous wording in English", async () => {
    setEnglish();
    registered();
    const confirm = stubConfirm(false);
    const user = userEvent.setup();
    render(<SettingsPage />);
    await user.click(screen.getByRole("button", { name: "Sign out" }));
    expect(confirm).toHaveBeenCalledExactlyOnceWith(EN_CONFIRM);
  });

  it("a guest has no sign-out button", () => {
    render(<SettingsPage />);
    expect(screen.queryByRole("button", { name: "退出登录" })).toBeNull();
  });
});

describe("SettingsPage: tap targets (44px)", () => {
  it("a guest sees inputs and the form buttons at 44px", () => {
    const { container } = render(<SettingsPage />);
    expect(container.querySelectorAll("input").length).toBeGreaterThan(4);
    expect(controlsBelowTapTarget(container)).toEqual([]);
  });

  it("a signed-in person sees the sign-out button at 44px too", () => {
    registered();
    const { container } = render(<SettingsPage />);
    expect(screen.getByRole("button", { name: "退出登录" })).toBeTruthy();
    expect(controlsBelowTapTarget(container)).toEqual([]);
  });

  it("an error message with no spaces wraps instead of widening the page", () => {
    h.auth.authError = { received: "Error-auth/some-very-long-unbroken-token-ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789" };
    render(<SettingsPage />);
    expect(screen.getByRole("alert").className).toContain("break-words");
  });
});
