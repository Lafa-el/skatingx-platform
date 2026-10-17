import { createTranslator, type Locale, type Resources } from "./translator";

/**
 * Text of the personal-best records page and of the messages its hooks show. English was the only
 * language before; the English column keeps that wording, except the plural fix noted below.
 * Chinese says 数据服务 for parents and athletes; English keeps the product name Firestore
 * (owner decision 2026-10-16, ADR-004 glossary).
 */
const zh = {
  "records.page.title": "个人最好纪录",
  "records.page.subtitle": "按距离记录个人最好成绩。时间可输入秒数，或 M:SS.xx 格式。",
  "records.card.best": "个人最好时间",
  "records.card.latest": "最近时间",
  "records.card.none": "还没有纪录",
  "records.form.addTitle": "添加个人最好 / 纪录",
  "records.form.editTitle": "编辑纪录",
  "records.form.date": "日期",
  "records.form.time": "时间",
  "records.form.timePlaceholder": "49.8 或 0:49.80 或 1:44.23",
  "records.form.source": "来源",
  "records.form.note": "备注（可选）",
  "records.form.notePlaceholder": "例如：计时赛",
  "records.form.add": "添加纪录",
  "records.form.save": "保存修改",
  "records.form.saving": "保存中…",
  "records.form.cancel": "取消",
  "records.source.manual": "手动",
  "records.source.training": "训练",
  "records.source.race": "比赛",
  "records.list.title.one": "{label} — {count} 条纪录",
  "records.list.title.other": "{label} — {count} 条纪录",
  "records.list.loading": "正在加载纪录…",
  "records.list.empty": "{label} 还没有纪录。请先在上方添加第一个成绩。",
  "records.entry.pb": "个人最好",
  "records.entry.edit": "编辑",
  "records.entry.delete": "删除",
  "records.confirm.delete": "删除纪录 {time}？",
  "records.distance.startHalfLap": "起跑半圈",
  "records.distance.startLap": "起跑一圈",
  "records.distance.fastestLap": "最快单圈",
  "records.error.dateRequired": "请填写日期。",
  "records.error.timeRequired": "请填写时间。",
  "records.error.timeInvalid": "请输入有效的时间（例如 49.8、0:49.80、1:44.23）。",
  "records.error.notSignedIn": "登录状态还没准备好，请稍后再试。",
  "records.error.unavailable": "数据服务暂时不可用，请稍后再试。",
  "records.error.actionFailed": "保存纪录失败。",
  "records.error.loadFailed": "加载个人最好纪录失败。",
} as const;

type RecordsKey = keyof typeof zh;

const en: Record<RecordsKey, string> = {
  "records.page.title": "PB records",
  "records.page.subtitle": "Track personal bests by distance. Times support seconds or M:SS.xx.",
  "records.card.best": "Best time (PB)",
  "records.card.latest": "Latest time",
  "records.card.none": "No entries yet",
  "records.form.addTitle": "Add PB / record",
  "records.form.editTitle": "Edit record",
  "records.form.date": "Date",
  "records.form.time": "Time",
  "records.form.timePlaceholder": "49.8 or 0:49.80 or 1:44.23",
  "records.form.source": "Source",
  "records.form.note": "Note (optional)",
  "records.form.notePlaceholder": "e.g. time trial",
  "records.form.add": "Add record",
  "records.form.save": "Save changes",
  "records.form.saving": "Saving…",
  "records.form.cancel": "Cancel",
  "records.source.manual": "Manual",
  "records.source.training": "Training",
  "records.source.race": "Race",
  // The earlier text said "1 entries"; the singular form fixes that.
  "records.list.title.one": "{label} — {count} entry",
  "records.list.title.other": "{label} — {count} entries",
  "records.list.loading": "Loading records…",
  "records.list.empty": "No records for {label} yet. Add your first time above.",
  "records.entry.pb": "PB",
  "records.entry.edit": "Edit",
  "records.entry.delete": "Delete",
  "records.confirm.delete": "Delete record {time}?",
  "records.distance.startHalfLap": "Start Half Lap",
  "records.distance.startLap": "Start Lap",
  "records.distance.fastestLap": "Fastest Lap",
  "records.error.dateRequired": "Date is required.",
  "records.error.timeRequired": "Time is required.",
  "records.error.timeInvalid": "Enter a valid time (e.g. 49.8, 0:49.80, 1:44.23).",
  "records.error.notSignedIn": "Sign-in is not ready yet. Try again in a moment.",
  "records.error.unavailable": "Firestore is not available right now. Try again later.",
  "records.error.actionFailed": "Record action failed.",
  "records.error.loadFailed": "Failed to initialize distance records.",
};

export type RecordsMessageKey = RecordsKey;

export const recordsResources: Resources<RecordsKey> = { zh, en };

export const tRecords = createTranslator(recordsResources);

/** Stored `source` values that have a display name. */
const SOURCE_KEYS: Readonly<Record<string, RecordsKey>> = {
  manual: "records.source.manual",
  training: "records.source.training",
  race: "records.source.race",
};

/** A value without a name is shown as stored: guessing a label would misstate the record. */
export function formatRecordSource(source: string, locale: Locale): string {
  const key = Object.hasOwn(SOURCE_KEYS, source) ? SOURCE_KEYS[source] : undefined;
  return key ? tRecords(locale, key) : source;
}

/**
 * The distances the app ships with, by id. The stored `label` stays English (it is written to
 * Firestore with each record); this is only what is shown. A distance without a name here, such
 * as a numeric one ("500m") or a custom one, is shown with the label it has.
 */
const DISTANCE_KEYS: Readonly<Record<string, RecordsKey>> = {
  start_half_lap: "records.distance.startHalfLap",
  start_lap: "records.distance.startLap",
  fastest_lap: "records.distance.fastestLap",
};

export function formatDistanceLabel(distanceId: string, label: string, locale: Locale): string {
  const key = Object.hasOwn(DISTANCE_KEYS, distanceId) ? DISTANCE_KEYS[distanceId] : undefined;
  return key ? tRecords(locale, key) : label;
}
