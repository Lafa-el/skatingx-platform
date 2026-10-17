import { createTranslator, type Resources } from "./translator";

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
};

export type AthleteMessageKey = AthleteKey;

export const athleteResources: Resources<AthleteKey> = { zh, en };

export const tAthlete = createTranslator(athleteResources);
