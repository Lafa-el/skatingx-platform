import { createTranslator, type Locale, type Resources } from "./translator";

/**
 * Text for sign-in, account-linking and "Firebase is not set up" problems. The English column is
 * the wording `getAuthErrorMessage` (packages/firebase-client) has always returned; a test compares
 * the two so they cannot drift. The identity layer itself is untouched: it still throws SDK
 * errors, and this file only decides what the user reads for each error code.
 */
const zh = {
  "auth.error.emailInUse": "这个邮箱已经注册过了。请使用下方的「登录已有账户」表单登录。",
  "auth.error.invalidEmail": "邮箱地址无效。",
  "auth.error.weakPassword": "密码至少需要 6 个字符。",
  "auth.error.wrongCredential": "邮箱或密码不正确。",
  "auth.error.userNotFound": "没有找到这个邮箱对应的账户。",
  "auth.error.tooManyRequests": "尝试次数过多，请稍后再试。",
  "auth.error.network": "网络错误，请检查网络连接。",
  "auth.error.operationNotAllowed": "这个 Firebase 项目没有开启邮箱和密码登录。",
  "auth.error.failed": "身份验证失败。",
  "auth.error.notConfigured": "Firebase 尚未配置。",
  "auth.error.notConfiguredSetup":
    "Firebase 尚未配置。请把 .env.example 复制为 apps/web/.env.local，并填写 VITE_FIREBASE_* 变量。",
} as const;

type AuthKey = keyof typeof zh;

const en: Record<AuthKey, string> = {
  "auth.error.emailInUse":
    "This email is already registered. Use the existing account sign-in form below.",
  "auth.error.invalidEmail": "Invalid email address.",
  "auth.error.weakPassword": "Password must be at least 6 characters.",
  "auth.error.wrongCredential": "Incorrect email or password.",
  "auth.error.userNotFound": "No account found for this email.",
  "auth.error.tooManyRequests": "Too many attempts. Try again later.",
  "auth.error.network": "Network error. Check your connection.",
  "auth.error.operationNotAllowed":
    "Email/password sign-in is not enabled for this Firebase project.",
  "auth.error.failed": "Authentication failed.",
  "auth.error.notConfigured": "Firebase is not configured.",
  "auth.error.notConfiguredSetup":
    "Firebase is not configured. Copy .env.example to apps/web/.env.local and set VITE_FIREBASE_* values.",
};

export type AuthMessageKey = AuthKey;

export const authResources: Resources<AuthKey> = { zh, en };

export const tAuth = createTranslator(authResources);

/**
 * What the user is told about a sign-in problem. It keeps what happened, not the sentence, so the
 * message follows the language if that changes while it is shown. A message that did not come from
 * a known error code is kept as received.
 */
export type AuthErrorNote = { key: AuthMessageKey } | { received: string };

/** Firebase Auth error codes that have a message, mapped to it (same grouping as before). */
const CODE_KEYS: Readonly<Record<string, AuthMessageKey>> = {
  "auth/email-already-in-use": "auth.error.emailInUse",
  "auth/credential-already-in-use": "auth.error.emailInUse",
  "auth/invalid-email": "auth.error.invalidEmail",
  "auth/weak-password": "auth.error.weakPassword",
  "auth/wrong-password": "auth.error.wrongCredential",
  "auth/invalid-credential": "auth.error.wrongCredential",
  "auth/user-not-found": "auth.error.userNotFound",
  "auth/too-many-requests": "auth.error.tooManyRequests",
  "auth/network-request-failed": "auth.error.network",
  "auth/operation-not-allowed": "auth.error.operationNotAllowed",
};

/** The `code` string on an SDK error, or null. Nothing else on the error is read. */
export function authErrorCode(error: unknown): string | null {
  return error &&
    typeof error === "object" &&
    "code" in error &&
    typeof (error as { code: unknown }).code === "string"
    ? (error as { code: string }).code
    : null;
}

export function toAuthErrorNote(error: unknown): AuthErrorNote {
  const code = authErrorCode(error);
  if (code !== null && Object.hasOwn(CODE_KEYS, code)) {
    return { key: CODE_KEYS[code]! };
  }
  if (error instanceof Error && error.message) {
    return { received: error.message };
  }
  return { key: "auth.error.failed" };
}

export function formatAuthError(note: AuthErrorNote, locale: Locale): string {
  return "received" in note ? note.received : tAuth(locale, note.key);
}
