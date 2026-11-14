export const PRODUCTION_PROJECT_ID: string;
export const EXPECTED_DATABASE_ID: string;
export const FIRESTORE_USERS_COLLECTION: string;
export const RACE_RESULT_PATH: string;
export const VIDEO_METADATA_PATH: string;
export const ALLOWED_PRODUCTION_SERVICE_ACCOUNTS: readonly string[];

export interface ImportArgs {
  mode: "initial" | "resume";
  runId: string;
  execute: boolean;
  target: "emulator" | "production";
  project: string;
  confirm: string;
  actor: string;
}

export interface ServiceAccountCredential {
  type: string;
  clientEmail?: string;
  projectId?: string;
}

export interface AuthCount {
  status: "available" | "unavailable";
  count?: number;
  reason?: string;
}

export interface BusinessCounts {
  status: "available" | "unavailable";
  firestoreUsers?: number;
  raceResults?: number;
  videoMetadata?: number;
  reason?: string;
  paths?: {
    firestoreUsers: string;
    raceResults: string;
    videoMetadata: string;
  };
}

export function parseImportArgs(argv: readonly string[]): ImportArgs;

export function assertExecutionTarget(input: {
  target: string;
  projectId: string;
  confirm?: string;
  emulatorHost?: string;
  execute?: boolean;
  databaseId?: string;
}): { target: string; phase: "execute" | "preflight" };

export function assertServiceAccountIdentity(input: {
  credential: ServiceAccountCredential | null | undefined;
  projectId: string;
  allowedEmails?: readonly string[];
}): { type: "service_account"; clientEmail: string; projectId: string };

export function assertProductionConnectionDisabled(): never;

export function confirmProjectOnStdin(projectId: string, readLine: () => Promise<string>): Promise<void>;

export function readLineFromStdin(): Promise<string>;

export function resolveAuthUserCount(result: { status?: string; count?: number; reason?: string } | null | undefined): AuthCount;

export function countBusinessData(db: {
  collection: (path: string) => {
    get: () => Promise<{ size: number; docs: Array<{ ref: { collection: (name: string) => { get: () => Promise<{ size: number; docs: unknown[] }> } } }> }>;
  };
}): Promise<BusinessCounts & { status: "available"; firestoreUsers: number; raceResults: number; videoMetadata: number }>;

export function assertBusinessCountsForProduction(
  authUsers: { status?: string; count?: number; reason?: string } | null | undefined,
  business: { status?: string } | null | undefined,
): { authUsers: number; status: string };

export function formatExecutionSummary(summary: {
  target: string;
  projectId: string;
  databaseId: string;
  identity: string;
  runId: string;
  mode: string;
  actor: string;
  gitSha: string;
  workbookSha256: string;
  plannedContentWrites: number;
  plannedAuditWrites: number;
  plannedMigrationCreates: number;
  baseBudget: number;
  authUsers?: AuthCount;
  business?: { status?: string; firestoreUsers?: number; raceResults?: number; videoMetadata?: number };
}): string;
