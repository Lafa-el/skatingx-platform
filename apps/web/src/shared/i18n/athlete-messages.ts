import { createTranslator, type Locale, type Resources } from "./translator";

/** Text of the Athlete page. */
const zh = {
  "athlete.title": "运动员",
  // Chinese says 数据服务 for parents and athletes; English keeps the product name Firestore
  // (owner decision 2026-10-16, ADR-004 glossary).
  "athlete.subtitle": "已从数据服务加载当前运动员的档案。",
  "athlete.profile.title": "当前档案",
  "athlete.field.name": "姓名",
  "athlete.field.birthDate": "出生日期",
  "athlete.field.sport": "项目",
  "athlete.field.country": "国家/地区",
  "athlete.field.activeId": "当前运动员 ID",
  "athlete.field.accountUid": "账户 UID",
  "athlete.field.age": "年龄",
  "athlete.field.skatingAge": "冰龄",
  "athlete.field.ageCategory": "年龄组",
  "athlete.field.skatingDuration": "滑冰时长",
  "athlete.field.skatingStartDate": "开始滑冰日期",
  "athlete.field.bio": "个人简介",
  "athlete.empty.title": "还没有运动员",
  "athlete.empty.body": "添加一位运动员后，训练和分析才会有人可用。",
  "athlete.action.edit": "编辑",
  "athlete.action.add": "添加运动员",
  "athlete.action.delete": "删除运动员",
  "athlete.delete.title": "删除这名运动员？",
  "athlete.delete.scope": "将删除该运动员的训练、纪录、积分和分析，以及比赛日里这个人的名单行、成绩和视频。日志和账号会保留。",
  "athlete.delete.confirm": "确认删除",
  "athlete.delete.cancel": "取消",
  "athlete.delete.failed": "没能删除，请再试一次。",
  "athlete.delete.busy": "正在删除…",
  "athlete.action.save": "保存",
  "athlete.action.cancel": "取消",
  "athlete.form.bioCount": "{count}/500",
  "athlete.error.nameRequired": "请填写姓名。",
  "athlete.error.countryRequired": "请填写国家或地区。",
  "athlete.error.dateInvalid": "请填写真实日期。",
  "athlete.error.bioTooLong": "简介不能超过 500 个字。",
  "athlete.error.saveFailed": "没能保存，请再试一次。",
  "athlete.error.createFailed": "没能添加，请再试一次。",
  "athlete.sport.shortTrack": "短道速滑",
} as const;

type AthleteKey = keyof typeof zh;

const en: Record<AthleteKey, string> = {
  "athlete.title": "Athlete",
  "athlete.subtitle": "Profile loaded from Firestore for the active skater.",
  "athlete.profile.title": "Active profile",
  "athlete.field.name": "Name",
  "athlete.field.birthDate": "Birth date",
  "athlete.field.sport": "Sport",
  "athlete.field.country": "Country",
  "athlete.field.activeId": "Active athlete ID",
  "athlete.field.accountUid": "Account UID",
  "athlete.field.age": "Age",
  "athlete.field.skatingAge": "Skating Age",
  "athlete.field.ageCategory": "Age Category",
  "athlete.field.skatingDuration": "Skating duration",
  "athlete.field.skatingStartDate": "Skating start date",
  "athlete.field.bio": "Bio",
  "athlete.empty.title": "No athlete yet",
  "athlete.empty.body": "Add an athlete before training and analysis have someone to use.",
  "athlete.action.edit": "Edit",
  "athlete.action.add": "Add athlete",
  "athlete.action.delete": "Delete athlete",
  "athlete.delete.title": "Delete this athlete?",
  "athlete.delete.scope": "This deletes their training, records, points, and analyses, plus their race-day roster rows, results, and videos. The journal and the account stay.",
  "athlete.delete.confirm": "Delete",
  "athlete.delete.cancel": "Cancel",
  "athlete.delete.failed": "Could not delete the athlete. Try again.",
  "athlete.delete.busy": "Deleting…",
  "athlete.action.save": "Save",
  "athlete.action.cancel": "Cancel",
  "athlete.form.bioCount": "{count}/500",
  "athlete.error.nameRequired": "Enter a name.",
  "athlete.error.countryRequired": "Enter a country.",
  "athlete.error.dateInvalid": "Enter a real date.",
  "athlete.error.bioTooLong": "Bio must be 500 characters or fewer.",
  "athlete.error.saveFailed": "Could not save. Try again.",
  "athlete.error.createFailed": "Could not add the athlete. Try again.",
  "athlete.sport.shortTrack": "Short track speed skating",
};

export type AthleteMessageKey = AthleteKey;

export const athleteResources: Resources<AthleteKey> = { zh, en };

export const tAthlete = createTranslator(athleteResources);

/** Stored `sport` identifiers that have a display name. */
const SPORT_KEYS: Readonly<Record<string, AthleteKey>> = {
  short_track_speed_skating: "athlete.sport.shortTrack",
};

/**
 * `sport` is free text in the schema, so a value without a name is shown as stored: guessing a
 * label for data we do not recognize would misstate the profile.
 */
export function formatSport(sport: string, locale: Locale): string {
  const key = Object.hasOwn(SPORT_KEYS, sport) ? SPORT_KEYS[sport] : undefined;
  return key ? tAthlete(locale, key) : sport;
}
