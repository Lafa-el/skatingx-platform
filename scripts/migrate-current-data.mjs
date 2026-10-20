/**
 * Copy current SkatingX documents from skatingx-platform onto the emulator or
 * skatingx-prod. Default is a dry run. The copy keeps the same path and the
 * same fields.
 *
 * Source reads use GOOGLE_APPLICATION_CREDENTIALS against project
 * skatingx-platform. Target writes, and --backup-target reads, use
 * TARGET_GOOGLE_APPLICATION_CREDENTIALS. The emulator does not need the target
 * key. A dry run does not either. This file does not open a key path unless
 * that variable is set. Keys stay outside the repository.
 *
 * Production is --write --target production --project skatingx-prod
 * --confirm-production. skatingx-production stays blocked: it is the path
 * prefix, not a project id. skatingx-platform stays blocked as a write target
 * so this script cannot overwrite its own source.
 */

import { readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const SOURCE_PROJECT = "skatingx-platform";
export const SOURCE_ROOT = "artifacts/skatingx-production";
export const EMULATOR_PROJECT = "demo-skatingx-current";
export const PRODUCTION_PROJECT = "skatingx-prod";
export const BLOCKED_PROJECTS = new Set(["skatingx-production", "skatingx-platform"]);

const SOURCE_CREDENTIAL_ENV = "GOOGLE_APPLICATION_CREDENTIALS";
const TARGET_CREDENTIAL_ENV = "TARGET_GOOGLE_APPLICATION_CREDENTIALS";
const SOURCE_CREDENTIAL_HINT =
  "Point it at a key that can read skatingx-platform. The script will not look up a path by itself.";
const TARGET_CREDENTIAL_HINT =
  "Point it at the write key for the target project. The script will not look up a path by itself.";

// One round trip per document never printed anything until the whole tree finished.
// Read users in batches and log after each batch so a live dry-run cannot sit silent.
const READ_BATCH = 20;

const SKIP_RULES = [
  { reason: "equipment-history", marker: "/equipment/main/records/" },
  { reason: "planning-check-in", marker: "/planning/main/completedTasks/" },
  { reason: "analysis-profile-backup", marker: "/migrationBackups/analysis-profile" },
];

export class MigrationStop extends Error {
  constructor(message) {
    super(message);
    this.name = "MigrationStop";
  }
}

function stop(message) {
  throw new MigrationStop(message);
}

export function skipReason(docPath) {
  if (docPath.includes("/equipment/main/records/") || docPath.endsWith("/equipment/main/records")) return "equipment-history";
  if (docPath.includes("/planning/main/completedTasks/") || docPath.endsWith("/planning/main/completedTasks")) return "planning-check-in";
  if (docPath.endsWith("/migrationBackups/analysis-profile") || docPath.includes("/migrationBackups/analysis-profile/")) {
    return "analysis-profile-backup";
  }
  return null;
}

export function inventoryKey(docPath) {
  const parts = docPath.split("/");
  const collection = parts[4];
  if (!collection) return "other";
  if (collection === "athletes") return parts[6] ? `athletes/${parts[6]}` : "athletes";
  return collection;
}

export function planCopy(source) {
  const documents = source?.documents;
  if (!Array.isArray(documents)) stop("source.documents is not a list");
  const seen = new Set();
  const actions = [];
  const skipped = [];
  for (const document of documents) {
    if (!document?.path || typeof document.path !== "string") stop("a source document has no path");
    if (document.path !== SOURCE_ROOT && !document.path.startsWith(`${SOURCE_ROOT}/`)) {
      stop(`path is outside ${SOURCE_ROOT}`);
    }
    if (seen.has(document.path)) stop(`path "${document.path}" appears twice`);
    seen.add(document.path);
    const reason = skipReason(document.path);
    if (reason) {
      const hasData = document.data != null;
      skipped.push({ path: document.path, reason, hasData });
      continue;
    }
    actions.push({ path: document.path, data: document.data });
  }
  const humanReview = skipped.filter((item) => item.hasData);
  const skipCounts = {};
  for (const rule of SKIP_RULES) skipCounts[rule.reason] = 0;
  for (const item of skipped) skipCounts[item.reason] += 1;
  const inventory = {};
  for (const item of actions) {
    const key = inventoryKey(item.path);
    inventory[key] = (inventory[key] ?? 0) + 1;
  }
  return {
    actions,
    skipped,
    humanReview,
    counts: {
      documents: documents.length,
      copy: actions.length,
      skipped: skipped.length,
      humanReview: humanReview.length,
      skipCounts,
      inventory,
    },
  };
}

export function parseArgs(argv) {
  const args = {
    write: false,
    target: "emulator",
    project: EMULATOR_PROJECT,
    fixture: null,
    confirmProduction: false,
    pauseMs: 0,
    backupTarget: null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];
    if (token === "--dry-run") args.write = false;
    else if (token === "--write") args.write = true;
    else if (token === "--confirm-production") args.confirmProduction = true;
    else if (token === "--target") {
      args.target = next;
      index += 1;
    } else if (token === "--project") {
      args.project = next;
      index += 1;
    } else if (token === "--fixture") {
      args.fixture = next;
      index += 1;
    } else if (token === "--pause-ms") {
      args.pauseMs = Number(next);
      index += 1;
    } else if (token === "--backup-target") {
      if (!next || next.startsWith("--")) stop("--backup-target needs a file path");
      args.backupTarget = next;
      index += 1;
    } else stop(`unknown argument ${token}`);
  }
  if (!["emulator", "production"].includes(args.target)) {
    stop(`target "${args.target}" is refused.`);
  }
  if (BLOCKED_PROJECTS.has(args.project)) {
    stop(`project "${args.project}" is refused. This script does not write the source project or the path prefix.`);
  }
  if (args.target === "production") {
    if (args.project !== PRODUCTION_PROJECT || !args.confirmProduction) {
      stop("production needs --project skatingx-prod --confirm-production");
    }
    if (!args.write && !args.backupTarget) {
      stop("production needs --write --project skatingx-prod --confirm-production");
    }
  }
  if (args.target === "emulator") args.project = EMULATOR_PROJECT;
  if (!Number.isInteger(args.pauseMs) || args.pauseMs < 0) stop("--pause-ms must be a non-negative integer");
  return args;
}

function isInsideRepo(filePath) {
  const resolved = path.resolve(filePath);
  return resolved === ROOT || resolved.startsWith(`${ROOT}${path.sep}`);
}

function credentialLocationFailure(env, name, hint) {
  const configured = env[name];
  if (!configured) return `${name} is unset. ${hint}`;
  if (isInsideRepo(configured)) return `${name} is inside the repository. Move the key outside the repo.`;
  return null;
}

function credentialMaterialFailure(env, name) {
  const resolved = path.resolve(env[name]);
  let info;
  try {
    info = statSync(resolved);
  } catch {
    return `${name} does not point at a key file.`;
  }
  if (!info.isFile()) return `${name} does not point at a key file.`;
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(resolved, "utf8"));
  } catch {
    return `${name} is not a readable service account key.`;
  }
  if (typeof parsed?.client_email !== "string" || typeof parsed?.private_key !== "string") {
    return `${name} is not a service account key.`;
  }
  return null;
}

function credentialGate(args, env, options = {}) {
  const failures = [];
  if (!args.fixture) {
    const location = credentialLocationFailure(env, SOURCE_CREDENTIAL_ENV, SOURCE_CREDENTIAL_HINT);
    if (location) failures.push(location);
    else if (args.write && args.target === "production") {
      const material = credentialMaterialFailure(env, SOURCE_CREDENTIAL_ENV);
      if (material) failures.push(material);
    }
  }
  const needsTarget = (args.write && args.target === "production" && !args.backupTarget) || options.requireTargetCredential;
  if (needsTarget) {
    const location = credentialLocationFailure(env, TARGET_CREDENTIAL_ENV, TARGET_CREDENTIAL_HINT);
    if (location) failures.push(location);
    else {
      const material = credentialMaterialFailure(env, TARGET_CREDENTIAL_ENV);
      if (material) failures.push(material);
    }
  }
  if (failures.length > 0) stop(failures.join("\n"));
}

function backupPathFailure(file) {
  if (isInsideRepo(file)) return "--backup-target path is inside the repository. Choose a file outside the repo.";
  return null;
}

function jsonSafe(value) {
  if (value == null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value.toDate === "function" && typeof value.toMillis === "function") {
    return { type: "timestamp", iso: value.toDate().toISOString() };
  }
  if (Array.isArray(value)) return value.map((item) => jsonSafe(item));
  if (typeof value === "object") {
    const name = value.constructor?.name;
    if (name === "GeoPoint") return { type: "geopoint", latitude: value.latitude, longitude: value.longitude };
    if (name && name !== "Object") stop(`backup cannot store ${name}`);
    const out = {};
    for (const [key, item] of Object.entries(value)) out[key] = jsonSafe(item);
    return out;
  }
  stop("backup cannot store an unsupported value");
}

function writeBackupFile(file, records) {
  const inside = backupPathFailure(file);
  if (inside) stop(inside);
  const resolved = path.resolve(file);
  let parent;
  try {
    parent = statSync(path.dirname(resolved));
  } catch {
    stop("--backup-target parent directory does not exist.");
  }
  if (!parent.isDirectory()) stop("--backup-target parent is not a directory.");
  writeFileSync(resolved, `${JSON.stringify(records, null, 2)}\n`);
}

async function readTargetDocs(pathsToRead, args, env, deps) {
  if (deps.readTargetDoc) {
    const records = [];
    for (const docPath of pathsToRead) {
      const row = await deps.readTargetDoc(docPath);
      records.push({ path: docPath, exists: Boolean(row.exists), data: row.exists ? jsonSafe(row.data) : null });
    }
    return records;
  }
  if (args.target === "emulator") {
    process.env.FIRESTORE_EMULATOR_HOST ||= "127.0.0.1:8080";
  } else if (env.FIRESTORE_EMULATOR_HOST) {
    stop("FIRESTORE_EMULATOR_HOST is set. Production backup does not use the emulator.");
  }
  const { cert, initializeApp } = await import("firebase-admin/app");
  const { getFirestore } = await import("firebase-admin/firestore");
  const options = { projectId: args.project };
  if (args.target !== "emulator") {
    const failure =
      credentialLocationFailure(env, TARGET_CREDENTIAL_ENV, TARGET_CREDENTIAL_HINT) ??
      credentialMaterialFailure(env, TARGET_CREDENTIAL_ENV);
    if (failure) stop(failure);
    options.credential = cert(path.resolve(env[TARGET_CREDENTIAL_ENV]));
  }
  const app = initializeApp(options, "current-backup");
  const db = getFirestore(app);
  const records = [];
  for (const docPath of pathsToRead) {
    const snap = await db.doc(docPath).get();
    records.push({ path: docPath, exists: snap.exists, data: snap.exists ? jsonSafe(snap.data()) : null });
  }
  return records;
}

export function loadFixture(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

function retryableReadError(error) {
  const code = error?.code;
  return code === 4 || code === 8 || code === 14 || code === "DEADLINE_EXCEEDED" || code === "RESOURCE_EXHAUSTED" || code === "UNAVAILABLE";
}

async function withRetry(label, fn) {
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (error) {
      attempt += 1;
      if (!retryableReadError(error) || attempt >= 3) throw error;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`read retry ${attempt} ${label}: ${message}`);
      await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
    }
  }
}

async function mapInBatches(items, fn) {
  const out = [];
  for (let index = 0; index < items.length; index += READ_BATCH) {
    const slice = items.slice(index, index + READ_BATCH);
    const parts = await Promise.all(slice.map(fn));
    out.push(...parts);
  }
  return out;
}

async function readDocTree(docRef) {
  const [snap, collections] = await Promise.all([
    withRetry(`get ${docRef.path}`, () => docRef.get()),
    withRetry(`listCollections ${docRef.path}`, () => docRef.listCollections()),
  ]);
  const found = [];
  if (snap.exists) found.push({ path: docRef.path, data: snap.data() });
  const childGroups = await Promise.all(
    collections.map(async (collection) => {
      const children = await withRetry(`listDocuments ${collection.path}`, () => collection.listDocuments());
      const trees = await mapInBatches(children, (child) => readDocTree(child));
      return trees.flat();
    }),
  );
  for (const group of childGroups) found.push(...group);
  return found;
}

async function readLiveSource(env) {
  const failure = credentialLocationFailure(env, SOURCE_CREDENTIAL_ENV, SOURCE_CREDENTIAL_HINT);
  if (failure) stop(failure);
  console.log(`read source start ${SOURCE_PROJECT} ${SOURCE_ROOT}`);
  const { applicationDefault, initializeApp } = await import("firebase-admin/app");
  const { getFirestore } = await import("firebase-admin/firestore");
  const app = initializeApp({ credential: applicationDefault(), projectId: SOURCE_PROJECT }, "current-source");
  const db = getFirestore(app);
  const documents = [];
  const root = db.doc(SOURCE_ROOT);
  const [rootSnap, collections] = await Promise.all([
    withRetry(`get ${root.path}`, () => root.get()),
    withRetry(`listCollections ${root.path}`, () => root.listCollections()),
  ]);
  if (rootSnap.exists) documents.push({ path: root.path, data: rootSnap.data() });
  const users = collections.find((collection) => collection.id === "users");
  const userRefs = users ? await withRetry(`listDocuments ${users.path}`, () => users.listDocuments()) : [];
  console.log(`read users listed ${userRefs.length} documents ${documents.length}`);
  for (let index = 0; index < userRefs.length; index += READ_BATCH) {
    const slice = userRefs.slice(index, index + READ_BATCH);
    const trees = await Promise.all(slice.map((userRef) => readDocTree(userRef)));
    for (const tree of trees) documents.push(...tree);
    const readUsers = Math.min(index + READ_BATCH, userRefs.length);
    console.log(`read users ${readUsers}/${userRefs.length} documents ${documents.length}`);
  }
  const others = collections.filter((collection) => collection.id !== "users");
  for (const collection of others) {
    const children = await withRetry(`listDocuments ${collection.path}`, () => collection.listDocuments());
    const trees = await mapInBatches(children, (child) => readDocTree(child));
    for (const tree of trees) documents.push(...tree);
    console.log(`read collection ${collection.id} documents ${documents.length}`);
  }
  return { documents };
}

async function writePlan(plan, args, env) {
  if (args.target === "production" && env.FIRESTORE_EMULATOR_HOST) {
    stop("FIRESTORE_EMULATOR_HOST is set. Refusing to write production through the emulator.");
  }
  const { cert, initializeApp } = await import("firebase-admin/app");
  const { getFirestore } = await import("firebase-admin/firestore");
  const options = { projectId: args.project };
  if (args.target === "emulator") {
    process.env.FIRESTORE_EMULATOR_HOST ||= "127.0.0.1:8080";
  } else {
    const failure =
      credentialLocationFailure(env, TARGET_CREDENTIAL_ENV, TARGET_CREDENTIAL_HINT) ??
      credentialMaterialFailure(env, TARGET_CREDENTIAL_ENV);
    if (failure) stop(failure);
    options.credential = cert(path.resolve(env[TARGET_CREDENTIAL_ENV]));
  }
  const app = initializeApp(options, "current-target");
  const db = getFirestore(app);
  for (const item of plan.actions) {
    await db.doc(item.path).set(item.data);
    if (args.pauseMs > 0) await new Promise((resolve) => setTimeout(resolve, args.pauseMs));
  }
  let present = 0;
  for (const item of plan.actions) {
    const snap = await db.doc(item.path).get();
    if (!snap.exists) stop(`wrote ${item.path} but it did not read back`);
    present += 1;
  }
  if (present !== plan.counts.copy) stop(`recount mismatch ${present}/${plan.counts.copy}`);
  return present;
}

function printPlan(plan, args) {
  const mode = args.backupTarget ? "backup-target" : args.write ? "write" : "dry-run";
  console.log(`mode: ${mode}`);
  console.log(`target: ${args.target} project ${args.project}`);
  console.log(
    `counts: documents ${plan.counts.documents}, copy ${plan.counts.copy}, skipped ${plan.counts.skipped}, human review ${plan.counts.humanReview}`,
  );
  const inventoryNames = Object.keys(plan.counts.inventory).sort();
  for (const name of inventoryNames) console.log(`inventory ${name} ${plan.counts.inventory[name]}`);
  if (!inventoryNames.includes("settings")) console.log("inventory settings 0");
  if (!inventoryNames.some((name) => name === "raceDay" || name.startsWith("athletes/"))) {
    console.log("inventory raceDay 0");
    console.log("inventory athletes/training 0");
  } else {
    if (!inventoryNames.includes("raceDay")) console.log("inventory raceDay 0");
    if (!inventoryNames.includes("athletes/training")) console.log("inventory athletes/training 0");
  }
  for (const rule of SKIP_RULES) {
    const count = plan.counts.skipCounts[rule.reason] ?? 0;
    const review = plan.humanReview.filter((item) => item.reason === rule.reason).length;
    console.log(`skip ${rule.reason} ${count} human-review ${review}`);
  }
  for (const item of plan.humanReview) console.log(`human-review ${item.reason} ${item.path}`);
}

export async function run(argv, env = process.env, deps = {}) {
  const args = parseArgs(argv);
  if (args.backupTarget) {
    const inside = backupPathFailure(args.backupTarget);
    if (inside) stop(inside);
  }
  credentialGate(args, env, { requireTargetCredential: Boolean(args.backupTarget) && args.target === "production" && !deps.readTargetDoc });
  const source = args.fixture ? loadFixture(args.fixture) : await readLiveSource(env);
  const plan = planCopy(source);
  printPlan(plan, args);
  if (args.backupTarget) {
    const records = await readTargetDocs(plan.actions.map((item) => item.path), args, env, deps);
    writeBackupFile(args.backupTarget, records);
    console.log(`backup-target: ${records.length} documents read, no documents written`);
    return plan;
  }
  if (!args.write) {
    console.log("dry-run: no documents written");
    return plan;
  }
  const present = await (deps.writePlan ?? writePlan)(plan, args, env);
  console.log(`recount matches the plan ${present}`);
  return plan;
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  run(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
