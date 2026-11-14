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

// This step has no authorized production identity. A later acceptance step
// replaces this list. An empty list fail-closes every real production run.
export const ALLOWED_PRODUCTION_SERVICE_ACCOUNTS = [];

export function parseImportArgs(argv) {
  const args = {
    mode: "initial",
    runId: "",
    execute: false,
    target: "",
    project: "",
    confirm: "",
    actor: "",
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

export function assertProductionConnectionDisabled() {
  throw new Error(
    "refusing to run: production Firestore connection is disabled until production acceptance",
  );
}

export async function confirmProjectOnStdin(projectId, readLine) {
  const entered = (await readLine()).trim();
  if (entered !== projectId) {
    throw new Error("refusing to run: stdin confirmation does not match the project id");
  }
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
  const usersSnap = await db.collection(FIRESTORE_USERS_COLLECTION).get();
  let raceResults = 0;
  let videoMetadata = 0;
  for (const user of usersSnap.docs) {
    const events = await user.ref.collection("raceDay").get();
    for (const event of events.docs) {
      const results = await event.ref.collection("results").get();
      raceResults += results.size;
    }
    const videos = await user.ref.collection("videos").get();
    videoMetadata += videos.size;
  }
  return {
    status: "available",
    firestoreUsers: usersSnap.size,
    raceResults,
    videoMetadata,
    paths: {
      firestoreUsers: FIRESTORE_USERS_COLLECTION,
      raceResults: RACE_RESULT_PATH,
      videoMetadata: VIDEO_METADATA_PATH,
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
        ].join("\n")
      : "firestoreUsers: unavailable\nraceResults: unavailable\nvideoMetadata: unavailable";
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
    `authUsers: ${authText}`,
    businessText,
    `userPath: ${FIRESTORE_USERS_COLLECTION}`,
    `raceResultPath: ${RACE_RESULT_PATH}`,
    `videoMetadataPath: ${VIDEO_METADATA_PATH}`,
  ].join("\n");
}
