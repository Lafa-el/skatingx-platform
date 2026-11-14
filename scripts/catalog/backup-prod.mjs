// Read-only backup of existing business documents. Restore is emulator-only.
// Video fields confirmed from:
// packages/schema/src/paths.ts (users/{uid}/videos and raceDay/{eventId}/videos)
// packages/firebase-client/src/firestore/videos.ts (title, fileName, externalUrl, technicalTags, notes)
// packages/schema/src/race-day.ts and race-day-codec.ts (externalUrl, storedWhere, label, note)
// None of those records a Storage object path. fileName is a local name. storedWhere is a note.
import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from "node:crypto";
import { chmodSync, closeSync, constants, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, writeSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { GeoPoint, Timestamp } from "firebase-admin/firestore";

import { FIRESTORE_USERS_COLLECTION, PRODUCTION_PROJECT_ID } from "./import-guard.mjs";

export const SCHEMA_VERSION = "race-day-v1+user-video-library";
export const FORMAT_VERSION = "skatingx-backup-v1";
const PLAINTEXT_FILE = "documents.json";
const CIPHER_FILE = "documents.json.enc";
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, keyLength: 32 };
const TEXT_FIELDS = new Set(["title", "notes", "label", "note", "name", "displayName", "status", "place", "technicalTags"]);

export const BACKUP_COVERAGE = {
  firestoreUsersResultsAndVideoMetadata: "backed-up",
  firebaseAuthAccounts: "not-exported",
  storageVideoBytes: "not-backed-up",
  projectDisasterRecovery: "out-of-scope",
};

export const BACKUP_SCOPE = [
  "Firestore 用户、比赛成绩、视频元数据：备份",
  "Firebase Authentication 账户：不导出",
  "Cloud Storage 视频二进制：不备份，仅核对元数据",
  "整个 Firebase 项目灾难恢复：不在本次范围",
];

export function sha256Text(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function sha256Bytes(value) {
  return createHash("sha256").update(value).digest("hex");
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

function leafName(fieldPath) {
  const match = fieldPath.match(/(?:^|\.)([^[.\]]+)(?:\[\d+\])*$/);
  return match ? match[1] : fieldPath;
}

function looksLikeStorage(value) {
  return value.startsWith("gs://")
    || value.includes("firebasestorage.googleapis.com")
    || value.includes("storage.googleapis.com/")
    || value.includes("storage.cloud.google.com/");
}

function parseStorageLocator(value) {
  if (value.startsWith("gs://")) {
    const body = value.slice("gs://".length).split("?")[0];
    const slash = body.indexOf("/");
    if (slash <= 0 || slash >= body.length - 1) return { ok: false, reason: "missing-object-path" };
    return { ok: true, bucket: body.slice(0, slash), object: body.slice(slash + 1) };
  }
  let parsed;
  try {
    parsed = new URL(value);
  } catch (error) {
    throw new Error("unreadable storage reference", { cause: error });
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return { ok: false, reason: "unreadable-storage-reference" };
  if (parsed.hostname === "firebasestorage.googleapis.com") {
    const match = parsed.pathname.match(/^\/v0\/b\/([^/]+)\/o\/(.+)$/);
    if (!match) return { ok: false, reason: "unreadable-storage-reference" };
    const object = decodeURIComponent(match[2]);
    if (!match[1] || object === "") return { ok: false, reason: "missing-object-path" };
    return { ok: true, bucket: match[1], object };
  }
  if (parsed.hostname === "storage.googleapis.com" || parsed.hostname === "storage.cloud.google.com") {
    const parts = parsed.pathname.split("/").filter((part) => part !== "");
    if (parts.length < 2) return { ok: false, reason: "missing-object-path" };
    return { ok: true, bucket: parts[0], object: decodeURIComponent(parts.slice(1).join("/")) };
  }
  return { ok: false, reason: "unreadable-storage-reference" };
}

export function classifyMediaValue(field, value) {
  if (value == null || value === "") return { field, kind: "empty" };
  if (typeof value !== "string") throw new Error(`unsupported media field ${field}`);
  const leaf = leafName(field);
  if (looksLikeStorage(value)) {
    let parsed;
    try {
      parsed = parseStorageLocator(value);
    } catch (error) {
      if (error instanceof Error && error.message === "unreadable storage reference") {
        return { field, kind: "storage", ok: false, reason: "unreadable-storage-reference" };
      }
      throw error;
    }
    if (!parsed.ok) return { field, kind: "storage", ok: false, reason: parsed.reason };
    return { field, kind: "storage", ok: true, bucket: parsed.bucket, object: parsed.object };
  }
  if ((value.startsWith("http://") || value.startsWith("https://")) && leaf === "externalUrl") {
    return { field, kind: "external-url" };
  }
  if (leaf === "fileName") return { field, kind: "local-file-name" };
  if (leaf === "storedWhere") return { field, kind: "stored-note" };
  if (TEXT_FIELDS.has(leaf)) return { field, kind: "text" };
  if (value.startsWith("http://") || value.startsWith("https://")) return { field, kind: "external-url" };
  return { field, kind: "unclassified" };
}

function visitEncoded(encoded, fieldPath, visit) {
  if (!encoded || typeof encoded !== "object") return;
  if (encoded.t === "string") {
    visit(fieldPath, encoded.v);
    return;
  }
  if (encoded.t === "array" && Array.isArray(encoded.v)) {
    encoded.v.forEach((item, index) => visitEncoded(item, `${fieldPath}[${index}]`, visit));
    return;
  }
  if (encoded.t === "map" && encoded.v && typeof encoded.v === "object") {
    for (const key of Object.keys(encoded.v)) {
      const next = fieldPath ? `${fieldPath}.${key}` : key;
      visitEncoded(encoded.v[key], next, visit);
    }
  }
}

export async function checkStorageReferences(documents, getMetadata) {
  const classified = { storage: 0, externalUrl: 0, localFileName: 0, storedNote: 0, unclassified: 0 };
  const failures = [];
  const metadata = [];
  const pending = new Map();
  for (const document of documents) {
    visitEncoded(document.encoded, "", (fieldPath, value) => {
      const item = classifyMediaValue(fieldPath, value);
      if (item.kind === "external-url") classified.externalUrl += 1;
      else if (item.kind === "local-file-name") classified.localFileName += 1;
      else if (item.kind === "stored-note") classified.storedNote += 1;
      else if (item.kind === "unclassified") classified.unclassified += 1;
      else if (item.kind === "text" || item.kind === "empty") return;
      else if (item.kind === "storage") {
        classified.storage += 1;
        if (!item.ok) {
          const kind = item.reason === "missing-object-path" ? "missing-reference" : "unreadable-storage-reference";
          failures.push({ path: document.path, field: fieldPath, kind });
          return;
        }
        const key = `${item.bucket}\n${item.object}`;
        const group = pending.get(key) ?? { bucket: item.bucket, object: item.object, references: [] };
        group.references.push({ path: document.path, field: fieldPath });
        pending.set(key, group);
      }
    });
  }
  for (const group of pending.values()) {
    let found;
    try {
      found = await getMetadata({ bucket: group.bucket, object: group.object });
    } catch (error) {
      failures.push({ path: group.references[0].path, field: group.references[0].field, kind: "metadata-query-failed", cause: error });
      continue;
    }
    if (!found) {
      for (const ref of group.references) failures.push({ path: ref.path, field: ref.field, kind: "missing-object" });
      continue;
    }
    if (found.bucket !== group.bucket) {
      for (const ref of group.references) failures.push({ path: ref.path, field: ref.field, kind: "bucket-mismatch" });
      continue;
    }
    metadata.push({
      bucket: found.bucket,
      object: group.object,
      name: found.name,
      size: found.size,
      updated: found.updated ?? null,
      generation: found.generation ?? null,
      hash: found.md5Hash ?? found.hash ?? null,
      exists: true,
      references: group.references,
    });
  }
  return { classified, failures: failures.map(publicFailure), metadata, videoBinaryBackedUp: false };
}

function publicFailure(failure) {
  return { path: failure.path, field: failure.field, kind: failure.kind };
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

function assertDocumentIntegrity(snapshot) {
  const seen = new Set();
  for (const document of snapshot.documents) {
    if (seen.has(document.path)) throw new Error(`backup document path is duplicated: ${document.path}`);
    seen.add(document.path);
    if (!document.encoded || typeof document.encoded !== "object") {
      throw new Error(`backup document sha256 mismatch: ${document.path}`);
    }
    if (sha256Text(stable(document.encoded)) !== document.sha256) {
      throw new Error(`backup document sha256 mismatch: ${document.path}`);
    }
  }
  return snapshot;
}

function isKeptError(error) {
  return error instanceof Error && (
    error.message === "基线必须是备份快照对象，不是文档数组"
    || error.message === "backup decryption failed"
    || error.message === "refusing a plaintext baseline for production verification"
    || error.message.startsWith("backup document ")
  );
}

export function loadBusinessBaseline(target, options = {}) {
  const resolved = path.resolve(target);
  let stat;
  try {
    stat = lstatSync(resolved);
  } catch (error) {
    throw new Error("backup file is missing or corrupt", { cause: error });
  }
  if (stat.isSymbolicLink()) throw new Error("backup file is missing or corrupt");
  if (stat.isDirectory() || path.basename(resolved) === "manifest.json") {
    const dir = stat.isDirectory() ? resolved : path.dirname(resolved);
    return verifyBackup(dir, options).snapshot;
  }
  if (path.basename(resolved) === CIPHER_FILE || path.basename(resolved) === PLAINTEXT_FILE) {
    const sibling = path.join(path.dirname(resolved), "manifest.json");
    if (isRegularFile(sibling)) return verifyBackup(path.dirname(resolved), options).snapshot;
  }
  if (options.requireEncrypted) throw new Error("refusing a plaintext baseline for production verification");
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(resolved, "utf8"));
  } catch (error) {
    throw new Error("backup file is missing or corrupt", { cause: error });
  }
  try {
    return assertDocumentIntegrity(assertBusinessSnapshot(parsed));
  } catch (error) {
    if (isKeptError(error)) throw error;
    throw new Error("backup file is missing or corrupt", { cause: error });
  }
}

function isRegularFile(filePath) {
  try {
    const stat = lstatSync(filePath);
    return stat.isFile() && !stat.isSymbolicLink();
  } catch (error) {
    if (error && error.code === "ENOENT") return false;
    throw error;
  }
}

function assertLeafIsNotSymlink(target) {
  try {
    const stat = lstatSync(target);
    if (stat.isSymbolicLink()) throw new Error("refusing to write through a symlink");
  } catch (error) {
    if (error && error.code === "ENOENT") return;
    throw error;
  }
}

function ensurePrivateDir(resolved) {
  assertLeafIsNotSymlink(resolved);
  mkdirSync(resolved, { recursive: true, mode: 0o700 });
  const stat = lstatSync(resolved);
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error("refusing to write through a symlink");
  chmodSync(resolved, 0o700);
}

function writePrivateFile(filePath, bytes) {
  const resolved = path.resolve(filePath);
  const dir = path.dirname(resolved);
  if (path.resolve(dir, path.basename(resolved)) !== resolved) {
    throw new Error("refusing to write outside the backup directory");
  }
  assertLeafIsNotSymlink(dir);
  assertLeafIsNotSymlink(resolved);
  const tmp = path.join(dir, `.${path.basename(resolved)}.${randomBytes(8).toString("hex")}.tmp`);
  const fd = openSync(tmp, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600);
  try {
    writeSync(fd, bytes);
    fsyncSync(fd);
  } catch (error) {
    closeSync(fd);
    rmSync(tmp, { force: true });
    throw error;
  }
  closeSync(fd);
  chmodSync(tmp, 0o600);
  try {
    renameSync(tmp, resolved);
  } catch (error) {
    rmSync(tmp, { force: true });
    throw error;
  }
  chmodSync(resolved, 0o600);
}

function removeRegularFile(filePath) {
  let stat;
  try {
    stat = lstatSync(filePath);
  } catch (error) {
    if (error && error.code === "ENOENT") return;
    throw error;
  }
  if (stat.isSymbolicLink()) throw new Error("refusing to write through a symlink");
  if (!stat.isFile()) throw new Error("refusing to replace a non-file backup path");
  rmSync(filePath);
}

function writePassphrase(meta) {
  if (typeof meta?.passphrase === "string") return meta.passphrase;
  if (meta?.projectId === PRODUCTION_PROJECT_ID) {
    return typeof process.env.SKATINGX_BACKUP_PASSPHRASE === "string" ? process.env.SKATINGX_BACKUP_PASSPHRASE : "";
  }
  return "";
}

function readPassphrase(options) {
  if (typeof options?.passphrase === "string") return options.passphrase;
  return typeof process.env.SKATINGX_BACKUP_PASSPHRASE === "string" ? process.env.SKATINGX_BACKUP_PASSPHRASE : "";
}

function aadBytes(identity) {
  return Buffer.from(stable({
    formatVersion: identity.formatVersion,
    projectId: identity.projectId,
    databaseId: identity.databaseId,
    schemaVersion: identity.schemaVersion,
    readAt: identity.readAt,
    pathDigest: identity.pathDigest,
  }), "utf8");
}

function encryptBytes(plaintext, identity, passphrase) {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = scryptSync(passphrase, salt, SCRYPT_PARAMS.keyLength, { N: SCRYPT_PARAMS.N, r: SCRYPT_PARAMS.r, p: SCRYPT_PARAMS.p });
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(aadBytes(identity));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext,
    encryption: {
      algorithm: "aes-256-gcm",
      kdf: "scrypt",
      kdfParams: { ...SCRYPT_PARAMS },
      salt: salt.toString("base64"),
      iv: iv.toString("base64"),
      tag: tag.toString("base64"),
    },
  };
}

function decryptBytes(ciphertext, manifest, passphrase) {
  if (passphrase === "") throw new Error("backup decryption failed");
  const enc = manifest.encryption;
  if (!enc || enc.algorithm !== "aes-256-gcm" || enc.kdf !== "scrypt") throw new Error("backup decryption failed");
  try {
    const salt = Buffer.from(enc.salt, "base64");
    const iv = Buffer.from(enc.iv, "base64");
    const tag = Buffer.from(enc.tag, "base64");
    const params = enc.kdfParams ?? {};
    if (salt.length < 16 || iv.length !== 12 || tag.length !== 16) throw new Error("backup decryption failed");
    const key = scryptSync(passphrase, salt, 32, { N: params.N, r: params.r, p: params.p });
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAAD(aadBytes(manifest));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch (error) {
    if (error instanceof Error && error.message === "backup decryption failed") throw error;
    throw new Error("backup decryption failed", { cause: error });
  }
}

function publicStorage(storage) {
  if (storage == null) return null;
  return JSON.parse(JSON.stringify(storage, (key, value) => {
    if (key === "token" || key === "downloadToken" || key === "accessToken") return undefined;
    if (typeof value === "string" && (value.includes("token=") || value.includes("access_token="))) return value.split("?")[0];
    return value;
  }));
}

function manifestBody(identity, file, storage) {
  return {
    formatVersion: FORMAT_VERSION,
    projectId: identity.projectId,
    databaseId: identity.databaseId,
    schemaVersion: identity.schemaVersion,
    readAt: identity.readAt,
    documentCount: identity.documentCount,
    pathDigest: identity.pathDigest,
    fileName: file.name,
    fileEncoding: file.encoding,
    fileSha256: file.sha256,
    videoBinaryBackedUp: false,
    encryptionAtRest: file.encryptionAtRest,
    encryption: file.encryption,
    coverage: BACKUP_COVERAGE,
    scope: BACKUP_SCOPE,
    storage,
  };
}

export function writeBackup(outDir, snapshot, meta) {
  const body = assertDocumentIntegrity(assertBusinessSnapshot(snapshot));
  if (body.schemaVersion !== SCHEMA_VERSION) throw new Error("backup file is missing or corrupt");
  const passphrase = writePassphrase(meta);
  const encrypt = meta.projectId === PRODUCTION_PROJECT_ID || passphrase !== "";
  if (meta.projectId === PRODUCTION_PROJECT_ID && passphrase === "") {
    throw new Error("refusing production backup without SKATINGX_BACKUP_PASSPHRASE");
  }
  const resolved = assertBackupOutput(outDir, meta);
  ensurePrivateDir(resolved);
  const pathDigest = sha256Text(body.documents.map((item) => item.path).join("\n"));
  const identity = {
    formatVersion: FORMAT_VERSION,
    projectId: meta.projectId,
    databaseId: meta.databaseId,
    schemaVersion: body.schemaVersion,
    readAt: body.readAt,
    pathDigest,
    documentCount: body.documents.length,
  };
  const plaintext = Buffer.from(`${stable(body)}\n`, "utf8");
  let fileBytes = plaintext;
  let fileName = PLAINTEXT_FILE;
  let fileEncoding = "utf8";
  let encryption = null;
  let encryptionAtRest = "none (emulator-only)";
  if (encrypt) {
    const sealed = encryptBytes(plaintext, identity, passphrase);
    fileBytes = sealed.ciphertext;
    fileName = CIPHER_FILE;
    fileEncoding = "aes-256-gcm";
    encryption = sealed.encryption;
    encryptionAtRest = "aes-256-gcm";
  }
  const file = { name: fileName, encoding: fileEncoding, sha256: sha256Bytes(fileBytes), encryptionAtRest, encryption };
  const bodyManifest = manifestBody(identity, file, publicStorage(meta.storage));
  const manifest = { ...bodyManifest, overallSha256: sha256Text(stable(bodyManifest)) };
  if (encrypt) removeRegularFile(path.join(resolved, PLAINTEXT_FILE));
  else removeRegularFile(path.join(resolved, CIPHER_FILE));
  writePrivateFile(path.join(resolved, fileName), fileBytes);
  writePrivateFile(path.join(resolved, "manifest.json"), Buffer.from(`${stable(manifest)}\n`, "utf8"));
  return {
    outDir: resolved,
    documentCount: manifest.documentCount,
    pathDigest: manifest.pathDigest,
    fileName,
    fileEncoding,
    fileSha256: manifest.fileSha256,
    overallSha256: manifest.overallSha256,
    videoBinaryBackedUp: false,
    encryptionAtRest,
    coverage: BACKUP_COVERAGE,
    scope: BACKUP_SCOPE,
    authAccountsExported: false,
    projectDisasterRecovery: false,
  };
}

function contentPath(outDir, manifest) {
  if (manifest.fileName !== PLAINTEXT_FILE && manifest.fileName !== CIPHER_FILE) {
    throw new Error("backup file is missing or corrupt");
  }
  const resolved = path.resolve(outDir, manifest.fileName);
  if (path.dirname(resolved) !== path.resolve(outDir)) throw new Error("backup file is missing or corrupt");
  return resolved;
}

export function verifyBackup(outDir, options = {}) {
  const resolved = path.resolve(outDir);
  let manifest;
  try {
    const stat = lstatSync(path.join(resolved, "manifest.json"));
    if (stat.isSymbolicLink()) throw new Error("symlink");
    manifest = JSON.parse(readFileSync(path.join(resolved, "manifest.json"), "utf8"));
  } catch (error) {
    throw new Error("backup file is missing or corrupt", { cause: error });
  }
  try {
    if (manifest.videoBinaryBackedUp !== false) throw new Error("backup file is missing or corrupt");
    if (stable(manifest.coverage) !== stable(BACKUP_COVERAGE)) throw new Error("backup file is missing or corrupt");
    if (stable(manifest.scope) !== stable(BACKUP_SCOPE)) throw new Error("backup file is missing or corrupt");
    const { overallSha256, ...unsigned } = manifest;
    if (typeof overallSha256 !== "string" || sha256Text(stable(unsigned)) !== overallSha256) {
      throw new Error("backup file is missing or corrupt");
    }
    const filePath = contentPath(resolved, manifest);
    const fileStat = lstatSync(filePath);
    if (fileStat.isSymbolicLink() || !fileStat.isFile()) throw new Error("backup file is missing or corrupt");
    const fileBytes = readFileSync(filePath);
    if (sha256Bytes(fileBytes) !== manifest.fileSha256) throw new Error("backup file is missing or corrupt");
    let plaintext = fileBytes;
    if (manifest.encryptionAtRest === "aes-256-gcm") {
      if (manifest.fileName !== CIPHER_FILE || manifest.fileEncoding !== "aes-256-gcm") {
        throw new Error("backup file is missing or corrupt");
      }
      plaintext = decryptBytes(fileBytes, manifest, readPassphrase(options));
    } else if (manifest.encryptionAtRest === "none (emulator-only)") {
      if (options.requireEncrypted) throw new Error("refusing a plaintext baseline for production verification");
      if (manifest.fileName !== PLAINTEXT_FILE || manifest.fileEncoding !== "utf8" || manifest.encryption !== null) {
        throw new Error("backup file is missing or corrupt");
      }
    } else {
      throw new Error("backup file is missing or corrupt");
    }
    const snapshot = assertDocumentIntegrity(assertBusinessSnapshot(JSON.parse(plaintext.toString("utf8"))));
    if (snapshot.schemaVersion !== SCHEMA_VERSION || snapshot.schemaVersion !== manifest.schemaVersion) {
      throw new Error("backup file is missing or corrupt");
    }
    if (snapshot.readAt !== manifest.readAt) throw new Error("backup file is missing or corrupt");
    if (snapshot.documents.length !== manifest.documentCount) throw new Error("backup file is missing or corrupt");
    const pathDigest = sha256Text(snapshot.documents.map((item) => item.path).join("\n"));
    if (pathDigest !== manifest.pathDigest) throw new Error("backup file is missing or corrupt");
    return { documents: snapshot.documents, snapshot, manifest };
  } catch (error) {
    if (isKeptError(error)) throw error;
    if (error instanceof Error && error.message === "backup file is missing or corrupt") throw error;
    throw new Error("backup file is missing or corrupt", { cause: error });
  }
}

function isHostPort(value) {
  return /^[^:\s]+:\d+$/.test(value);
}

function clientEndpoint(db) {
  const settings = db?._settings ?? {};
  const projectId = typeof settings.projectId === "string" ? settings.projectId : "";
  const servicePath = typeof settings.servicePath === "string" ? settings.servicePath : "";
  const port = typeof settings.port === "number" && Number.isInteger(settings.port) ? String(settings.port) : "";
  const host = servicePath !== "" && port !== "" ? `${servicePath}:${port}` : "";
  return { projectId, host, ssl: settings.ssl };
}

function assertRestoreIdentity(db, options) {
  const projectId = options?.projectId ?? "";
  if (!projectId.startsWith("demo-")) throw new Error("refusing restore outside a demo- emulator project");
  const envHost = process.env.FIRESTORE_EMULATOR_HOST ?? "";
  if (!isHostPort(envHost)) throw new Error("refusing restore while FIRESTORE_EMULATOR_HOST is not set");
  const actual = clientEndpoint(db);
  if (actual.projectId === "" || actual.host === "") {
    throw new Error("refusing restore: emulator connection identity is not exposed");
  }
  if (actual.projectId !== projectId) {
    throw new Error(`refusing restore: Firestore project ${actual.projectId} does not match ${projectId}`);
  }
  if (actual.ssl !== false) throw new Error("refusing restore: connection is not an emulator endpoint");
  if (actual.host !== envHost) throw new Error("refusing restore: emulator host does not match the Firestore client");
  if (typeof options.emulatorHost === "string" && options.emulatorHost !== actual.host) {
    throw new Error("refusing restore: emulator host does not match the Firestore client");
  }
}

function assertBusinessRestorePath(docPath) {
  const prefix = `${FIRESTORE_USERS_COLLECTION}/`;
  if (!docPath.startsWith(prefix)) throw new Error(`refusing restore outside business paths: ${docPath}`);
  const parts = docPath.slice(prefix.length).split("/");
  if (parts.some((part) => part === "" || part === "." || part === "..")) {
    throw new Error(`refusing restore outside business paths: ${docPath}`);
  }
  const [, collection, , nested] = parts;
  const allowed = parts.length === 1
    || (parts.length === 3 && collection === "videos")
    || (parts.length === 3 && collection === "raceDay")
    || (parts.length === 5 && collection === "raceDay" && (nested === "results" || nested === "videos"));
  if (!allowed) throw new Error(`refusing restore outside business paths: ${docPath}`);
}

export async function restoreBackupToEmulator(db, documentsOrDir, options) {
  assertRestoreIdentity(db, options);
  const documents = typeof documentsOrDir === "string"
    ? verifyBackup(documentsOrDir, options).documents
    : documentsOrDir;
  assertDocumentIntegrity(assertBusinessSnapshot({
    documents,
    readAt: "restore",
    schemaVersion: SCHEMA_VERSION,
  }));
  for (const document of documents) {
    assertBusinessRestorePath(document.path);
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
    passphrase: process.env.SKATINGX_BACKUP_PASSPHRASE,
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
