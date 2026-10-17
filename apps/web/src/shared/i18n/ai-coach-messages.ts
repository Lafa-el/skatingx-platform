import { createTranslator, type Resources } from "./translator";

/** Text of the AI Coach placeholder page. The feature does not exist yet; the text says so. */
const zh = {
  "aiCoach.title": "AI 教练",
  "aiCoach.description": "教练建议及一键应用到任务的流程——第 5 阶段及之后提供。",
} as const;

type AiCoachKey = keyof typeof zh;

const en: Record<AiCoachKey, string> = {
  "aiCoach.title": "AI Coach",
  "aiCoach.description": "Coach recommendations and apply-to-tasks flow — Phase 5+.",
};

export type AiCoachMessageKey = AiCoachKey;

export const aiCoachResources: Resources<AiCoachKey> = { zh, en };

export const tAiCoach = createTranslator(aiCoachResources);
