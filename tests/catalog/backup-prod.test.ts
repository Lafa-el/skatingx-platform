import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
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
  decodeValue,
  encodeValue,
  fetchObjectMetadata,
  restoreBackupToEmulator,
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
    const summary = writeBackup(outDir, first.documents, {
      projectId: PROJECT_ID,
      databaseId: "(default)",
      repoRoot: rootDir,
      storage: { skipped: true, failures: [], videoBinaryBackedUp: false },
    });
    expect(summary.videoBinaryBackedUp).toBe(false);
    expect(summary.encryptionAtRest).toBe("required");
    expect(JSON.stringify(summary)).not.toContain("Backup Athlete");
    expect(statSync(path.join(outDir, "documents.json")).mode & 0o777).toBe(0o600);
    const checked = verifyBackup(outDir);
    expect(checked.manifest.fileSha256).toBe(summary.fileSha256);
    expect(checked.manifest.documentCount).toBe(first.documents.length);

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
    writeBackup(outDir, [], {
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
    expect(missing.failures).toEqual([{ path: `${userPath}/videos/library-video`, kind: "missing-object" }]);
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
});
