import { getAuthErrorMessage } from "@skatingx/firebase-client";
import { describe, expect, it } from "vitest";

import { authErrorCode, formatAuthError, tAuth, toAuthErrorNote } from "./auth-messages";
import { tSettingsPage } from "./settings-page-messages";

const sdkError = (code: string, message = `Firebase: Error (${code}).`) =>
  Object.assign(new Error(message), { code });

const KNOWN_CODES = [
  "auth/email-already-in-use",
  "auth/credential-already-in-use",
  "auth/invalid-email",
  "auth/weak-password",
  "auth/wrong-password",
  "auth/invalid-credential",
  "auth/user-not-found",
  "auth/too-many-requests",
  "auth/network-request-failed",
  "auth/operation-not-allowed",
];

describe("English is exactly what getAuthErrorMessage has always said", () => {
  it.each(KNOWN_CODES)("%s", (code) => {
    const error = sdkError(code);
    expect(formatAuthError(toAuthErrorNote(error), "en")).toBe(getAuthErrorMessage(error));
  });

  it("an unknown code, a plain error, and things that are not errors", () => {
    const cases: unknown[] = [
      sdkError("auth/quota-exceeded", "Firebase: Error (auth/quota-exceeded)."),
      new Error("No signed-in user to link."),
      new Error(""),
      { code: "auth/invalid-email" },
      { code: 42 },
      "boom",
      null,
      undefined,
    ];
    for (const error of cases) {
      expect(formatAuthError(toAuthErrorNote(error), "en"), JSON.stringify(error)).toBe(
        getAuthErrorMessage(error),
      );
    }
  });

  it("the two setup messages are the ones the providers used to write", () => {
    expect(tAuth("en", "auth.error.notConfigured")).toBe("Firebase is not configured.");
    expect(tAuth("en", "auth.error.notConfiguredSetup")).toBe(
      "Firebase is not configured. Copy .env.example to apps/web/.env.local and set VITE_FIREBASE_* values.",
    );
  });
});

describe("Chinese", () => {
  const ZH: Record<string, string> = {
    "auth/email-already-in-use": "这个邮箱已经注册过了。请使用下方的「登录已有账户」表单登录。",
    "auth/credential-already-in-use": "这个邮箱已经注册过了。请使用下方的「登录已有账户」表单登录。",
    "auth/invalid-email": "邮箱地址无效。",
    "auth/weak-password": "密码至少需要 6 个字符。",
    "auth/wrong-password": "邮箱或密码不正确。",
    "auth/invalid-credential": "邮箱或密码不正确。",
    "auth/user-not-found": "没有找到这个邮箱对应的账户。",
    "auth/too-many-requests": "尝试次数过多，请稍后再试。",
    "auth/network-request-failed": "网络错误，请检查网络连接。",
    "auth/operation-not-allowed": "这个 Firebase 项目没有开启邮箱和密码登录。",
  };

  it.each(KNOWN_CODES)("%s", (code) => {
    expect(formatAuthError(toAuthErrorNote(sdkError(code)), "zh")).toBe(ZH[code]);
  });

  it("points to the sign-in card by the title that card has", () => {
    expect(tAuth("zh", "auth.error.emailInUse")).toContain(`「${tSettingsPage("zh", "settings.signIn.title")}」`);
  });

  it("the fallback and the setup messages are in Chinese", () => {
    expect(formatAuthError(toAuthErrorNote("boom"), "zh")).toBe("身份验证失败。");
    expect(tAuth("zh", "auth.error.notConfigured")).toBe("Firebase 尚未配置。");
    expect(tAuth("zh", "auth.error.notConfiguredSetup")).toBe(
      "Firebase 尚未配置。请把 .env.example 复制为 apps/web/.env.local，并填写 VITE_FIREBASE_* 变量。",
    );
  });
});

describe("what is not translated", () => {
  it("an unknown code or a plain error is kept as received, in either language", () => {
    for (const locale of ["zh", "en"] as const) {
      expect(formatAuthError(toAuthErrorNote(sdkError("auth/quota-exceeded", "quota text")), locale)).toBe(
        "quota text",
      );
      expect(formatAuthError(toAuthErrorNote(new Error("No signed-in user to link.")), locale)).toBe(
        "No signed-in user to link.",
      );
    }
  });

  it("a code on something that is not an Error gets the general message, not a guess", () => {
    expect(toAuthErrorNote({ code: "auth/quota-exceeded" })).toEqual({ key: "auth.error.failed" });
  });

  it("names that exist on every object are not error codes", () => {
    for (const code of ["constructor", "toString", "__proto__", "hasOwnProperty"]) {
      expect(toAuthErrorNote(sdkError(code, "own text"))).toEqual({ received: "own text" });
    }
  });

  it("only the code string is read from an error", () => {
    expect(authErrorCode(sdkError("auth/invalid-email"))).toBe("auth/invalid-email");
    expect(authErrorCode({ code: 1 })).toBeNull();
    expect(authErrorCode("auth/invalid-email")).toBeNull();
    expect(authErrorCode(null)).toBeNull();
  });
});

describe("a message follows the language", () => {
  it("the same note is written in each language it is read in", () => {
    const note = toAuthErrorNote(sdkError("auth/wrong-password"));
    expect(formatAuthError(note, "zh")).toBe("邮箱或密码不正确。");
    expect(formatAuthError(note, "en")).toBe("Incorrect email or password.");
  });
});
