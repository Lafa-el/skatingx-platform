import { createTranslator, type Resources } from "./translator";

/** Text of the Dashboard page. Keys are named by domain; `en` is typed against `zh`. */
const zh = {
  "dashboard.title": "总览",
  "dashboard.loading": "正在加载总览…",
  "dashboard.welcome": "欢迎回来，{name}",

  "dashboard.card.athlete": "运动员",
  "dashboard.card.points": "积分",
  "dashboard.card.streak": "连续天数",
  "dashboard.card.tasks": "今日任务",
  "dashboard.card.pb500": "500m 个人最好",
  "dashboard.card.pbFastestLap": "最快单圈个人最好",
  "dashboard.card.plan": "方案",
  "dashboard.card.redemption": "最近兑换",
  "dashboard.card.record": "最近纪录",

  "dashboard.tasks.hint": "已完成 / 总数",
  "dashboard.streak.one": "{count} 天",
  "dashboard.streak.other": "{count} 天",
  "dashboard.plan.pro": "PRO 已开通",
  "dashboard.plan.free": "免费版",
  "dashboard.redemption.cost": "−{cost} 积分 · {date}",
  "dashboard.redemption.none": "还没有兑换记录",
  "dashboard.record.none": "还没有纪录",

  "dashboard.shortcut.open": "打开 →",
  "dashboard.shortcut.training.title": "今日训练",
  "dashboard.shortcut.training.body": "查看并完成今天的任务清单。",
  "dashboard.shortcut.analysis.title": "最新分析",
  "dashboard.shortcut.analysis.body": "动作分析、配速和装备分析。",
  "dashboard.shortcut.athlete.title": "运动员档案",
  "dashboard.shortcut.athlete.body": "档案、组别和头像设置。",
  "dashboard.shortcut.aiCoach.title": "AI 教练建议",
  "dashboard.shortcut.aiCoach.body": "根据你的数据给出个性化的训练建议。",
} as const;

type DashboardKey = keyof typeof zh;

const en: Record<DashboardKey, string> = {
  "dashboard.title": "Dashboard",
  "dashboard.loading": "Loading your dashboard…",
  "dashboard.welcome": "Welcome back, {name}",

  "dashboard.card.athlete": "Athlete",
  "dashboard.card.points": "Points",
  "dashboard.card.streak": "Streak",
  "dashboard.card.tasks": "Today's tasks",
  "dashboard.card.pb500": "500m PB",
  "dashboard.card.pbFastestLap": "Fastest lap PB",
  "dashboard.card.plan": "Plan",
  "dashboard.card.redemption": "Latest redemption",
  "dashboard.card.record": "Latest record",

  "dashboard.tasks.hint": "completed / total",
  "dashboard.streak.one": "{count} day",
  "dashboard.streak.other": "{count} days",
  "dashboard.plan.pro": "PRO active",
  "dashboard.plan.free": "Free plan",
  "dashboard.redemption.cost": "−{cost} pts · {date}",
  "dashboard.redemption.none": "No redemptions yet",
  "dashboard.record.none": "No entries yet",

  "dashboard.shortcut.open": "Open →",
  "dashboard.shortcut.training.title": "Today's Training",
  "dashboard.shortcut.training.body": "View and complete today's task list.",
  "dashboard.shortcut.analysis.title": "Latest Analysis",
  "dashboard.shortcut.analysis.body": "Biomechanics, pacing, and equipment insights.",
  "dashboard.shortcut.athlete.title": "Athlete Profile",
  "dashboard.shortcut.athlete.body": "Profile, division, and avatar settings.",
  "dashboard.shortcut.aiCoach.title": "AI Coach Recommendation",
  "dashboard.shortcut.aiCoach.body": "Personalized coaching suggestions from your data.",
};

export type DashboardMessageKey = DashboardKey;

export const dashboardResources: Resources<DashboardKey> = { zh, en };

export const tDashboard = createTranslator(dashboardResources);
