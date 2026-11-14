import type { Firestore } from "firebase-admin/firestore";

export const EXPECTED_WORKBOOK_SHA256: string;
export const CONTENT_VERSION: string;
export const IMPORT_ACTOR: string;

export interface PlannedDocument<T = Record<string, unknown>> {
  path: string;
  data: T;
}

export interface MigrationRecord {
  runId: string;
  projectId: string;
  workbookSha256: string;
  importedAt: string;
  status: "running" | "rolled_back";
  rolledBackAt?: string;
}

export interface ImportRunContext {
  runId: string;
  importedAt: string;
  actor?: string;
}

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

export function importDocuments(
  db: Firestore,
  plans: readonly PlannedDocument[],
  context: ImportRunContext,
): Promise<number>;

export function deleteDocuments(db: Firestore, docPaths: readonly string[]): Promise<void>;

export function beginRun(
  db: Firestore,
  input: { runId: string; workbookSha256: string },
): Promise<MigrationRecord>;

export function rollbackImport(db: Firestore, runId: string): Promise<MigrationRecord>;
