import type { Firestore } from "firebase-admin/firestore";

export interface VerificationCheck {
  name: string;
  status: "pass" | "fail" | "skipped";
  passed: boolean;
  detail: string;
  paths: string[];
}

export interface CatalogVerification {
  projectId: string;
  databaseId: string;
  runId: string;
  gitHead: string;
  workbookSha256: string;
  counts: {
    parents: number;
    versions: number;
    exercise: number;
    drill: number;
    block: number;
    session: number;
    refs: number;
    audits: number;
  };
  checks: VerificationCheck[];
  business: { countBefore: number; countAfter: number; changes: Array<{ path: string; kind: string }> };
  conflicts: Array<{ path: string; kind: string }>;
  idempotency: {
    mode: string;
    invoked?: boolean;
    note?: string;
    actualContentWrites?: number | null;
    actualAuditWrites?: number | null;
  };
  passed: boolean;
}

export interface CatalogRead {
  projectId: string;
  databaseId: string;
  migration: Record<string, unknown> | null;
  plans: Array<{ path: string; data: Record<string, unknown> }>;
  stored: Array<{ path: string; data: Record<string, unknown> }>;
  inspected: { collectionDocs: Record<string, string[]>; orphans: string[]; versionPaths: string[] };
  audits: Array<{ path: string; data: Record<string, unknown> }>;
}

export function readCatalogVerification(
  db: Firestore,
  runId: string,
  mode?: "emulator" | "production",
): Promise<CatalogRead>;

export function evaluateCatalogImport(input: {
  mode: "emulator" | "production";
  runId: string;
  projectId: string;
  databaseId: string;
  gitHead: string;
  workbookSha256: string;
  migration: Record<string, unknown> | null;
  plans: ReadonlyArray<{ path: string; data: Record<string, unknown> }>;
  stored: ReadonlyArray<{ path: string; data: Record<string, unknown> }>;
  inspected: { collectionDocs: Record<string, string[]>; orphans: string[]; versionPaths: string[] };
  audits: ReadonlyArray<{ path: string; data: Record<string, unknown> }>;
  business: { countBefore: number; countAfter: number; changes: Array<{ path: string; kind: string }> };
  rules?: { anonymous?: string; signedIn?: string; admin?: string; skipped?: boolean };
  idempotency?: { actualContentWrites?: number | null; actualAuditWrites?: number | null; skipped?: boolean; invoked?: boolean };
}): CatalogVerification;

export function businessReport(
  before: { documents: Array<{ path: string; sha256: string }> },
  after: { documents: Array<{ path: string; sha256: string }> },
): { countBefore: number; countAfter: number; changes: Array<{ path: string; kind: string }> };

export function checkDraftReads(input: {
  host: string;
  port: string | number;
  projectId: string;
  draftPath: string;
}): Promise<{ anonymous: string; signedIn: string; admin: string }>;

export function resumeIdempotency(input: {
  runId: string;
  projectId: string;
  rootDir: string;
}): { actualContentWrites: number | null; actualAuditWrites: number | null; passed: boolean };

export function verificationActions(mode: "emulator" | "production"): {
  resume: boolean;
  rulesClient: boolean;
  writes: boolean;
};
