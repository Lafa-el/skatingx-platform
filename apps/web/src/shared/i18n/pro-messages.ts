import { createTranslator, type Resources } from "./translator";

/**
 * Text of the PRO plan banner and the PRO-locked card, shared by the Academy and the Shop. PRO is
 * opened for a trial account by an administrator in the Firebase console, so neither component
 * links anywhere: the Settings switch that used to do it was a development tool and is gone. The
 * flag is a UX gate, not an entitlement check (ADR-001).
 */
const zh = {
  "pro.banner.active.title": "PRO 已开启",
  "pro.banner.active.body": "高阶计划导入与 PRO 专区已解锁。",
  "pro.banner.free.title": "免费版",
  "pro.banner.free.body": "可浏览学院内容与兑换默认奖励。高阶导入目前只对试用账号开放。如需使用，请联系管理员开通。",
  "pro.locked.title": "需要 PRO",
  "pro.locked.contact": "目前只对试用账号开放。如需使用，请联系管理员开通。",
} as const;

type ProKey = keyof typeof zh;

const en: Record<ProKey, string> = {
  "pro.banner.active.title": "PRO active",
  "pro.banner.active.body":
    "Advanced routine import and PRO-only sections are unlocked.",
  "pro.banner.free.title": "Free plan",
  "pro.banner.free.body":
    "Browse Academy content and redeem catalog rewards. Advanced imports are only available to trial accounts for now. Contact your team admin to get access.",
  "pro.locked.title": "PRO required",
  "pro.locked.contact": "Only available to trial accounts for now. Contact your team admin to get access.",
};

export type ProMessageKey = ProKey;

export const proResources: Resources<ProKey> = { zh, en };

export const tPro = createTranslator(proResources);
