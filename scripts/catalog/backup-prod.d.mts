import type { Firestore } from "firebase-admin/firestore";

export const SCHEMA_VERSION: string;

export function sha256Text(value: string): string;
export function encodeValue(value: unknown): unknown;
export function decodeValue(encoded: unknown, db?: Firestore): unknown;

export function classifyMediaValue(field: string, value: unknown): { field: string; kind: string; ok?: boolean; bucket?: string; object?: string };

export function checkStorageReferences(
  documents: ReadonlyArray<{ path: string; encoded: unknown }>,
  getMetadata: (ref: { bucket: string; object: string }) => Promise<{ bucket: string; name: string; size: string } | null>,
): Promise<{
  classified: { storage: number; externalUrl: number; localFileName: number; storedNote: number; unclassified: number };
  failures: Array<{ path: string; kind: string }>;
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
}): Promise<{ bucket: string; name: string; size: string } | null>;

export function snapshotBusiness(db: Firestore): Promise<{
  documents: Array<{ path: string; sha256: string; encoded: unknown; readAt: string; updateTime: string | null }>;
  readAt: string;
}>;

export function assertBackupOutput(outDir: string, meta: { repoRoot: string; projectId: string }): string;
export function assertBackupOptions(input: { projectId: string; skipStorage: boolean }): void;

export function writeBackup(
  outDir: string,
  documents: ReadonlyArray<{ path: string; sha256: string; encoded: unknown }>,
  meta: { projectId: string; databaseId: string; repoRoot: string; storage: { videoBinaryBackedUp: false; skipped?: boolean; failures?: unknown[] } },
): { videoBinaryBackedUp: false; encryptionAtRest: string; fileSha256: string; documentCount: number };

export function verifyBackup(outDir: string): {
  documents: Array<{ path: string; sha256: string; encoded: unknown }>;
  manifest: { fileSha256: string; documentCount: number; videoBinaryBackedUp: false };
};

export function restoreBackupToEmulator(
  db: Firestore,
  documents: ReadonlyArray<{ path: string; encoded: unknown }>,
  input: { projectId: string },
): Promise<void>;
