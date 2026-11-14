import type { Firestore } from "firebase-admin/firestore";

export const SCHEMA_VERSION: string;
export const FORMAT_VERSION: string;
export const BACKUP_COVERAGE: {
  firestoreUsersResultsAndVideoMetadata: "backed-up";
  firebaseAuthAccounts: "not-exported";
  storageVideoBytes: "not-backed-up";
  projectDisasterRecovery: "out-of-scope";
};
export const BACKUP_SCOPE: readonly string[];

export function sha256Text(value: string): string;
export function sha256Bytes(value: Uint8Array | string): string;
export function encodeValue(value: unknown): unknown;
export function decodeValue(encoded: unknown, db?: Firestore): unknown;

export function classifyMediaValue(
  field: string,
  value: unknown,
): { field: string; kind: string; ok?: boolean; reason?: string; bucket?: string; object?: string };

export function checkStorageReferences(
  documents: ReadonlyArray<{ path: string; encoded: unknown }>,
  getMetadata: (ref: { bucket: string; object: string }) => Promise<{
    bucket: string;
    name: string;
    size: string;
    updated?: string | null;
    generation?: string | null;
    md5Hash?: string | null;
    hash?: string | null;
  } | null>,
): Promise<{
  classified: { storage: number; externalUrl: number; localFileName: number; storedNote: number; unclassified: number };
  failures: Array<{ path: string; field: string; kind: string }>;
  metadata: Array<{
    bucket: string;
    object: string;
    name: string;
    size: string;
    updated: string | null;
    generation: string | null;
    hash: string | null;
    exists: true;
    references: Array<{ path: string; field: string }>;
  }>;
  videoBinaryBackedUp: false;
}>;

export function fetchObjectMetadata(input: {
  bucket: string;
  object: string;
  token: string;
  fetchImpl: (url: string, init: { method?: string; headers?: Record<string, string> }) => Promise<{
    ok: boolean;
    status: number;
    json: () => Promise<{ name?: string; size?: string; updated?: string; generation?: string; md5Hash?: string }>;
  }>;
}): Promise<{
  bucket: string;
  name: string;
  size: string;
  updated: string | null;
  generation: string | null;
  md5Hash: string | null;
} | null>;

export interface BusinessSnapshot {
  documents: Array<{ path: string; sha256: string; encoded: unknown; readAt?: string; updateTime?: string | null }>;
  readAt: string;
  schemaVersion: string;
}

export interface BackupLoadOptions {
  passphrase?: string;
  requireEncrypted?: boolean;
}

export function snapshotBusiness(db: Firestore): Promise<BusinessSnapshot>;
export function compareBusiness(
  before: { documents: ReadonlyArray<{ path: string; sha256: string }> },
  after: { documents: ReadonlyArray<{ path: string; sha256: string }> },
): { countBefore: number; countAfter: number; changes: Array<{ path: string; kind: string }> };

export function assertBusinessSnapshot(value: unknown): BusinessSnapshot;
export function loadBusinessBaseline(filePath: string, options?: BackupLoadOptions): BusinessSnapshot;

export function assertBackupOutput(outDir: string, meta: { repoRoot: string; projectId: string }): string;
export function assertBackupOptions(input: { projectId: string; skipStorage: boolean }): void;

export interface BackupSummary {
  outDir: string;
  documentCount: number;
  pathDigest: string;
  fileName: string;
  fileEncoding: string;
  fileSha256: string;
  overallSha256: string;
  videoBinaryBackedUp: false;
  encryptionAtRest: string;
  coverage: typeof BACKUP_COVERAGE;
  scope: readonly string[];
  authAccountsExported: false;
  projectDisasterRecovery: false;
}

export function writeBackup(
  outDir: string,
  snapshot: BusinessSnapshot,
  meta: {
    projectId: string;
    databaseId: string;
    repoRoot: string;
    passphrase?: string;
    storage: { videoBinaryBackedUp: false; skipped?: boolean; failures?: unknown[] };
  },
): BackupSummary;

export function verifyBackup(outDir: string, options?: BackupLoadOptions): {
  documents: Array<{ path: string; sha256: string; encoded: unknown }>;
  snapshot: BusinessSnapshot;
  manifest: {
    fileName: string;
    fileEncoding: string;
    fileSha256: string;
    documentCount: number;
    videoBinaryBackedUp: false;
    encryptionAtRest: string;
    encryption: {
      algorithm: string;
      kdf: string;
      salt: string;
      iv: string;
      tag: string;
    } | null;
  };
};

export function restoreBackupToEmulator(
  db: Firestore,
  documentsOrDir: string | ReadonlyArray<{ path: string; sha256: string; encoded: unknown }>,
  input: { projectId: string; emulatorHost?: string; passphrase?: string },
): Promise<void>;
