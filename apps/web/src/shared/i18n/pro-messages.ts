import { createTranslator, type Resources } from "./translator";

/**
 * Text of the PRO plan banner and the PRO-locked card, shared by the Academy and the Shop. The
 * wording is what these components said before, in both languages. Both still point to the PRO
 * switch in Settings, which exists for development and is kept until the Buffalo trip is over.
 */
const zh = {
  "pro.banner.active.title": "PRO 已开启",
  "pro.banner.active.body": "高阶计划导入与 PRO 专区已解锁（开发开关）。",
  "pro.banner.free.title": "免费版",
  "pro.banner.free.body": "可浏览学院内容与兑换默认奖励。在设置中开启 PRO（开发）以使用高阶导入。",
  "pro.banner.free.settings": "打开设置",
  "pro.locked.title": "需要 PRO",
  "pro.locked.settings": "在设置中开启 PRO（开发）",
} as const;

type ProKey = keyof typeof zh;

const en: Record<ProKey, string> = {
  "pro.banner.active.title": "PRO active",
  "pro.banner.active.body":
    "Advanced routine import and PRO-only sections are unlocked (development flag).",
  "pro.banner.free.title": "Free plan",
  "pro.banner.free.body":
    "Browse Academy content and redeem catalog rewards. Enable PRO in Settings (dev) for advanced imports.",
  "pro.banner.free.settings": "Open Settings",
  "pro.locked.title": "PRO required",
  "pro.locked.settings": "Enable PRO in Settings (dev)",
};

export type ProMessageKey = ProKey;

export const proResources: Resources<ProKey> = { zh, en };

export const tPro = createTranslator(proResources);
