import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { getApps, initializeApp } from "firebase-admin/app";
import { GeoPoint, type Firestore, Timestamp, getFirestore } from "firebase-admin/firestore";
import { afterAll, describe, expect, it } from "vitest";

import {
  assertBackupOptions,
  assertBackupOutput,
  checkStorageReferences,
  classifyMediaValue,
  compareBusiness,
  decodeValue,
  encodeValue,
  fetchObjectMetadata,
  loadBusinessBaseline,
  restoreBackupToEmulator,
  sha256Text,
  snapshotBusiness,
  verifyBackup,
  writeBackup,
} from "../../scripts/catalog/backup-prod.mjs";

const PROJECT_ID = "demo-skatingx-import";
const USERS = "artifacts/skatingx-production/users";
const rootDir = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");
const source = readFileSync(path.join(rootDir, "scripts/catalog/backup-prod.mjs"), "utf8");

function openFirestore(): Firestore {
  const existing = getApps().find((app) => app.name === "catalog-backup");
  const app = existing ?? initializeApp({ projectId: PROJECT_ID }, "catalog-backup");
  return getFirestore(app);
}

describe("business backup", () => {
  const db = openFirestore();
  const userPath = `${USERS}/backup-user`;
  const dirs: string[] = [];

  afterAll(async () => {
    for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
    const snap = await snapshotBusiness(db);
    for (const document of snap.documents) {
      if (document.path.startsWith(`${userPath}`)) await db.doc(document.path).delete();
    }
    await db.doc(userPath).delete();
  });

  it("round-trips nested business documents and Firestore field types", async () => {
    const when = Timestamp.fromDate(new Date("2026-01-02T03:04:05.000Z"));
    const self = db.doc(userPath);
    await self.set({
      displayName: "Backup Athlete",
      createdAt: when,
      point: new GeoPoint(1.25, -2.5),
      payload: Buffer.from("frame"),
      self,
      tags: ["edge", null],
      score: 3,
      note: null,
    });
    await db.doc(`${userPath}/raceDay/event-1`).set({ name: "Meet", schemaVersion: 1 });
    await db.doc(`${userPath}/raceDay/event-1/results/result-1`).set({ status: "finished", place: 2 });
    await db.doc(`${userPath}/raceDay/event-1/videos/race-video`).set({
      externalUrl: "https://example.com/watch",
      storedWhere: "coach notebook",
    });
    await db.doc(`${userPath}/videos/library-video`).set({
      title: "local",
      fileName: "clip.mp4",
      externalUrl: "gs://demo-bucket/videos/clip.mp4",
    });

    const first = await snapshotBusiness(db);
    const mine = first.documents.filter((item) => item.path === userPath || item.path.startsWith(`${userPath}/`));
    expect(mine.map((item) => item.path)).toEqual([
      userPath,
      `${userPath}/raceDay/event-1`,
      `${userPath}/raceDay/event-1/results/result-1`,
      `${userPath}/raceDay/event-1/videos/race-video`,
      `${userPath}/videos/library-video`,
    ]);
    const outDir = mkdtempSync(path.join(os.tmpdir(), "skatingx-backup-"));
    dirs.push(outDir);
    const summary = writeBackup(outDir, first, {
      projectId: PROJECT_ID,
      databaseId: "(default)",
      repoRoot: rootDir,
      storage: { skipped: true, failures: [], videoBinaryBackedUp: false },
    });
    expect(summary.videoBinaryBackedUp).toBe(false);
    expect(summary.encryptionAtRest).toBe("none (emulator-only)");
    expect(summary.authAccountsExported).toBe(false);
    expect(summary.projectDisasterRecovery).toBe(false);
    expect(summary.coverage.storageVideoBytes).toBe("not-backed-up");
    expect(summary.scope).toContain("Cloud Storage 视频二进制：不备份，仅核对元数据");
    expect(JSON.stringify(summary)).not.toContain("Backup Athlete");
    const fileBytes = readFileSync(path.join(outDir, "documents.json"));
    expect(fileBytes.subarray(-1).toString("utf8")).toBe("\n");
    expect(summary.fileSha256).toBe(createHash("sha256").update(fileBytes).digest("hex"));
    expect(statSync(path.join(outDir, "documents.json")).mode & 0o777).toBe(0o600);
    const manifest = JSON.parse(readFileSync(path.join(outDir, "manifest.json"), "utf8")) as { fileName: string; fileEncoding: string };
    expect(manifest.fileName).toBe("documents.json");
    expect(manifest.fileEncoding).toBe("utf8");
    const checked = verifyBackup(outDir);
    expect(checked.snapshot.schemaVersion).toBe(first.schemaVersion);
    expect(checked.snapshot.readAt).toBe(first.readAt);
    expect(Array.isArray(checked.snapshot.documents)).toBe(true);
    expect(checked.manifest.fileSha256).toBe(summary.fileSha256);
    expect(checked.manifest.documentCount).toBe(first.documents.length);
    const baseline = loadBusinessBaseline(path.join(outDir, "documents.json"));
    expect(baseline.documents).toHaveLength(first.documents.length);
    expect(compareBusiness(baseline, first).changes).toEqual([]);

    for (const document of first.documents) await db.doc(document.path).delete();
    await restoreBackupToEmulator(db, checked.documents, { projectId: PROJECT_ID });
    const restored = await db.doc(userPath).get();
    const data = restored.data();
    expect(data?.createdAt).toBeInstanceOf(Timestamp);
    expect((data?.createdAt as Timestamp).isEqual(when)).toBe(true);
    expect(data?.point).toBeInstanceOf(GeoPoint);
    expect((data?.point as GeoPoint).latitude).toBe(1.25);
    expect(Buffer.isBuffer(data?.payload)).toBe(true);
    expect((data?.payload as Buffer).equals(Buffer.from("frame"))).toBe(true);
    expect(data?.self?.path).toBe(userPath);
    const second = await snapshotBusiness(db);
    expect(second.documents.map((item) => item.sha256)).toEqual(first.documents.map((item) => item.sha256));
    expect(decodeValue(first.documents[0]?.encoded, db)).toBeTruthy();
  });

  it("detects a missing or corrupt backup and refuses a workspace path", () => {
    const outDir = mkdtempSync(path.join(os.tmpdir(), "skatingx-backup-"));
    dirs.push(outDir);
    writeBackup(outDir, { documents: [], readAt: "2026-11-14T00:00:00.000Z", schemaVersion: "race-day-v1+user-video-library" }, {
      projectId: PROJECT_ID,
      databaseId: "(default)",
      repoRoot: rootDir,
      storage: { skipped: true, failures: [], videoBinaryBackedUp: false },
    });
    const docsPath = path.join(outDir, "documents.json");
    writeFileSync(docsPath, readFileSync(docsPath, "utf8").replace("[]", "["));
    expect(() => verifyBackup(outDir)).toThrow(/corrupt/);
    expect(() => verifyBackup(path.join(outDir, "missing"))).toThrow(/corrupt/);
    expect(() => assertBackupOutput(rootDir, { repoRoot: rootDir, projectId: PROJECT_ID })).toThrow(/git workspace/);
    expect(() => assertBackupOptions({ projectId: "skatingx-prod", skipStorage: true })).toThrow(/skip-storage/);
    const arrayPath = path.join(outDir, "array.json");
    writeFileSync(arrayPath, `${JSON.stringify([{ path: "a", sha256: "b" }])}\n`);
    expect(() => loadBusinessBaseline(arrayPath)).toThrow("基线必须是备份快照对象，不是文档数组");
  });

  it("classifies storage references and external urls without downloading bytes", async () => {
    expect(classifyMediaValue("externalUrl", "https://example.com/a").kind).toBe("external-url");
    expect(classifyMediaValue("fileName", "clip.mp4").kind).toBe("local-file-name");
    expect(classifyMediaValue("storedWhere", "coach notebook").kind).toBe("stored-note");
    const documents = [{
      path: `${userPath}/videos/library-video`,
      encoded: encodeValue({
        externalUrl: "gs://demo-bucket/videos/clip.mp4",
        fileName: "clip.mp4",
      }),
    }, {
      path: `${userPath}/raceDay/event-1/videos/race-video`,
      encoded: encodeValue({ externalUrl: "https://example.com/watch", storedWhere: "coach notebook" }),
    }];
    const calls: Array<{ bucket: string; object: string }> = [];
    const missing = await checkStorageReferences(documents, async (ref) => {
      calls.push(ref);
      return null;
    });
    expect(calls).toEqual([{ bucket: "demo-bucket", object: "videos/clip.mp4" }]);
    expect(missing.failures).toEqual([{ path: `${userPath}/videos/library-video`, field: "externalUrl", kind: "missing-object" }]);
    expect(missing.videoBinaryBackedUp).toBe(false);
    expect(missing.classified.externalUrl).toBe(1);
    const mismatch = await checkStorageReferences(documents, async () => ({ bucket: "other", name: "videos/clip.mp4", size: "1" }));
    expect(mismatch.failures[0]?.kind).toBe("bucket-mismatch");

    const methods: string[] = [];
    const fetchImpl = async (_url: string, init: { method?: string }) => {
      methods.push(init.method ?? "GET");
      return { ok: true, status: 200, json: async () => ({ name: "videos/clip.mp4", size: "4", bucket: "demo-bucket" }) };
    };
    const meta = await fetchObjectMetadata({ bucket: "demo-bucket", object: "videos/clip.mp4", token: "token", fetchImpl });
    expect(meta?.name).toBe("videos/clip.mp4");
    expect(methods).toEqual(["GET"]);
    expect(source).not.toMatch(/\b(upload|insert|delete)\b/i);
  });

  it("fails closed on an unsupported field type", () => {
    expect(() => encodeValue(new Date())).toThrow(/unsupported field type/);
    expect(() => encodeValue(undefined)).toThrow(/unsupported field type/);
  });

  it("rejects a tampered file byte and a document whose outer hash was resealed", () => {
    const outDir = mkdtempSync(path.join(os.tmpdir(), "skatingx-backup-"));
    dirs.push(outDir);
    const snapshot = emptySnapshot();
    writeBackup(outDir, snapshot, demoMeta());
    const docsPath = path.join(outDir, "documents.json");
    const flipped = Buffer.from(readFileSync(docsPath));
    flipped[0] ^= 0xff;
    writeFileSync(docsPath, flipped);
    expect(() => verifyBackup(outDir)).toThrow(/corrupt/);

    const resealed = mkdtempSync(path.join(os.tmpdir(), "skatingx-backup-"));
    dirs.push(resealed);
    const encoded = encodeValue({ displayName: "kept" });
    writeBackup(resealed, {
      documents: [{ path: userPath, encoded, sha256: sha256Text(JSON.stringify(encoded)) }],
      readAt: "2026-11-14T00:00:00.000Z",
      schemaVersion: "race-day-v1+user-video-library",
    }, demoMeta());
    const target = path.join(resealed, "documents.json");
    const body = JSON.parse(readFileSync(target, "utf8")) as { documents: Array<{ encoded: unknown }> };
    body.documents[0].encoded = encodeValue({ displayName: "tampered" });
    const next = Buffer.from(`${JSON.stringify(body)}\n`, "utf8");
    writeFileSync(target, next);
    resealManifest(path.join(resealed, "manifest.json"), (manifest) => {
      manifest.fileSha256 = createHash("sha256").update(next).digest("hex");
    });
    expect(() => verifyBackup(resealed)).toThrow(/sha256 mismatch/);
  });

  it("round-trips an encrypted backup and refuses passphrase, ciphertext, and AAD tampering", () => {
    const passphrase = "correct horse battery";
    const marker = "EncryptedBodyMarker";
    const encoded = encodeValue({ displayName: marker });
    const snapshot = {
      documents: [{ path: userPath, encoded, sha256: sha256Text(JSON.stringify(encoded)) }],
      readAt: "2026-11-14T00:00:00.000Z",
      schemaVersion: "race-day-v1+user-video-library",
    };
    const firstDir = mkdtempSync(path.join(os.tmpdir(), "skatingx-backup-"));
    const secondDir = mkdtempSync(path.join(os.tmpdir(), "skatingx-backup-"));
    dirs.push(firstDir, secondDir);
    const first = writeBackup(firstDir, snapshot, demoMeta(passphrase));
    const second = writeBackup(secondDir, snapshot, demoMeta(passphrase));
    expect(first.encryptionAtRest).toBe("aes-256-gcm");
    expect(first.fileName).toBe("documents.json.enc");
    expect(existsSync(path.join(firstDir, "documents.json"))).toBe(false);
    expect(statSync(path.join(firstDir, "documents.json.enc")).mode & 0o777).toBe(0o600);
    const manifest = JSON.parse(readFileSync(path.join(firstDir, "manifest.json"), "utf8")) as {
      encryption: { algorithm: string; kdf: string; salt: string; iv: string; tag: string };
      fileEncoding: string;
    };
    const other = JSON.parse(readFileSync(path.join(secondDir, "manifest.json"), "utf8")) as {
      encryption: { salt: string; iv: string };
    };
    expect(manifest.fileEncoding).toBe("aes-256-gcm");
    expect(manifest.encryption.algorithm).toBe("aes-256-gcm");
    expect(manifest.encryption.kdf).toBe("scrypt");
    expect(Buffer.from(manifest.encryption.salt, "base64").length).toBeGreaterThanOrEqual(16);
    expect(Buffer.from(manifest.encryption.iv, "base64").length).toBe(12);
    expect(Buffer.from(manifest.encryption.tag, "base64").length).toBe(16);
    expect(manifest.encryption.iv).not.toBe(other.encryption.iv);
    expect(manifest.encryption.salt).not.toBe(other.encryption.salt);
    expect(first.fileSha256).not.toBe(second.fileSha256);
    const packed = `${readFileSync(path.join(firstDir, "documents.json.enc")).toString("utf8")}\n${readFileSync(path.join(firstDir, "manifest.json"), "utf8")}`;
    expect(packed).not.toContain(passphrase);
    expect(packed).not.toContain(marker);
    const loaded = loadBusinessBaseline(firstDir, { passphrase });
    expect(compareBusiness(loaded, snapshot).changes).toEqual([]);
    expect(() => verifyBackup(firstDir, { passphrase: "wrong horse" })).toThrow(/decryption failed/);

    const cipherPath = path.join(secondDir, "documents.json.enc");
    const cipher = Buffer.from(readFileSync(cipherPath));
    cipher[0] ^= 0xff;
    writeFileSync(cipherPath, cipher);
    resealManifest(path.join(secondDir, "manifest.json"), (body) => {
      body.fileSha256 = createHash("sha256").update(cipher).digest("hex");
    });
    expect(() => verifyBackup(secondDir, { passphrase })).toThrow(/decryption failed/);

    const aadDir = mkdtempSync(path.join(os.tmpdir(), "skatingx-backup-"));
    dirs.push(aadDir);
    writeBackup(aadDir, snapshot, demoMeta(passphrase));
    resealManifest(path.join(aadDir, "manifest.json"), (body) => {
      body.projectId = "demo-other";
    });
    expect(() => verifyBackup(aadDir, { passphrase })).toThrow(/decryption failed/);
    expect(loadBusinessBaseline(firstDir, { passphrase, requireEncrypted: true }).documents).toHaveLength(1);
    const plainDir = mkdtempSync(path.join(os.tmpdir(), "skatingx-backup-"));
    dirs.push(plainDir);
    writeBackup(plainDir, emptySnapshot(), demoMeta());
    expect(() => loadBusinessBaseline(plainDir, { requireEncrypted: true })).toThrow(/plaintext baseline/);
  });

  it("refuses a production backup without a passphrase and still loads a legacy plaintext snapshot", () => {
    const outDir = mkdtempSync(path.join(os.tmpdir(), "skatingx-backup-"));
    dirs.push(outDir);
    expect(() => writeBackup(outDir, emptySnapshot(), {
      projectId: "skatingx-prod",
      databaseId: "(default)",
      repoRoot: rootDir,
      storage: { skipped: true, failures: [], videoBinaryBackedUp: false },
    })).toThrow(/SKATINGX_BACKUP_PASSPHRASE/);
    expect(readdirSync(outDir)).toEqual([]);

    const encoded = encodeValue({ title: "legacy" });
    const legacy = {
      documents: [{ path: userPath, encoded, sha256: sha256Text(JSON.stringify(encoded)) }],
      readAt: "2026-11-14T00:00:00.000Z",
      schemaVersion: "race-day-v1+user-video-library",
    };
    const legacyPath = path.join(outDir, "legacy.json");
    writeFileSync(legacyPath, `${JSON.stringify(legacy)}\n`);
    expect(loadBusinessBaseline(legacyPath).documents[0]?.path).toBe(userPath);
    expect(compareBusiness(loadBusinessBaseline(legacyPath), legacy).changes).toEqual([]);
  });

  it("refuses a symlink backup destination", () => {
    const real = mkdtempSync(path.join(os.tmpdir(), "skatingx-backup-"));
    const link = path.join(os.tmpdir(), `skatingx-backup-link-${Date.now()}`);
    dirs.push(real);
    symlinkSync(real, link);
    try {
      expect(() => writeBackup(link, emptySnapshot(), demoMeta())).toThrow(/symlink/);
      expect(readdirSync(real)).toEqual([]);
    } finally {
      rmSync(link, { force: true });
    }
  });

  it("walks nested storage references, ignores ordinary text, and hides download tokens", async () => {
    const token = "super-secret-download-token";
    const firebaseUrl = `https://firebasestorage.googleapis.com/v0/b/demo-bucket/o/${encodeURIComponent("videos/clip.mp4")}?alt=media&token=${token}`;
    const documents = [{
      path: `${userPath}/videos/library-video`,
      encoded: encodeValue({
        title: "500m final",
        notes: "coach said edge",
        fileName: "clip.mp4",
        externalUrl: firebaseUrl,
        clips: [{ externalUrl: "gs://demo-bucket/videos/clip.mp4" }],
      }),
    }, {
      path: `${userPath}/raceDay/event-1/videos/race-video`,
      encoded: encodeValue({
        label: "Final A",
        note: "lane 2",
        externalUrl: "https://storage.googleapis.com/demo-bucket/videos/clip.mp4",
        storedWhere: "coach notebook",
      }),
    }, {
      path: `${userPath}/videos/broken`,
      encoded: encodeValue({ externalUrl: "gs://demo-bucket" }),
    }];
    const calls: Array<{ bucket: string; object: string }> = [];
    const checked = await checkStorageReferences(documents, async (ref) => {
      calls.push(ref);
      return { bucket: ref.bucket, name: ref.object, size: "9", updated: "2026-11-14T00:00:00.000Z", generation: "3", md5Hash: "abc" };
    });
    expect(calls).toEqual([{ bucket: "demo-bucket", object: "videos/clip.mp4" }]);
    expect(checked.metadata).toHaveLength(1);
    expect(checked.metadata[0]).toMatchObject({
      bucket: "demo-bucket",
      object: "videos/clip.mp4",
      size: "9",
      updated: "2026-11-14T00:00:00.000Z",
      generation: "3",
      hash: "abc",
      exists: true,
    });
    expect(checked.metadata[0]?.references).toHaveLength(3);
    expect(checked.failures.map((item) => item.kind)).toEqual(["missing-reference"]);
    expect(checked.classified.localFileName).toBe(1);
    expect(checked.classified.storedNote).toBe(1);
    expect(checked.videoBinaryBackedUp).toBe(false);
    const rendered = JSON.stringify(checked);
    expect(rendered).not.toContain(token);
    expect(rendered).not.toContain("500m final");
    const failed = await checkStorageReferences(documents.slice(0, 1), async () => {
      throw new Error(`network ${token}`);
    });
    expect(failed.failures[0]?.kind).toBe("metadata-query-failed");
    expect(JSON.stringify(failed)).not.toContain(token);
    expect(classifyMediaValue("title", "Meet").kind).toBe("text");
  });

  it("refuses restore unless the emulator project, host, path, and backup all match", async () => {
    const other = getFirestore(initializeApp({ projectId: "demo-other-backup" }, "backup-other"));
    const encoded = encodeValue({ displayName: "should-not-restore" });
    const secretPath = `${userPath}/videos/should-not`;
    const documents = [{ path: secretPath, encoded, sha256: sha256Text(JSON.stringify(encoded)) }];
    await expect(restoreBackupToEmulator(other, documents, { projectId: PROJECT_ID })).rejects.toThrow(/does not match/);
    expect((await db.doc(secretPath).get()).exists).toBe(false);

    await expect(restoreBackupToEmulator(db, [], { projectId: PROJECT_ID, emulatorHost: "127.0.0.1:1" })).rejects.toThrow(/emulator host/);
    const saved = process.env.FIRESTORE_EMULATOR_HOST;
    delete process.env.FIRESTORE_EMULATOR_HOST;
    try {
      await expect(restoreBackupToEmulator(db, [], { projectId: PROJECT_ID })).rejects.toThrow(/FIRESTORE_EMULATOR_HOST/);
    } finally {
      if (saved === undefined) delete process.env.FIRESTORE_EMULATOR_HOST;
      else process.env.FIRESTORE_EMULATOR_HOST = saved;
    }

    const illegal = encodeValue({ name: "catalog" });
    await expect(restoreBackupToEmulator(db, [{
      path: "artifacts/skatingx-production/trainingCatalogObjects/EX-L001",
      encoded: illegal,
      sha256: sha256Text(JSON.stringify(illegal)),
    }], { projectId: PROJECT_ID })).rejects.toThrow(/business paths/);

    const outDir = mkdtempSync(path.join(os.tmpdir(), "skatingx-backup-"));
    dirs.push(outDir);
    writeBackup(outDir, emptySnapshot(), demoMeta());
    const docsPath = path.join(outDir, "documents.json");
    const bytes = Buffer.from(readFileSync(docsPath));
    bytes[0] ^= 0xff;
    writeFileSync(docsPath, bytes);
    await expect(restoreBackupToEmulator(db, outDir, { projectId: PROJECT_ID })).rejects.toThrow(/corrupt/);
    expect((await db.doc(secretPath).get()).exists).toBe(false);
  });
});

function demoMeta(passphrase?: string) {
  return {
    projectId: PROJECT_ID,
    databaseId: "(default)",
    repoRoot: rootDir,
    storage: { skipped: true, failures: [], videoBinaryBackedUp: false as const },
    ...(passphrase === undefined ? {} : { passphrase }),
  };
}

function emptySnapshot() {
  return { documents: [], readAt: "2026-11-14T00:00:00.000Z", schemaVersion: "race-day-v1+user-video-library" };
}

function resealManifest(manifestPath: string, patch: (manifest: Record<string, unknown>) => void) {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<string, unknown>;
  patch(manifest);
  const body: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(manifest)) {
    if (key === "overallSha256") continue;
    body[key] = value;
  }
  const overallSha256 = createHash("sha256").update(JSON.stringify(body)).digest("hex");
  writeFileSync(manifestPath, `${JSON.stringify({ ...body, overallSha256 })}\n`);
}
