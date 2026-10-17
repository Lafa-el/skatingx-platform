import { createTranslator, type Resources } from "./translator";

/**
 * Text of the reward shop page and of the messages its hooks show. The Chinese is what the page
 * already said; the English column is unchanged except the plural fix noted below. Chinese says
 * 数据服务 for parents and athletes; English keeps the product name Firestore (owner decision
 * 2026-10-16, ADR-004 glossary).
 */
const zh = {
  "shop.page.title": "奖励商店",
  "shop.page.subtitle": "目录奖励始终可兑换。自定义奖励需要 PRO。",
  "shop.points.title": "当前积分",
  "shop.catalog.title": "目录奖励",
  "shop.catalog.loading": "加载中…",
  "shop.catalog.empty": "暂无奖励商品。",
  "shop.reward.cost": "{cost} 分",
  "shop.reward.redeem": "兑换",
  "shop.reward.redeeming": "兑换中…",
  "shop.reward.notEnough": "积分不足",
  "shop.confirm.one": "使用 {cost} 积分兑换「{name}」？",
  "shop.confirm.other": "使用 {cost} 积分兑换「{name}」？",
  "shop.success": "兑换成功！快去享受【{name}】吧！",
  "shop.custom.title": "自定义奖励",
  "shop.custom.proTag": "PRO",
  "shop.custom.cardTitle": "PRO — 自定义奖励",
  "shop.custom.active": "PRO 已开启",
  "shop.custom.placeholder": "自定义奖励管理为 M6 占位功能，完整增删改将在支付与家长功能上线后提供。",
  "shop.custom.locked": "开启 PRO 后可创建并管理运动员专属自定义奖励。",
  "shop.history.title": "兑换记录",
  "shop.history.empty": "还没有兑换记录。",
  "shop.history.line": "{date} · −{cost} 分",
  "shop.error.unavailable": "数据服务暂时不可用，请稍后再试。",
  "shop.error.catalogFailed": "初始化奖励目录失败。",
  "shop.error.redeemFailed": "兑换失败。",
} as const;

type ShopKey = keyof typeof zh;

const en: Record<ShopKey, string> = {
  "shop.page.title": "Reward shop",
  "shop.page.subtitle": "Catalog rewards are always available. Custom rewards require PRO.",
  "shop.points.title": "Your points",
  "shop.catalog.title": "Catalog rewards",
  "shop.catalog.loading": "Loading…",
  "shop.catalog.empty": "No rewards in catalog yet.",
  "shop.reward.cost": "{cost} pts",
  "shop.reward.redeem": "Redeem",
  "shop.reward.redeeming": "Redeeming…",
  "shop.reward.notEnough": "Not enough points",
  // The earlier text said "for 1 points"; the singular form fixes that.
  "shop.confirm.one": "Redeem \"{name}\" for {cost} point?",
  "shop.confirm.other": "Redeem \"{name}\" for {cost} points?",
  "shop.success": "Redeemed successfully! Enjoy your {name}.",
  "shop.custom.title": "Custom rewards",
  "shop.custom.proTag": "PRO",
  "shop.custom.cardTitle": "PRO — custom rewards",
  "shop.custom.active": "PRO active",
  "shop.custom.placeholder":
    "Custom reward management is a placeholder in M6. Full add/edit UI ships with payment and parent tools later.",
  "shop.custom.locked": "Unlock PRO to create and manage custom rewards for your athlete.",
  "shop.history.title": "Redemption history",
  "shop.history.empty": "No redemptions yet.",
  "shop.history.line": "{date} · −{cost} pts",
  "shop.error.unavailable": "Firestore is not available.",
  "shop.error.catalogFailed": "Failed to initialize rewards catalog.",
  "shop.error.redeemFailed": "Redemption failed.",
};

export type ShopMessageKey = ShopKey;

export const shopResources: Resources<ShopKey> = { zh, en };

export const tShop = createTranslator(shopResources);
