import { createTranslator, type Resources } from "./translator";

/**
 * Text of the task-history page. Archived task names are user data and stay as stored.
 */
const zh = {
  "training.history.title": "历史",
  "training.history.month.previous": "上个月",
  "training.history.month.next": "下个月",
  "training.history.legend": "圆点是有归档的日子，焰橙色是全勤日。",
  "training.history.weekday.mon": "一",
  "training.history.weekday.tue": "二",
  "training.history.weekday.wed": "三",
  "training.history.weekday.thu": "四",
  "training.history.weekday.fri": "五",
  "training.history.weekday.sat": "六",
  "training.history.weekday.sun": "日",
  "training.history.day.button": "{date}{marks}",
  "training.history.mark.today": "，今天",
  "training.history.mark.archived": "，有归档",
  "training.history.mark.full": "，全勤",
  "training.history.summary": "完成 {done}/{total}",
  "training.history.empty": "这一天没有归档的任务。",
  "training.history.task.done": "已完成",
  "training.history.task.open": "未完成",
  "training.history.delete": "删除这天的记录",
  "training.history.delete.confirm": "删除后不可恢复。积分与连续天数是已发放的账本，不受影响，也不会重算。",
  "training.history.delete.busy": "正在删除…",
  "training.history.delete.failed": "没能删除这一天的记录。",
  "training.history.loading": "正在读取这个月的记录。",
  "training.history.error": "这次没有读出这个月的记录。",
  "training.history.retry": "重试",
  "training.history.signedOut": "登录后才能看任务历史。",
  "training.history.unavailable": "数据服务暂时不可用。",
} as const;

type HistoryMessageKey = keyof typeof zh;

const en: Record<HistoryMessageKey, string> = {
  "training.history.title": "History",
  "training.history.month.previous": "Previous month",
  "training.history.month.next": "Next month",
  "training.history.legend": "A dot marks an archived day. Flame marks full attendance.",
  "training.history.weekday.mon": "Mon",
  "training.history.weekday.tue": "Tue",
  "training.history.weekday.wed": "Wed",
  "training.history.weekday.thu": "Thu",
  "training.history.weekday.fri": "Fri",
  "training.history.weekday.sat": "Sat",
  "training.history.weekday.sun": "Sun",
  "training.history.day.button": "{date}{marks}",
  "training.history.mark.today": ", today",
  "training.history.mark.archived": ", archived",
  "training.history.mark.full": ", full attendance",
  "training.history.summary": "{done}/{total} done",
  "training.history.empty": "This day has no archived tasks.",
  "training.history.task.done": "Done",
  "training.history.task.open": "Not done",
  "training.history.delete": "Delete this day's record",
  "training.history.delete.confirm":
    "This cannot be undone. Points and the streak are a ledger that was already issued. They are unaffected and are not recalculated.",
  "training.history.delete.busy": "Deleting…",
  "training.history.delete.failed": "This day's record could not be deleted.",
  "training.history.loading": "Reading this month's records.",
  "training.history.error": "This month's records could not be read.",
  "training.history.retry": "Retry",
  "training.history.signedOut": "Sign in to see task history.",
  "training.history.unavailable": "The data service is unavailable.",
};

export const historyResources: Resources<HistoryMessageKey> = { zh, en };

export const tTrainingHistory = createTranslator(historyResources);

export type { HistoryMessageKey };
