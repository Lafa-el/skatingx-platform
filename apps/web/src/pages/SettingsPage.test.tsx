// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { render, screen, userEvent, within } from "@/test/dom";

import { SettingsPage } from "./SettingsPage";

const h = vi.hoisted(() => {
  const baseAuth = () => ({
    user: null as { email: string | null } | null,
    uid: "u1234567890" as string | null,
    isAnonymous: true,
    loading: false,
    authError: null as string | null,
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
  it("shows the language choice with the saved language selected, above the PRO card", () => {
    render(<SettingsPage />);
    expect((screen.getByLabelText("中文") as HTMLInputElement).checked).toBe(true);
    const language = screen.getByRole("heading", { name: "语言 / Language" });
    const pro = screen.getByRole("heading", { name: "PRO 会员" });
    expect(language.compareDocumentPosition(pro) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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

  it("leaves the PRO toggle working on its own (it saves isPro, not language)", async () => {
    const user = userEvent.setup();
    render(<SettingsPage />);
    await user.click(screen.getByRole("button", { name: "开启 PRO(开发用)" }));
    expect(h.update).toHaveBeenCalledExactlyOnceWith(expect.anything(), "u1234567890", { isPro: true });
  });
});

describe("SettingsPage text", () => {
  it("Chinese: title, intro and every card title", () => {
    render(<SettingsPage />);
    expect(screen.getByRole("heading", { level: 1, name: "设置" })).toBeTruthy();
    expect(screen.getByText("账户与登录。个人资料和运动员数据同步将在后续阶段提供。")).toBeTruthy();
    for (const title of ["PRO 会员", "家长设置", "当前用户", "绑定邮箱和密码", "登录已有账户"]) {
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
      "PRO membership",
      "Parent settings",
      "Current user",
      "Link email & password",
      "Sign in to existing account",
    ]) {
      expect(screen.getByRole("heading", { level: 3, name: title }), title).toBeTruthy();
    }
  });

  it("PRO card, Chinese: the development-only warning and the toggle", () => {
    render(<SettingsPage />);
    expect(screen.getByText("仅供开发使用。尚未接入支付。")).toBeTruthy();
    expect(
      screen.getByText("可在下方切换 PRO,用来测试学院和商店的付费限制界面。不会扣费,也不会验证订阅状态。"),
    ).toBeTruthy();
    expect(screen.getByText("免费版")).toBeTruthy();
  });

  it("PRO card, English: the previous wording", () => {
    setEnglish();
    h.settings = { ...h.settings, isPro: true };
    render(<SettingsPage />);
    expect(screen.getByText("Development only. Payment is not implemented.")).toBeTruthy();
    expect(screen.getByText("PRO active")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Disable PRO (dev)" })).toBeTruthy();
  });

  it("parent card: the sentence is built around the field name, which is not translated", () => {
    const { container } = render(<SettingsPage />);
    const note = container.querySelector("code")?.parentElement;
    expect(note?.textContent).toBe(
      "家长 PIN 锁在 M6 中尚未实现。PIN 不会以明文保存。PIN 安全功能上线后,只会把哈希值保存在 settings/main 中。",
    );
    expect(container.querySelector("code")?.textContent).toBe("settings/main");
    expect(screen.getByText("parentPinEnabled: false")).toBeTruthy();
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
  it("the note under the PRO card follows the language if it changes afterwards", async () => {
    const user = userEvent.setup();
    const view = render(<SettingsPage />);
    await user.click(screen.getByRole("button", { name: "开启 PRO(开发用)" }));
    expect(await screen.findByText("PRO 已开启(开发标记)。")).toBeTruthy();

    setEnglish();
    view.rerender(<SettingsPage />);
    expect(screen.getByText("PRO enabled (development flag).")).toBeTruthy();
    expect(screen.queryByText("PRO 已开启(开发标记)。")).toBeNull();
  });

  it("the parent PIN line keeps its previous truthiness rule and its field name in both languages", () => {
    h.settings = { ...h.settings, parentPinEnabled: 1 };
    const zh = render(<SettingsPage />);
    expect(screen.getByText("parentPinEnabled: true")).toBeTruthy();
    zh.unmount();

    setEnglish();
    h.settings = { ...h.settings, parentPinEnabled: undefined };
    render(<SettingsPage />);
    expect(screen.getByText("parentPinEnabled: false")).toBeTruthy();
  });
});

describe("SettingsPage PRO toggle messages", () => {
  it("Chinese: confirmation after turning PRO on, and off", async () => {
    const user = userEvent.setup();
    const first = render(<SettingsPage />);
    await user.click(screen.getByRole("button", { name: "开启 PRO(开发用)" }));
    expect(await screen.findByText("PRO 已开启(开发标记)。")).toBeTruthy();
    first.unmount();

    h.settings = { ...h.settings, isPro: true };
    render(<SettingsPage />);
    await user.click(screen.getByRole("button", { name: "关闭 PRO(开发用)" }));
    expect(await screen.findByText("PRO 已关闭。")).toBeTruthy();
  });

  it("English: the previous confirmation", async () => {
    setEnglish();
    const user = userEvent.setup();
    render(<SettingsPage />);
    await user.click(screen.getByRole("button", { name: "Enable PRO (dev)" }));
    expect(await screen.findByText("PRO enabled (development flag).")).toBeTruthy();
  });

  it("a failure with a technical message shows that message as received", async () => {
    h.update = vi.fn().mockRejectedValue(new Error("Missing or insufficient permissions."));
    const user = userEvent.setup();
    render(<SettingsPage />);
    await user.click(screen.getByRole("button", { name: "开启 PRO(开发用)" }));
    expect(await screen.findByText("Missing or insufficient permissions.")).toBeTruthy();
  });

  it("a failure without a message falls back to text in the active language", async () => {
    h.update = vi.fn().mockRejectedValue("nope");
    const user = userEvent.setup();
    const first = render(<SettingsPage />);
    await user.click(screen.getByRole("button", { name: "开启 PRO(开发用)" }));
    expect(await screen.findByText("PRO 状态更新失败。")).toBeTruthy();
    first.unmount();

    setEnglish();
    render(<SettingsPage />);
    await user.click(screen.getByRole("button", { name: "Enable PRO (dev)" }));
    expect(await screen.findByText("Failed to update PRO status.")).toBeTruthy();
  });

  it("a confirmation follows the language if it is changed afterwards", async () => {
    const user = userEvent.setup();
    const view = render(<SettingsPage />);
    await user.click(screen.getByRole("button", { name: "开启 PRO(开发用)" }));
    expect(await screen.findByText("PRO 已开启(开发标记)。")).toBeTruthy();

    setEnglish();
    view.rerender(<SettingsPage />);
    expect(screen.getByText("PRO enabled (development flag).")).toBeTruthy();
    expect(screen.queryByText("PRO 已开启(开发标记)。")).toBeNull();
  });

  it("while saving the button says so", async () => {
    h.update = vi.fn().mockReturnValue(new Promise(() => undefined));
    const user = userEvent.setup();
    render(<SettingsPage />);
    await user.click(screen.getByRole("button", { name: "开启 PRO(开发用)" }));
    expect(await screen.findByRole("button", { name: "保存中…" })).toBeTruthy();
  });
});

describe("SettingsPage account", () => {
  it("Chinese: account status in each state", () => {
    const states: Array<[() => void, string]> = [
      [() => undefined, "访客(匿名)"],
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

  it("an authentication error is shown as an alert, exactly as received", () => {
    h.auth.authError = "Incorrect email or password.";
    render(<SettingsPage />);
    expect(screen.getByRole("alert").textContent).toBe("Incorrect email or password.");
  });

  it("a guest sees the first eight characters of the guest id", () => {
    h.auth.user = { email: null };
    render(<SettingsPage />);
    expect(screen.getByText("访客 UID(前 8 位):u1234567")).toBeTruthy();
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
      screen.getByText("使用已注册的邮箱和密码登录。登录会替换当前会话(访客数据不会自动合并)。"),
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
    "要退出登录吗?你会回到一个新的访客会话。除非你之前已经绑定账户,否则这台设备上未保存的访客数据不会转移到已注册账户。";
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
