/**
 * Training profile migration. Default is a dry run. This step writes only the
 * local Firestore emulator.
 *
 * Identity does not read Firebase Auth. The reader service account has no Auth
 * permission. The chain is the operator's --source-uid (confirmed locally in
 * the M2 census), a case-insensitive username match, and the target uid anchor.
 *
 * A live source read uses GOOGLE_APPLICATION_CREDENTIALS. The agreed path is
 * ~/.config/gcp/training-migration-reader.json. This file does not open that
 * path unless the variable is set, and it refuses a path inside the repository.
 * The emulator target does not use a writer key. A staging dry-run reads
 * skatingx-platform with TARGET_GOOGLE_APPLICATION_CREDENTIALS, and that
 * variable must resolve to ~/.config/gcp/migration-writer.json outside the
 * repository. Staging writes stay closed until M5b. Production stays closed.
 *
 * Source access is one profile/main get. There is no source write.
 * Payloads from buildMigrationPlan omit updatedAt. Each target write adds
 * serverTimestamp() at write time. state and gamification merge. records,
 * task history, and the unmapped backup are full documents.
 */

import { readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { MigrationStop, buildMigrationPlan, createEmptyTargetState } from "./training-map.mjs";

export { MigrationStop };

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export const SOURCE_PROJECT = "blaze-skate-training-platform";
export const SOURCE_APP = "blaze-skate-production";
export const TARGET_UID = "baWEw6SZKcQItvcDdpF64ZNe5W12";
export const EMULATOR_PROJECT = "demo-skatingx-migration";
export const STAGING_PROJECT = "skatingx-platform";
export const DEFAULT_ATHLETE_ID = "lindsay";

const SOURCE_CREDENTIAL_ENV = "GOOGLE_APPLICATION_CREDENTIALS";
const TARGET_CREDENTIAL_ENV = "TARGET_GOOGLE_APPLICATION_CREDENTIALS";
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const KIND_ORDER = ["state", "gamification", "recordsDoc", "taskHistoryDay", "backupDoc"];

function stop(message) {
  throw new MigrationStop(message);
}

export function parseArgs(argv) {
  const args = {
    write: false,
    target: "",
    fixture: "",
    sourceUid: "",
    targetUid: "",
    executionDate: "",
    snapshotOut: "",
    athleteId: DEFAULT_ATHLETE_ID,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];
    const value = (flag) => {
      if (!next || next.startsWith("--")) stop(`${flag} needs a value`);
      index += 1;
      return next;
    };
    if (token === "--write") args.write = true;
    else if (token === "--dry-run") args.dryRun = true;
    else if (token === "--target") args.target = value(token);
    else if (token === "--fixture") args.fixture = value(token);
    else if (token === "--source-uid") args.sourceUid = value(token);
    else if (token === "--target-uid") args.targetUid = value(token);
    else if (token === "--execution-date") args.executionDate = value(token);
    else if (token === "--snapshot-out") args.snapshotOut = value(token);
    else if (token === "--athlete-id") args.athleteId = value(token);
    else if (token === "--project") stop("--project is not accepted. The target project is fixed in the script.");
    else stop(`unknown argument ${token}`);
  }
  if (args.write && args.dryRun) stop("--dry-run and --write cannot be combined");
  if (args.target === "staging" && args.write) {
    stop("--write is not authorized for --target staging in this step. Staging writes stay in M5b.");
  }
  if (args.target === "production") {
    stop("--target production is not authorized in this step. Production writes stay in M6.");
  }
  if (args.target !== "emulator" && args.target !== "staging") {
    stop("--target must be emulator or staging.");
  }
  if (!args.sourceUid) stop("--source-uid is required");
  if (args.targetUid !== TARGET_UID) stop("--target-uid does not match the confirmed account");
  if (!DATE_PATTERN.test(args.executionDate)) stop("--execution-date must be YYYY-MM-DD");
  if (!args.athleteId) stop("--athlete-id is empty");
  if (args.write && !args.snapshotOut) stop("--write requires --snapshot-out outside the repository");
  if (args.snapshotOut && isInsideRepo(args.snapshotOut)) {
    stop("--snapshot-out path is inside the repository. Choose a file outside the repo.");
  }
  return args;
}

function isInsideRepo(filePath) {
  const resolved = path.resolve(filePath);
  return resolved === ROOT || resolved.startsWith(`${ROOT}${path.sep}`);
}

function assertCredentialLocation(env) {
  const configured = env[SOURCE_CREDENTIAL_ENV];
  if (configured && isInsideRepo(configured)) {
    stop(`${SOURCE_CREDENTIAL_ENV} is inside the repository. Move the key outside the repo.`);
  }
}

function assertKeyFile(env, name, hint) {
  const configured = env[name];
  if (!configured) stop(`${name} is unset. ${hint}`);
  if (isInsideRepo(configured)) stop(`${name} is inside the repository. Move the key outside the repo.`);
  const resolved = path.resolve(configured);
  let info;
  try {
    info = statSync(resolved);
  } catch {
    stop(`${name} does not point at a key file.`);
  }
  if (!info.isFile()) stop(`${name} does not point at a key file.`);
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(resolved, "utf8"));
  } catch {
    stop(`${name} is not a readable service account key.`);
  }
  if (typeof parsed?.client_email !== "string" || typeof parsed?.private_key !== "string") {
    stop(`${name} is not a service account key.`);
  }
}

function assertLiveCredential(env) {
  assertKeyFile(env, SOURCE_CREDENTIAL_ENV, "Point it at the training reader key outside the repository.");
}

export function agreedWriterKeyPath() {
  return path.join(homedir(), ".config", "gcp", "migration-writer.json");
}

export function assertWriterCredential(env) {
  const configured = env[TARGET_CREDENTIAL_ENV];
  if (!configured) {
    stop(`${TARGET_CREDENTIAL_ENV} is unset. Point it at ~/.config/gcp/migration-writer.json.`);
  }
  if (isInsideRepo(configured)) {
    stop(`${TARGET_CREDENTIAL_ENV} is inside the repository. Move the key outside the repo.`);
  }
  if (path.resolve(configured) !== path.resolve(agreedWriterKeyPath())) {
    stop(`${TARGET_CREDENTIAL_ENV} must point at ~/.config/gcp/migration-writer.json.`);
  }
  assertKeyFile(env, TARGET_CREDENTIAL_ENV, "Point it at ~/.config/gcp/migration-writer.json.");
}

export function assertStagingEnvironment(env) {
  if (STAGING_PROJECT !== "skatingx-platform") stop("staging project must be skatingx-platform");
  if (env.FIRESTORE_EMULATOR_HOST || process.env.FIRESTORE_EMULATOR_HOST) {
    stop("FIRESTORE_EMULATOR_HOST is set. Staging does not use the emulator.");
  }
  assertWriterCredential(env);
}

function assertSnapshotParent(file) {
  const resolved = path.resolve(file);
  let parent;
  try {
    parent = statSync(path.dirname(resolved));
  } catch {
    stop("--snapshot-out parent directory does not exist.");
  }
  if (!parent.isDirectory()) stop("--snapshot-out parent is not a directory.");
}

function assertUsername(legacyDoc) {
  const username = legacyDoc?.username;
  if (typeof username !== "string" || !/lindsay/i.test(username)) {
    stop("source username does not match the confirmed profile");
  }
}

export function loadFixture(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

export async function readSourceProfile(env, sourceUid) {
  const saved = env.FIRESTORE_EMULATOR_HOST;
  const savedProcess = process.env.FIRESTORE_EMULATOR_HOST;
  delete env.FIRESTORE_EMULATOR_HOST;
  delete process.env.FIRESTORE_EMULATOR_HOST;
  try {
    const { applicationDefault, initializeApp } = await import("firebase-admin/app");
    const { getFirestore } = await import("firebase-admin/firestore");
    const app = initializeApp(
      { credential: applicationDefault(), projectId: SOURCE_PROJECT },
      `training-source-${process.pid}`,
    );
    const db = getFirestore(app);
    const snap = await db.doc(`artifacts/${SOURCE_APP}/users/${sourceUid}/profile/main`).get();
    if (!snap.exists) stop("source profile was not found");
    return snap.data();
  } finally {
    if (saved === undefined) delete env.FIRESTORE_EMULATOR_HOST;
    else env.FIRESTORE_EMULATOR_HOST = saved;
    if (savedProcess === undefined) delete process.env.FIRESTORE_EMULATOR_HOST;
    else process.env.FIRESTORE_EMULATOR_HOST = savedProcess;
  }
}

function jsonSafe(value) {
  if (value == null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (typeof value.toDate === "function" && typeof value.toMillis === "function") {
    return { type: "timestamp", iso: value.toDate().toISOString() };
  }
  if (Array.isArray(value)) return value.map((item) => jsonSafe(item));
  if (typeof value === "object") {
    const name = value.constructor?.name;
    if (name && name !== "Object") stop(`snapshot cannot store ${name}`);
    const out = {};
    for (const [key, item] of Object.entries(value)) out[key] = jsonSafe(item);
    return out;
  }
  stop("snapshot cannot store an unsupported value");
}

async function openStagingDb(env) {
  if (env.FIRESTORE_EMULATOR_HOST || process.env.FIRESTORE_EMULATOR_HOST) {
    stop("FIRESTORE_EMULATOR_HOST is set. Staging does not use the emulator.");
  }
  if (STAGING_PROJECT !== "skatingx-platform") stop("staging project must be skatingx-platform");
  const { cert, initializeApp } = await import("firebase-admin/app");
  const { getFirestore } = await import("firebase-admin/firestore");
  const app = initializeApp(
    { credential: cert(path.resolve(agreedWriterKeyPath())), projectId: STAGING_PROJECT },
    `training-staging-${process.pid}-${Date.now()}`,
  );
  return getFirestore(app);
}

export async function openTargetDb(env, args = { target: "emulator" }) {
  if (args.target === "staging") return openStagingDb(env);
  if (!env.FIRESTORE_EMULATOR_HOST) {
    env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
  }
  process.env.FIRESTORE_EMULATOR_HOST = env.FIRESTORE_EMULATOR_HOST;
  const { initializeApp } = await import("firebase-admin/app");
  const { getFirestore } = await import("firebase-admin/firestore");
  const app = initializeApp({ projectId: EMULATOR_PROJECT }, `training-target-${process.pid}-${Date.now()}`);
  return getFirestore(app);
}

export async function readTargetState(db, uid, athleteId) {
  const state = createEmptyTargetState(uid, athleteId);
  const athlete = `artifacts/skatingx-production/users/${uid}/athletes/${athleteId}`;
  const trainingSnap = await db.doc(`${athlete}/training/state`).get();
  if (trainingSnap.exists) {
    const data = trainingSnap.data();
    if (Array.isArray(data.todayTasks)) state.trainingState.todayTasks = data.todayTasks;
    if (data.weeklyTemplate && typeof data.weeklyTemplate === "object") {
      state.trainingState.weeklyTemplate = { ...state.trainingState.weeklyTemplate, ...data.weeklyTemplate };
    }
    if (typeof data.lastLoginDate === "string") state.trainingState.lastLoginDate = data.lastLoginDate;
  }
  const gameSnap = await db.doc(`${athlete}/gamification/main`).get();
  if (gameSnap.exists) {
    const data = gameSnap.data();
    if (typeof data.points === "number") state.gamification.points = data.points;
    if (Array.isArray(data.completedDays)) state.gamification.completedDays = data.completedDays;
    if (typeof data.streakDays === "number") state.gamification.streakDays = data.streakDays;
  }
  const recordsSnap = await db.collection(`${athlete}/training/main/records`).get();
  for (const item of recordsSnap.docs) state.records[item.id] = item.data();
  const historySnap = await db.collection(`${athlete}/training/main/taskHistory`).get();
  for (const item of historySnap.docs) state.taskHistory[item.id] = item.data();
  return state;
}

async function collectSnapshot(db, writes) {
  const records = [];
  for (const item of writes) {
    const snap = await db.doc(item.path).get();
    records.push({
      path: item.path,
      exists: snap.exists,
      data: snap.exists ? jsonSafe(snap.data()) : null,
    });
  }
  return records;
}

function writeSnapshotFile(file, records) {
  if (isInsideRepo(file)) stop("--snapshot-out path is inside the repository. Choose a file outside the repo.");
  writeFileSync(path.resolve(file), `${JSON.stringify(records, null, 2)}\n`);
}

async function writeDocuments(db, writes) {
  const { FieldValue } = await import("firebase-admin/firestore");
  for (const item of writes) {
    const body = { ...item.payload, updatedAt: FieldValue.serverTimestamp() };
    const merge = item.kind === "state" || item.kind === "gamification";
    if (merge) await db.doc(item.path).set(body, { merge: true });
    else await db.doc(item.path).set(body);
  }
}

export function appendCounts(plan, targetState) {
  let tasksAdded = 0;
  let historyTasksAdded = 0;
  let recordsAdded = 0;
  for (const write of plan.writes) {
    if (write.kind === "state" && Array.isArray(write.payload.todayTasks)) {
      const existing = new Set(targetState.trainingState.todayTasks.map((task) => task.id));
      tasksAdded += write.payload.todayTasks.filter((task) => !existing.has(task.id)).length;
    }
    if (write.kind === "taskHistoryDay") {
      const existingTasks = targetState.taskHistory[write.payload.dateId]?.tasks ?? [];
      const existing = new Set(existingTasks.map((task) => task.id));
      historyTasksAdded += write.payload.tasks.filter((task) => !existing.has(task.id)).length;
    }
    if (write.kind === "recordsDoc") {
      const existingEntries = targetState.records[write.payload.distanceId]?.entries ?? [];
      const existing = new Set(existingEntries.map((entry) => entry.id));
      recordsAdded += write.payload.entries.filter((entry) => !existing.has(entry.id)).length;
    }
  }
  return { tasksAdded, historyTasksAdded, recordsAdded };
}

export function formatSummary(plan, counts) {
  const kinds = KIND_ORDER.map((kind) => `${kind}:${plan.writes.filter((write) => write.kind === kind).length}`).join(",");
  const backupKeys = plan.backup ? Object.keys(plan.backup).sort().join(",") : "none";
  const skips = plan.skips.length ? plan.skips.map((skip) => `${skip.field}:${skip.reason}`).join(",") : "none";
  return `plan-summary kinds=${kinds} tasksAdded=${counts.tasksAdded} historyTasksAdded=${counts.historyTasksAdded} recordsAdded=${counts.recordsAdded} backupKeys=${backupKeys} skips=${skips}`;
}

export function formatTargetState(legacyDoc, targetState) {
  const legacyPoints = typeof legacyDoc.points === "number" && Number.isFinite(legacyDoc.points)
    ? String(legacyDoc.points)
    : "absent";
  const recordIds = Object.keys(targetState.records).sort();
  const template = targetState.trainingState.weeklyTemplate ?? {};
  const filled = Object.values(template).some((value) => typeof value === "string" && value.trim() !== "");
  const records = recordIds.length === 0 ? "none" : recordIds.join(",");
  return `target-state legacyPoints=${legacyPoints} points=${targetState.gamification.points} records=${records} weeklyTemplate=${filled ? "filled" : "empty"}`;
}

function printSummary(args, plan, counts, legacyDoc, targetState) {
  console.log(`mode: ${args.write ? "write" : "dry-run"}`);
  console.log(`target: ${args.target}`);
  console.log(`source-uid: ${args.sourceUid}`);
  console.log("username matched");
  console.log(formatSummary(plan, counts));
  console.log(formatTargetState(legacyDoc, targetState));
}

export async function run(argv, env = process.env, deps = {}) {
  const args = parseArgs(argv);
  assertCredentialLocation(env);
  if (args.target === "staging") assertStagingEnvironment(env);
  if (!args.fixture) assertLiveCredential(env);
  if (args.write) assertSnapshotParent(args.snapshotOut);

  const legacyDoc = args.fixture
    ? loadFixture(args.fixture)
    : await (deps.readSourceProfile ?? readSourceProfile)(env, args.sourceUid);
  assertUsername(legacyDoc);

  const db = await (deps.openTargetDb ?? openTargetDb)(env, args);
  const targetState = await (deps.readTargetState ?? readTargetState)(db, args.targetUid, args.athleteId);
  const plan = buildMigrationPlan(legacyDoc, targetState, args.executionDate);
  const counts = appendCounts(plan, targetState);
  printSummary(args, plan, counts, legacyDoc, targetState);

  if (!args.write) {
    console.log("dry-run: no documents written");
    return { plan, counts };
  }

  const records = await (deps.collectSnapshot ?? collectSnapshot)(db, plan.writes);
  (deps.writeSnapshot ?? writeSnapshotFile)(args.snapshotOut, records);
  console.log(`snapshot written: ${records.length} target documents`);
  await (deps.writeDocuments ?? writeDocuments)(db, plan.writes);
  console.log(`wrote ${plan.writes.length} documents`);
  return { plan, counts };
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  run(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
