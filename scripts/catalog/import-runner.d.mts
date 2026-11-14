export interface CredentialDescription {
  type?: string;
  clientEmail?: string;
  projectId?: string;
}

export interface CredentialProvider {
  source: string;
  describe: () => Promise<CredentialDescription | null>;
}

export interface ImportPlan {
  importedAt: string;
  runId: string;
  workbookSha256: string;
  plans: Array<{ path: string; data: Record<string, unknown> }>;
  parentPaths: string[];
  versionPaths: string[];
  checksums: Array<{ id: unknown; checksum: unknown }>;
  planSummary: { parents: number; versions: number; audits: number; digest: string };
  refs: { blockToDrill: number; sessionToBlock: number; total: number; emptyDrills: number };
  baseBudget: number;
  migrationId: string;
  migrationPath: string;
  auditIds: string[];
}

export interface ImportRequest {
  mode: "initial" | "resume";
  runId: string;
  execute: boolean;
  target: "emulator" | "production";
  project: string;
  confirm: string;
  actor: string;
  databaseId?: string;
}

export interface ImportEntryResult {
  publicReport?: Record<string, unknown>;
  plan?: ImportPlan;
  lockToken?: string;
  runId?: string;
  importedAt?: string;
  identity?: { type: string; clientEmail: string; projectId: string };
}

export function unconfiguredCredentialProvider(): CredentialProvider;

export function buildImportPlan(importedAt: string, runId: string): ImportPlan;

export function runImportEntry(
  request: ImportRequest,
  deps: {
    emulatorHost?: string;
    now?: () => Date;
    openFirestore?: (projectId: string) => Promise<unknown>;
    credentialProvider?: CredentialProvider;
    confirmProject?: (projectId: string) => Promise<void>;
    writeSummary?: (text: string) => void;
    writeReport?: (value: Record<string, unknown>) => void;
    gitSha?: () => string;
    allowedEmails?: readonly string[];
    countBusiness?: (db: never) => Promise<unknown>;
  },
): Promise<ImportEntryResult>;
