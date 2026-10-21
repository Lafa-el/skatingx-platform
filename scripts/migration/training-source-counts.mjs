/**
 * Read-only census of blaze-skate-training profile/main documents.
 *
 * A live read uses GOOGLE_APPLICATION_CREDENTIALS. The agreed path is
 * ~/.config/gcp/training-migration-reader.json for
 * migration-reader@blaze-skate-training-platform.iam.gserviceaccount.com.
 * This file does not open that path unless the variable is set, and it never
 * writes Firestore. Fixture mode does not use a key.
 *
 * Prints aggregate counts and, locally, Lindsay candidates. Callers must not
 * redirect the local section into the repository.
 */

import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export const SOURCE_PROJECT = "blaze-skate-training-platform";
export const SOURCE_APP = "blaze-skate-production";
const READER_ACCOUNT = "migration-reader@blaze-skate-training-platform.iam.gserviceaccount.com";
const SOURCE_CREDENTIAL_ENV = "GOOGLE_APPLICATION_CREDENTIALS";
const SOURCE_CREDENTIAL_HINT =
  `Point it at the ${READER_ACCOUNT} key (agreed path: ~/.config/gcp/training-migration-reader.json).`;

const RECORD_KEYS = [
  "records",
  "records777",
  "records1000",
  "records1500",
  "recordsStart",
  "recordsLap",
];

const ARRAY_FIELDS = [
  "tasks",
  "competitionGoalsV1",
  "trainingPlansV1",
  "customRewards",
  "rewardHistory",
  "races",
  "completedDays",
];

const REAL_DATA_ARRAYS = [
  "tasks",
  "competitionGoalsV1",
  "trainingPlansV1",
  "rewardHistory",
  "races",
  "completedDays",
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

function isInsideRepo(filePath) {
  const resolved = path.resolve(filePath);
  return resolved === ROOT || resolved.startsWith(`${ROOT}${path.sep}`);
}

export function median(numbers) {
  if (numbers.length === 0) return null;
  const sorted = [...numbers].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

function distribution(lengths) {
  return {
    documents: lengths.length,
    max: lengths.length === 0 ? null : Math.max(...lengths),
    median: median(lengths),
  };
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value) && typeof value.toDate !== "function";
}

function isTimestamp(value) {
  return Boolean(value) && typeof value === "object" && typeof value.toDate === "function";
}

export function approximateBytes(value) {
  return Buffer.byteLength(JSON.stringify(toPlain(value)));
}

function toPlain(value) {
  if (value == null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (isTimestamp(value)) return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((item) => toPlain(item));
  if (typeof value === "object") {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = toPlain(value[key]);
    return out;
  }
  return null;
}

function arrayLengths(profiles, field) {
  const lengths = [];
  for (const profile of profiles) {
    const value = profile.data?.[field];
    if (Array.isArray(value)) lengths.push(value.length);
  }
  return lengths;
}

function recordKeyLengths(profiles) {
  const byKey = {};
  for (const profile of profiles) {
    if (!isPlainObject(profile.data)) continue;
    for (const key of Object.keys(profile.data)) {
      if (!key.startsWith("records")) continue;
      const value = profile.data[key];
      if (!Array.isArray(value)) continue;
      const list = byKey[key] ?? [];
      list.push(value.length);
      byKey[key] = list;
    }
  }
  const out = {};
  for (const key of Object.keys(byKey).sort()) out[key] = distribution(byKey[key]);
  return out;
}

function taskHistoryDateLengths(profiles) {
  const lengths = [];
  for (const profile of profiles) {
    const value = profile.data?.taskHistory;
    if (isPlainObject(value)) lengths.push(Object.keys(value).length);
  }
  return lengths;
}

function valueHistogram(profiles, field) {
  const counts = {};
  let missing = 0;
  for (const profile of profiles) {
    if (!isPlainObject(profile.data) || !Object.prototype.hasOwnProperty.call(profile.data, field)) {
      missing += 1;
      continue;
    }
    const value = profile.data[field];
    const label = value === null ? "null" : String(value);
    counts[label] = (counts[label] ?? 0) + 1;
  }
  if (missing > 0) counts.missing = missing;
  return counts;
}

export function hasRealTrainingData(data) {
  if (!isPlainObject(data)) return false;
  if (typeof data.points === "number" && data.points > 0) return true;
  if (isPlainObject(data.taskHistory) && Object.keys(data.taskHistory).length > 0) return true;
  for (const field of [...REAL_DATA_ARRAYS, ...RECORD_KEYS]) {
    if (Array.isArray(data[field]) && data[field].length > 0) return true;
  }
  for (const key of Object.keys(data)) {
    if (key.startsWith("records_") && Array.isArray(data[key]) && data[key].length > 0) return true;
  }
  return false;
}

export function summarizeAggregates({ userPathCount, userDocumentCount, profiles }) {
  const present = profiles.filter((profile) => isPlainObject(profile.data));
  const keyCounts = {};
  for (const profile of present) {
    for (const key of Object.keys(profile.data)) {
      keyCounts[key] = (keyCounts[key] ?? 0) + 1;
    }
  }
  const arrays = {};
  for (const field of ARRAY_FIELDS) arrays[field] = distribution(arrayLengths(present, field));
  arrays.taskHistoryDates = distribution(taskHistoryDateLengths(present));
  return {
    userPathCount,
    userDocumentCount,
    profileDocuments: present.length,
    topLevelKeyCounts: Object.fromEntries(Object.entries(keyCounts).sort(([a], [b]) => a.localeCompare(b))),
    arrays,
    recordArrays: recordKeyLengths(present),
    pointsPerTask: valueHistogram(present, "pointsPerTask"),
    dailyBonusPoints: valueHistogram(present, "dailyBonusPoints"),
    isPro: valueHistogram(present, "isPro"),
    usernamePresent: present.filter((profile) => typeof profile.data.username === "string" && profile.data.username.trim() !== "").length,
    realTrainingProfiles: present.filter((profile) => hasRealTrainingData(profile.data)).length,
    approximateBytes: distribution(present.map((profile) => approximateBytes(profile.data))),
  };
}

export function findLindsayCandidates(profiles) {
  const matches = [];
  for (const profile of profiles) {
    const username = profile.data?.username;
    if (typeof username === "string" && username.toLowerCase().includes("lindsay")) {
      matches.push({ uid: profile.uid, username });
    }
  }
  return matches;
}

function mergeItemShape(items) {
  const keys = {};
  const itemTypes = {};
  for (const item of items) {
    const described = describeValue(item);
    itemTypes[described.type] = (itemTypes[described.type] ?? 0) + 1;
    if (described.type !== "object") continue;
    for (const [key, shape] of Object.entries(described.keys)) {
      keys[key] = keys[key] ?? shape;
    }
  }
  return {
    type: "array",
    length: items.length,
    itemTypes,
    itemFields: keys,
  };
}

export function describeValue(value) {
  if (value === null) return { type: "null" };
  if (isTimestamp(value) || value instanceof Date) return { type: "timestamp" };
  if (Array.isArray(value)) return mergeItemShape(value);
  if (typeof value === "object") {
    const keys = {};
    for (const key of Object.keys(value).sort()) keys[key] = describeValue(value[key]);
    return { type: "object", keys };
  }
  return { type: typeof value };
}

export function describeProfileStructure(data) {
  if (!isPlainObject(data)) return { type: data == null ? "missing" : typeof data };
  return {
    topLevel: describeValue(data),
    approximateBytes: approximateBytes(data),
    arrayLengths: {
      tasks: Array.isArray(data.tasks) ? data.tasks.length : null,
      taskHistoryDates: isPlainObject(data.taskHistory) ? Object.keys(data.taskHistory).length : null,
      competitionGoalsV1: Array.isArray(data.competitionGoalsV1) ? data.competitionGoalsV1.length : null,
      trainingPlansV1: Array.isArray(data.trainingPlansV1) ? data.trainingPlansV1.length : null,
      records: Object.fromEntries(
        Object.keys(data)
          .filter((key) => key.startsWith("records") && Array.isArray(data[key]))
          .sort()
          .map((key) => [key, data[key].length]),
      ),
    },
  };
}

function credentialFailure(env) {
  const configured = env[SOURCE_CREDENTIAL_ENV];
  if (!configured) {
    return `${SOURCE_CREDENTIAL_ENV} is unset. ${SOURCE_CREDENTIAL_HINT} The script will not look there by itself.`;
  }
  if (isInsideRepo(configured)) {
    return `${SOURCE_CREDENTIAL_ENV} is inside the repository. Move the key outside the repo.`;
  }
  const resolved = path.resolve(configured);
  let info;
  try {
    info = statSync(resolved);
  } catch {
    return `${SOURCE_CREDENTIAL_ENV} does not point at a key file.`;
  }
  if (!info.isFile()) return `${SOURCE_CREDENTIAL_ENV} does not point at a key file.`;
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(resolved, "utf8"));
  } catch {
    return `${SOURCE_CREDENTIAL_ENV} is not a readable service account key.`;
  }
  if (parsed?.client_email !== READER_ACCOUNT || parsed?.project_id !== SOURCE_PROJECT || typeof parsed?.private_key !== "string") {
    return `${SOURCE_CREDENTIAL_ENV} is not the training migration reader for ${SOURCE_PROJECT}.`;
  }
  return null;
}

export function assertLiveEnvironment(env) {
  if (env.FIRESTORE_EMULATOR_HOST || env.FIREBASE_AUTH_EMULATOR_HOST) {
    stop("Unset FIRESTORE_EMULATOR_HOST and FIREBASE_AUTH_EMULATOR_HOST before a live source read.");
  }
  const failure = credentialFailure(env);
  if (failure) stop(failure);
}

function parseArgs(argv) {
  const args = { live: false, fixture: null };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--live") args.live = true;
    else if (token === "--fixture") {
      args.fixture = argv[index + 1] ?? "";
      index += 1;
    } else {
      stop(`Unknown argument ${token}`);
    }
  }
  if (args.live && args.fixture) stop("Use either --live or --fixture.");
  if (!args.live && !args.fixture) stop("Use --live for the source project, or --fixture <file> for a fake snapshot.");
  return args;
}

function loadFixture(file) {
  const parsed = JSON.parse(readFileSync(file, "utf8"));
  if (!Array.isArray(parsed.profiles) || !Number.isInteger(parsed.userPathCount) || !Number.isInteger(parsed.userDocumentCount)) {
    stop("--fixture must be { userPathCount, userDocumentCount, profiles }.");
  }
  return parsed;
}

async function readLive(env) {
  assertLiveEnvironment(env);
  const { applicationDefault, initializeApp } = await import("firebase-admin/app");
  const { getFirestore } = await import("firebase-admin/firestore");
  const app = initializeApp(
    { credential: applicationDefault(), projectId: SOURCE_PROJECT },
    "training-source-counts",
  );
  const db = getFirestore(app);
  const users = db.collection("artifacts").doc(SOURCE_APP).collection("users");
  const refs = await users.listDocuments();
  let userDocumentCount = 0;
  const profiles = [];
  const chunkSize = 50;
  for (let index = 0; index < refs.length; index += chunkSize) {
    const chunk = refs.slice(index, index + chunkSize);
    const userSnaps = await db.getAll(...chunk);
    const profileRefs = chunk.map((ref) => ref.collection("profile").doc("main"));
    const profileSnaps = await db.getAll(...profileRefs);
    for (let offset = 0; offset < chunk.length; offset += 1) {
      if (userSnaps[offset].exists) userDocumentCount += 1;
      const profileSnap = profileSnaps[offset];
      profiles.push({
        uid: chunk[offset].id,
        data: profileSnap.exists ? profileSnap.data() : null,
      });
    }
  }
  return { userPathCount: refs.length, userDocumentCount, profiles };
}

export function renderReport(source) {
  const aggregate = summarizeAggregates(source);
  const candidates = findLindsayCandidates(source.profiles);
  const structures = candidates.map((candidate) => {
    const profile = source.profiles.find((item) => item.uid === candidate.uid);
    return describeProfileStructure(profile?.data);
  });
  return { aggregate, candidates, structures };
}

function printReport(report) {
  console.log("=== AGGREGATE ===");
  console.log(JSON.stringify(report.aggregate, null, 2));
  console.log("=== LINDSAY STRUCTURE ===");
  console.log(JSON.stringify(report.structures, null, 2));
  console.log("=== LOCAL ONLY ===");
  for (const candidate of report.candidates) {
    console.log(`uid=${candidate.uid} username=${candidate.username}`);
  }
  console.log(`lindsayCandidates=${report.candidates.length}`);
}

async function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    const source = args.live ? await readLive(process.env) : loadFixture(args.fixture);
    printReport(renderReport(source));
  } catch (error) {
    console.error(error instanceof Error ? error.message : "training source count failed");
    process.exitCode = 1;
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) await main();
