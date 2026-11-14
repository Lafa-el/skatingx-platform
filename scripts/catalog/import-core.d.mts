import type { Firestore } from "firebase-admin/firestore";

export const EXPECTED_WORKBOOK_SHA256: string;
export const CONTENT_VERSION: string;
export const IMPORT_ACTOR: string;
export const BASE_IMPORT_BUDGET: number;
export const CATALOG_COLLECTIONS: readonly string[];

export function inspectCatalog(db: Firestore): Promise<{
  collectionDocs: Map<string, string[]>;
  orphans: string[];
  versionPaths: string[];
}>;

export interface PlannedDocument<T = Record<string, unknown>> {
  path: string;
  data: T;
}

export interface PlanSummary {
  parents: number;
  versions: number;
  audits: number;
  digest: string;
}

export interface MigrationRecord {
  runId: string;
  projectId: string;
  workbookSha256: string;
  importedAt: string;
  actor?: string;
  databaseId?: string;
  gitSha?: string;
  planSummary?: PlanSummary;
  status: "running" | "completed" | "rolled_back";
  rolledBackAt?: string;
  created?: boolean;
}

export interface ImportReport {
  plannedContentWrites: number;
  plannedAuditWrites: number;
  plannedMigrationCreates: number;
  actualContentWrites: number;
  actualAuditWrites: number;
  actualMigrationWrites: number;
  skippedExisting: number;
  remainingPlanned: number;
  idempotent: boolean;
  runStatus: string;
  batches: Array<{
    index: number;
    objects: number;
    writes: number;
    cumulativeContent: number;
    cumulativeAudits: number;
  }>;
}

export interface ImportRunContext {
  runId: string;
  importedAt: string;
  actor?: string;
}

export function projectIdOf(db: Firestore): string;
export function databaseIdOf(db: Firestore): string;

export function assertDemoProjectId(projectId: string): void;

export function auditDocId(runId: string, objectId: string): string;

export function documentData(value: unknown): Record<string, unknown>;

export function loadPlans(importedAt: string): { workbookSha256: string; plans: PlannedDocument[] };

export function planBatches(
  plans: readonly PlannedDocument[],
  runId: string,
  context: { actor: string; importedAt: string },
): PlannedDocument[][];

export function readPlannedDocs(
  db: Firestore,
  plans: readonly { path: string }[],
): Promise<Map<string, Record<string, unknown>>>;

export function dumpCatalog(docs: ReadonlyMap<string, Record<string, unknown>>): string;

export function planSummary(plans: readonly PlannedDocument[]): PlanSummary;

export function actorOf(record: { actor?: string } | null | undefined): string;

export function preflightInitial(
  db: Firestore,
  plans: readonly PlannedDocument[],
): Promise<{ planSummary: PlanSummary; baseBudget: number; plannedMigrationCreates: number }>;

export function assertResumeCatalog(
  db: Firestore,
  plans: readonly PlannedDocument[],
  runId: string,
): Promise<Record<string, unknown>>;

export function assertResumeIdentity(
  record: MigrationRecord,
  input: {
    actor: string;
    projectId: string;
    databaseId: string;
    workbookSha256: string;
    planSummary: PlanSummary;
  },
): MigrationRecord;

export function previewImport(
  db: Firestore,
  plans: readonly PlannedDocument[],
  context: ImportRunContext,
): Promise<{
  present: number;
  absent: number;
  mismatched: string[];
  incomplete: string[];
  plannedContentWrites: number;
  plannedAuditWrites: number;
  plannedMigrationCreates: number;
  baseBudget: number;
  roundBudget: number;
  remainingObjectGroups: number;
}>;

export function executeImport(
  db: Firestore,
  plans: readonly PlannedDocument[],
  context: ImportRunContext & { stopAfterObjects?: number },
): Promise<ImportReport>;

export function importDocuments(
  db: Firestore,
  plans: readonly PlannedDocument[],
  context: ImportRunContext & { stopAfterObjects?: number },
): Promise<number>;

export function deleteDocuments(db: Firestore, docPaths: readonly string[]): Promise<void>;

export function beginRun(
  db: Firestore,
  input: { runId: string; workbookSha256: string; actor?: string; gitSha?: string },
): Promise<MigrationRecord>;

export function rollbackImport(db: Firestore, runId: string): Promise<MigrationRecord>;
