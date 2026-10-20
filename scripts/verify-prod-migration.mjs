/**
 * Read skatingx-prod and compare it with the migration counts. This script
 * never writes. It does not read skatingx-platform: that project is the
 * source, and its quota is exhausted.
 *
 * The prod read uses TARGET_GOOGLE_APPLICATION_CREDENTIALS. The file does not
 * open a key path unless that variable is set. Keys stay outside the repository.
 *
 * Prod backup documents are the 54 analysis-migration copies. The 53
 * analysis-profile documents counted on skatingx-platform are the current-data
 * source skip. That source is one short because a later legacy user never
 * landed there. Do not assert 53 against prod.
 */

import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { skipReason, SOURCE_ROOT } from "./migrate-current-data.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const PROD_PROJECT = "skatingx-prod";
const TARGET_CREDENTIAL_ENV = "TARGET_GOOGLE_APPLICATION_CREDENTIALS";
const TARGET_CREDENTIAL_HINT =
  "Point it at the skatingx-prod key. The script will not look up a path by itself.";
const READ_BATCH = 20;

const USER_COLLECTIONS = new Set(["settings", "raceDay", "athletes", "migrationBackups", "analyses"]);
const ATHLETE_MODULES = new Set(["profile", "gamification", "training", "trainingState", "equipment", "planning", "analysis"]);

// Lindsay's platform account. The Auth record for this uid is lafaellin, and
// that account's source gamification/main.points is 0.
export const LINDSAY_UID = "baWEw6SZKcQItvcDdpF64ZNe5W12";
export const LINDSAY_GAMIFICATION_POINTS = 0;
// Analysis check-in owner. DR-004 never writes gamification for this uid.
export const CHECKIN_UID = "lefwGmZ9KyW3d4NswdwF4T2VvEH3";

// Source-side current-data skip on skatingx-platform. Not a prod count.
export const SOURCE_CURRENT_SKIP = { total: 54, equipment: 0, checkIns: 1, backups: 53 };

// The analysis source listed 56 people. Two of them have no profile and no
// documents, so prod never shows them. Count owners from the documents that
// are on prod, which is 54, not from the source headcount.
export const PROD_EXPECTED = {
  analysis: { users: 54, backups: 54, checkIns: 1 },
  current: { copy: 1363, equipment: 0, checkIns: 1 },
  lindsay: { uid: LINDSAY_UID, gamificationPoints: LINDSAY_GAMIFICATION_POINTS },
  checkInOwner: { uid: CHECKIN_UID },
};

const SKIP_KIND = {
  "equipment-history": "equipment",
  "planning-check-in": "checkIn",
  "analysis-profile-backup": "backup",
};

export class VerifyStop extends Error {
  constructor(message) {
    super(message);
    this.name = "VerifyStop";
  }
}

function stop(message) {
  throw new VerifyStop(message);
}

export function parseArgs(argv) {
  const args = { fixture: null, failOnDiff: false, project: PROD_PROJECT };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];
    if (token === "--fail-on-diff") args.failOnDiff = true;
    else if (token === "--fixture") {
      args.fixture = next;
      index += 1;
    } else if (token === "--project") {
      args.project = next;
      index += 1;
    } else if (token === "--write") stop("verify script does not write");
    else stop(`unknown argument ${token}`);
  }
  if (args.project !== PROD_PROJECT) stop("verify only reads skatingx-prod");
  return args;
}

function isInsideRepo(filePath) {
  const resolved = path.resolve(filePath);
  return resolved === ROOT || resolved.startsWith(`${ROOT}${path.sep}`);
}

function credentialGate(env) {
  const configured = env[TARGET_CREDENTIAL_ENV];
  if (!configured) stop(`${TARGET_CREDENTIAL_ENV} is unset. ${TARGET_CREDENTIAL_HINT}`);
  if (isInsideRepo(configured)) stop(`${TARGET_CREDENTIAL_ENV} is inside the repository. Move the key outside the repo.`);
  const resolved = path.resolve(configured);
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
}

function assertLiveHost(env) {
  if (env.FIRESTORE_EMULATOR_HOST || env.FIREBASE_AUTH_EMULATOR_HOST) {
    stop("unset FIRESTORE_EMULATOR_HOST and FIREBASE_AUTH_EMULATOR_HOST before reading skatingx-prod");
  }
}

function uidOf(docPath) {
  const parts = docPath.split("/");
  return parts[3] ?? "";
}

function athleteModule(docPath) {
  const parts = docPath.split("/");
  return parts[4] === "athletes" ? parts[6] : "";
}

export function documentKind(docPath) {
  if (docPath === SOURCE_ROOT) return "root";
  if (!docPath.startsWith(`${SOURCE_ROOT}/users/`)) return "orphan";
  const reason = skipReason(docPath);
  if (reason) return SKIP_KIND[reason];
  const parts = docPath.split("/");
  const collection = parts[4];
  if (!USER_COLLECTIONS.has(collection)) return "orphan";
  if (collection === "athletes") {
    const moduleName = athleteModule(docPath);
    if (!ATHLETE_MODULES.has(moduleName)) return "orphan";
  }
  return "copy";
}

function countCheck(name, actual, expected) {
  return {
    name,
    ok: actual === expected,
    actual,
    expected,
    items: actual === expected ? [] : [`${actual} expected ${expected}`],
  };
}

function findDoc(documents, docPath) {
  return documents.find((document) => document.path === docPath) ?? null;
}

function missingFields(data, names) {
  if (!data || typeof data !== "object") return ["missing document"];
  const missing = [];
  for (const name of names) {
    if (!(name in data) || data[name] === undefined) missing.push(`missing ${name}`);
  }
  return missing;
}

function fieldCheck(name, data, names, extra = []) {
  const items = [...missingFields(data, names), ...extra];
  return { name, ok: items.length === 0, actual: items.length === 0 ? "complete" : "incomplete", expected: "complete", items };
}

function gamificationCheck(documents, lindsay) {
  const gamification = findDoc(documents, `${SOURCE_ROOT}/users/${lindsay.uid}/athletes/lindsay/gamification/main`);
  if (lindsay.gamificationDocument === "absent") {
    const items = gamification ? ["document exists"] : [];
    return {
      name: "lindsay gamification points",
      ok: items.length === 0,
      actual: gamification ? "present" : "absent",
      expected: "absent",
      items,
    };
  }
  const pointsItems = missingFields(gamification?.data, ["points", "streakDays", "completedDays"]);
  if (gamification?.data && (typeof gamification.data.points !== "number" || !Number.isFinite(gamification.data.points))) {
    pointsItems.push("points is not a number");
  } else if (gamification?.data && typeof lindsay.gamificationPoints !== "number") {
    pointsItems.push("expected source value is not set");
  } else if (gamification?.data && gamification.data.points !== lindsay.gamificationPoints) {
    pointsItems.push(`points ${gamification.data.points} expected ${lindsay.gamificationPoints}`);
  }
  return {
    name: "lindsay gamification points",
    ok: pointsItems.length === 0,
    actual: gamification?.data?.points ?? "missing",
    expected: lindsay.gamificationPoints ?? "source",
    items: pointsItems,
  };
}

function lindsayChecks(documents, lindsay) {
  const base = `${SOURCE_ROOT}/users/${lindsay.uid}`;
  const athlete = `${base}/athletes/lindsay`;
  const settings = findDoc(documents, `${base}/settings/main`);
  const settingsExtra = [];
  if (settings?.data && settings.data.activeAthleteId !== "lindsay") settingsExtra.push("activeAthleteId is not lindsay");
  const training = findDoc(documents, `${athlete}/training/state`);
  const events = documents.filter((document) => {
    const parts = document.path.split("/");
    return parts.length === 6 && parts[4] === "raceDay" && document.path.startsWith(`${base}/`);
  });
  const eventItems = [];
  if (events.length === 0) eventItems.push("missing document");
  for (const event of events) {
    for (const item of missingFields(event.data, ["eventId", "name", "dates", "timeZone", "venue", "verification", "source", "sourceNote", "schemaVersion"])) {
      eventItems.push(`${event.path} ${item}`);
    }
    if (event.data && !Array.isArray(event.data.dates)) eventItems.push(`${event.path} dates is not a list`);
  }
  return [
    fieldCheck("lindsay settings", settings?.data, ["activeAthleteId", "language", "theme"], settingsExtra),
    fieldCheck("lindsay training", training?.data, ["todayTasks", "weeklyTemplate", "lastLoginDate", "pointsPerTask", "dailyBonusPoints"]),
    { name: "lindsay raceDay", ok: eventItems.length === 0, actual: events.length, expected: "complete", items: eventItems },
    gamificationCheck(documents, lindsay),
  ];
}

function checkInOwnerChecks(documents, owner) {
  const base = `${SOURCE_ROOT}/users/${owner.uid}`;
  const backup = findDoc(documents, `${base}/migrationBackups/analysis-profile`);
  const checkIns = documents.filter((document) => document.path.startsWith(`${base}/athletes/lindsay/planning/main/completedTasks/`));
  return [
    {
      name: "check-in owner backup",
      ok: Boolean(backup),
      actual: backup ? "present" : "missing",
      expected: "present",
      items: backup ? [] : ["missing document"],
    },
    {
      name: "check-in owner check-in",
      ok: checkIns.length > 0,
      actual: checkIns.length,
      expected: "present",
      items: checkIns.length > 0 ? [] : ["missing document"],
    },
  ];
}

export function verifyMigration(documents, expected = PROD_EXPECTED) {
  if (!Array.isArray(documents)) stop("documents is not a list");
  const seen = new Set();
  const unique = [];
  const duplicates = [];
  for (const document of documents) {
    if (!document?.path || typeof document.path !== "string") stop("a document has no path");
    if (seen.has(document.path)) duplicates.push(document.path);
    else {
      seen.add(document.path);
      unique.push(document);
    }
  }
  const counts = { copy: 0, equipment: 0, checkIn: 0, backup: 0 };
  const orphans = [];
  const analysisUsers = new Set();
  for (const document of unique) {
    const kind = documentKind(document.path);
    if (kind === "root") continue;
    if (kind === "orphan") orphans.push(document.path);
    else if (kind === "copy") counts.copy += 1;
    else {
      counts[kind] += 1;
      analysisUsers.add(uidOf(document.path));
    }
  }
  const checks = [
    countCheck("analysis users", analysisUsers.size, expected.analysis.users),
    countCheck("analysis backups", counts.backup, expected.analysis.backups),
    countCheck("analysis check-ins", counts.checkIn, expected.analysis.checkIns),
    countCheck("current copy", counts.copy, expected.current.copy),
    countCheck("current equipment", counts.equipment, expected.current.equipment),
    countCheck("current check-ins", counts.checkIn, expected.current.checkIns),
    {
      name: "orphans",
      ok: orphans.length === 0,
      actual: orphans.length,
      expected: 0,
      items: orphans,
    },
    {
      name: "duplicate ids",
      ok: duplicates.length === 0,
      actual: duplicates.length,
      expected: 0,
      items: duplicates,
    },
    ...lindsayChecks(unique, expected.lindsay),
    ...checkInOwnerChecks(unique, expected.checkInOwner),
  ];
  return { checks, ok: checks.every((check) => check.ok) };
}

export function reportLines(result) {
  const lines = [];
  for (const check of result.checks) {
    lines.push(`check ${check.name} ${check.ok ? "PASS" : "FAIL"} ${check.actual} expected ${check.expected}`);
  }
  for (const check of result.checks) {
    if (check.ok) continue;
    if (check.items.length === 0) lines.push(`FAIL ${check.name} ${check.actual} expected ${check.expected}`);
    for (const item of check.items) lines.push(`FAIL ${check.name} ${item}`);
  }
  lines.push(
    `note source skip backups ${SOURCE_CURRENT_SKIP.backups} on skatingx-platform, not a prod check`,
  );
  lines.push(result.ok ? "result PASS" : "result FAIL");
  return lines;
}

function loadFixture(filePath) {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    stop(`fixture ${filePath} is not readable json`);
  }
  const documents = Array.isArray(parsed) ? parsed : parsed?.documents;
  if (!Array.isArray(documents)) stop("fixture documents is not a list");
  return { documents, expected: parsed?.expected ?? null };
}

async function readDocTree(docRef) {
  const [snap, collections] = await Promise.all([docRef.get(), docRef.listCollections()]);
  const found = [];
  if (snap.exists) found.push({ path: docRef.path, data: snap.data() });
  const childGroups = await Promise.all(
    collections.map(async (collection) => {
      const children = await collection.listDocuments();
      const trees = [];
      for (let index = 0; index < children.length; index += READ_BATCH) {
        const slice = children.slice(index, index + READ_BATCH);
        const parts = await Promise.all(slice.map((child) => readDocTree(child)));
        trees.push(...parts);
      }
      return trees.flat();
    }),
  );
  for (const group of childGroups) found.push(...group);
  return found;
}

async function readProd(env) {
  assertLiveHost(env);
  credentialGate(env);
  console.log(`read prod start ${PROD_PROJECT} ${SOURCE_ROOT}`);
  const { cert, initializeApp } = await import("firebase-admin/app");
  const { getFirestore } = await import("firebase-admin/firestore");
  const app = initializeApp({ credential: cert(env[TARGET_CREDENTIAL_ENV]), projectId: PROD_PROJECT }, "verify-prod");
  const db = getFirestore(app);
  const documents = [];
  const root = db.doc(SOURCE_ROOT);
  const [rootSnap, collections] = await Promise.all([root.get(), root.listCollections()]);
  if (rootSnap.exists) documents.push({ path: root.path, data: rootSnap.data() });
  const users = collections.find((collection) => collection.id === "users");
  const userRefs = users ? await users.listDocuments() : [];
  console.log(`read users listed ${userRefs.length} documents ${documents.length}`);
  for (let index = 0; index < userRefs.length; index += READ_BATCH) {
    const slice = userRefs.slice(index, index + READ_BATCH);
    const trees = await Promise.all(slice.map((userRef) => readDocTree(userRef)));
    for (const tree of trees) documents.push(...tree);
    console.log(`read users ${Math.min(index + READ_BATCH, userRefs.length)}/${userRefs.length} documents ${documents.length}`);
  }
  return documents;
}

export async function run(argv, env = process.env, deps = {}) {
  const args = parseArgs(argv);
  const loaded = args.fixture ? loadFixture(args.fixture) : { documents: await (deps.readProd ?? readProd)(env), expected: null };
  const result = verifyMigration(loaded.documents, deps.expected ?? loaded.expected ?? PROD_EXPECTED);
  for (const line of reportLines(result)) console.log(line);
  return { ...result, failOnDiff: args.failOnDiff };
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  run(process.argv.slice(2))
    .then((result) => {
      if (result.failOnDiff && !result.ok) process.exit(1);
    })
    .catch((error) => {
      const message = error instanceof Error ? error.message : "verify failed";
      console.error(message);
      process.exit(1);
    });
}
