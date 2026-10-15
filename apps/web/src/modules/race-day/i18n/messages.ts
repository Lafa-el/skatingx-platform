import { createTranslator, type Resources } from "@/shared/i18n/translator";

import { coreResources, type RaceDayCoreKey } from "./core-messages";

/**
 * Full Race Day text resource (zh/en), loaded with the module chunk. Keys are named by
 * domain (`raceDay.tab.schedule`), not by English sentence (AGENTS.md).
 *
 * `zh` defines the keys and `en` is typed against them, so a missing or extra translation
 * is a compile error rather than a blank label.
 */
const zh = {
  "raceDay.title": "比赛日助手",
  "raceDay.phase0.notice": "实测版:数据为手动录入,未核对的数据会标为“待确认”。",
  "raceDay.tab.today": "今天",
  "raceDay.tab.schedule": "赛程",
  "raceDay.tab.results": "成绩",
  "raceDay.tab.videos": "视频",
  "raceDay.tab.summary": "总结",
  "raceDay.tab.setup": "设置",
  "raceDay.nav.section": "比赛日分区",
  "raceDay.placeholder.notAvailable": "此部分尚未开放,将在后续版本提供。",

  "raceDay.verification.pending": "待确认",
  "raceDay.verification.verified": "已确认",
  "raceDay.verification.markVerified": "标记为已确认",
  "raceDay.verification.markPending": "退回待确认",

  "raceDay.common.save": "保存",
  "raceDay.common.saving": "保存中…",
  "raceDay.common.cancel": "取消",
  "raceDay.common.edit": "编辑",
  "raceDay.common.delete": "删除",
  "raceDay.common.confirmDelete": "确认删除",
  "raceDay.common.add": "添加",
  "raceDay.common.dismiss": "知道了",

  "raceDay.state.notReady": "正在准备数据…",
  "raceDay.state.queued": "已保存在本机,联网后会自动同步。",
  "raceDay.state.syncFailed": "有一项修改未能同步到服务器,已被撤销。请检查后重新录入。",
  "raceDay.state.invalidHidden": "有 {count} 条数据无法读取,已隐藏。",

  "raceDay.error.savePermission": "没有权限保存。请重新登录后再试。",
  "raceDay.error.saveNetwork": "未能保存。请检查网络后再试。",
  "raceDay.error.saveValidation": "内容不符合要求,请检查后再试。",
  "raceDay.error.saveUnknown": "保存失败,请稍后再试。",
  "raceDay.error.loadPermission": "无法读取比赛日数据:没有权限。请重新登录。",
  "raceDay.error.load": "无法读取比赛日数据,请检查网络。",

  "raceDay.form.summaryError": "请先修正标出的问题。",
  "raceDay.form.error.required": "必填",
  "raceDay.form.error.tooLong": "内容太长,请缩短",
  "raceDay.form.error.tooMany": "数量太多",
  "raceDay.form.error.invalidFormat": "格式不正确",
  "raceDay.form.error.outOfRange": "超出范围",
  "raceDay.form.error.duplicate": "有重复项",

  "raceDay.setup.event.title": "赛事",
  "raceDay.setup.event.empty": "还没有赛事。先创建一场赛事,再录入运动员名单。",
  "raceDay.setup.event.create": "创建赛事",
  "raceDay.setup.event.edit": "编辑赛事",
  "raceDay.setup.event.current": "当前赛事",
  "raceDay.setup.event.dates": "比赛日期:{dates}",
  "raceDay.setup.event.deleteWarning": "删除赛事会同时删除它的运动员名单和赛程,无法恢复。",
  "raceDay.form.event.name": "赛事名称",
  "raceDay.form.event.dates": "比赛日期",
  "raceDay.form.event.day": "第 {n} 天",
  "raceDay.form.event.addDay": "添加一天",
  "raceDay.form.event.removeDay": "移除第 {n} 天",
  "raceDay.form.event.timeZone": "时区(可选)",
  "raceDay.form.event.timeZoneHint": "例如 America/New_York。不确定就留空。",
  "raceDay.form.event.venue": "场馆(可选)",
  "raceDay.form.sourceNote": "来源说明(可选)",
  "raceDay.form.sourceNoteHint": "例如:报名名单、赛事官网。",

  "raceDay.setup.roster.title": "运动员名单",
  "raceDay.setup.roster.empty": "名单还是空的。添加运动员后,才能安排赛程。",
  "raceDay.setup.roster.add": "添加运动员",
  "raceDay.setup.roster.edit": "编辑运动员",
  "raceDay.setup.roster.self": "本人",
  "raceDay.setup.roster.following": "关注",
  "raceDay.setup.roster.bib": "号码 {bib}",
  "raceDay.form.roster.displayName": "姓名",
  "raceDay.form.roster.bib": "号码",
  "raceDay.form.roster.division": "组别",
  "raceDay.form.roster.isSelf": "这是我自己的运动员",
  "raceDay.form.roster.isFollowed": "关注该运动员",
} as const;

type ModuleKey = keyof typeof zh;

const en: Record<ModuleKey, string> = {
  "raceDay.title": "Race Day Companion",
  "raceDay.phase0.notice":
    "Field-test version: data is entered by hand, and unverified data is marked Pending.",
  "raceDay.tab.today": "Today",
  "raceDay.tab.schedule": "Schedule",
  "raceDay.tab.results": "Results",
  "raceDay.tab.videos": "Videos",
  "raceDay.tab.summary": "Summary",
  "raceDay.tab.setup": "Setup",
  "raceDay.nav.section": "Race Day sections",
  "raceDay.placeholder.notAvailable":
    "This section is not available yet. It will arrive in a later version.",

  "raceDay.verification.pending": "Pending",
  "raceDay.verification.verified": "Verified",
  "raceDay.verification.markVerified": "Mark as verified",
  "raceDay.verification.markPending": "Return to pending",

  "raceDay.common.save": "Save",
  "raceDay.common.saving": "Saving…",
  "raceDay.common.cancel": "Cancel",
  "raceDay.common.edit": "Edit",
  "raceDay.common.delete": "Delete",
  "raceDay.common.confirmDelete": "Confirm delete",
  "raceDay.common.add": "Add",
  "raceDay.common.dismiss": "Got it",

  "raceDay.state.notReady": "Getting your data ready…",
  "raceDay.state.queued": "Saved on this device. It will sync when you are back online.",
  "raceDay.state.syncFailed":
    "One change could not be synced to the server and was undone. Please check and enter it again.",
  "raceDay.state.invalidHidden": "{count} item(s) could not be read and are hidden.",

  "raceDay.error.savePermission": "You do not have permission to save. Please sign in again and retry.",
  "raceDay.error.saveNetwork": "Could not save. Please check your connection and retry.",
  "raceDay.error.saveValidation": "Some content is not allowed. Please check it and retry.",
  "raceDay.error.saveUnknown": "Saving failed. Please try again later.",
  "raceDay.error.loadPermission": "Cannot read Race Day data: no permission. Please sign in again.",
  "raceDay.error.load": "Cannot read Race Day data. Please check your connection.",

  "raceDay.form.summaryError": "Please fix the highlighted problems first.",
  "raceDay.form.error.required": "Required",
  "raceDay.form.error.tooLong": "Too long, please shorten it",
  "raceDay.form.error.tooMany": "Too many items",
  "raceDay.form.error.invalidFormat": "Invalid format",
  "raceDay.form.error.outOfRange": "Out of range",
  "raceDay.form.error.duplicate": "Contains duplicates",

  "raceDay.setup.event.title": "Event",
  "raceDay.setup.event.empty": "No event yet. Create an event first, then enter the roster.",
  "raceDay.setup.event.create": "Create event",
  "raceDay.setup.event.edit": "Edit event",
  "raceDay.setup.event.current": "Current event",
  "raceDay.setup.event.dates": "Dates: {dates}",
  "raceDay.setup.event.deleteWarning":
    "Deleting an event also deletes its roster and schedule. This cannot be undone.",
  "raceDay.form.event.name": "Event name",
  "raceDay.form.event.dates": "Event dates",
  "raceDay.form.event.day": "Day {n}",
  "raceDay.form.event.addDay": "Add a day",
  "raceDay.form.event.removeDay": "Remove day {n}",
  "raceDay.form.event.timeZone": "Time zone (optional)",
  "raceDay.form.event.timeZoneHint": "For example America/New_York. Leave empty if unsure.",
  "raceDay.form.event.venue": "Venue (optional)",
  "raceDay.form.sourceNote": "Source note (optional)",
  "raceDay.form.sourceNoteHint": "For example: entry list, event website.",

  "raceDay.setup.roster.title": "Roster",
  "raceDay.setup.roster.empty": "The roster is empty. Add athletes before building the schedule.",
  "raceDay.setup.roster.add": "Add athlete",
  "raceDay.setup.roster.edit": "Edit athlete",
  "raceDay.setup.roster.self": "Me",
  "raceDay.setup.roster.following": "Following",
  "raceDay.setup.roster.bib": "Bib {bib}",
  "raceDay.form.roster.displayName": "Name",
  "raceDay.form.roster.bib": "Bib",
  "raceDay.form.roster.division": "Division",
  "raceDay.form.roster.isSelf": "This is my own athlete",
  "raceDay.form.roster.isFollowed": "Follow this athlete",
};

export type RaceDayMessageKey = ModuleKey | RaceDayCoreKey;

// Core keys are merged in so the module can use one translator for everything.
export const raceDayResources: Resources<RaceDayMessageKey> = {
  zh: { ...coreResources.zh, ...zh },
  en: { ...coreResources.en, ...en },
};

export const t = createTranslator(raceDayResources);
