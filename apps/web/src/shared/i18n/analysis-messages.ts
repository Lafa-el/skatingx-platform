import { createTranslator, type Resources } from "./translator";

/**
 * Text of the four Analysis pages. They are placeholders: the analysis tools are not built yet, so
 * the text names the sections and says no more. Biomechanics is 动作分析 in Chinese (owner
 * decision 2026-10-16, ADR-004 glossary): "生物力学" would claim more than a placeholder does.
 * The note under the section pages is the shared placeholder text, not repeated here.
 */
const zh = {
  "analysis.hub.title": "分析",
  "analysis.hub.description": "动作分析、配速图表和装备追踪。",
  "analysis.biomechanics.title": "分析 · 动作分析",
  "analysis.pacing.title": "分析 · 配速",
  "analysis.equipment.title": "分析 · 装备",
} as const;

type AnalysisKey = keyof typeof zh;

const en: Record<AnalysisKey, string> = {
  "analysis.hub.title": "Analysis",
  // The earlier text said "Biomechanics lab"; a placeholder page has no lab, so the word is dropped
  // (owner approved 2026-10-17). It matches the Chinese and the Dashboard card.
  "analysis.hub.description": "Biomechanics, pacing charts, and equipment tracking.",
  "analysis.biomechanics.title": "Analysis · Biomechanics",
  "analysis.pacing.title": "Analysis · Pacing",
  "analysis.equipment.title": "Analysis · Equipment",
};

export type AnalysisMessageKey = AnalysisKey;

export const analysisResources: Resources<AnalysisKey> = { zh, en };

export const tAnalysis = createTranslator(analysisResources);
