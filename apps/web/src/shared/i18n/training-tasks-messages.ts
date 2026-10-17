import { createTranslator, type Resources } from "./translator";

/**
 * Text of the Today's tasks page. The task text, description, target and tags are typed by the
 * user (or come from the Academy plan), so they are never in here: they are shown as stored.
 */
const zh = {
  "trainingTasks.title": "今日任务",
  "trainingTasks.loading": "正在加载任务…",
  "trainingTasks.summary": "已完成 {done} / {total}",

  "trainingTasks.bonus.applied": "每日奖励 +{points} 积分！",
  "trainingTasks.bonus.removed": "每日奖励已撤销。",

  "trainingTasks.rules.title": "积分规则",
  "trainingTasks.rules.perTask": "每完成一项任务 +{points} 积分",
  "trainingTasks.rules.dailyBonus": "全部完成后额外 +{points} 积分",
  "trainingTasks.rules.balance": "当前余额：{balance} 积分",

  "trainingTasks.add.title": "添加任务",
  "trainingTasks.add.task": "任务",
  "trainingTasks.add.taskPlaceholder": "例如：500m 间歇跑",
  "trainingTasks.add.target": "目标（选填）",
  "trainingTasks.add.targetPlaceholder": "例如：3 组",
  "trainingTasks.add.submit": "添加任务",
  "trainingTasks.add.saving": "保存中…",

  "trainingTasks.list.title": "任务清单",
  "trainingTasks.list.loading": "加载中…",
  "trainingTasks.list.empty": "今天还没有任务。请在上方添加。",
  "trainingTasks.list.academyBadge": "学院",
  "trainingTasks.list.complete": "完成：{task}",
  "trainingTasks.list.delete": "删除",
  "trainingTasks.list.deleteConfirm": "删除任务「{task}」？",
  "trainingTasks.error.notSignedIn": "登录状态还没准备好，请稍后再试。",
  "trainingTasks.error.unavailable": "数据服务暂时不可用，请稍后再试。",
  "trainingTasks.error.actionFailed": "任务操作失败。",
} as const;

type TrainingTasksKey = keyof typeof zh;

const en: Record<TrainingTasksKey, string> = {
  "trainingTasks.title": "Today's tasks",
  "trainingTasks.loading": "Loading tasks…",
  "trainingTasks.summary": "{done} of {total} completed",

  "trainingTasks.bonus.applied": "Daily bonus +{points} points!",
  "trainingTasks.bonus.removed": "Daily bonus removed.",

  "trainingTasks.rules.title": "Points rules",
  "trainingTasks.rules.perTask": "+{points} points per completed task",
  "trainingTasks.rules.dailyBonus": "+{points} daily bonus when all tasks are done",
  "trainingTasks.rules.balance": "Current balance: {balance} points",

  "trainingTasks.add.title": "Add task",
  "trainingTasks.add.task": "Task",
  "trainingTasks.add.taskPlaceholder": "e.g. 500m intervals",
  "trainingTasks.add.target": "Target (optional)",
  "trainingTasks.add.targetPlaceholder": "e.g. 3 sets",
  "trainingTasks.add.submit": "Add task",
  "trainingTasks.add.saving": "Saving…",

  "trainingTasks.list.title": "Task list",
  "trainingTasks.list.loading": "Loading…",
  "trainingTasks.list.empty": "No tasks for today. Add one above.",
  "trainingTasks.list.academyBadge": "Academy",
  "trainingTasks.list.complete": "Complete {task}",
  "trainingTasks.list.delete": "Delete",
  "trainingTasks.list.deleteConfirm": "Delete task \"{task}\"?",
  "trainingTasks.error.notSignedIn": "Sign-in is not ready yet. Try again in a moment.",
  "trainingTasks.error.unavailable": "Firestore is not available right now. Try again later.",
  "trainingTasks.error.actionFailed": "Training action failed.",
};

export type TrainingTasksMessageKey = TrainingTasksKey;

export const trainingTasksResources: Resources<TrainingTasksKey> = { zh, en };

export const tTrainingTasks = createTranslator(trainingTasksResources);
