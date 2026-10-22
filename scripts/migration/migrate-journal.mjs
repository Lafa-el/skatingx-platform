/**
 * Journal migration. Default is a dry run. Writes stay on the local Firestore
 * emulator. Staging writes require a snapshot; production is refused while parsing.
 *
 * The source project is blaze-skate-journal. There is no --project flag.
 * The staging project is skatingx-platform. Its credential must be the writer
 * key at ~/.config/gcp/migration-writer.json.
 * A live source read uses GOOGLE_APPLICATION_CREDENTIALS.
 *
 * Before that read, FIRESTORE_EMULATOR_HOST is removed so the live client
 * cannot be routed into the emulator. The emulator target sets the host again
 * when it connects. Payloads come from buildJournalPlan. Time fields stay
 * the mapped source strings. This script does not mint a clock value.
 *
 * Mapper paths are journal/<collection>/<id>. Stored documents insert main
 * after journal so the full path has an even number of segments.
 */

import { readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ANCHOR_PREFIX, SOURCE_APP, TARGET_UID, MigrationStop, buildJournalPlan } from "./journal-map.mjs";

export { MigrationStop, ANCHOR_PREFIX, TARGET_UID };

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export const SOURCE_PROJECT = "blaze-skate-journal";
export const EMULATOR_PROJECT = "demo-skatingx-migration";
export const STAGING_PROJECT = "skatingx-platform";
export const PLATFORM_PREFIX = "artifacts/skatingx-production";

const SOURCE_CREDENTIAL_ENV = "GOOGLE_APPLICATION_CREDENTIALS";
const TARGET_CREDENTIAL_ENV = "TARGET_GOOGLE_APPLICATION_CREDENTIALS";
const SOURCE_COLLECTIONS = [
  "athletes",
  "journal_days",
  "training_sessions",
  "coach_notes",
  "body_status",
  "performance_records",
  "video_refs",
  "weekly_reviews",
  "milestones",
];
const TARGET_COLLECTIONS = [
  "athlete",
  "days",
  "sessions",
  "coachNotes",
  "bodyStatus",
  "performance",
  "videos",
  "weeklyReviews",
];

let appSerial = 0;

function stop(message) {
  throw new MigrationStop(message);
}

function nextAppName(prefix) {
  appSerial += 1;
  return `${prefix}-${process.pid}-${appSerial}`;
}

export function parseArgs(argv) {
  const args = { write: false, target: "", fixture: "", snapshotOut: "" };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];
    const value = (flag) => {
      if (!next || next.startsWith("--")) stop(`${flag} needs a value`);
      index += 1;
      return next;
    };
    if (token === "--write") args.write = true;
    else if (token === "--target") args.target = value(token);
    else if (token === "--fixture") args.fixture = value(token);
    else if (token === "--snapshot-out" || token === "--snapshot") args.snapshotOut = value(token);
    else if (token === "--project") stop("--project is not accepted. The source project is fixed in the script.");
    else stop(`unknown argument ${token}`);
  }
  if (args.target === "production") stop("--target production is refused.");
  if (args.write && args.target !== "emulator" && args.target !== "staging") stop("--write requires --target emulator");
  if (args.target !== "emulator" && args.target !== "staging") stop("--target must be emulator");
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

function assertCredentialLocations(env) {
  for (const name of [SOURCE_CREDENTIAL_ENV, TARGET_CREDENTIAL_ENV]) {
    const configured = env[name];
    if (configured && isInsideRepo(configured)) {
      stop(`${name} is inside the repository. Move the key outside the repo.`);
    }
  }
}

function assertLiveCredential(env) {
  const configured = env[SOURCE_CREDENTIAL_ENV];
  if (!configured) stop(`${SOURCE_CREDENTIAL_ENV} is unset. Point it at the journal reader key outside the repository.`);
  if (isInsideRepo(configured)) stop(`${SOURCE_CREDENTIAL_ENV} is inside the repository. Move the key outside the repo.`);
  const resolved = path.resolve(configured);
  let info;
  try {
    info = statSync(resolved);
  } catch {
    stop(`${SOURCE_CREDENTIAL_ENV} does not point at a key file.`);
  }
  if (!info.isFile()) stop(`${SOURCE_CREDENTIAL_ENV} does not point at a key file.`);
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(resolved, "utf8"));
  } catch {
    stop(`${SOURCE_CREDENTIAL_ENV} is not a readable service account key.`);
  }
  if (typeof parsed?.client_email !== "string" || typeof parsed?.private_key !== "string") {
    stop(`${SOURCE_CREDENTIAL_ENV} is not a service account key.`);
  }
}

export function stagingWriterKeyPath() {
  return path.join(homedir(), ".config", "gcp", "migration-writer.json");
}

export function assertStagingProject(projectId) {
  if (projectId !== "skatingx-platform") stop("staging project must be skatingx-platform");
}

function assertStagingKeyFile(env) {
  const resolved = path.resolve(stagingWriterKeyPath());
  let info;
  try {
    info = statSync(resolved);
  } catch {
    stop(`${TARGET_CREDENTIAL_ENV} does not point at a key file.`);
  }
  if (!info.isFile()) stop(`${TARGET_CREDENTIAL_ENV} does not point at a key file.`);
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(resolved, "utf8"));
  } catch {
    stop(`${TARGET_CREDENTIAL_ENV} is not a readable service account key.`);
  }
  if (typeof parsed?.client_email !== "string" || typeof parsed?.private_key !== "string") {
    stop(`${TARGET_CREDENTIAL_ENV} is not a service account key.`);
  }
  if (path.resolve(env[TARGET_CREDENTIAL_ENV]) !== resolved) {
    stop(`${TARGET_CREDENTIAL_ENV} must point at ~/.config/gcp/migration-writer.json.`);
  }
}

export function assertStagingEnvironment(env) {
  assertStagingProject(STAGING_PROJECT);
  if (env.FIRESTORE_EMULATOR_HOST || process.env.FIRESTORE_EMULATOR_HOST) {
    stop("FIRESTORE_EMULATOR_HOST is set. Staging does not use the emulator.");
  }
  const configured = env[TARGET_CREDENTIAL_ENV];
  if (!configured) stop(`${TARGET_CREDENTIAL_ENV} is unset. Point it at ~/.config/gcp/migration-writer.json.`);
  if (path.resolve(configured) !== path.resolve(stagingWriterKeyPath())) {
    stop(`${TARGET_CREDENTIAL_ENV} must point at ~/.config/gcp/migration-writer.json.`);
  }
  assertStagingKeyFile(env);
}

export async function withLiveSource(env, read) {
  const savedEnv = env.FIRESTORE_EMULATOR_HOST;
  const savedProcess = process.env.FIRESTORE_EMULATOR_HOST;
  delete env.FIRESTORE_EMULATOR_HOST;
  delete process.env.FIRESTORE_EMULATOR_HOST;
  try {
    return await read();
  } finally {
    if (savedEnv === undefined) delete env.FIRESTORE_EMULATOR_HOST;
    else env.FIRESTORE_EMULATOR_HOST = savedEnv;
    if (savedProcess === undefined) delete process.env.FIRESTORE_EMULATOR_HOST;
    else process.env.FIRESTORE_EMULATOR_HOST = savedProcess;
  }
}

export async function readSource(env) {
  return withLiveSource(env, async () => {
    const { applicationDefault, initializeApp } = await import("firebase-admin/app");
    const { getFirestore } = await import("firebase-admin/firestore");
    const app = initializeApp(
      { credential: applicationDefault(), projectId: SOURCE_PROJECT },
      nextAppName("journal-source"),
    );
    const db = getFirestore(app);
    const source = {};
    for (const name of SOURCE_COLLECTIONS) {
      const snap = await db.collection(name).get();
      source[name] = snap.docs.map((item) => ({ id: item.id, data: item.data() }));
    }
    return source;
  });
}

export function loadFixture(file) {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    stop("--fixture is not a JSON object");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) stop("--fixture is not a JSON object");
  for (const name of SOURCE_COLLECTIONS) {
    if (!Array.isArray(parsed[name])) stop(`--fixture is missing ${name}`);
  }
  return parsed;
}

export function storagePath(planPath) {
  if (!planPath.startsWith("journal/")) stop("plan path is outside journal");
  const full = `${PLATFORM_PREFIX}/users/${TARGET_UID}/journal/main/${planPath.slice("journal/".length)}`;
  if (full.split("/").length % 2 !== 0) stop("target path has an odd number of segments");
  return full;
}

export function planPathFromStored(storedPath) {
  const marker = `/journal/main/`;
  const at = storedPath.indexOf(marker);
  if (at < 0) stop("stored path is outside journal/main");
  return `journal/${storedPath.slice(at + marker.length)}`;
}

async function openStagingDb(env) {
  assertStagingEnvironment(env);
  const { cert, initializeApp } = await import("firebase-admin/app");
  const { getFirestore } = await import("firebase-admin/firestore");
  const app = initializeApp(
    { credential: cert(path.resolve(stagingWriterKeyPath())), projectId: STAGING_PROJECT },
    nextAppName("journal-staging"),
  );
  return getFirestore(app);
}

export async function openTargetDb(env, args = { target: "emulator" }) {
  if (args.target === "staging") return openStagingDb(env);
  if (!env.FIRESTORE_EMULATOR_HOST) env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
  process.env.FIRESTORE_EMULATOR_HOST = env.FIRESTORE_EMULATOR_HOST;
  const { initializeApp } = await import("firebase-admin/app");
  const { getFirestore } = await import("firebase-admin/firestore");
  const app = initializeApp({ projectId: EMULATOR_PROJECT }, nextAppName("journal-target"));
  return getFirestore(app);
}

export async function readTargetJournal(db) {
  const docs = {};
  const root = `${PLATFORM_PREFIX}/users/${TARGET_UID}/journal/main`;
  for (const name of TARGET_COLLECTIONS) {
    const snap = await db.collection(`${root}/${name}`).get();
    for (const item of snap.docs) docs[planPathFromStored(item.ref.path)] = item.data();
  }
  return docs;
}

function jsonSafe(value) {
  if (value == null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.map((item) => jsonSafe(item));
  if (typeof value === "object") {
    const name = value.constructor?.name;
    if (name && name !== "Object") stop("snapshot cannot store an unsupported value");
    const out = {};
    for (const [key, item] of Object.entries(value)) out[key] = jsonSafe(item);
    return out;
  }
  stop("snapshot cannot store an unsupported value");
}

function mappedCount(source) {
  return SOURCE_COLLECTIONS.filter((name) => name !== "milestones").reduce((sum, name) => sum + source[name].length, 0);
}

async function collectSnapshot(source, db) {
  const target = await readTargetJournal(db);
  return {
    sourceApp: SOURCE_APP,
    source: Object.fromEntries(SOURCE_COLLECTIONS.map((name) => [
      name,
      source[name].map((doc) => ({ id: doc.id, data: jsonSafe(doc.data) })),
    ])),
    target: Object.keys(target).sort().map((planPath) => ({ path: planPath, data: jsonSafe(target[planPath]) })),
  };
}

function assertSnapshotParent(file) {
  let parent;
  try {
    parent = statSync(path.dirname(path.resolve(file)));
  } catch {
    stop("--snapshot-out parent directory does not exist.");
  }
  if (!parent.isDirectory()) stop("--snapshot-out parent is not a directory.");
}

function writeSnapshotFile(file, records) {
  if (isInsideRepo(file)) stop("--snapshot-out path is inside the repository. Choose a file outside the repo.");
  writeFileSync(path.resolve(file), `${JSON.stringify(records)}\n`);
}

async function writeDocuments(db, writes) {
  for (const item of writes) {
    await db.doc(storagePath(item.path)).set(item.data);
  }
}

async function postCheck(db, source) {
  const target = await readTargetJournal(db);
  return buildJournalPlan(source, target, { anchorPrefix: ANCHOR_PREFIX, targetUid: TARGET_UID });
}

function collectionOf(planPath) {
  return planPath.split("/")[1] ?? "";
}

function fieldNames(value, prefix = "") {
  if (!value || typeof value !== "object" || Array.isArray(value)) return prefix ? [prefix] : [];
  const names = [];
  for (const key of Object.keys(value).sort()) {
    const next = prefix ? `${prefix}.${key}` : key;
    const child = value[key];
    if (child && typeof child === "object" && !Array.isArray(child)) names.push(...fieldNames(child, next));
    else names.push(next);
  }
  return names;
}

export function formatTargetShape(targetDocs) {
  return Object.keys(targetDocs).sort().map((planPath) => (
    `target-shape ${planPath} fields=${fieldNames(targetDocs[planPath]).join(",")}`
  )).join("\n");
}

export function formatSummary(plan) {
  const lines = [`plan-summary writes=${plan.writes.length} skips=${plan.skips.length}`];
  for (const name of TARGET_COLLECTIONS) {
    const writes = plan.writes.filter((item) => collectionOf(item.path) === name).length;
    const skips = plan.skips.filter((item) => collectionOf(item.path) === name).length;
    lines.push(`collection ${name} writes=${writes} skips=${skips}`);
  }
  for (const item of plan.writes) lines.push(`write-path ${item.path}`);
  for (const item of plan.skips) lines.push(`skip-path ${item.path}`);
  return lines.join("\n");
}

function printSummary(args, plan, source, targetDocs) {
  console.log(`mode: ${args.write ? "write" : "dry-run"}`);
  console.log(`target: ${args.target}`);
  console.log(`anchor: ${ANCHOR_PREFIX}`);
  console.log(`source-counts ${SOURCE_COLLECTIONS.map((name) => `${name}=${source[name].length}`).join(" ")}`);
  console.log(`target-docs=${Object.keys(targetDocs).length}`);
  const shape = formatTargetShape(targetDocs);
  if (shape) console.log(shape);
  console.log(formatSummary(plan));
}

export async function run(argv, env = process.env, deps = {}) {
  const args = parseArgs(argv);
  assertCredentialLocations(env);
  if (args.target === "staging") assertStagingEnvironment(env);
  if (!args.fixture) assertLiveCredential(env);
  if (args.write) assertSnapshotParent(args.snapshotOut);

  const source = args.fixture
    ? loadFixture(args.fixture)
    : await (deps.readSource ?? readSource)(env);
  const db = await (deps.openTargetDb ?? openTargetDb)(env, args);
  const targetDocs = await (deps.readTargetJournal ?? readTargetJournal)(db);
  const plan = buildJournalPlan(source, targetDocs, { anchorPrefix: ANCHOR_PREFIX, targetUid: TARGET_UID });
  printSummary(args, plan, source, targetDocs);
  if (!args.write) {
    console.log("dry-run: no documents written");
    return { plan };
  }

  const records = await (deps.collectSnapshot ?? collectSnapshot)(source, db);
  (deps.writeSnapshot ?? writeSnapshotFile)(args.snapshotOut, records);
  const sourceDocs = SOURCE_COLLECTIONS.reduce((sum, name) => sum + source[name].length, 0);
  console.log(`snapshot written: sourceDocs=${sourceDocs} targetDocs=${records.target.length}`);
  await (deps.writeDocuments ?? writeDocuments)(db, plan.writes);
  console.log(`wrote ${plan.writes.length} documents`);
  const checked = await (deps.postCheck ?? ((database) => postCheck(database, source)))(db, source);
  console.log(`post-check writes=${checked.writes.length} skips=${checked.skips.length}`);
  if (checked.writes.length !== 0 || checked.skips.length !== mappedCount(source)) {
    stop("post-check failed");
  }
  return { plan };
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  run(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : "journal migration failed");
    process.exit(1);
  });
}
