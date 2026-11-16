// Execution target, credential, and confirmation guards for catalog import.
//
// Target comes only from the CLI. Environment variables do not decide whether
// this process may write. Production Firestore is not opened here.
import { createInterface } from "node:readline";

export const PRODUCTION_PROJECT_ID = "skatingx-prod";
export const EXPECTED_DATABASE_ID = "(default)";
export const FIRESTORE_USERS_COLLECTION = "artifacts/skatingx-production/users";
export const RACE_RESULT_PATH =
  "artifacts/skatingx-production/users/{userId}/raceDay/{eventId}/results/{resultId}";
export const VIDEO_METADATA_PATH = "artifacts/skatingx-production/users/{userId}/videos/{videoId}";
export const RACE_VIDEO_PATH =
  "artifacts/skatingx-production/users/{userId}/raceDay/{eventId}/videos/{videoId}";

const IAM_IMPERSONATION_URL =
  /^https:\/\/iamcredentials\.googleapis\.com\/v1\/projects\/-\/serviceAccounts\/([^:/?#]+):generateAccessToken$/;

export function assertRunDocumentId(runId) {
  if (typeof runId !== "string" || runId === "" || runId !== runId.trim()) {
    throw new Error("refusing to run: runId is not a single document id");
  }
  if (runId.includes("/") || runId.includes("\\") || runId === "." || runId === "..") {
    throw new Error("refusing to run: runId is not a single document id");
  }
}

// Short-lived impersonated ADC only. Long-lived JSON private keys are refused.
export const ALLOWED_PRODUCTION_SERVICE_ACCOUNTS = [
  "catalog-importer@skatingx-prod.iam.gserviceaccount.com",
];

export function parseImportArgs(argv) {
  const args = {
    mode: "initial",
    runId: "",
    execute: false,
    target: "",
    project: "",
    confirm: "",
    actor: "",
    allowProductionRead: false,
    allowProductionWrite: false,
    rollback: false,
    recoverLock: false,
    recoverReason: "",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--mode") args.mode = argv[(index += 1)] ?? "";
    else if (token === "--runId") args.runId = argv[(index += 1)] ?? "";
    else if (token === "--execute") args.execute = true;
    else if (token === "--target") args.target = argv[(index += 1)] ?? "";
    else if (token === "--project") args.project = argv[(index += 1)] ?? "";
    else if (token === "--confirm") args.confirm = argv[(index += 1)] ?? "";
    else if (token === "--actor") args.actor = argv[(index += 1)] ?? "";
    else if (token === "--allow-production-read") args.allowProductionRead = true;
    else if (token === "--allow-production-write") args.allowProductionWrite = true;
    else if (token === "--rollback") args.rollback = true;
    else if (token === "--recover-lock") args.recoverLock = true;
    else if (token === "--recover-reason") args.recoverReason = argv[(index += 1)] ?? "";
    else if (token === "--yes") throw new Error("refusing to run: --yes is not a confirmation");
    else throw new Error(`unknown argument ${token}`);
  }
  if (args.mode !== "initial" && args.mode !== "resume") {
    throw new Error("mode must be initial or resume");
  }
  if (args.target !== "emulator" && args.target !== "production") {
    throw new Error("--target emulator|production is required");
  }
  if (args.project === "") throw new Error("--project is required");
  if (args.mode === "resume" && args.runId === "") throw new Error("--runId is required for resume");
  if (args.mode === "initial" && args.runId === "") throw new Error("--runId is required");
  if (args.recoverLock && args.rollback) throw new Error("refusing to run: lock recovery cannot be combined with rollback");
  if (args.rollback && args.execute) throw new Error("refusing to run: rollback is a separate command");
  if (args.recoverLock && args.mode !== "resume") throw new Error("refusing to run: lock recovery requires resume");
  if (args.recoverLock && args.execute !== true) throw new Error("refusing to run: lock recovery requires --execute");
  if (args.recoverLock && args.recoverReason.trim() === "") {
    throw new Error("refusing to run: lock recovery requires a reason");
  }
  if (args.runId !== "") assertRunDocumentId(args.runId);
  return args;
}

export function assertExecutionTarget(input) {
  const target = input.target;
  const projectId = input.projectId;
  const emulatorHost = input.emulatorHost;
  if (target === "emulator") {
    if (typeof projectId !== "string" || !projectId.startsWith("demo-")) {
      throw new Error("refusing to run: project id must start with demo-");
    }
    if (projectId === PRODUCTION_PROJECT_ID) {
      throw new Error("refusing to run: emulator target cannot use the production project id");
    }
    if (typeof emulatorHost !== "string" || emulatorHost.trim() === "") {
      throw new Error("refusing to run: FIRESTORE_EMULATOR_HOST is not set");
    }
    return { target, phase: input.execute ? "execute" : "preflight" };
  }
  if (target !== "production") throw new Error("--target emulator|production is required");
  if (projectId !== PRODUCTION_PROJECT_ID) {
    throw new Error("refusing to run: production project id must be skatingx-prod");
  }
  if (input.confirm !== projectId) {
    throw new Error("refusing to run: --confirm must equal the production project id");
  }
  if (typeof emulatorHost === "string" && emulatorHost.trim() !== "") {
    throw new Error("refusing to run: FIRESTORE_EMULATOR_HOST must be unset for production");
  }
  if (input.databaseId !== EXPECTED_DATABASE_ID) {
    throw new Error("refusing to run: database id must be (default)");
  }
  return { target, phase: input.execute ? "execute" : "preflight" };
}

export function assertServiceAccountIdentity(input) {
  const credential = input.credential;
  if (!credential || credential.type !== "service_account") {
    throw new Error("refusing to run: credential type is not service_account");
  }
  if (typeof credential.clientEmail !== "string" || credential.clientEmail.trim() === "") {
    throw new Error("refusing to run: service account email is missing");
  }
  const email = credential.clientEmail.trim();
  const allowed = input.allowedEmails ?? ALLOWED_PRODUCTION_SERVICE_ACCOUNTS;
  if (!Array.isArray(allowed) || !allowed.includes(email)) {
    throw new Error("refusing to run: service account is not allowed");
  }
  if (credential.projectId !== input.projectId) {
    throw new Error("refusing to run: credential project does not match the target project");
  }
  return { type: "service_account", clientEmail: email, projectId: credential.projectId };
}

function assertNoLongLivedKey(value) {
  if (!value || typeof value !== "object") return;
  if (typeof value.private_key === "string" || value.type === "service_account") {
    throw new Error("refusing to run: long-lived service account keys are not accepted");
  }
  if (value.source_credentials) assertNoLongLivedKey(value.source_credentials);
  if (value.credential_source) assertNoLongLivedKey(value.credential_source);
}

export function identityFromAdcPayload(payload) {
  if (!payload || typeof payload !== "object") {
    throw new Error("refusing to run: credential type is not service_account");
  }
  assertNoLongLivedKey(payload);
  if (Object.hasOwn(payload, "delegates")) {
    const delegates = payload.delegates;
    if (!Array.isArray(delegates) || delegates.length > 0) {
      throw new Error("refusing to run: impersonation delegates are not accepted");
    }
  }
  if (Object.hasOwn(payload, "universe_domain") && payload.universe_domain !== "googleapis.com") {
    throw new Error("refusing to run: universe domain is not accepted");
  }
  if (Object.hasOwn(payload, "token_uri") || Object.hasOwn(payload, "token_url")) {
    throw new Error("refusing to run: unexpected credential endpoint");
  }
  if (payload.type !== "impersonated_service_account") {
    throw new Error("refusing to run: credential type is not service_account");
  }
  const source = payload.source_credentials;
  if (!source || source.type !== "authorized_user") {
    throw new Error("refusing to run: impersonation source is not a user credential");
  }
  for (const field of ["client_id", "client_secret", "refresh_token"]) {
    if (typeof source[field] !== "string" || source[field].trim() === "") {
      throw new Error("refusing to run: impersonation source is not a user credential");
    }
  }
  const url = typeof payload.service_account_impersonation_url === "string"
    ? payload.service_account_impersonation_url
    : "";
  const match = url.match(IAM_IMPERSONATION_URL);
  if (!match) throw new Error("refusing to run: impersonation url is not a Google IAM endpoint");
  // quota_project_id attributes API quota. It does not prove the Firestore project.
  return {
    type: "service_account",
    clientEmail: decodeURIComponent(match[1]),
    projectId: PRODUCTION_PROJECT_ID,
  };
}

export function assertExplicitConfirmation(confirmation, projectId) {
  if (confirmation !== "IMPORT" && confirmation !== projectId) {
    throw new Error("refusing to run: production confirmation was rejected");
  }
  return confirmation;
}

export async function confirmProjectOnStdin(projectId, readLine) {
  const entered = await readLine();
  return assertExplicitConfirmation(typeof entered === "string" ? entered : "", projectId);
}

export function readLineFromStdin() {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stderr });
    rl.question(`Type the target project id (${process.stdin.isTTY ? "required" : "stdin"}): `, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

export function resolveAuthUserCount(result) {
  if (!result || result.status !== "available" || typeof result.count !== "number" || result.count < 0) {
    return { status: "unavailable", reason: result?.reason ?? "Firebase Auth user count is not available" };
  }
  return { status: "available", count: result.count };
}

export async function countBusinessData(db) {
  const userRefs = await db.collection(FIRESTORE_USERS_COLLECTION).listDocuments();
  let raceResults = 0;
  let videoMetadata = 0;
  let raceVideos = 0;
  let firestoreUsers = 0;
  for (const userRef of userRefs) {
    firestoreUsers += 1;
    const events = await userRef.collection("raceDay").listDocuments();
    for (const eventRef of events) {
      const results = await eventRef.collection("results").get();
      raceResults += results.size;
      const eventVideos = await eventRef.collection("videos").get();
      raceVideos += eventVideos.size;
      videoMetadata += eventVideos.size;
    }
    const videos = await userRef.collection("videos").get();
    videoMetadata += videos.size;
  }
  return {
    status: "available",
    firestoreUsers,
    raceResults,
    videoMetadata,
    raceVideos,
    paths: {
      firestoreUsers: FIRESTORE_USERS_COLLECTION,
      raceResults: RACE_RESULT_PATH,
      videoMetadata: VIDEO_METADATA_PATH,
      raceVideos: RACE_VIDEO_PATH,
    },
  };
}

export function assertBusinessCountsForProduction(authUsers, business) {
  const auth = resolveAuthUserCount(authUsers);
  if (auth.status !== "available") {
    throw new Error("refusing to run: Firebase Auth user count is unavailable");
  }
  if (!business || business.status !== "available") {
    throw new Error("refusing to run: Firestore business counts are unavailable");
  }
  return { authUsers: auth.count, ...business };
}

export function formatExecutionSummary(summary) {
  const authText =
    summary.authUsers?.status === "available" ? String(summary.authUsers.count) : "unavailable";
  const business = summary.business;
  const businessText =
    business?.status === "available"
      ? [
          `firestoreUsers: ${business.firestoreUsers}`,
          `raceResults: ${business.raceResults}`,
          `videoMetadata: ${business.videoMetadata}`,
          `raceVideos: ${business.raceVideos ?? 0}`,
        ].join("\n")
      : "firestoreUsers: unavailable\nraceResults: unavailable\nvideoMetadata: unavailable\nraceVideos: unavailable";
  return [
    `target: ${summary.target}`,
    `projectId: ${summary.projectId}`,
    `databaseId: ${summary.databaseId}`,
    `identity: ${summary.identity}`,
    `runId: ${summary.runId}`,
    `mode: ${summary.mode}`,
    `actor: ${summary.actor}`,
    `gitSha: ${summary.gitSha}`,
    `workbookSha256: ${summary.workbookSha256}`,
    `plannedContentWrites: ${summary.plannedContentWrites}`,
    `plannedAuditWrites: ${summary.plannedAuditWrites}`,
    `plannedMigrationCreates: ${summary.plannedMigrationCreates}`,
    `baseBudget: ${summary.baseBudget}`,
    `planDigest: ${summary.planDigest ?? ""}`,
    `plannedDocuments: ${summary.plannedDocuments ?? summary.plannedContentWrites + summary.plannedAuditWrites + summary.plannedMigrationCreates}`,
    "plannedDocumentsNote: content, audits, and migration create; lock writes stay inside baseBudget",
    `remainingObjectGroups: ${summary.remainingObjectGroups ?? ""}`,
    `lockStatus: ${summary.lockStatus ?? ""}`,
    `migrationStatus: ${summary.migrationStatus ?? ""}`,
    `orphans: ${Array.isArray(summary.orphans) ? summary.orphans.join(",") : ""}`,
    `collections: ${summary.collections ? Object.entries(summary.collections).map(([name, count]) => `${name}=${count}`).join(",") : ""}`,
    `authUsers: ${authText}`,
    businessText,
    `userPath: ${FIRESTORE_USERS_COLLECTION}`,
    `raceResultPath: ${RACE_RESULT_PATH}`,
    `videoMetadataPath: ${VIDEO_METADATA_PATH}`,
    `raceVideoPath: ${RACE_VIDEO_PATH}`,
    "safety: production writes require --allow-production-write, a verified service account, --confirm, and stdin",
  ].join("\n");
}
