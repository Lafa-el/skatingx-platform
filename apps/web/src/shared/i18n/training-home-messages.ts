import { createTranslator, type Resources } from "./translator";

/**
 * Text of the Training home page. English is what the page said before. Where the English had
 * a number glued to a unit ("1 days"), singular and plural are separate keys: the page picks
 * one by count, because a placeholder cannot choose a word.
 */
const zh = {
  "trainingHome.title": "训练",
  // Chinese says 数据服务 for parents and athletes; English keeps the product name Firestore
  // (owner decision 2026-10-16, ADR-004 glossary).
  "trainingHome.subtitle": "每日任务、学院、纪录和商店——任务数据已实时保存在数据服务中。",

  "trainingHome.card.athlete": "运动员",
  "trainingHome.card.points": "积分",
  "trainingHome.card.streak": "连续天数",
  "trainingHome.card.tasks": "今日任务",
  "trainingHome.card.records": "纪录",
  "trainingHome.card.shop": "商店 / 奖励",
  "trainingHome.card.academy": "学院",

  "trainingHome.streak.one": "{count} 天",
  "trainingHome.streak.other": "{count} 天",
  "trainingHome.tasks.open": "打开任务清单 →",
  "trainingHome.records.entries.one": "{count} 条纪录",
  "trainingHome.records.entries.other": "{count} 条纪录",
  "trainingHome.records.pb": "500m 个人最好 {time}",
  "trainingHome.records.noPb": "还没有 500m 个人最好成绩",
  "trainingHome.records.open": "打开纪录 →",
  "trainingHome.shop.points.one": "{count} 积分",
  "trainingHome.shop.points.other": "{count} 积分",
  "trainingHome.shop.pro": "PRO 已开启 · 目录奖励 + 自定义奖励（占位）",
  "trainingHome.shop.free": "免费版 · 仅目录奖励",
  "trainingHome.shop.open": "打开商店 →",
  "trainingHome.academy.reference": "参考阶段：{stage}（{ageRange}）",
  "trainingHome.academy.import": "从 BLAZE Academy 导入陆地训练。",
  "trainingHome.academy.open": "打开学院 →",

  "trainingHome.shortcut.tasks.title": "任务",
  "trainingHome.shortcut.tasks.body": "添加并完成今天的清单",
  "trainingHome.shortcut.academy.title": "学院",
  "trainingHome.shortcut.academy.body": "{stage} · 陆地训练计划",
  "trainingHome.shortcut.academy.fallback": "BLAZE Academy",
  "trainingHome.shortcut.records.title": "纪录",
  "trainingHome.shortcut.records.body": "各距离的个人最好成绩",
  "trainingHome.shortcut.shop.title": "商店",
  "trainingHome.shortcut.shop.body.one": "可用 {count} 积分",
  "trainingHome.shortcut.shop.body.other": "可用 {count} 积分",
} as const;

type TrainingHomeKey = keyof typeof zh;

const en: Record<TrainingHomeKey, string> = {
  "trainingHome.title": "Training",
  "trainingHome.subtitle": "Daily tasks, academy, records, and shop — tasks are live on Firestore.",

  "trainingHome.card.athlete": "Athlete",
  "trainingHome.card.points": "Points",
  "trainingHome.card.streak": "Streak",
  "trainingHome.card.tasks": "Today's tasks",
  "trainingHome.card.records": "Records",
  "trainingHome.card.shop": "Shop / Rewards",
  "trainingHome.card.academy": "Academy",

  "trainingHome.streak.one": "{count} day",
  "trainingHome.streak.other": "{count} days",
  "trainingHome.tasks.open": "Open task list →",
  "trainingHome.records.entries.one": "{count} entry",
  "trainingHome.records.entries.other": "{count} entries",
  "trainingHome.records.pb": "500m PB {time}",
  "trainingHome.records.noPb": "No 500m PB yet",
  "trainingHome.records.open": "Open records →",
  "trainingHome.shop.points.one": "{count} point",
  "trainingHome.shop.points.other": "{count} points",
  "trainingHome.shop.pro": "PRO active · catalog + custom rewards (placeholder)",
  "trainingHome.shop.free": "Free plan · catalog rewards only",
  "trainingHome.shop.open": "Open shop →",
  "trainingHome.academy.reference": "Reference stage: {stage} ({ageRange})",
  "trainingHome.academy.import": "Import dryland training from BLAZE Academy.",
  "trainingHome.academy.open": "Open academy →",

  "trainingHome.shortcut.tasks.title": "Tasks",
  "trainingHome.shortcut.tasks.body": "Add and complete today's list",
  "trainingHome.shortcut.academy.title": "Academy",
  "trainingHome.shortcut.academy.body": "{stage} · dryland plans",
  "trainingHome.shortcut.academy.fallback": "BLAZE Academy",
  "trainingHome.shortcut.records.title": "Records",
  "trainingHome.shortcut.records.body": "PB times by distance",
  "trainingHome.shortcut.shop.title": "Shop",
  "trainingHome.shortcut.shop.body.one": "{count} point available",
  "trainingHome.shortcut.shop.body.other": "{count} points available",
};

export type TrainingHomeMessageKey = TrainingHomeKey;

export const trainingHomeResources: Resources<TrainingHomeKey> = { zh, en };

export const tTrainingHome = createTranslator(trainingHomeResources);
