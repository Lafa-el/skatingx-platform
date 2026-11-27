import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { getApps, initializeApp } from "firebase-admin/app";
import { type Firestore, getFirestore } from "firebase-admin/firestore";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  backfillEditorRecords,
  editorRecordId,
  importAuditId,
  inventoryObjectIds,
  lastEditorFromSnap,
} from "../../scripts/catalog/trusted-flow.mjs";

const PROJECT_ID = "demo-skatingx-import";
const ROOT = "artifacts/skatingx-production";
const AUDIT = `${ROOT}/trainingCatalogAuditLogs`;
const FLOW = { operator: "emulator-operator" };
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const trustedFlowPath = path.join(rootDir, "scripts/catalog/trusted-flow.mjs");

function openFirestore(): Firestore {
  const existing = getApps().find((app) => app.name === "catalog-editor-backfill");
  const app = existing ?? initializeApp({ projectId: PROJECT_ID }, "catalog-editor-backfill");
  return getFirestore(app);
}

function importAudit(objectId: string, actor = "catalog-import") {
  return {
    action: "import",
    actor,
    operator: "catalog-import",
    serviceAccount: "catalog-importer@skatingx-prod.iam.gserviceaccount.com",
    target: { collection: "trainingCatalogObjects", id: objectId, contentVersion: "v1" },
    at: "2026-11-15T00:00:00.000Z",
    runId: "initial-20261115",
    checksum: "abc",
    result: "ok",
  };
}

describe("editor record backfill", () => {
  let db: Firestore;

  beforeAll(() => {
    expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy();
    db = openFirestore();
  });

  afterAll(async () => {
    if (!db) return;
    const batch = db.batch();
    for (const id of ["EX-L001", "EX-BACKFILL", "EX-CONFLICT", "EX-MISSING"]) {
      batch.delete(db.doc(`${AUDIT}/${importAuditId(id)}`));
      batch.delete(db.doc(`${AUDIT}/${editorRecordId(id)}`));
    }
    await batch.commit();
  });

  it("loads the 257 workbook inventory ids and does not query Firestore", () => {
    const ids = inventoryObjectIds();
    expect(ids).toHaveLength(257);
    expect(new Set(ids).size).toBe(257);
    expect(ids).toContain("EX-L001");
  });

  it("copies one import audit onto the fixed editor record", async () => {
    await db.doc(`${AUDIT}/${importAuditId("EX-BACKFILL")}`).set(importAudit("EX-BACKFILL"));
    const report = await backfillEditorRecords(db, { objectIds: ["EX-BACKFILL"] }, FLOW);
    expect(report.counts).toEqual({ written: 1, skipped: 0, missing: 0, refused: 0, total: 1 });
    const saved = await db.doc(`${AUDIT}/${editorRecordId("EX-BACKFILL")}`).get();
    expect(saved.data()).toEqual({
      action: "import",
      actor: "catalog-import",
      operator: "catalog-import",
      target: { collection: "trainingCatalogObjects", id: "EX-BACKFILL" },
      at: "2026-11-15T00:00:00.000Z",
      runId: "initial-20261115",
      sourceAuditId: importAuditId("EX-BACKFILL"),
    });
    expect(lastEditorFromSnap(saved, "EX-BACKFILL")).toBe("catalog-import");
    const again = await backfillEditorRecords(db, { objectIds: ["EX-BACKFILL"] }, FLOW);
    expect(again.counts.skipped).toBe(1);
    expect(again.counts.written).toBe(0);
  });

  it("skips a missing import audit and refuses a conflicting editor record", async () => {
    const missing = await backfillEditorRecords(db, { objectIds: ["EX-MISSING"] }, FLOW);
    expect(missing.counts.missing).toBe(1);
    expect((await db.doc(`${AUDIT}/${editorRecordId("EX-MISSING")}`).get()).exists).toBe(false);

    await db.doc(`${AUDIT}/${importAuditId("EX-CONFLICT")}`).set(importAudit("EX-CONFLICT"));
    await db.doc(`${AUDIT}/${editorRecordId("EX-CONFLICT")}`).set({
      action: "import",
      actor: "someone-else",
      operator: "catalog-import",
      target: { collection: "trainingCatalogObjects", id: "EX-CONFLICT" },
      at: "2026-11-15T00:00:00.000Z",
      runId: "initial-20261115",
      sourceAuditId: importAuditId("EX-CONFLICT"),
    });
    await expect(backfillEditorRecords(db, { objectIds: ["EX-CONFLICT"] }, FLOW)).rejects.toThrow(
      /editor backfill refused/,
    );
    expect((await db.doc(`${AUDIT}/${editorRecordId("EX-CONFLICT")}`).get()).data()?.actor).toBe("someone-else");
  });

  it("refuses a production backfill with no gate context and writes nothing", async () => {
    await db.doc(`${AUDIT}/${importAuditId("EX-L001")}`).set(importAudit("EX-L001"));
    await expect(backfillEditorRecords(db, { objectIds: ["EX-L001"] }, { target: "production" })).rejects.toThrow(
      /production execution context is required/,
    );
    expect((await db.doc(`${AUDIT}/${editorRecordId("EX-L001")}`).get()).exists).toBe(false);
  });

  it("runs the CLI on the emulator and refuses production without credentials", async () => {
    await db.doc(`${AUDIT}/${importAuditId("EX-L001")}`).set(importAudit("EX-L001"));
    const ran = spawnSync(process.execPath, [
      trustedFlowPath,
      "backfill-editor-records",
      "--target",
      "emulator",
    ], { cwd: rootDir, env: process.env, encoding: "utf8" });
    expect(ran.status, ran.stderr).toBe(0);
    const report = JSON.parse(ran.stdout.trim());
    expect(report.counts.total).toBe(257);
    expect(report.counts.written + report.counts.skipped).toBeGreaterThan(0);
    expect((await db.doc(`${AUDIT}/${editorRecordId("EX-L001")}`).get()).data()?.actor).toBe("catalog-import");

    const env = { ...process.env };
    delete env.GOOGLE_APPLICATION_CREDENTIALS;
    delete env.FIRESTORE_EMULATOR_HOST;
    const production = spawnSync(process.execPath, [
      trustedFlowPath,
      "backfill-editor-records",
      "--target",
      "production",
      "--project",
      "skatingx-prod",
      "--confirm",
      "skatingx-prod",
    ], { cwd: rootDir, env, encoding: "utf8" });
    expect(production.status).toBe(1);
    expect(production.stderr).toMatch(/GOOGLE_APPLICATION_CREDENTIALS is not set/);
  });
});
