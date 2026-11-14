// Read-only backup of existing business documents. Restore is emulator-only.
import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { GeoPoint, Timestamp } from "firebase-admin/firestore";

import { FIRESTORE_USERS_COLLECTION, PRODUCTION_PROJECT_ID } from "./import-guard.mjs";

export const SCHEMA_VERSION = "race-day-v1+user-video-library";
const MEDIA_FIELDS = new Set(["externalUrl", "fileName", "storedWhere"]);

export function sha256Text(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function stable(value) {
  return JSON.stringify(value);
}

export function encodeValue(value) {
  if (value === null) return { t: "null" };
  if (value === undefined) throw new Error("unsupported field type undefined");
  if (typeof value === "string") return { t: "string", v: value };
  if (typeof value === "boolean") return { t: "boolean", v: value };
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("unsupported field type number");
    return { t: "number", v: value };
  }
  if (value instanceof Timestamp) {
    return { t: "timestamp", seconds: value.seconds, nanoseconds: value.nanoseconds };
  }
  if (value instanceof GeoPoint) {
    return { t: "geopoint", latitude: value.latitude, longitude: value.longitude };
  }
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
    return { t: "bytes", v: Buffer.from(value).toString("base64") };
  }
  if (Array.isArray(value)) return { t: "array", v: value.map((item) => encodeValue(item)) };
  if (isReference(value)) return { t: "reference", path: value.path };
  if (isPlainObject(value)) {
    const encoded = {};
    for (const key of Object.keys(value).sort()) encoded[key] = encodeValue(value[key]);
    return { t: "map", v: encoded };
  }
  throw new Error(`unsupported field type ${value?.constructor?.name ?? typeof value}`);
}

export function decodeValue(encoded, db) {
  switch (encoded?.t) {
    case "null":
      return null;
    case "string":
    case "boolean":
    case "number":
      return encoded.v;
    case "array":
      return encoded.v.map((item) => decodeValue(item, db));
    case "timestamp":
      return new Timestamp(encoded.seconds, encoded.nanoseconds);
    case "geopoint":
      return new GeoPoint(encoded.latitude, encoded.longitude);
    case "bytes":
      return Buffer.from(encoded.v, "base64");
    case "reference":
      if (!db) throw new Error("reference decode needs a Firestore client");
      return db.doc(encoded.path);
    case "map": {
      const decoded = {};
      for (const key of Object.keys(encoded.v).sort()) decoded[key] = decodeValue(encoded.v[key], db);
      return decoded;
    }
    default:
      throw new Error(`unsupported field type ${String(encoded?.t)}`);
  }
}

function isReference(value) {
  return value?.constructor?.name === "DocumentReference" && typeof value.path === "string";
}

function isPlainObject(value) {
  return Object.prototype.toString.call(value) === "[object Object]" && Object.getPrototypeOf(value) === Object.prototype;
}

export function classifyMediaValue(field, value) {
  if (value == null || value === "") return { field, kind: "empty" };
  if (typeof value !== "string") throw new Error(`unsupported media field ${field}`);
  if (value.startsWith("gs://")) {
    const body = value.slice("gs://".length);
    const slash = body.indexOf("/");
    if (slash <= 0 || slash === body.length - 1) return { field, kind: "storage", ok: false, reason: "missing-object-path" };
    return { field, kind: "storage", ok: true, bucket: body.slice(0, slash), object: body.slice(slash + 1) };
  }
  if (value.startsWith("http://") || value.startsWith("https://")) return { field, kind: "external-url" };
  if (field === "fileName") return { field, kind: "local-file-name" };
  if (field === "storedWhere") return { field, kind: "stored-note" };
  return { field, kind: "unclassified" };
}

function mediaFields(encoded) {
  if (encoded?.t !== "map") return [];
  const found = [];
  for (const [field, value] of Object.entries(encoded.v)) {
    if (MEDIA_FIELDS.has(field) && value?.t === "string") found.push(classifyMediaValue(field, value.v));
  }
  return found;
}

export async function checkStorageReferences(documents, getMetadata) {
  const classified = { storage: 0, externalUrl: 0, localFileName: 0, storedNote: 0, unclassified: 0 };
  const failures = [];
  const metadata = [];
  for (const document of documents) {
    for (const item of mediaFields(document.encoded)) {
      if (item.kind === "external-url") classified.externalUrl += 1;
      else if (item.kind === "local-file-name") classified.localFileName += 1;
      else if (item.kind === "stored-note") classified.storedNote += 1;
      else if (item.kind === "unclassified") classified.unclassified += 1;
      else if (item.kind === "storage") {
        classified.storage += 1;
        if (!item.ok) {
          failures.push({ path: document.path, kind: "missing-reference" });
          continue;
        }
        const found = await getMetadata({ bucket: item.bucket, object: item.object });
        if (!found) {
          failures.push({ path: document.path, kind: "missing-object" });
          continue;
        }
        if (found.bucket !== item.bucket) {
          failures.push({ path: document.path, kind: "bucket-mismatch" });
          continue;
        }
        metadata.push({
          path: document.path,
          bucket: found.bucket,
          name: found.name,
          size: found.size,
          updated: found.updated ?? null,
          generation: found.generation ?? null,
          md5Hash: found.md5Hash ?? null,
        });
      }
    }
  }
  return { classified, failures, metadata, videoBinaryBackedUp: false };
}

function packDocument(snap, readAt) {
  const encoded = encodeValue(snap.data() ?? {});
  return {
    path: snap.ref.path,
    encoded,
    sha256: sha256Text(stable(encoded)),
    readAt,
    updateTime: snap.updateTime ? snap.updateTime.toDate().toISOString() : null,
  };
}

export async function snapshotBusiness(db) {
  const readAt = new Date().toISOString();
  const documents = [];
  const users = await db.collection(FIRESTORE_USERS_COLLECTION).listDocuments();
  for (const userRef of users) {
    const user = await userRef.get();
    if (user.exists) documents.push(packDocument(user, readAt));
    const events = await userRef.collection("raceDay").listDocuments();
    for (const eventRef of events) {
      const event = await eventRef.get();
      if (event.exists) documents.push(packDocument(event, readAt));
      const results = await eventRef.collection("results").get();
      for (const result of results.docs) documents.push(packDocument(result, readAt));
      const raceVideos = await eventRef.collection("videos").get();
      for (const video of raceVideos.docs) documents.push(packDocument(video, readAt));
    }
    const videos = await userRef.collection("videos").get();
    for (const video of videos.docs) documents.push(packDocument(video, readAt));
  }
  documents.sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));
  return { documents, readAt, schemaVersion: SCHEMA_VERSION };
}

export function compareBusiness(before, after) {
  const left = new Map(before.documents.map((item) => [item.path, item.sha256]));
  const right = new Map(after.documents.map((item) => [item.path, item.sha256]));
  const changes = [];
  for (const [docPath, digest] of left) {
    if (!right.has(docPath)) changes.push({ path: docPath, kind: "removed" });
    else if (right.get(docPath) !== digest) changes.push({ path: docPath, kind: "changed" });
  }
  for (const docPath of right.keys()) {
    if (!left.has(docPath)) changes.push({ path: docPath, kind: "added" });
  }
  changes.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return { countBefore: before.documents.length, countAfter: after.documents.length, changes };
}

export function assertBackupOutput(outDir, { repoRoot, projectId }) {
  const resolved = path.resolve(outDir);
  const repo = path.resolve(repoRoot);
  if (resolved === repo || resolved.startsWith(repo + path.sep)) {
    throw new Error("refusing to write a backup inside the git workspace");
  }
  if (projectId === PRODUCTION_PROJECT_ID) {
    const home = os.homedir();
    if (!(resolved === home || resolved.startsWith(home + path.sep))) {
      throw new Error("refusing to write a production backup outside the private home directory");
    }
  }
  return resolved;
}

export function assertBackupOptions({ projectId, skipStorage }) {
  if (skipStorage && projectId === PRODUCTION_PROJECT_ID) {
    throw new Error("refusing --skip-storage for a production backup");
  }
}

export function assertBusinessSnapshot(value) {
  if (Array.isArray(value) || !value || typeof value !== "object" || !Array.isArray(value.documents)) {
    throw new Error("基线必须是备份快照对象，不是文档数组");
  }
  if (typeof value.readAt !== "string" || typeof value.schemaVersion !== "string") {
    throw new Error("基线必须是备份快照对象，不是文档数组");
  }
  for (const document of value.documents) {
    if (typeof document?.path !== "string" || document.path === "" || typeof document?.sha256 !== "string" || document.sha256 === "") {
      throw new Error("backup document is missing path or sha256");
    }
  }
  return { documents: value.documents, readAt: value.readAt, schemaVersion: value.schemaVersion };
}

export function loadBusinessBaseline(filePath) {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error("backup file is missing or corrupt", { cause: error });
  }
  return assertBusinessSnapshot(parsed);
}

export function manifestFor(snapshot, { projectId, databaseId, storage }) {
  const documents = assertBusinessSnapshot(snapshot).documents;
  const paths = documents.map((item) => item.path);
  const pathDigest = sha256Text(paths.join("\n"));
  const fileSha256 = sha256Text(stable(assertBusinessSnapshot(snapshot)));
  const body = {
    projectId,
    databaseId,
    schemaVersion: SCHEMA_VERSION,
    documentCount: documents.length,
    pathDigest,
    fileSha256,
    videoBinaryBackedUp: false,
    encryptionAtRest: "required",
    storage,
  };
  return { ...body, overallSha256: sha256Text(stable(body)) };
}

export function writeBackup(outDir, snapshot, meta) {
  const resolved = assertBackupOutput(outDir, meta);
  const body = assertBusinessSnapshot(snapshot);
  mkdirSync(resolved, { recursive: true, mode: 0o700 });
  chmodSync(resolved, 0o700);
  const manifest = manifestFor(body, meta);
  const docsPath = path.join(resolved, "documents.json");
  const manifestPath = path.join(resolved, "manifest.json");
  writeFileSync(docsPath, `${stable(body)}\n`, { mode: 0o600 });
  writeFileSync(manifestPath, `${stable(manifest)}\n`, { mode: 0o600 });
  chmodSync(docsPath, 0o600);
  chmodSync(manifestPath, 0o600);
  return {
    outDir: resolved,
    documentCount: manifest.documentCount,
    pathDigest: manifest.pathDigest,
    fileSha256: manifest.fileSha256,
    overallSha256: manifest.overallSha256,
    videoBinaryBackedUp: false,
    encryptionAtRest: "required",
  };
}

export function verifyBackup(outDir) {
  const docsPath = path.join(outDir, "documents.json");
  const manifestPath = path.join(outDir, "manifest.json");
  let snapshot;
  let manifest;
  try {
    snapshot = loadBusinessBaseline(docsPath);
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (error) {
    if (error instanceof Error && error.message === "基线必须是备份快照对象，不是文档数组") throw error;
    throw new Error("backup file is missing or corrupt", { cause: error });
  }
  if (sha256Text(stable(snapshot)) !== manifest.fileSha256) {
    throw new Error("backup file is missing or corrupt");
  }
  const rebuilt = manifestFor(snapshot, manifest);
  if (rebuilt.overallSha256 !== manifest.overallSha256 || rebuilt.pathDigest !== manifest.pathDigest) {
    throw new Error("backup file is missing or corrupt");
  }
  if (manifest.videoBinaryBackedUp !== false) throw new Error("backup file is missing or corrupt");
  return { documents: snapshot.documents, snapshot, manifest };
}

export async function restoreBackupToEmulator(db, documents, { projectId }) {
  if (!projectId.startsWith("demo-")) throw new Error("refusing restore outside a demo- emulator project");
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error("refusing restore while FIRESTORE_EMULATOR_HOST is not set");
  for (const document of documents) {
    if (!document.path.startsWith(`${FIRESTORE_USERS_COLLECTION}/`)) {
      throw new Error(`refusing restore outside business paths: ${document.path}`);
    }
    await db.doc(document.path).set(decodeValue(document.encoded, db));
  }
}

function databaseIdOf(db) {
  return typeof db.databaseId === "string" && db.databaseId !== "" ? db.databaseId : "(default)";
}

function projectIdOf(db) {
  const settings = db._settings;
  return typeof settings?.projectId === "string" ? settings.projectId : "";
}

async function main() {
  const { initializeApp } = await import("firebase-admin/app");
  const { getFirestore } = await import("firebase-admin/firestore");
  const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const projectId = argument("--project") ?? "";
  const skipStorage = process.argv.includes("--skip-storage");
  assertBackupOptions({ projectId, skipStorage });
  if (projectId === PRODUCTION_PROJECT_ID && process.env.SKATINGX_BACKUP_READ !== "allow") {
    throw new Error("refusing production backup without SKATINGX_BACKUP_READ=allow");
  }
  if (projectId === PRODUCTION_PROJECT_ID && process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error("refusing production backup while FIRESTORE_EMULATOR_HOST is set");
  }
  if (projectId !== PRODUCTION_PROJECT_ID && !projectId.startsWith("demo-")) {
    throw new Error("refusing backup: project must be skatingx-prod or a demo- emulator");
  }
  const outDir = argument("--out") ?? path.join(os.homedir(), ".skatingx", "catalog-backups", projectId);
  const app = initializeApp({ projectId }, `catalog-backup-${projectId}`);
  const db = getFirestore(app);
  const snap = await snapshotBusiness(db);
  const storage = skipStorage
    ? { skipped: true, failures: [], videoBinaryBackedUp: false }
    : await checkStorageReferences(snap.documents, (ref) => fetchObjectMetadata({
      ...ref,
      token: process.env.FIREBASE_STORAGE_TOKEN ?? "",
      fetchImpl: globalThis.fetch,
    }));
  if (storage.failures?.length) throw new Error(`storage check failed: ${storage.failures[0].path}`);
  const summary = writeBackup(outDir, snap, {
    projectId: projectIdOf(db) || projectId,
    databaseId: databaseIdOf(db),
    repoRoot: rootDir,
    storage,
  });
  console.log(stable(summary));
}

export async function fetchObjectMetadata({ bucket, object, token, fetchImpl }) {
  if (typeof token !== "string" || token.trim() === "") throw new Error("refusing storage metadata read: no token");
  const url = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(object)}`;
  const response = await fetchImpl(url, { method: "GET", headers: { Authorization: `Bearer ${token}` } });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`storage metadata read failed: ${response.status}`);
  const body = await response.json();
  return {
    bucket,
    name: body.name,
    size: body.size,
    updated: body.updated ?? null,
    generation: body.generation ?? null,
    md5Hash: body.md5Hash ?? null,
  };
}

function argument(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
