import { createTranslator, type Resources } from "./translator";

/**
 * Text of the Settings page: the four groups, account forms and parent note. The language
 * radios have their own resource (`settings-messages.ts`).
 *
 * English for the subscription group, password reset and athlete rows is a draft pending review.
 * Messages that arrive from the authentication layer are not here; they stay in `auth-messages.ts`.
 */
const zh = {
  "settings.page.title": "设置",
  "settings.page.intro": "账户与登录。个人资料和运动员数据同步将在后续阶段提供。",

  "settings.parent.title": "家长设置",
  // The sentence has a field name in the middle that is not translated, so it is two pieces around
  // a <code> element. The space before the field name is part of the first piece.
  "settings.parent.noteBefore": "家长 PIN 在账号分组里设置。保存下来的只有哈希，明文不会写入 ",
  "settings.parent.noteAfter": "。",

  "settings.account.title": "当前用户",
  "settings.account.status": "状态",
  "settings.account.uid": "UID",
  "settings.account.anonymous": "匿名",
  "settings.account.email": "邮箱",
  "settings.account.loading": "加载中…",
  "settings.account.notConfigured": "服务未配置",
  "settings.account.guest": "访客（匿名）",
  "settings.account.registered": "已注册用户",
  "settings.account.yes": "是",
  "settings.account.no": "否",
  "settings.account.guestUid": "访客 UID（前 8 位）：{uid}",

  "settings.field.email": "邮箱",
  "settings.field.password": "密码",

  "settings.link.title": "绑定邮箱和密码",
  "settings.link.help": "把当前访客会话变成永久账户。密码至少 6 个字符。",
  "settings.link.submit": "绑定账户",
  "settings.link.busy": "绑定中…",

  "settings.signIn.title": "登录已有账户",
  "settings.signIn.help": "使用已注册的邮箱和密码登录。登录会替换当前会话（访客数据不会自动合并）。",
  "settings.signIn.confirmGuest":
    "要登录已有账户吗？登录会替换当前的访客会话：访客数据不会转移到登录后的账户，而且你无法再回到这个访客会话。",
  "settings.signIn.submit": "登录",
  "settings.signIn.busy": "登录中…",
  "settings.signIn.forgot": "忘记密码？",
  "settings.signIn.forgotNeedEmail": "请先填写邮箱，再点忘记密码",

  "settings.signOut.button": "退出登录",
  "settings.signOut.confirm":
    "要退出登录吗？你会回到一个新的访客会话。除非你之前已经绑定账户，否则这台设备上未保存的访客数据不会转移到已注册账户。",

  "settings.group.account": "账号",
  "settings.group.athlete": "运动员",
  "settings.group.plan": "订阅",
  "settings.group.preferences": "偏好",

  "settings.passwordReset.button": "修改密码",
  "settings.passwordReset.busy": "发送中…",
  "settings.passwordReset.sent": "重置邮件已发送",
  "settings.passwordReset.noEmail": "这个账户没有邮箱，发不了重置邮件。",

  "settings.pin.suggest": "还没有家长 PIN。建议设置一个，用来确认修改密码、删除运动员和订阅变更。未设置时这些操作不会被拦住。",
  "settings.pin.set": "设置家长 PIN",
  "settings.pin.change": "修改 PIN",
  "settings.pin.current": "当前 PIN",
  "settings.pin.next": "新 PIN",
  "settings.pin.again": "再输入一次",
  "settings.pin.save": "保存",
  "settings.pin.saving": "保存中…",
  "settings.pin.saved": "已保存",
  "settings.pin.mismatch": "两次输入不一致。",
  "settings.pin.invalid": "请输入 4 位数字。",
  "settings.pin.wrong": "PIN 不正确。请再试一次。",
  "settings.pin.saveFailed": "没能保存，请再试一次。",
  "settings.pin.dialogTitle": "请输入家长 PIN",
  "settings.pin.dialogHelp": "输入家长 PIN 后才会继续。这只是为了防止误触，不是账户的安全锁。",
  "settings.pin.dialogLabel": "家长 PIN",
  "settings.pin.cancel": "取消",
  "settings.pin.verify": "验证",

  "settings.athlete.name": "姓名",
  "settings.athlete.id": "运动员 ID",
  "settings.athlete.current": "当前",
  "settings.athlete.open": "运动员资料 ›",

  "settings.plan.preparing": "正在准备",
  "settings.plan.error": "暂时无法确认你的套餐状态",
  "settings.plan.retry": "重试",
  "settings.plan.proTag": "PRO",
  "settings.plan.proTitle": "PRO 已开通",
  "settings.plan.freeTag": "免费版",
  "settings.plan.benefits": "权益",
  "settings.plan.benefit.videos": "比赛日视频记录与总结卡",
  "settings.plan.benefit.analysis": "完整分析能力",
  "settings.plan.benefit.feedback": "分析生成训练建议",
  "settings.plan.price": "$19.99 / 月",
  "settings.plan.manual": "目前由管理员人工开通；在线订阅即将推出",
  "settings.plan.start": "开通",
  "settings.plan.change": "变更",
  "settings.plan.confirmed": "已核对。套餐仍由管理员处理，这一步不会改你的套餐状态。",

  "settings.footer.version": "版本 {version}",
} as const;

type SettingsPageKey = keyof typeof zh;

const en: Record<SettingsPageKey, string> = {
  "settings.page.title": "Settings",
  "settings.page.intro": "Account and authentication. Profile and athlete data sync come in a later phase.",

  "settings.parent.title": "Parent settings",
  "settings.parent.noteBefore":
    "The parent PIN is set in the Account group. Only a hash is stored, never the PIN itself, on ",
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
  "settings.signIn.confirmGuest":
    "Sign in to an existing account? Signing in replaces the current guest session: guest data will not be transferred to the account you sign in to, and you will not be able to return to this guest session.",
  "settings.signIn.submit": "Sign in",
  "settings.signIn.busy": "Signing in…",
  "settings.signIn.forgot": "Forgot password?",
  "settings.signIn.forgotNeedEmail": "Enter an email address first, then tap Forgot password.",

  "settings.signOut.button": "Sign out",
  "settings.signOut.confirm":
    "Sign out? You will return to a new guest session. Unsaved guest data on this device will not carry over to a registered account unless you linked first.",

  "settings.group.account": "Account",
  "settings.group.athlete": "Athlete",
  "settings.group.plan": "Subscription",
  "settings.group.preferences": "Preferences",

  "settings.passwordReset.button": "Change password",
  "settings.passwordReset.busy": "Sending…",
  "settings.passwordReset.sent": "Password reset email sent",
  "settings.passwordReset.noEmail": "This account has no email address, so a reset email cannot be sent.",

  "settings.pin.suggest":
    "No parent PIN yet. Set one to confirm password changes, athlete deletion and subscription changes. Until you set one, those actions are not held back.",
  "settings.pin.set": "Set parent PIN",
  "settings.pin.change": "Change PIN",
  "settings.pin.current": "Current PIN",
  "settings.pin.next": "New PIN",
  "settings.pin.again": "Enter it again",
  "settings.pin.save": "Save",
  "settings.pin.saving": "Saving…",
  "settings.pin.saved": "Saved",
  "settings.pin.mismatch": "The two entries do not match.",
  "settings.pin.invalid": "Enter 4 digits.",
  "settings.pin.wrong": "That PIN is not correct. Try again.",
  "settings.pin.saveFailed": "Could not save. Try again.",
  "settings.pin.dialogTitle": "Enter the parent PIN",
  "settings.pin.dialogHelp":
    "Enter the parent PIN to continue. This only prevents an accidental tap. It is not an account security lock.",
  "settings.pin.dialogLabel": "Parent PIN",
  "settings.pin.cancel": "Cancel",
  "settings.pin.verify": "Verify",

  "settings.athlete.name": "Name",
  "settings.athlete.id": "Athlete ID",
  "settings.athlete.current": "Current",
  "settings.athlete.open": "Athlete profile ›",

  "settings.plan.preparing": "Getting ready",
  "settings.plan.error": "We could not confirm your plan just now",
  "settings.plan.retry": "Try again",
  "settings.plan.proTag": "PRO",
  "settings.plan.proTitle": "PRO active",
  "settings.plan.freeTag": "Free plan",
  "settings.plan.benefits": "Included",
  "settings.plan.benefit.videos": "Race-day video records and the summary card",
  "settings.plan.benefit.analysis": "Full analysis",
  "settings.plan.benefit.feedback": "Training suggestions from analysis",
  "settings.plan.price": "$19.99 / month",
  "settings.plan.manual": "An administrator turns this on for now. Online subscription is coming.",
  "settings.plan.start": "Activate",
  "settings.plan.change": "Change",
  "settings.plan.confirmed": "Checked. An administrator still handles the plan. This step does not change it.",

  "settings.footer.version": "Version {version}",
};

export type SettingsPageMessageKey = SettingsPageKey;

export const settingsPageResources: Resources<SettingsPageKey> = { zh, en };

export const tSettingsPage = createTranslator(settingsPageResources);
