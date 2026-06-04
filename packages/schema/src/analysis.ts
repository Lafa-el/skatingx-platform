import type { AthleteId } from "./athlete";
import type { Timestamp } from "./common";

export type AnalysisModule = "biomechanics" | "pacing" | "equipment";

export type AnalysisSessionStatus = "draft" | "completed" | "discarded";

export type AnalysisTagSeverity = "info" | "watch" | "action";

/**
 * Structured finding attached to an analysis session (AI Coach L1 input).
 */
export interface AnalysisTag {
  tagId: string;
  severity: AnalysisTagSeverity;
  /** 0–1 */
  confidence: number;
  sessionId: string;
  athleteId: AthleteId;
  messageKey: string;
}

export interface AnalysisSessionSource {
  videoLocal?: boolean;
  legacyModule?: string;
}

/**
 * Analysis run summary (`athletes/{athleteId}/analysis/sessions/{sessionId}/summary`).
 * Raw landmarks and video blobs stay client-local by default.
 */
export interface AnalysisSession {
  sessionId: string;
  athleteId: AthleteId;
  module: AnalysisModule;
  status: AnalysisSessionStatus;
  tags: AnalysisTag[];
  /** Module-specific metrics (scores, splits, equipment flags, etc.) */
  scores: Record<string, number | string | boolean | null>;
  narrativeSummary?: string;
  source?: AnalysisSessionSource;
  createdAt?: Timestamp;
  completedAt?: Timestamp;
}
