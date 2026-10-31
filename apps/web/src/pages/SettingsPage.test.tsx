// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

import { APP_VERSION } from "@/shared/appVersion";
import { render, screen, userEvent, within } from "@/test/dom";
import { controlsBelowTapTarget } from "@/test/tapTarget";
import { watchUnhandledRejections } from "@/test/unhandledRejections";

import { hashParentPin } from "@/shared/parentPin";

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
    planLoading: false,
    planError: null as string | null,
    profile: { data: { displayName: "Sample Skater" } as { displayName: string } | null, loading: false },
    reload: vi.fn(),
    reset: vi.fn(),
    authClient: {} as object | null,
  };
});

vi.mock("@/app/providers/AuthProvider", () => ({ useAuth: () => h.auth }));
vi.mock("@/app/providers/FirestoreProvider", () => ({
  useUserSettings: () => ({ data: h.settings, loading: h.planLoading, error: h.planError }),
  useAthleteProfile: () => h.profile,
  useReloadUserSettings: () => h.reload,
}));
vi.mock("@/components/FirestoreStatusBanner", () => ({
  FirestoreStatusBanner: () => <div data-testid="firestore-status-banner" />,
}));
vi.mock("@skatingx/firebase-client", () => ({
  getFirestoreDb: () => ({}),
  getFirebaseAuth: () => h.authClient,
  updateUserSettings: (...args: unknown[]) => h.update(...args),
  requestPasswordResetEmail: (...args: unknown[]) => h.reset(...args),
}));

function renderSettings() {
  return render(
    <MemoryRouter>
      <SettingsPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  h.auth = h.baseAuth();
  h.settings = { language: "zh", isPro: false, parentPinEnabled: false, activeAthleteId: "lindsay" };
  h.planLoading = false;
  h.planError = null;
  h.profile = { data: { displayName: "Sample Skater" }, loading: false };
  h.reload = vi.fn();
  h.reset = vi.fn().mockResolvedValue(undefined);
  h.authClient = {};
  h.update = vi.fn().mockResolvedValue(undefined);
  sessionStorage.clear();
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
  it("shows the language choice with the saved language selected, above the parent note inside preferences", () => {
    renderSettings();
    expect((screen.getByLabelText("中文") as HTMLInputElement).checked).toBe(true);
    const preferences = screen.getByRole("heading", { name: "偏好" });
    const language = screen.getByRole("heading", { name: "语言 / Language" });
    const parent = screen.getByRole("heading", { name: "家长设置" });
    expect(preferences.compareDocumentPosition(language) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(language.compareDocumentPosition(parent) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("choosing English saves language 'en' for the user and nothing else", async () => {
    const user = userEvent.setup();
    renderSettings();
    await user.click(screen.getByLabelText("English"));
    expect(h.update).toHaveBeenCalledExactlyOnceWith(expect.anything(), "u1234567890", { language: "en" });
  });

  it("shows English when the saved language is English", () => {
    setEnglish();
    renderSettings();
    expect((screen.getByLabelText("English") as HTMLInputElement).checked).toBe(true);
    expect(screen.getByRole("heading", { name: "Language / 语言" })).toBeTruthy();
  });

  it("still saves only the language: the subscription group does not write isPro", async () => {
    const user = userEvent.setup();
    h.settings = { ...h.settings, isPro: true };
    renderSettings();
    await user.click(screen.getByLabelText("English"));
    expect(h.update).toHaveBeenCalledExactlyOnceWith(expect.anything(), "u1234567890", { language: "en" });
    expect(screen.queryByRole("switch")).toBeNull();
  });
});

describe("SettingsPage text", () => {
  it("Chinese: title, intro and every card title", () => {
    renderSettings();
    expect(screen.getByRole("heading", { level: 1, name: "设置" })).toBeTruthy();
    expect(screen.getByText("账户与登录。个人资料和运动员数据同步将在后续阶段提供。")).toBeTruthy();
    for (const title of ["账号", "运动员", "订阅", "偏好"]) {
      expect(screen.getByRole("heading", { level: 3, name: title }), title).toBeTruthy();
    }
    for (const title of ["绑定邮箱和密码", "登录已有账户", "家长设置"]) {
      expect(screen.getByRole("heading", { name: title }), title).toBeTruthy();
    }
  });

  it("English: the previous wording", () => {
    setEnglish();
    renderSettings();
    expect(screen.getByRole("heading", { level: 1, name: "Settings" })).toBeTruthy();
    expect(
      screen.getByText("Account and authentication. Profile and athlete data sync come in a later phase."),
    ).toBeTruthy();
    for (const title of ["Account", "Athlete", "Subscription", "Preferences"]) {
      expect(screen.getByRole("heading", { level: 3, name: title }), title).toBeTruthy();
    }
    for (const title of ["Parent settings", "Link email & password", "Sign in to existing account"]) {
      expect(screen.getByRole("heading", { name: title }), title).toBeTruthy();
    }
  });

  // The old assertion required the page to hide the word PRO even when isPro was true.
  // That was when Settings had no plan display. The subscription group is now supposed to say
  // PRO is on, and it still must not write the flag.
  it("shows PRO when the flag is on, and does not write it", () => {
    h.settings = { ...h.settings, isPro: true };
    renderSettings();
    expect(screen.getByText("PRO 已开通")).toBeTruthy();
    expect(h.update).not.toHaveBeenCalled();
    expect(screen.queryByRole("switch")).toBeNull();
  });

  it("parent card: the sentence is built around the field name, which is not translated", () => {
    const { container } = renderSettings();
    const note = container.querySelector("code")?.parentElement;
    expect(note?.textContent).toBe(
      "家长 PIN 在账号分组里设置。保存下来的只有哈希，明文不会写入 settings/main。",
    );
    expect(container.querySelector("code")?.textContent).toBe("settings/main");
  });

  it("parent card, English: the previous sentence", () => {
    setEnglish();
    const { container } = renderSettings();
    expect(container.querySelector("code")?.parentElement?.textContent).toBe(
      "The parent PIN is set in the Account group. Only a hash is stored, never the PIN itself, on settings/main.",
    );
  });
});

describe("SettingsPage details", () => {
  // The raw field was a debug line that parents and athletes could see in Production.
  it.each([true, false, 1, undefined])(
    "never shows the internal parentPinEnabled field, whatever is stored (%s), in either language",
    (stored) => {
      h.settings = { ...h.settings, parentPinEnabled: stored };
      const zh = renderSettings();
      expect(zh.container.textContent).not.toMatch(/parentPinEnabled|parentPinHash|parentPinSalt/);
      zh.unmount();

      setEnglish();
      const en = renderSettings();
      expect(en.container.textContent).not.toMatch(/parentPinEnabled|parentPinHash|parentPinSalt/);
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
    stubConfirm(true); // a guest signing in is asked first; this test is about what follows
    const watcher = watchUnhandledRejections();
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    h.auth[method] = vi.fn().mockRejectedValue(fail());
    const user = userEvent.setup();
    renderSettings();
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
      const view = renderSettings();
      expect(within(screen.getByRole("heading", { level: 3, name: "账号" }).closest("article") as HTMLElement).getByText(expected)).toBeTruthy();
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
      const view = renderSettings();
      expect(within(screen.getByRole("heading", { level: 3, name: "Account" }).closest("article") as HTMLElement).getByText(expected)).toBeTruthy();
      view.unmount();
    }
  });

  it("current user card: labels, yes/no and the email as stored", () => {
    registered();
    renderSettings();
    expect(dd("UID")).toBe("u1234567890");
    expect(dd("匿名")).toBe("否");
    expect(dd("邮箱")).toBe("person@example.com");
  });

  it("current user card: anonymous, no email", () => {
    renderSettings();
    expect(dd("匿名")).toBe("是");
    expect(dd("邮箱")).toBe("—");
  });

  it("English yes/no", () => {
    setEnglish();
    renderSettings();
    expect(dd("Anonymous")).toBe("Yes");
    expect(dd("Email")).toBe("—");
  });

  it("an authentication error is shown as an alert in the language of the page", () => {
    h.auth.authError = { key: "auth.error.wrongCredential" };
    const zh = renderSettings();
    expect(screen.getByRole("alert").textContent).toBe("邮箱或密码不正确。");
    zh.unmount();

    setEnglish();
    renderSettings();
    expect(screen.getByRole("alert").textContent).toBe("Incorrect email or password.");
  });

  it("an authentication error follows a change of language while it is shown", () => {
    h.auth.authError = { key: "auth.error.wrongCredential" };
    const view = renderSettings();
    setEnglish();
    view.rerender(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole("alert").textContent).toBe("Incorrect email or password.");
  });

  it("a message that did not come from a known error is shown as received, in either language", () => {
    h.auth.authError = { received: "No signed-in user to link." };
    const zh = renderSettings();
    expect(screen.getByRole("alert").textContent).toBe("No signed-in user to link.");
    zh.unmount();

    setEnglish();
    renderSettings();
    expect(screen.getByRole("alert").textContent).toBe("No signed-in user to link.");
  });

  it("a guest sees the first eight characters of the guest id", () => {
    h.auth.user = { email: null };
    renderSettings();
    expect(screen.getByText("访客 UID（前 8 位）：u1234567")).toBeTruthy();
  });

  it("guest id line in English", () => {
    setEnglish();
    h.auth.user = { email: null };
    renderSettings();
    expect(screen.getByText("Guest UID (first 8 chars): u1234567")).toBeTruthy();
  });
});

describe("SettingsPage forms", () => {
  it("link form, Chinese: labelled fields, help text and a submit button that waits for valid input", async () => {
    const user = userEvent.setup();
    renderSettings();
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
    renderSettings();
    const submit = screen.getByRole("button", { name: "绑定账户" });
    const form = submit.closest("form") as HTMLElement;
    await user.type(within(form).getByLabelText("邮箱"), "a@example.com");
    await user.type(within(form).getByLabelText("密码"), "123456");
    await user.click(submit);
    expect(await screen.findByRole("button", { name: "绑定中…" })).toBeTruthy();
  });

  it("link form, English: the previous wording", () => {
    setEnglish();
    renderSettings();
    expect(
      screen.getByText("Turn this guest session into a permanent account. Password must be at least 6 characters."),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Link account" })).toBeTruthy();
  });

  it("sign-in form, Chinese: help text, labelled fields and a busy state", async () => {
    stubConfirm(true);
    h.auth.signInEmailPassword = vi.fn().mockReturnValue(new Promise(() => undefined));
    const user = userEvent.setup();
    renderSettings();
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
    renderSettings();
    expect(
      screen.getByText(
        "Use a registered email and password. Signing in replaces the current session (guest data is not merged automatically).",
      ),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeTruthy();
  });

  it("the link and sign-in forms are hidden when the service is not configured", () => {
    h.auth.firebaseReady = false;
    renderSettings();
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
    renderSettings();
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
    renderSettings();
    await user.click(screen.getByRole("button", { name: "Sign out" }));
    expect(confirm).toHaveBeenCalledExactlyOnceWith(EN_CONFIRM);
  });

  it("a guest has no sign-out button", () => {
    renderSettings();
    expect(screen.queryByRole("button", { name: "退出登录" })).toBeNull();
  });
});

describe("SettingsPage sign in", () => {
  const ZH_CONFIRM =
    "要登录已有账户吗？登录会替换当前的访客会话：访客数据不会转移到登录后的账户，而且你无法再回到这个访客会话。";
  const EN_CONFIRM =
    "Sign in to an existing account? Signing in replaces the current guest session: guest data will not be transferred to the account you sign in to, and you will not be able to return to this guest session.";

  const fillSignIn = async (user: ReturnType<typeof userEvent.setup>, button: string) => {
    const submit = screen.getByRole("button", { name: button });
    const form = submit.closest("form") as HTMLElement;
    const email = within(form).getByLabelText(/邮箱|Email/) as HTMLInputElement;
    const password = within(form).getByLabelText(/密码|Password/) as HTMLInputElement;
    await user.type(email, "a@example.com");
    await user.type(password, "secret");
    return { submit, email, password };
  };

  it("a guest who declines: nothing is called and the typed email and password stay", async () => {
    const confirm = stubConfirm(false);
    const user = userEvent.setup();
    renderSettings();
    const { submit, email, password } = await fillSignIn(user, "登录");
    await user.click(submit);
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(h.auth.signInEmailPassword).not.toHaveBeenCalled();
    expect(h.auth.clearAuthError).not.toHaveBeenCalled();
    expect(email.value).toBe("a@example.com");
    expect(password.value).toBe("secret");
    expect((screen.getByRole("button", { name: "登录" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("a guest who agrees: signs in once with what was typed, then the fields are cleared", async () => {
    const confirm = stubConfirm(true);
    h.auth.signInEmailPassword = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderSettings();
    const { submit, email, password } = await fillSignIn(user, "登录");
    await user.click(submit);
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(h.auth.signInEmailPassword).toHaveBeenCalledExactlyOnceWith("a@example.com", "secret");
    expect(email.value).toBe("");
    expect(password.value).toBe("");
  });

  it("asks in the active language: the stored sentence, once (Chinese, then English)", async () => {
    const confirm = stubConfirm(false);
    const user = userEvent.setup();
    const zh = renderSettings();
    await user.click((await fillSignIn(user, "登录")).submit);
    expect(confirm).toHaveBeenCalledExactlyOnceWith(ZH_CONFIRM);
    zh.unmount();

    setEnglish();
    const en = stubConfirm(false);
    renderSettings();
    await user.click((await fillSignIn(user, "Sign in")).submit);
    expect(en).toHaveBeenCalledExactlyOnceWith(EN_CONFIRM);
  });

  it("the sentence says the session is replaced and the data does not move, and does not say deleted", () => {
    expect(ZH_CONFIRM).toMatch(/替换/);
    expect(ZH_CONFIRM).toMatch(/不会转移/);
    expect(ZH_CONFIRM).not.toMatch(/删除/);
    expect(EN_CONFIRM).toMatch(/replaces/);
    expect(EN_CONFIRM).toMatch(/not be transferred/);
    expect(EN_CONFIRM).not.toMatch(/delet/i);
  });

  it("a signed-out user is not asked: sign-in goes straight ahead", async () => {
    h.auth.isAnonymous = false;
    h.auth.user = null;
    const confirm = stubConfirm(false);
    h.auth.signInEmailPassword = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderSettings();
    await user.click((await fillSignIn(user, "登录")).submit);
    expect(confirm).not.toHaveBeenCalled();
    expect(h.auth.signInEmailPassword).toHaveBeenCalledExactlyOnceWith("a@example.com", "secret");
  });

  it("linking is not asked about: it keeps the same uid", async () => {
    const confirm = stubConfirm(false);
    h.auth.linkEmailPassword = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderSettings();
    const submit = screen.getByRole("button", { name: "绑定账户" });
    const form = submit.closest("form") as HTMLElement;
    await user.type(within(form).getByLabelText("邮箱"), "a@example.com");
    await user.type(within(form).getByLabelText("密码"), "123456");
    await user.click(submit);
    expect(confirm).not.toHaveBeenCalled();
    expect(h.auth.linkEmailPassword).toHaveBeenCalledTimes(1);
  });
});

describe("SettingsPage: tap targets (44px)", () => {
  it("a guest sees inputs and the form buttons at 44px", () => {
    const { container } = renderSettings();
    expect(container.querySelectorAll("input").length).toBeGreaterThan(4);
    expect(controlsBelowTapTarget(container)).toEqual([]);
  });

  it("a signed-in person sees the sign-out button at 44px too", () => {
    registered();
    const { container } = renderSettings();
    expect(screen.getByRole("button", { name: "退出登录" })).toBeTruthy();
    expect(controlsBelowTapTarget(container)).toEqual([]);
  });

  it("an error message with no spaces wraps instead of widening the page", () => {
    h.auth.authError = { received: "Error-auth/some-very-long-unbroken-token-ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789" };
    renderSettings();
    expect(screen.getByRole("alert").className).toContain("break-words");
  });
});

// UI v1, phase 1: the page was restyled only. These pin the look, because a class that is off
// here is invisible to every behaviour test above.
describe("SettingsPage subscription", () => {
  it("loading does not show the free plan", () => {
    h.planLoading = true;
    h.settings = { ...h.settings, isPro: false };
    renderSettings();
    expect(screen.getByRole("status").textContent).toBe("正在准备");
    expect(screen.queryByText("免费版")).toBeNull();
    expect(screen.queryByText("PRO 已开通")).toBeNull();
  });

  it("a failed read shows the plan error and a retry, not the free plan", async () => {
    h.planError = "permission-denied";
    h.settings = { ...h.settings, isPro: false };
    const user = userEvent.setup();
    renderSettings();
    expect(screen.getByRole("alert").textContent).toContain("暂时无法确认你的套餐状态");
    expect(screen.queryByText("免费版")).toBeNull();
    expect(screen.queryByText("$19.99 / 月")).toBeNull();
    await user.click(screen.getByRole("button", { name: "重试" }));
    expect(h.reload).toHaveBeenCalledTimes(1);
  });

  it("PRO shows the sticker, the title and the benefit list, and not the price", () => {
    h.settings = { ...h.settings, isPro: true };
    renderSettings();
    expect(screen.getByText("PRO")).toBeTruthy();
    expect(screen.getByText("PRO 已开通")).toBeTruthy();
    for (const benefit of ["比赛日视频记录与总结卡", "完整分析能力", "分析生成训练建议"]) {
      expect(screen.getByText(benefit)).toBeTruthy();
    }
    expect(screen.getByRole("list", { name: "权益" }).getAttribute("data-locked")).toBe("false");
    expect(screen.queryByText("$19.99 / 月")).toBeNull();
    expect(screen.queryByText("目前由管理员人工开通；在线订阅即将推出")).toBeNull();
    expect(h.update).not.toHaveBeenCalled();
  });

  it("the free plan shows the same benefits locked, plus the price anchor", () => {
    renderSettings();
    expect(screen.getByText("免费版")).toBeTruthy();
    expect(screen.getByText("$19.99 / 月")).toBeTruthy();
    expect(screen.getByText("目前由管理员人工开通；在线订阅即将推出")).toBeTruthy();
    expect(screen.getByRole("list", { name: "权益" }).getAttribute("data-locked")).toBe("true");
    expect(screen.queryByText("PRO 已开通")).toBeNull();
    expect(screen.queryByText("正在准备")).toBeNull();
  });
});

describe("SettingsPage password reset", () => {
  it("a registered user can send a reset email, and sees the success note", async () => {
    registered();
    const user = userEvent.setup();
    renderSettings();
    await user.click(screen.getByRole("button", { name: "修改密码" }));
    expect(h.reset).toHaveBeenCalledExactlyOnceWith(h.authClient, "person@example.com");
    expect(screen.getByRole("status").textContent).toBe("重置邮件已发送");
  });

  it("a guest does not see the password reset", () => {
    renderSettings();
    expect(screen.queryByRole("button", { name: "修改密码" })).toBeNull();
  });

  it("a failed reset uses the existing auth error wording", async () => {
    registered();
    h.reset.mockRejectedValue(Object.assign(new Error("auth/network-request-failed"), { code: "auth/network-request-failed" }));
    const user = userEvent.setup();
    renderSettings();
    await user.click(screen.getByRole("button", { name: "修改密码" }));
    expect(screen.getByRole("alert").textContent).toContain("网络错误，请检查网络连接。");
    expect(screen.queryByText("重置邮件已发送")).toBeNull();
  });

  it("does not call Auth when the registered account has no email", async () => {
    registered();
    h.auth.user = { email: null };
    const user = userEvent.setup();
    renderSettings();
    await user.click(screen.getByRole("button", { name: "修改密码" }));
    expect(h.reset).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toBe("这个账户没有邮箱，发不了重置邮件。");
  });
});

const signInForm = () => {
  const form = screen.getByRole("heading", { name: "登录已有账户" }).closest("form");
  if (!form) {
    throw new Error("sign-in form missing");
  }
  return within(form);
};

describe("SettingsPage forgot password", () => {
  it("does not call Auth when the sign-in email is empty, and says to fill it in", async () => {
    const user = userEvent.setup();
    renderSettings();
    await user.click(signInForm().getByRole("button", { name: "忘记密码？" }));
    expect(h.reset).not.toHaveBeenCalled();
    expect(signInForm().getByText("请先填写邮箱，再点忘记密码")).toBeTruthy();
  });

  it("sends a reset for the email typed in the sign-in form, and reuses the sent note", async () => {
    const user = userEvent.setup();
    renderSettings();
    await user.type(signInForm().getByLabelText("邮箱"), "person@example.com");
    await user.click(signInForm().getByRole("button", { name: "忘记密码？" }));
    expect(h.reset).toHaveBeenCalledExactlyOnceWith(h.authClient, "person@example.com");
    expect(signInForm().getByRole("status").textContent).toBe("重置邮件已发送");
  });

  it("a registered user does not see the sign-in form or forgot password, and still has change-password and sign-out", () => {
    registered();
    renderSettings();
    expect(screen.queryByRole("heading", { name: "登录已有账户" })).toBeNull();
    expect(screen.queryByRole("button", { name: "登录" })).toBeNull();
    expect(screen.queryByRole("button", { name: "忘记密码？" })).toBeNull();
    expect(screen.getByRole("button", { name: "修改密码" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "退出登录" })).toBeTruthy();
    expect(dd("邮箱")).toBe("person@example.com");
  });

  it("a failed reset uses the existing auth error wording inside the sign-in form", async () => {
    h.reset.mockRejectedValue(Object.assign(new Error("auth/network-request-failed"), { code: "auth/network-request-failed" }));
    const user = userEvent.setup();
    renderSettings();
    await user.type(signInForm().getByLabelText("邮箱"), "person@example.com");
    await user.click(signInForm().getByRole("button", { name: "忘记密码？" }));
    expect(signInForm().getByRole("alert").textContent).toContain("网络错误，请检查网络连接。");
    expect(signInForm().queryByText("重置邮件已发送")).toBeNull();
  });

  it("a guest sees the sign-in form and forgot password", () => {
    renderSettings();
    expect(signInForm().getByRole("button", { name: "登录" })).toBeTruthy();
    expect(signInForm().getByRole("button", { name: "忘记密码？" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "绑定邮箱和密码" })).toBeTruthy();
  });

  it("is not rendered while Firebase is unconfigured or auth is still loading", () => {
    h.auth.firebaseReady = false;
    const unconfigured = renderSettings();
    expect(screen.queryByRole("button", { name: "登录" })).toBeNull();
    expect(screen.queryByRole("button", { name: "忘记密码？" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "登录已有账户" })).toBeNull();
    unconfigured.unmount();

    h.auth.firebaseReady = true;
    h.auth.loading = true;
    renderSettings();
    expect(screen.queryByRole("button", { name: "登录" })).toBeNull();
    expect(screen.queryByRole("button", { name: "忘记密码？" })).toBeNull();
  });
});

describe("SettingsPage athlete", () => {
  it("shows the current athlete name and id, and links to the read-only profile", () => {
    h.profile = { data: { displayName: "Sample Skater" }, loading: false };
    h.settings = { ...h.settings, activeAthleteId: "athlete-9" };
    renderSettings();
    expect(dd("姓名")).toBe("Sample Skater");
    expect(dd("运动员 ID")).toBe("athlete-9");
    expect(screen.getByText("当前")).toBeTruthy();
    const link = screen.getByRole("link", { name: "运动员资料 ›" });
    expect(link.getAttribute("href")).toBe("/athlete");
    expect(link.textContent).not.toMatch(/编辑/);
  });
});

describe("SettingsPage footer", () => {
  it("shows only the app version, with no website link", () => {
    const pkg = JSON.parse(readFileSync(path.resolve("apps/web/package.json"), "utf8")) as { version: string };
    renderSettings();
    expect(APP_VERSION).toBe(pkg.version);
    const footer = screen.getByText(`版本 ${APP_VERSION}`);
    expect(footer.closest("a")).toBeNull();
    expect(screen.queryByRole("link", { name: /skatingx\.com/i })).toBeNull();
    expect(screen.getByTestId("firestore-status-banner")).toBeTruthy();
  });
});

describe("SettingsPage look (UI v1)", () => {
  it("uses the brand tokens and none of the old blue, grey or red classes, in any state", () => {
    h.auth.authError = { key: "auth.error.wrongCredential" };
    const { container } = renderSettings();
    const classes = Array.from(container.querySelectorAll("[class]")).flatMap((el) => (el.getAttribute("class") ?? "").split(/\s+/));
    const legacy = classes.filter((c) => /(^|:)(text|bg|border|ring|accent|outline)-(sky|slate|red)-\d/.test(c) || c === "text-white");
    expect(legacy).toEqual([]);
  });

  it("a sign-in error is shown with an icon and the words, not colour alone", () => {
    h.auth.authError = { key: "auth.error.wrongCredential" };
    renderSettings();
    const alert = screen.getByRole("alert");
    expect(alert.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    expect(alert.textContent?.length).toBeGreaterThan(0);
    expect(alert.className).toContain("text-status-danger");
  });

  it("the link button is the brand button, the sign-in button an outline, sign-out the red outline", () => {
    renderSettings();
    expect(screen.getByRole("button", { name: "绑定账户" }).className).toContain("bg-brand-flame");
    expect(screen.getByRole("button", { name: "绑定账户" }).className).toContain("text-brand-navy");
    expect(screen.getByRole("button", { name: "登录" }).className).toContain("border-brand-navy/50");
  });

  it("sign-out uses the error red, never the brand flame", () => {
    registered();
    renderSettings();
    const signOut = screen.getByRole("button", { name: "退出登录" });
    expect(signOut.className).toContain("text-status-danger");
    expect(signOut.className).not.toContain("brand-flame");
  });
});

describe("SettingsPage parent PIN", () => {
  const pin = "1357";

  async function storedPin() {
    const salt = "ab";
    return { parentPinHash: await hashParentPin(salt, pin), parentPinSalt: salt };
  }

  it("suggests setting a PIN and does not block the three actions while it is unset", async () => {
    registered();
    const user = userEvent.setup();
    renderSettings();
    expect(screen.getByText(/建议设置一个/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "设置家长 PIN" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "修改密码" }));
    expect(h.reset).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();

    await user.click(screen.getByRole("button", { name: "开通" }));
    expect(screen.getByText(/这一步不会改你的套餐状态/)).toBeTruthy();
    expect(h.update).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("saves only when the two entries match, and the write contains the hash, not the PIN", async () => {
    const user = userEvent.setup();
    renderSettings();
    await user.click(screen.getByRole("button", { name: "设置家长 PIN" }));
    await user.type(screen.getByLabelText("新 PIN"), pin);
    await user.type(screen.getByLabelText("再输入一次"), "0000");
    expect(screen.getByRole("button", { name: "保存" })).toHaveProperty("disabled", true);
    expect(h.update).not.toHaveBeenCalled();

    await user.clear(screen.getByLabelText("再输入一次"));
    await user.type(screen.getByLabelText("再输入一次"), pin);
    await user.click(screen.getByRole("button", { name: "保存" }));
    expect(h.update).toHaveBeenCalledTimes(1);
    const patch = h.update.mock.calls[0]?.[2] as { parentPinHash: string; parentPinSalt: string };
    expect(JSON.stringify(patch)).not.toContain(pin);
    expect(patch.parentPinHash).toBe(await hashParentPin(patch.parentPinSalt, pin));
    expect(screen.getByText("已保存")).toBeTruthy();
  });

  it("a wrong current PIN does not replace the stored hash", async () => {
    h.settings = { ...h.settings, ...(await storedPin()) };
    const user = userEvent.setup();
    renderSettings();
    await user.click(screen.getByRole("button", { name: "修改 PIN" }));
    await user.type(screen.getByLabelText("当前 PIN"), "0000");
    await user.type(screen.getByLabelText("新 PIN"), "2468");
    await user.type(screen.getByLabelText("再输入一次"), "2468");
    await user.click(screen.getByRole("button", { name: "保存" }));
    expect(h.update).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain("PIN 不正确");
  });

  it("holds the password email and the plan action until the PIN matches, then keeps the session unlocked", async () => {
    registered();
    h.settings = { ...h.settings, ...(await storedPin()) };
    const user = userEvent.setup();
    renderSettings();
    expect(screen.queryByText(/建议设置一个/)).toBeNull();

    await user.click(screen.getByRole("button", { name: "修改密码" }));
    expect(h.reset).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog");
    await user.type(within(dialog).getByLabelText("家长 PIN"), "0000");
    await user.click(within(dialog).getByRole("button", { name: "验证" }));
    expect(h.reset).not.toHaveBeenCalled();
    expect(within(dialog).getByRole("alert").textContent).toContain("PIN 不正确");

    await user.click(within(dialog).getByRole("button", { name: "取消" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(h.reset).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "开通" }));
    expect(screen.queryByText(/这一步不会改你的套餐状态/)).toBeNull();
    await user.type(within(screen.getByRole("dialog")).getByLabelText("家长 PIN"), pin);
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "验证" }));
    expect(screen.getByText(/这一步不会改你的套餐状态/)).toBeTruthy();
    expect(h.update).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "修改密码" }));
    expect(h.reset).toHaveBeenCalledExactlyOnceWith(h.authClient, "person@example.com");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("the PRO card's change action is the same gate and still does not write isPro", async () => {
    h.settings = { ...h.settings, isPro: true, ...(await storedPin()) };
    const user = userEvent.setup();
    renderSettings();
    await user.click(screen.getByRole("button", { name: "变更" }));
    expect(h.update).not.toHaveBeenCalled();
    expect(screen.queryByText(/这一步不会改你的套餐状态/)).toBeNull();
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "取消" }));
    expect(screen.queryByText(/这一步不会改你的套餐状态/)).toBeNull();
  });
});
