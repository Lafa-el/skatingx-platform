import { createTranslator, type Resources } from "./translator";

/**
 * Text of the Settings page: account, Pro toggle, parent settings and the sign-in forms. The
 * language setting has its own resource (`settings-messages.ts`).
 *
 * Messages that arrive from the authentication or data layer (for example "Incorrect email or
 * password.") are not here; they are shown as received until those layers return codes instead of
 * sentences (ADR-004, follow-up).
 */
const zh = {
  "settings.page.title": "设置",
  "settings.page.intro": "账户与登录。个人资料和运动员数据同步将在后续阶段提供。",

  "settings.pro.title": "PRO 会员",
  "settings.pro.devNotice": "仅供开发使用。尚未接入支付。",
  "settings.pro.devHelp": "可在下方切换 PRO,用来测试学院和商店的付费限制界面。不会扣费,也不会验证订阅状态。",
  "settings.pro.status": "状态",
  "settings.pro.active": "PRO 已开通",
  "settings.pro.free": "免费版",
  "settings.pro.saving": "保存中…",
  "settings.pro.disable": "关闭 PRO(开发用)",
  "settings.pro.enable": "开启 PRO(开发用)",
  "settings.pro.enabledMessage": "PRO 已开启(开发标记)。",
  "settings.pro.disabledMessage": "PRO 已关闭。",
  "settings.pro.updateFailed": "PRO 状态更新失败。",

  "settings.parent.title": "家长设置",
  // The sentence has a field name in the middle that is not translated, so it is two pieces around
  // a <code> element. The space before the field name is part of the first piece.
  "settings.parent.noteBefore": "家长 PIN 锁在 M6 中尚未实现。PIN 不会以明文保存。PIN 安全功能上线后,只会把哈希值保存在 ",
  "settings.parent.noteAfter": " 中。",

  "settings.account.title": "当前用户",
  "settings.account.status": "状态",
  "settings.account.uid": "UID",
  "settings.account.anonymous": "匿名",
  "settings.account.email": "邮箱",
  "settings.account.loading": "加载中…",
  "settings.account.notConfigured": "服务未配置",
  "settings.account.guest": "访客(匿名)",
  "settings.account.registered": "已注册用户",
  "settings.account.yes": "是",
  "settings.account.no": "否",
  "settings.account.guestUid": "访客 UID(前 8 位):{uid}",

  "settings.field.email": "邮箱",
  "settings.field.password": "密码",

  "settings.link.title": "绑定邮箱和密码",
  "settings.link.help": "把当前访客会话变成永久账户。密码至少 6 个字符。",
  "settings.link.submit": "绑定账户",
  "settings.link.busy": "绑定中…",

  "settings.signIn.title": "登录已有账户",
  "settings.signIn.help": "使用已注册的邮箱和密码登录。登录会替换当前会话(访客数据不会自动合并)。",
  "settings.signIn.submit": "登录",
  "settings.signIn.busy": "登录中…",

  "settings.signOut.button": "退出登录",
  "settings.signOut.confirm":
    "要退出登录吗?你会回到一个新的访客会话。除非你之前已经绑定账户,否则这台设备上未保存的访客数据不会转移到已注册账户。",
} as const;

type SettingsPageKey = keyof typeof zh;

const en: Record<SettingsPageKey, string> = {
  "settings.page.title": "Settings",
  "settings.page.intro": "Account and authentication. Profile and athlete data sync come in a later phase.",

  "settings.pro.title": "PRO membership",
  "settings.pro.devNotice": "Development only. Payment is not implemented.",
  "settings.pro.devHelp":
    "Toggle PRO below to test gated Academy and Shop UI. This does not charge real money or verify subscription status.",
  "settings.pro.status": "Status",
  "settings.pro.active": "PRO active",
  "settings.pro.free": "Free plan",
  "settings.pro.saving": "Saving…",
  "settings.pro.disable": "Disable PRO (dev)",
  "settings.pro.enable": "Enable PRO (dev)",
  "settings.pro.enabledMessage": "PRO enabled (development flag).",
  "settings.pro.disabledMessage": "PRO disabled.",
  "settings.pro.updateFailed": "Failed to update PRO status.",

  "settings.parent.title": "Parent settings",
  "settings.parent.noteBefore":
    "Parent PIN lock is not implemented in M6. PINs are not stored in plaintext. When PIN security ships, only a hash will be saved on ",
  "settings.parent.noteAfter": ".",

  "settings.account.title": "Current user",
  "settings.account.status": "Status",
  "settings.account.uid": "UID",
  "settings.account.anonymous": "Anonymous",
  "settings.account.email": "Email",
  "settings.account.loading": "Loading…",
  "settings.account.notConfigured": "Firebase not configured",
  "settings.account.guest": "Guest (anonymous)",
  "settings.account.registered": "Registered User",
  "settings.account.yes": "Yes",
  "settings.account.no": "No",
  "settings.account.guestUid": "Guest UID (first 8 chars): {uid}",

  "settings.field.email": "Email",
  "settings.field.password": "Password",

  "settings.link.title": "Link email & password",
  "settings.link.help": "Turn this guest session into a permanent account. Password must be at least 6 characters.",
  "settings.link.submit": "Link account",
  "settings.link.busy": "Linking…",

  "settings.signIn.title": "Sign in to existing account",
  "settings.signIn.help":
    "Use a registered email and password. Signing in replaces the current session (guest data is not merged automatically).",
  "settings.signIn.submit": "Sign in",
  "settings.signIn.busy": "Signing in…",

  "settings.signOut.button": "Sign out",
  "settings.signOut.confirm":
    "Sign out? You will return to a new guest session. Unsaved guest data on this device will not carry over to a registered account unless you linked first.",
};

export type SettingsPageMessageKey = SettingsPageKey;

export const settingsPageResources: Resources<SettingsPageKey> = { zh, en };

export const tSettingsPage = createTranslator(settingsPageResources);
