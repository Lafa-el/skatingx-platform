import { createTranslator, type Resources } from "./translator";

/**
 * Text that is only about the Academy and Shop surfaces. Plan status and how PRO is turned on
 * live in `settings.plan.*` so this file does not keep a second wording.
 */
const zh = {
  "pro.banner.active.body": "高阶计划导入与 PRO 专区已解锁。",
  "pro.banner.free.body": "可浏览学院内容与兑换默认奖励。",
  "pro.locked.title": "需要 PRO",
} as const;

type ProKey = keyof typeof zh;

const en: Record<ProKey, string> = {
  "pro.banner.active.body": "Advanced routine import and PRO-only sections are unlocked.",
  "pro.banner.free.body": "Browse Academy content and redeem catalog rewards.",
  "pro.locked.title": "PRO required",
};

export type ProMessageKey = ProKey;

export const proResources: Resources<ProKey> = { zh, en };

export const tPro = createTranslator(proResources);
