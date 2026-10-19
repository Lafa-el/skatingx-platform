/**
 * One-shot analysis migration. Default is a dry run against the Firestore emulator.
 *
 * Auth uses two keys. A live source read uses Application Default Credentials,
 * which means GOOGLE_APPLICATION_CREDENTIALS. The agreed path is
 * ~/.config/gcp/migration-reader.json for
 * migration-reader@blaze-skate-analysis.iam.gserviceaccount.com.
 * A write to anything other than the emulator uses
 * TARGET_GOOGLE_APPLICATION_CREDENTIALS. The agreed path is
 * ~/.config/gcp/migration-writer.json for the skatingx-platform writer.
 * This file does not open either path unless that variable is set.
 * The emulator does not need the writer key. A dry run does not either.
 * --backup-target reads the planned skatingx-platform documents with the writer
 * key and stores {path, exists, data} outside this repository. It does not write.
 * Both paths must be outside this repository. The keys are not in the repo.
 *
 * firebase-admin is a root devDependency (Apache-2.0, Google-maintained). It is
 * the Admin SDK this script was asked to use. The rules gate does not use it:
 * Admin writes skip Security Rules, so scripts/migrate-analysis.test.mjs replays
 * the same documents through the client SDK on the emulator.
 */

import { readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const SOURCE_PROJECT = "blaze-skate-analysis";
export const SOURCE_APP = "blaze-skate-academy";
export const TARGET_APP = "skatingx-production";
export const ATHLETE_ID = "lindsay";
export const EMULATOR_PROJECT = "demo-skatingx-migration";
export const STAGING_PROJECT = "skatingx-platform";
export const BLOCKED_PROJECTS = new Set(["skatingx-prod", "skatingx-production"]);

const READER_ACCOUNT = "migration-reader@blaze-skate-analysis.iam.gserviceaccount.com";
const SOURCE_CREDENTIAL_ENV = "GOOGLE_APPLICATION_CREDENTIALS";
const TARGET_CREDENTIAL_ENV = "TARGET_GOOGLE_APPLICATION_CREDENTIALS";
const SOURCE_CREDENTIAL_HINT =
  `Point it at the ${READER_ACCOUNT} key (agreed path: ~/.config/gcp/migration-reader.json).`;
const TARGET_CREDENTIAL_HINT =
  "Point it at the skatingx-platform writer key (agreed path: ~/.config/gcp/migration-writer.json).";

const SYMPTOM_KEYS = {
  slide: "slide",
  bootout: "boot-out",
  "boot-out": "boot-out",
  unstable: "unstable",
  ankle: "ankle",
  release: "release",
  asymmetry: "asymmetry",
};

const ADJUSTMENT_TYPES = {
  unchanged: "unchanged",
  "记录未调整": "unchanged",
  "radius-rocker": "radius-rocker",
  "重磨 Radius/Rocker": "radius-rocker",
  offset: "offset",
  "调整 Offset": "offset",
  bend: "bend",
  "调整 Bend": "bend",
  "blade-change": "blade-change",
  换刀: "blade-change",
  "boot-change": "boot-change",
  换鞋: "boot-change",
  combined: "combined",
  综合调整: "combined",
};

const FEEDBACK_RATINGS = {
  "not-skated": "not-skated",
  未上冰验证: "not-skated",
  "clear-improvement": "clear-improvement",
  明显改善: "clear-improvement",
  "slight-improvement": "slight-improvement",
  小幅改善: "slight-improvement",
  "no-change": "no-change",
  无明显变化: "no-change",
  "worse-revert": "worse-revert",
  "变差，需要回退": "worse-revert",
};

const FOCUS_BY_PREFIX = [
  ["jd_tech_", "lean"],
  ["jd_speed_", "bounce"],
  ["jd_race_", "endurance"],
];

const PROVENANCE_MODEL = {
  modelVersion: "mediapipe-pose@0.5.1675469404",
  modelVariant: "pose_landmark_full",
  modelComplexity: 1,
  smoothLandmarks: true,
  enableSegmentation: false,
  minDetectionConfidence: 0.5,
  minTrackingConfidence: 0.5,
  poseFrameIntervalMs: 180,
  maxAnalysisEdgePx: 640,
};

const ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export class MigrationStop extends Error {
  constructor(message) {
    super(message);
    this.name = "MigrationStop";
  }
}

function stop(message) {
  throw new MigrationStop(message);
}

export function targetRoot(uid) {
  return `artifacts/${TARGET_APP}/users/${uid}`;
}

export function equipmentDocId(raw) {
  const cleaned = String(raw)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!ID_PATTERN.test(cleaned) || cleaned.length > 64) {
    stop(`equipment id "${raw}" cannot be written under the equipment rules`);
  }
  return cleaned;
}

function text(value, max, label) {
  const string = value == null ? "" : String(value);
  if (string.length > max) stop(`${label} is longer than ${max}`);
  return string;
}

function enumValue(table, value, label) {
  const mapped = table[value];
  if (!mapped) stop(`${label} "${value}" is not a known legacy value`);
  return mapped;
}

export function toIso(value, label) {
  let date = null;
  if (typeof value === "string" && value) date = new Date(value);
  else if (value instanceof Date) date = value;
  else if (value && typeof value.toDate === "function") date = value.toDate();
  else if (value && (typeof value.seconds === "number" || typeof value._seconds === "number")) {
    const seconds = typeof value.seconds === "number" ? value.seconds : value._seconds;
    date = new Date(seconds * 1000);
  }
  if (!date || Number.isNaN(date.getTime())) stop(`${label} is not a time`);
  const iso = date.toISOString();
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$/.test(iso)) {
    stop(`${label} is not millisecond UTC`);
  }
  return iso;
}

function gaugeList(value, label) {
  if (value == null) return [];
  if (!Array.isArray(value)) stop(`${label} is not a list`);
  if (value.length > 21) stop(`${label} has more than 21 points`);
  return value.map((item, index) => {
    if (!item || typeof item !== "object") stop(`${label}[${index}] is not a point`);
    if (typeof item.point !== "number" || !Number.isInteger(item.point)) {
      stop(`${label}[${index}].point is not an integer`);
    }
    return { point: item.point, value: text(item.value, 40, `${label}[${index}].value`) };
  });
}

function hintList(value) {
  if (value == null) return [];
  if (!Array.isArray(value)) stop("ruleHints is not a list");
  if (value.length > 96) stop("ruleHints has more than 96 items");
  return value.map((item, index) => {
    if (typeof item !== "string") stop(`ruleHints[${index}] is not text`);
    return text(item, 500, `ruleHints[${index}]`);
  });
}

function offsetsOf(value) {
  const source = value && typeof value === "object" ? value : {};
  return {
    leftFront: text(source.leftFront, 80, "offsets.leftFront"),
    leftRear: text(source.leftRear, 80, "offsets.leftRear"),
    rightFront: text(source.rightFront, 80, "offsets.rightFront"),
    rightRear: text(source.rightRear, 80, "offsets.rightRear"),
  };
}

function bendOf(value) {
  const source = value && typeof value === "object" ? value : {};
  return {
    front: text(source.front, 40, "bend.front"),
    middle: text(source.middle, 40, "bend.middle"),
    rear: text(source.rear, 40, "bend.rear"),
  };
}

export function mapEquipment(uid, sourceId, data) {
  const id = equipmentDocId(sourceId);
  const symptomKey = enumValue(SYMPTOM_KEYS, data.symptomKey, "symptomKey");
  const createdAt = toIso(data.createdAt, `equipment ${sourceId} createdAt`);
  const updatedAt = data.updatedAt ? toIso(data.updatedAt, `equipment ${sourceId} updatedAt`) : createdAt;
  const leftRocker = gaugeList(data.leftRocker ?? data.leftRockerReadings, "leftRocker");
  const rightRocker = gaugeList(data.rightRocker ?? data.rightRockerReadings, "rightRocker");
  const weight = text(data.weight, 40, "weight");
  const missingCore =
    typeof data.missingCore === "boolean" ? data.missingCore : weight === "" || (leftRocker.length === 0 && rightRocker.length === 0);
  return {
    id,
    ownerUserId: uid,
    athleteId: ATHLETE_ID,
    createdAt,
    updatedAt,
    provenance: {
      schemaVersion: "skatingx-analysis-contract-v1",
      algorithmVersion: "legacy-equipment-port-1",
      model: PROVENANCE_MODEL,
    },
    symptomKey,
    symptomText: text(data.symptomText, 500, "symptomText"),
    height: text(data.height, 40, "height"),
    weight,
    bladeLength: text(data.bladeLength, 40, "bladeLength"),
    leftRocker,
    rightRocker,
    offsets: offsetsOf(data.offsets),
    bend: bendOf(data.bend),
    adjustmentType: enumValue(ADJUSTMENT_TYPES, data.adjustmentType, "adjustmentType"),
    feedbackRating: enumValue(FEEDBACK_RATINGS, data.feedbackRating, "feedbackRating"),
    adjustmentNotes: text(data.adjustmentNotes, 500, "adjustmentNotes"),
    missingCore,
    ruleHints: hintList(data.ruleHints),
    findings: [{ code: `equipment.symptom.${symptomKey}`, analysisId: id }],
  };
}

function focusOf(taskId, data) {
  if (data.focus === "lean" || data.focus === "bounce" || data.focus === "endurance") return data.focus;
  const match = FOCUS_BY_PREFIX.find(([prefix]) => taskId.startsWith(prefix));
  if (!match) stop(`completed task "${taskId}" has no known focus`);
  return match[1];
}

export function mapCheckIn(uid, sourceId, data) {
  const taskId = typeof data.taskId === "string" && data.taskId ? data.taskId : sourceId;
  if (!taskId || taskId.includes("/")) stop(`completed task id "${taskId}" is not a document id`);
  if (typeof data.points !== "number" || !Number.isFinite(data.points)) {
    stop(`completed task "${taskId}" has no numeric points`);
  }
  const createdAt = toIso(data.createdAt ?? data.completedAt, `task ${taskId} createdAt`);
  const completedAt = data.completedAt ? toIso(data.completedAt, `task ${taskId} completedAt`) : createdAt;
  const updatedAt = data.updatedAt ? toIso(data.updatedAt, `task ${taskId} updatedAt`) : createdAt;
  return {
    taskId,
    points: data.points,
    focus: focusOf(taskId, data),
    athleteId: ATHLETE_ID,
    ownerUserId: uid,
    completedAt,
    createdAt,
    updatedAt,
    schemaVersion: 1,
    source: "migration:blaze-skate-analysis",
  };
}

export function mapProfileBackup(uid, data) {
  if (!data || typeof data !== "object") stop(`profile for ${uid} is missing`);
  if (typeof data.points !== "number" || !Number.isFinite(data.points)) {
    stop(`profile for ${uid} has no numeric points`);
  }
  return {
    schemaVersion: 1,
    source: "migration:blaze-skate-analysis",
    legacyPath: `artifacts/${SOURCE_APP}/users/${uid}/profile/${ATHLETE_ID}`,
    points: data.points,
    mergedIntoTrainingPoints: false,
    name: data.name == null ? "" : text(data.name, 120, "profile.name"),
    birthDate: data.birthDate == null ? "" : text(data.birthDate, 40, "profile.birthDate"),
  };
}

function action(kind, docPath, data) {
  return { kind, path: docPath, data };
}

export function planUser(user) {
  if (!user || typeof user.uid !== "string" || !user.uid) stop("a source user has no uid");
  const uid = user.uid;
  const root = targetRoot(uid);
  const actions = [];
  const seenEquipment = new Map();

  for (const record of user.equipmentRecords ?? []) {
    const sourceId = record.id;
    if (!sourceId) stop(`equipment record for ${uid} has no id`);
    const data = mapEquipment(uid, sourceId, record);
    if (seenEquipment.has(data.id)) {
      stop(`equipment ids "${seenEquipment.get(data.id)}" and "${sourceId}" both become "${data.id}"`);
    }
    seenEquipment.set(data.id, sourceId);
    actions.push(action("equipment", `${root}/athletes/${ATHLETE_ID}/equipment/main/records/${data.id}`, data));
  }

  const seenTasks = new Set();
  for (const task of user.completedTasks ?? []) {
    const sourceId = task.id;
    if (!sourceId) stop(`completed task for ${uid} has no id`);
    const data = mapCheckIn(uid, sourceId, task);
    if (seenTasks.has(data.taskId)) stop(`completed task "${data.taskId}" appears twice`);
    seenTasks.add(data.taskId);
    actions.push(
      action("checkIn", `${root}/athletes/${ATHLETE_ID}/planning/main/completedTasks/${data.taskId}`, data),
    );
  }

  if (user.profile) {
    const data = mapProfileBackup(uid, user.profile);
    actions.push(action("profileBackup", `${root}/migrationBackups/analysis-profile`, data));
  }

  return actions;
}

export function planMigration(source) {
  const users = source?.users;
  if (!Array.isArray(users)) stop("source.users is not a list");
  const actions = users.flatMap((user) => planUser(user));
  const gamificationWrites = actions.filter((item) => item.path.includes("/gamification/")).length;
  if (gamificationWrites !== 0) stop("analysis points were planned onto the training balance");
  const counts = {
    users: users.length,
    equipment: actions.filter((item) => item.kind === "equipment").length,
    checkIns: actions.filter((item) => item.kind === "checkIn").length,
    profileBackups: actions.filter((item) => item.kind === "profileBackup").length,
    gamificationWrites,
  };
  return { actions, counts };
}

export function parseArgs(argv) {
  const args = {
    write: false,
    target: "emulator",
    project: EMULATOR_PROJECT,
    fixture: null,
    confirmStaging: false,
    pauseMs: 0,
    uid: null,
    backupTarget: null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];
    if (token === "--dry-run") args.write = false;
    else if (token === "--write") args.write = true;
    else if (token === "--confirm-staging") args.confirmStaging = true;
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
    } else if (token === "--uid") {
      args.uid = next;
      index += 1;
    } else if (token === "--backup-target") {
      if (!next || next.startsWith("--")) stop("--backup-target needs a file path");
      args.backupTarget = next;
      index += 1;
    } else stop(`unknown argument ${token}`);
  }
  if (!["emulator", "staging"].includes(args.target)) {
    stop(`target "${args.target}" is refused. Production waits for a separate Buffalo approval.`);
  }
  if (BLOCKED_PROJECTS.has(args.project)) {
    stop(`project "${args.project}" is refused. This script does not write skatingx-prod.`);
  }
  if (args.target === "staging") {
    if (args.project !== STAGING_PROJECT || !args.confirmStaging || !args.write) {
      stop("staging needs --write --project skatingx-platform --confirm-staging");
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
  if (!configured) {
    return `${name} is unset. ${hint} The script will not look there by itself.`;
  }
  if (isInsideRepo(configured)) {
    return `${name} is inside the repository. Move the key outside the repo.`;
  }
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
    else if (args.write) {
      const material = credentialMaterialFailure(env, SOURCE_CREDENTIAL_ENV);
      if (material) failures.push(material);
    }
  }
  const needsTargetCredential =
    (args.write && args.target !== "emulator" && !args.backupTarget) || options.requireTargetCredential;
  if (needsTargetCredential) {
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
  if (isInsideRepo(file)) {
    return "--backup-target path is inside the repository. Choose a file outside the repo.";
  }
  return null;
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

async function collectBackup(plan, env, deps) {
  if (deps.readTargetDoc) {
    const records = [];
    for (const item of plan.actions) {
      const row = await deps.readTargetDoc(item.path);
      records.push({
        path: item.path,
        exists: Boolean(row.exists),
        data: row.exists ? jsonSafe(row.data) : null,
      });
    }
    return records;
  }
  if (env.FIRESTORE_EMULATOR_HOST) {
    stop("FIRESTORE_EMULATOR_HOST is set. --backup-target reads skatingx-platform and does not use the emulator.");
  }
  const failure =
    credentialLocationFailure(env, TARGET_CREDENTIAL_ENV, TARGET_CREDENTIAL_HINT) ??
    credentialMaterialFailure(env, TARGET_CREDENTIAL_ENV);
  if (failure) stop(failure);
  const { cert, initializeApp } = await import("firebase-admin/app");
  const { getFirestore } = await import("firebase-admin/firestore");
  const app = initializeApp(
    { credential: cert(path.resolve(env[TARGET_CREDENTIAL_ENV])), projectId: STAGING_PROJECT },
    "backup-target",
  );
  const db = getFirestore(app);
  const records = [];
  for (const item of plan.actions) {
    const snap = await db.doc(item.path).get();
    records.push({
      path: item.path,
      exists: snap.exists,
      data: snap.exists ? jsonSafe(snap.data()) : null,
    });
  }
  return records;
}

export function loadFixture(file) {
  const parsed = JSON.parse(readFileSync(file, "utf8"));
  return parsed;
}

function selectUid(source, uid) {
  if (!uid) return source;
  return { users: source.users.filter((user) => user.uid === uid) };
}

async function readLiveSource(env) {
  const failure = credentialLocationFailure(env, SOURCE_CREDENTIAL_ENV, SOURCE_CREDENTIAL_HINT);
  if (failure) stop(failure);
  const { applicationDefault, initializeApp } = await import("firebase-admin/app");
  const { getFirestore } = await import("firebase-admin/firestore");
  const app = initializeApp({ credential: applicationDefault(), projectId: SOURCE_PROJECT }, "source");
  const db = getFirestore(app);
  const usersRoot = db.collection("artifacts").doc(SOURCE_APP).collection("users");
  const userRefs = await usersRoot.listDocuments();
  const users = [];
  for (const userRef of userRefs) {
    const uid = userRef.id;
    const profileSnap = await userRef.collection("profile").doc(ATHLETE_ID).get();
    const equipmentSnap = await userRef.collection("equipmentRecords").get();
    const taskSnap = await userRef.collection("completedTasks").get();
    users.push({
      uid,
      profile: profileSnap.exists ? profileSnap.data() : null,
      equipmentRecords: equipmentSnap.docs.map((item) => ({ id: item.id, ...item.data() })),
      completedTasks: taskSnap.docs.map((item) => ({ id: item.id, ...item.data() })),
    });
  }
  return { users };
}

async function writePlan(plan, args, env) {
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
  const app = initializeApp(options, "target");
  const db = getFirestore(app);
  for (const item of plan.actions) {
    await db.doc(item.path).set(item.data);
    if (args.pauseMs > 0) await new Promise((resolve) => setTimeout(resolve, args.pauseMs));
  }
  const written = { equipment: 0, checkIns: 0, profileBackups: 0 };
  for (const item of plan.actions) {
    const snap = await db.doc(item.path).get();
    if (!snap.exists) stop(`wrote ${item.path} but it did not read back`);
    written[item.kind === "equipment" ? "equipment" : item.kind === "checkIn" ? "checkIns" : "profileBackups"] += 1;
  }
  return written;
}

function printPlan(plan, args) {
  const mode = args.backupTarget ? "backup-target" : args.write ? "write" : "dry-run";
  console.log(`mode: ${mode}`);
  console.log(`target: ${args.target} project ${args.project}`);
  console.log(
    `counts: users ${plan.counts.users}, equipment ${plan.counts.equipment}, check-ins ${plan.counts.checkIns}, profile backups ${plan.counts.profileBackups}, gamification writes ${plan.counts.gamificationWrites}`,
  );
  for (const item of plan.actions) {
    console.log(`plan ${item.kind} ${item.path}`);
  }
  const sampleEquipment = plan.actions.find((item) => item.kind === "equipment");
  const sampleTask = plan.actions.find((item) => item.kind === "checkIn");
  const sampleProfile = plan.actions.find((item) => item.kind === "profileBackup");
  if (sampleEquipment) {
    console.log(
      `spot equipment ${sampleEquipment.data.id} symptom ${sampleEquipment.data.symptomKey} adjustment ${sampleEquipment.data.adjustmentType}`,
    );
  }
  if (sampleTask) console.log(`spot check-in ${sampleTask.data.taskId} points ${sampleTask.data.points}`);
  if (sampleProfile) {
    console.log(
      `spot profile points ${sampleProfile.data.points} backup ${sampleProfile.path} mergedIntoTrainingPoints ${sampleProfile.data.mergedIntoTrainingPoints}`,
    );
  }
}

export async function run(argv, env = process.env, deps = {}) {
  const args = parseArgs(argv);
  if (args.backupTarget) {
    const inside = backupPathFailure(args.backupTarget);
    if (inside) stop(inside);
  }
  credentialGate(args, env, { requireTargetCredential: Boolean(args.backupTarget) && !deps.readTargetDoc });
  const source = args.fixture ? selectUid(loadFixture(args.fixture), args.uid) : await readLiveSource(env);
  const filtered = args.fixture ? source : selectUid(source, args.uid);
  const plan = planMigration(filtered);
  printPlan(plan, args);
  if (args.backupTarget) {
    const records = await collectBackup(plan, env, deps);
    writeBackupFile(args.backupTarget, records);
    console.log(`backup-target: ${records.length} documents read, no documents written`);
    return plan;
  }
  if (!args.write) {
    console.log("dry-run: no documents written");
    return plan;
  }
  const written = await (deps.writePlan ?? writePlan)(plan, args, env);
  if (
    written.equipment !== plan.counts.equipment ||
    written.checkIns !== plan.counts.checkIns ||
    written.profileBackups !== plan.counts.profileBackups
  ) {
    stop(
      `recount mismatch equipment ${written.equipment}/${plan.counts.equipment}, check-ins ${written.checkIns}/${plan.counts.checkIns}, backups ${written.profileBackups}/${plan.counts.profileBackups}`,
    );
  }
  console.log("recount matches the plan");
  return plan;
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  run(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
