// Read-only census of blaze-skate-journal. Stdout only.
// The key path comes from GOOGLE_APPLICATION_CREDENTIALS. This file does not open a fixed path.
// Live reads require --limit N or --full. There is no default scan.

import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE_PROJECT = "blaze-skate-journal";
const READER_ACCOUNT = "migration-reader@blaze-skate-journal.iam.gserviceaccount.com";
const SOURCE_CREDENTIAL_ENV = "GOOGLE_APPLICATION_CREDENTIALS";
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const FIELD_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const MAX_DEPTH = 3;

export const COLLECTIONS = [
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

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export class MigrationStop extends Error {
  constructor(message) {
    super(message);
    this.name = "MigrationStop";
  }
}

function stop(message) {
  throw new MigrationStop(message);
}

function isInsideRepo(file) {
  const resolved = path.resolve(file);
  return resolved === repoRoot || resolved.startsWith(`${repoRoot}${path.sep}`);
}

function isTimestamp(value) {
  return Boolean(value && typeof value.toDate === "function" && typeof value.toMillis === "function");
}

export function typeName(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (isTimestamp(value)) return "timestamp";
  if (typeof value === "string") return "string";
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "object") return "object";
  return "other";
}

function note(local, key, type) {
  const types = local[key] ?? {};
  types[type] = true;
  local[key] = types;
}

function walkValue(local, fieldPath, value, depth) {
  note(local, fieldPath, typeName(value));
  if (depth >= MAX_DEPTH) return;
  if (Array.isArray(value)) {
    for (const item of value) {
      if (!item || typeof item !== "object" || Array.isArray(item) || isTimestamp(item)) continue;
      for (const key of Object.keys(item)) {
        const child = FIELD_NAME_PATTERN.test(key) ? `${fieldPath}[].${key}` : `${fieldPath}[].<unsafe-key>`;
        walkValue(local, child, item[key], depth + 1);
      }
    }
    return;
  }
  if (!value || typeof value !== "object" || isTimestamp(value)) return;
  for (const key of Object.keys(value)) {
    const child = FIELD_NAME_PATTERN.test(key) ? `${fieldPath}.${key}` : `${fieldPath}.<unsafe-key>`;
    walkValue(local, child, value[key], depth + 1);
  }
}

function observeDocument(table, data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return;
  const local = {};
  for (const key of Object.keys(data)) {
    const fieldPath = FIELD_NAME_PATTERN.test(key) ? key : "<unsafe-key>";
    walkValue(local, fieldPath, data[key], 1);
  }
  for (const field of Object.keys(local)) {
    const row = table[field] ?? { docs: 0, types: {} };
    row.docs += 1;
    Object.assign(row.types, local[field]);
    table[field] = row;
  }
}

function stringBytes(value) {
  if (typeof value === "string") return Buffer.byteLength(value);
  if (Array.isArray(value)) return value.reduce((sum, item) => sum + stringBytes(item), 0);
  if (isTimestamp(value) || !value || typeof value !== "object") return 0;
  return Object.values(value).reduce((sum, item) => sum + stringBytes(item), 0);
}

function athleteIdOf(data) {
  const value = data?.athleteId;
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function dateSpan(values) {
  const valid = [];
  let invalid = 0;
  for (const value of values) {
    if (typeof value === "string" && DATE_PATTERN.test(value)) valid.push(value);
    else if (value !== undefined) invalid += 1;
  }
  valid.sort();
  return {
    min: valid[0] ?? null,
    max: valid[valid.length - 1] ?? null,
    invalid,
  };
}

function hostnameOf(value) {
  if (typeof value !== "string" || value.trim() === "") return { host: null, invalid: false, empty: true };
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return { host: null, invalid: true, empty: false };
    return { host: url.hostname.toLowerCase(), invalid: false, empty: false };
  } catch {
    return { host: null, invalid: true, empty: false };
  }
}

function prefixOf(athleteId) {
  if (athleteId.length < 8) stop("An athleteId is shorter than 8 characters. Census stopped.");
  return athleteId.slice(0, 8);
}

export function summarize(byCollection) {
  for (const name of COLLECTIONS) {
    if (!Array.isArray(byCollection[name])) stop(`Missing collection ${name}.`);
  }

  const collections = {};
  for (const name of COLLECTIONS) {
    const docs = byCollection[name];
    const athletes = {};
    let missingAthleteId = 0;
    const fields = {};
    const dates = [];
    const weekStarts = [];
    for (const doc of docs) {
      const athleteId = athleteIdOf(doc.data);
      if (athleteId) athletes[athleteId] = true;
      else missingAthleteId += 1;
      observeDocument(fields, doc.data);
      if (doc.data && Object.prototype.hasOwnProperty.call(doc.data, "date")) dates.push(doc.data.date);
      if (doc.data && Object.prototype.hasOwnProperty.call(doc.data, "weekStart")) weekStarts.push(doc.data.weekStart);
    }
    const fieldRows = Object.keys(fields)
      .sort()
      .map((field) => ({
        field,
        docs: fields[field].docs,
        types: Object.keys(fields[field].types).sort(),
      }));
    collections[name] = {
      docs: docs.length,
      distinctAthleteId: Object.keys(athletes).length,
      missingAthleteId,
      fields: fieldRows,
      date: dates.length > 0 ? dateSpan(dates) : null,
      weekStart: weekStarts.length > 0 ? dateSpan(weekStarts) : null,
    };
  }

  const dayCounts = {};
  for (const doc of byCollection.journal_days) {
    const athleteId = athleteIdOf(doc.data);
    if (!athleteId) continue;
    dayCounts[athleteId] = (dayCounts[athleteId] ?? 0) + 1;
  }
  let anchorId = null;
  let anchorDays = -1;
  let tie = false;
  for (const [athleteId, count] of Object.entries(dayCounts)) {
    if (count > anchorDays) {
      anchorId = athleteId;
      anchorDays = count;
      tie = false;
    } else if (count === anchorDays) {
      tie = true;
    }
  }

  let anchor = { status: "none" };
  if (tie) {
    anchor = { status: "tie", journalDays: anchorDays };
  } else if (anchorId) {
    const perCollection = {};
    let bytes = 0;
    const anchorDates = [];
    for (const name of COLLECTIONS) {
      const owned = byCollection[name].filter((doc) => athleteIdOf(doc.data) === anchorId);
      perCollection[name] = owned.length;
      for (const doc of owned) {
        bytes += stringBytes(doc.data);
        if (name === "journal_days" && doc.data && Object.prototype.hasOwnProperty.call(doc.data, "date")) {
          anchorDates.push(doc.data.date);
        }
      }
    }
    const span = dateSpan(anchorDates);
    anchor = {
      status: "ok",
      prefix: prefixOf(anchorId),
      journalDays: anchorDays,
      perCollection,
      dateMin: span.min,
      dateMax: span.max,
      dateInvalid: span.invalid,
      stringBytes: bytes,
    };
  }

  let idEquals = 0;
  let idDiffers = 0;
  let idMissing = 0;
  for (const doc of byCollection.athletes) {
    const athleteId = athleteIdOf(doc.data);
    if (!athleteId) idMissing += 1;
    else if (doc.id === athleteId) idEquals += 1;
    else idDiffers += 1;
  }

  const hosts = {};
  let videoInvalid = 0;
  let videoEmpty = 0;
  for (const doc of byCollection.video_refs) {
    const parsed = hostnameOf(doc.data?.externalUrl);
    if (parsed.host) hosts[parsed.host] = true;
    else if (parsed.empty) videoEmpty += 1;
    else videoInvalid += 1;
  }

  return {
    collections,
    anchor,
    athletes: { idEquals, idDiffers, idMissing },
    videoHosts: Object.keys(hosts).sort(),
    videoInvalid,
    videoEmpty,
    milestones: byCollection.milestones.length,
  };
}

function render(report, mode) {
  const lines = [`mode=${mode}`, `project=${SOURCE_PROJECT}`];
  for (const name of COLLECTIONS) {
    const row = report.collections[name];
    lines.push(
      `collection=${name} docs=${row.docs} distinctAthleteId=${row.distinctAthleteId} missingAthleteId=${row.missingAthleteId}`,
    );
    for (const field of row.fields) {
      lines.push(`field ${name} ${field.field} docs=${field.docs} types=${field.types.join("|")}`);
    }
    if (row.date) lines.push(`date ${name} min=${row.date.min ?? "none"} max=${row.date.max ?? "none"} invalid=${row.date.invalid}`);
    if (row.weekStart) {
      lines.push(`weekStart ${name} min=${row.weekStart.min ?? "none"} max=${row.weekStart.max ?? "none"} invalid=${row.weekStart.invalid}`);
    }
  }
  if (report.anchor.status === "ok") {
    lines.push(
      `anchor prefix=${report.anchor.prefix} journal_days=${report.anchor.journalDays} dateMin=${report.anchor.dateMin ?? "none"} dateMax=${report.anchor.dateMax ?? "none"} dateInvalid=${report.anchor.dateInvalid} stringBytes=${report.anchor.stringBytes}`,
    );
    for (const name of COLLECTIONS) lines.push(`anchor-collection ${name} docs=${report.anchor.perCollection[name]}`);
  } else if (report.anchor.status === "tie") {
    lines.push(`anchor status=tie journal_days=${report.anchor.journalDays}`);
  } else {
    lines.push("anchor status=none");
  }
  lines.push(
    `athletes idEquals=${report.athletes.idEquals} idDiffers=${report.athletes.idDiffers} idMissing=${report.athletes.idMissing}`,
  );
  lines.push(`video-domains ${report.videoHosts.join(",") || "none"} invalid=${report.videoInvalid} empty=${report.videoEmpty}`);
  lines.push(`milestones docs=${report.milestones} empty=${report.milestones === 0}`);
  return lines.join("\n");
}

export function renderReport(byCollection, mode) {
  return render(summarize(byCollection), mode);
}

function credentialFailure(env) {
  const configured = env[SOURCE_CREDENTIAL_ENV];
  if (!configured) return `${SOURCE_CREDENTIAL_ENV} is unset. The script will not look for a key by itself.`;
  if (isInsideRepo(configured)) return `${SOURCE_CREDENTIAL_ENV} is inside the repository. Move the key outside the repo.`;
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
    return `${SOURCE_CREDENTIAL_ENV} is not the journal migration reader for ${SOURCE_PROJECT}.`;
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
  const args = { full: false, limit: null, fixture: null };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--full") args.full = true;
    else if (token === "--limit") {
      const raw = argv[index + 1] ?? "";
      index += 1;
      if (!/^[1-9]\d*$/.test(raw)) stop("--limit needs a positive integer.");
      args.limit = Number(raw);
    } else if (token === "--fixture") {
      args.fixture = argv[index + 1] ?? "";
      index += 1;
    } else {
      stop(`Unknown argument ${token}`);
    }
  }
  const chosen = [args.full, args.limit !== null, args.fixture !== null].filter(Boolean).length;
  if (chosen !== 1) stop("Use one of --limit N, --full, or --fixture <file>.");
  if (args.full) return { mode: "full", limit: null, fixture: null };
  if (args.limit !== null) return { mode: "sample", limit: args.limit, fixture: null };
  return { mode: "fixture", limit: null, fixture: args.fixture };
}

function loadFixture(file) {
  const parsed = JSON.parse(readFileSync(file, "utf8"));
  for (const name of COLLECTIONS) {
    if (!Array.isArray(parsed[name])) stop(`--fixture is missing ${name}.`);
  }
  return parsed;
}

async function readLive(env, limit) {
  assertLiveEnvironment(env);
  const { applicationDefault, initializeApp } = await import("firebase-admin/app");
  const { getFirestore } = await import("firebase-admin/firestore");
  const app = initializeApp(
    { credential: applicationDefault(), projectId: SOURCE_PROJECT },
    "journal-source-counts",
  );
  const db = getFirestore(app);
  const byCollection = {};
  for (const name of COLLECTIONS) {
    let query = db.collection(name);
    if (limit) query = query.limit(limit);
    const snap = await query.get();
    byCollection[name] = snap.docs.map((doc) => ({ id: doc.id, data: doc.data() }));
  }
  return byCollection;
}

async function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    const byCollection = args.mode === "fixture" ? loadFixture(args.fixture) : await readLive(process.env, args.limit);
    const mode = args.mode === "sample" ? `sample limit=${args.limit}` : args.mode;
    console.log(renderReport(byCollection, mode));
  } catch (error) {
    console.error(error instanceof Error ? error.message : "journal source count failed");
    process.exitCode = 1;
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) await main();
