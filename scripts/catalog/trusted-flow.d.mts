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

export function assertCatalogProject(projectId: string): void;

export function parseArgs(argv: string[]): { command: string; args: Record<string, string> };

export function assertProductionCommand(command: string): void;

export function openProductionFlowDb(
  project: string | undefined,
  confirm: string | undefined,
  readLine?: () => Promise<string>,
): Promise<{ db: Firestore; operator: string }>;

export function assertProductionProject(db: Firestore): void;

type FlowOptions = { target?: "emulator" | "production"; operator?: string };

export function reviewCatalogVersion(
  db: Firestore,
  input: { objectId: string; contentVersion: string; reviewer: string; decision: "approved" | "rejected" },
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
  input: { academyItemId: string; reviewer: string; decision: "approved" | "rejected" },
  options?: FlowOptions,
): Promise<void>;

export function reviewKnowledgeArticle(
  db: Firestore,
  input: { articleId: string; reviewer: string; decision: "approved" | "rejected" },
  options?: FlowOptions,
): Promise<void>;

export function publishKnowledgeArticle(
  db: Firestore,
  input: { articleId: string; actor: string },
  options?: FlowOptions,
): Promise<void>;

export function reviewSafetyPolicy(
  db: Firestore,
  input: { policyId: string; reviewer: string; decision: "approved" | "rejected" },
  options?: FlowOptions,
): Promise<void>;

export function publishSafetyPolicy(
  db: Firestore,
  input: { policyId: string; actor: string },
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
