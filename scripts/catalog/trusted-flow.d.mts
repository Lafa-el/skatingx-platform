import type { Firestore } from "firebase-admin/firestore";

import type { SafetyEvaluation, SafetyEvaluationInput } from "../../packages/training-catalog/src/safety-evaluate";

export function assessEmulatorSafety(
  db: Firestore,
  request: SafetyEvaluationInput & { policyId: string; policyVersion: string },
  options?: {
    readPolicy?: (request: { policyId: string; policyVersion: string }) => Promise<unknown>;
    timeoutMs?: number;
  },
): Promise<SafetyEvaluation>;

export function contentHash(doc: object): string;

export function assertCatalogProject(projectId: string): void;

export function parseArgs(argv: string[]): { command: string; args: Record<string, string> };

export function assertProductionCommand(command: string): void;

export function policyDocId(policyId: string, policyVersion: string): string;

export function readPolicyDocument(
  db: Firestore,
  policyId: string,
  policyVersion: string,
): Promise<Record<string, unknown> | null>;

export interface ProductionExecutionContext {
  readonly operator: string;
}

export function openProductionFlowDb(
  project: string | undefined,
  confirm: string | undefined,
  readLine?: () => Promise<unknown>,
  dependencies?: {
    bindVerifiedAdc?: (adcFile: string) => unknown;
    openProductionFirestore?: (adcFile: string) => Promise<unknown>;
    productionFirestore?: (app: unknown) => Promise<Firestore>;
  },
): Promise<{ db: Firestore; operator: string; executionContext: ProductionExecutionContext }>;

export function assertProductionProject(db: Firestore): void;

export function projectIdOf(db: Firestore): string;

type FlowOptions = {
  target?: "emulator" | "production";
  /** Emulator audits only. Production uses the operator inside executionContext. */
  operator?: string;
  executionContext?: ProductionExecutionContext;
};

export function editorRecordId(objectId: string): string;

export function importAuditId(objectId: string): string;

export function inventoryObjectIds(): string[];

export function lastEditorFromSnap(
  snap: { exists: boolean; data: () => Record<string, unknown> | undefined },
  objectId: string,
): string | null;

export function backfillEditorRecords(
  db: Firestore,
  input?: { objectIds?: string[] },
  options?: FlowOptions,
): Promise<{
  results: Array<{ objectId: string; status: string; detail?: string }>;
  counts: { written: number; skipped: number; missing: number; refused: number; total: number };
}>;

export function reviewCatalogVersion(
  db: Firestore,
  input: {
    objectId: string;
    contentVersion: string;
    reviewer: string;
    decision: "approved" | "rejected";
    expectedContentSha256: string;
  },
  options?: FlowOptions,
): Promise<void>;

export function publishCatalogVersionFlow(
  db: Firestore,
  input: { objectId: string; contentVersion: string; reviewer: string; notes?: string },
  options?: FlowOptions,
): Promise<void>;

export function withdrawCatalogVersion(
  db: Firestore,
  input: { objectId: string; contentVersion: string; actor: string },
  options?: FlowOptions,
): Promise<void>;

export function revokeCatalogApprovalFlow(
  db: Firestore,
  input: { objectId: string; contentVersion: string; actor: string },
  options?: FlowOptions,
): Promise<void>;

export function reviewCatalogLink(
  db: Firestore,
  input: {
    academyItemId: string;
    reviewer: string;
    decision: "approved" | "rejected";
    expectedContentSha256?: string;
  },
  options?: FlowOptions,
): Promise<void>;

export function reviewKnowledgeArticle(
  db: Firestore,
  input: {
    articleId: string;
    reviewer: string;
    decision: "approved" | "rejected";
    expectedContentSha256?: string;
  },
  options?: FlowOptions,
): Promise<void>;

export function publishKnowledgeArticle(
  db: Firestore,
  input: { articleId: string; actor: string },
  options?: FlowOptions,
): Promise<void>;

export function createSafetyPolicy(
  db: Firestore,
  input: { policyId: string; policyVersion: string; actor: string },
  options?: FlowOptions,
): Promise<void>;

export function reviewSafetyPolicy(
  db: Firestore,
  input: {
    policyId: string;
    policyVersion: string;
    reviewer: string;
    decision: "approved" | "rejected";
    expectedContentSha256?: string;
  },
  options?: FlowOptions,
): Promise<void>;

export function publishSafetyPolicy(
  db: Firestore,
  input: { policyId: string; policyVersion: string; actor: string },
  options?: FlowOptions,
): Promise<void>;

export function publishCatalogLink(
  db: Firestore,
  input: { academyItemId: string; actor: string },
  options?: FlowOptions,
): Promise<void>;

export function withdrawCatalogLink(
  db: Firestore,
  input: { academyItemId: string; actor: string },
  options?: FlowOptions,
): Promise<void>;

export function readPolicyPointer(
  db: Firestore,
  policyId: string,
): Promise<Record<string, unknown> | null>;

export function showPolicyPointer(
  db: Firestore,
  input: { policyId: string },
  options?: FlowOptions,
): Promise<{
  policyId: unknown;
  activePolicyVersion: unknown;
  previousPolicyVersion: unknown;
  revision: unknown;
  updatedBy: unknown;
  updatedAt: unknown;
  reason: unknown;
} | null>;

export type PointerSafetyResult = {
  decision: SafetyEvaluation["decision"];
  reasonCodes: readonly string[];
  policyVersion: string | null;
  pointerState: "enabled" | "disabled" | "error";
  alertEvents: readonly string[];
};

export function assessPointerSafety(
  db: Firestore,
  request: SafetyEvaluationInput & { policyId: string },
  options?: {
    timeoutMs?: number;
    readPointer?: (request: { policyId: string }) => Promise<unknown>;
    readPolicy?: (request: { policyId: string; policyVersion: string }) => Promise<unknown>;
  },
): Promise<PointerSafetyResult>;

export function enablePolicyPointer(
  db: Firestore,
  input: { policyId: string; policyVersion: string; reason: string },
  options?: FlowOptions,
): Promise<void>;

export function disablePolicyPointer(
  db: Firestore,
  input: { policyId: string; reason: string },
  options?: FlowOptions,
): Promise<void>;

export function rollbackPolicyPointer(
  db: Firestore,
  input: { policyId: string; expectedRevision: number | string; reason: string },
  options?: FlowOptions,
): Promise<void>;
