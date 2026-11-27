import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { deleteApp, getApps, initializeApp } from "firebase-admin/app";
import { type Firestore, getFirestore } from "firebase-admin/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { CatalogKind } from "@skatingx/schema";
import { contentChecksumPayload } from "@skatingx/training-catalog";
import { computeCatalogChecksum } from "../../packages/training-catalog/src/checksum";
import {
  contentHash,
  importAuditId,
  INITIAL_IMPORT_RUN_ID,
  openProductionFlowDb,
  publishCatalogVersionFlow,
  reviewCatalogVersion,
} from "../../scripts/catalog/trusted-flow.mjs";

const PROJECT_ID = "demo-skatingx-import";
const ROOT = "artifacts/skatingx-production";
const OBJECTS = `${ROOT}/trainingCatalogObjects`;
const AUDIT = `${ROOT}/trainingCatalogAuditLogs`;
const VERSION = "v1";
const FLOW = { operator: "emulator-operator" };
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const trustedFlowPath = path.join(rootDir, "scripts/catalog/trusted-flow.mjs");
const POLICY_URL =
  "https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/catalog-policy-operator@skatingx-prod.iam.gserviceaccount.com:generateAccessToken";
const SOURCE = {
  type: "authorized_user",
  client_id: "synthetic-client",
  client_secret: "synthetic-secret",
  refresh_token: "synthetic-refresh",
};

function openFirestore(name: string, projectId: string): Firestore {
  const existing = getApps().find((app) => app.name === name);
  const app = existing ?? initializeApp({ projectId }, name);
  return getFirestore(app);
}

function body(id: string, kind: CatalogKind, legacyAttributes: Record<string, unknown> = {}, refs: Array<{ id: string; contentVersion: string }> = []) {
  const content = {
    localeContent: { zh: { name: id }, en: { name: id } },
    taxonomy: { objectiveIds: [] as string[] },
    refs,
    legacyAttributes,
    schemaVersion: 1,
  };
  const checksum = computeCatalogChecksum(contentChecksumPayload(content));
  return {
    parent: {
      id,
      kind,
      sportId: "short_track",
      ...content,
      contentVersion: VERSION,
      status: "draft",
      reviewStatus: "pending",
      checksum,
      createdAt: "2026-11-26T00:00:00.000Z",
      updatedAt: "2026-11-26T00:00:00.000Z",
    },
    version: {
      ...content,
      contentVersion: VERSION,
      status: "draft",
      reviewStatus: "pending",
      checksum,
    },
  };
}

async function seed(
  db: Firestore,
  id: string,
  kind: CatalogKind,
  options: { editor?: string; legacyAttributes?: Record<string, unknown>; refs?: Array<{ id: string; contentVersion: string }> } = {},
): Promise<void> {
  const pair = body(id, kind, options.legacyAttributes, options.refs);
  const batch = db.batch();
  batch.set(db.doc(`${OBJECTS}/${id}`), pair.parent);
  batch.set(db.doc(`${OBJECTS}/${id}/versions/${VERSION}`), pair.version);
  if (options.editor) {
    batch.set(db.doc(`${AUDIT}/${importAuditId(id)}`), {
      action: "import",
      actor: options.editor,
      operator: "catalog-import",
      target: { collection: "trainingCatalogObjects", id, contentVersion: VERSION },
      at: "2026-11-15T00:00:00.000Z",
      runId: INITIAL_IMPORT_RUN_ID,
      checksum: pair.version.checksum,
      result: "ok",
    });
  }
  await batch.commit();
}

async function rejectedAudits(db: Firestore, id: string, action: string): Promise<Record<string, unknown>[]> {
  const snap = await db.collection(AUDIT).where("target.id", "==", id).get();
  return snap.docs.map((item) => item.data()).filter((entry) => entry.action === action && entry.result === "rejected");
}

describe("catalog production review and publish", () => {
  let db: Firestore;

  beforeAll(() => {
    expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy();
    db = openFirestore("catalog-prod-review-publish", PROJECT_ID);
  });

  beforeEach(async () => {
    const ids = ["DR-OK", "DR-FLAG", "DR-MISS", "DR-OLD", "BL-OK", "BL-FLAG", "BL-MISS", "BL-OLD", "EX-NESTED", "CLI-DR"];
    const batches = [db.batch()];
    for (const id of ids) {
      batches[0].delete(db.doc(`${OBJECTS}/${id}`));
      batches[0].delete(db.doc(`${OBJECTS}/${id}/versions/${VERSION}`));
      batches[0].delete(db.doc(`${ROOT}/trainingCatalogReleases/rel-${id}-${VERSION}`));
      batches[0].delete(db.doc(`${AUDIT}/${importAuditId(id)}`));
      const logs = await db.collection(AUDIT).where("target.id", "==", id).get();
      for (const item of logs.docs) batches[0].delete(item.ref);
    }
    await batches[0].commit();
  });

  afterAll(async () => {
    if (!db) return;
    const logs = await db.collection(AUDIT).where("target.collection", "==", "trainingCatalogObjects").get();
    const batch = db.batch();
    for (const item of logs.docs) batch.delete(item.ref);
    await batch.commit();
  });

  it("approves a snapshot when the confirmed digest matches and the reviewer is not the editor", async () => {
    await seed(db, "DR-OK", "drill", { editor: "catalog-import" });
    const version = (await db.doc(`${OBJECTS}/DR-OK/versions/${VERSION}`).get()).data() ?? {};
    const digest = contentHash(version);
    await reviewCatalogVersion(db, {
      objectId: "DR-OK",
      contentVersion: VERSION,
      reviewer: "reviewer-1",
      decision: "approved",
      expectedContentSha256: digest,
    }, FLOW);
    const saved = (await db.doc(`${OBJECTS}/DR-OK/versions/${VERSION}`).get()).data();
    expect(saved?.reviewStatus).toBe("approved");
    expect(saved?.reviewedContentSha256).toBe(digest);
    const logs = await db.collection(AUDIT).where("target.id", "==", "DR-OK").get();
    expect(logs.docs.map((item) => item.data()).filter((entry) => entry.action === "review")).toEqual([
      expect.objectContaining({
        action: "review",
        result: "ok",
        actor: "reviewer-1",
        operator: "emulator-operator",
        reviewedContentSha256: digest,
      }),
    ]);
  });

  it("rejects a review whose digest does not match the snapshot", async () => {
    await seed(db, "DR-OK", "drill", { editor: "catalog-import" });
    await expect(reviewCatalogVersion(db, {
      objectId: "DR-OK",
      contentVersion: VERSION,
      reviewer: "reviewer-1",
      decision: "approved",
      expectedContentSha256: "0".repeat(64),
    }, FLOW)).rejects.toThrow(/content changed since review/);
    expect((await db.doc(`${OBJECTS}/DR-OK/versions/${VERSION}`).get()).data()?.reviewStatus).toBe("pending");
    expect(await rejectedAudits(db, "DR-OK", "review")).toEqual([
      expect.objectContaining({ result: "rejected", operator: "emulator-operator" }),
    ]);
  });

  it("rejects publish when the reviewer is the last editor", async () => {
    await seed(db, "DR-OK", "drill", { editor: "reviewer-1" });
    const version = (await db.doc(`${OBJECTS}/DR-OK/versions/${VERSION}`).get()).data() ?? {};
    await expect(reviewCatalogVersion(db, {
      objectId: "DR-OK",
      contentVersion: VERSION,
      reviewer: "reviewer-1",
      decision: "approved",
      expectedContentSha256: contentHash(version),
    }, FLOW)).rejects.toThrow(/reviewer matches the last editor/);
    expect((await db.doc(`${OBJECTS}/DR-OK/versions/${VERSION}`).get()).data()?.reviewStatus).toBe("pending");
    expect(await rejectedAudits(db, "DR-OK", "review")).toEqual([
      expect.objectContaining({ result: "rejected", operator: "emulator-operator" }),
    ]);
  });

  it("rejects publish when the fixed editor record is missing", async () => {
    await seed(db, "DR-OK", "drill");
    const version = (await db.doc(`${OBJECTS}/DR-OK/versions/${VERSION}`).get()).data() ?? {};
    await expect(reviewCatalogVersion(db, {
      objectId: "DR-OK",
      contentVersion: VERSION,
      reviewer: "reviewer-1",
      decision: "approved",
      expectedContentSha256: contentHash(version),
    }, FLOW)).rejects.toThrow(/import audit does not exist/);
    expect((await db.doc(`${OBJECTS}/DR-OK/versions/${VERSION}`).get()).data()?.reviewStatus).toBe("pending");
    expect(await rejectedAudits(db, "DR-OK", "review")).toEqual([
      expect.objectContaining({ result: "rejected", operator: "emulator-operator" }),
    ]);
  });

  it("rejects publish when a block references a drill with safetyFlag review_required", async () => {
    await seed(db, "DR-FLAG", "drill", {
      editor: "catalog-import",
      legacyAttributes: { safetyFlag: "review_required" },
    });
    await seed(db, "BL-FLAG", "block", {
      editor: "catalog-import",
      refs: [{ id: "DR-FLAG", contentVersion: VERSION }],
    });
    const version = (await db.doc(`${OBJECTS}/BL-FLAG/versions/${VERSION}`).get()).data() ?? {};
    await reviewCatalogVersion(db, {
      objectId: "BL-FLAG",
      contentVersion: VERSION,
      reviewer: "reviewer-1",
      decision: "approved",
      expectedContentSha256: contentHash(version),
    }, FLOW);
    await expect(publishCatalogVersionFlow(db, {
      objectId: "BL-FLAG",
      contentVersion: VERSION,
      reviewer: "publisher-1",
    }, FLOW)).rejects.toThrow(/referenced drill DR-FLAG is not published/);
    expect((await db.doc(`${OBJECTS}/BL-FLAG`).get()).data()?.status).toBe("draft");
    expect((await db.doc(`${OBJECTS}/BL-FLAG`).get()).data()?.publishedVersion).toBeUndefined();
    expect(await rejectedAudits(db, "BL-FLAG", "publish")).toEqual([
      expect.objectContaining({ result: "rejected" }),
    ]);
  });

  it("rejects publish when a block reference is missing or has another contentVersion", async () => {
    await seed(db, "BL-MISS", "block", {
      editor: "catalog-import",
      refs: [{ id: "DR-MISS", contentVersion: VERSION }],
    });
    const missing = (await db.doc(`${OBJECTS}/BL-MISS/versions/${VERSION}`).get()).data() ?? {};
    await reviewCatalogVersion(db, {
      objectId: "BL-MISS",
      contentVersion: VERSION,
      reviewer: "reviewer-1",
      decision: "approved",
      expectedContentSha256: contentHash(missing),
    }, FLOW);
    await expect(publishCatalogVersionFlow(db, {
      objectId: "BL-MISS",
      contentVersion: VERSION,
      reviewer: "publisher-1",
    }, FLOW)).rejects.toThrow(/referenced drill DR-MISS does not exist/);

    await seed(db, "DR-OLD", "drill", { editor: "catalog-import" });
    await seed(db, "BL-OLD", "block", {
      editor: "catalog-import",
      refs: [{ id: "DR-OLD", contentVersion: "v9" }],
    });
    const mismatched = (await db.doc(`${OBJECTS}/BL-OLD/versions/${VERSION}`).get()).data() ?? {};
    await reviewCatalogVersion(db, {
      objectId: "BL-OLD",
      contentVersion: VERSION,
      reviewer: "reviewer-1",
      decision: "approved",
      expectedContentSha256: contentHash(mismatched),
    }, FLOW);
    await expect(publishCatalogVersionFlow(db, {
      objectId: "BL-OLD",
      contentVersion: VERSION,
      reviewer: "publisher-1",
    }, FLOW)).rejects.toThrow(/contentVersion does not match/);
    expect((await rejectedAudits(db, "BL-MISS", "publish")).length).toBeGreaterThan(0);
    expect((await rejectedAudits(db, "BL-OLD", "publish")).length).toBeGreaterThan(0);
  });

  it("rejects publish after the reviewed snapshot content changes, even when the checksum is updated", async () => {
    await seed(db, "DR-OK", "drill", { editor: "catalog-import" });
    const before = (await db.doc(`${OBJECTS}/DR-OK/versions/${VERSION}`).get()).data();
    if (!before) throw new Error("snapshot missing");
    await reviewCatalogVersion(db, {
      objectId: "DR-OK",
      contentVersion: VERSION,
      reviewer: "reviewer-1",
      decision: "approved",
      expectedContentSha256: contentHash(before),
    }, FLOW);
    const reviewed = (await db.doc(`${OBJECTS}/DR-OK/versions/${VERSION}`).get()).data();
    if (!reviewed) throw new Error("reviewed snapshot missing");
    const localeContent = { zh: { name: "changed" }, en: { name: "changed" } };
    const checksum = computeCatalogChecksum(contentChecksumPayload({
      localeContent,
      taxonomy: reviewed.taxonomy,
      refs: reviewed.refs,
      legacyAttributes: reviewed.legacyAttributes,
      schemaVersion: reviewed.schemaVersion,
    }));
    await db.doc(`${OBJECTS}/DR-OK/versions/${VERSION}`).set({ ...reviewed, localeContent, checksum });
    await expect(publishCatalogVersionFlow(db, {
      objectId: "DR-OK",
      contentVersion: VERSION,
      reviewer: "publisher-1",
    }, FLOW)).rejects.toThrow(/content changed since review/);
    expect((await db.doc(`${OBJECTS}/DR-OK`).get()).data()?.status).toBe("draft");
    expect(await rejectedAudits(db, "DR-OK", "publish")).toEqual([
      expect.objectContaining({ result: "rejected" }),
    ]);
  });

  it("does not follow a drill ref to an exercise when deciding safetyFlag", async () => {
    await seed(db, "EX-NESTED", "exercise", {
      editor: "catalog-import",
      legacyAttributes: { safetyFlag: "review_required" },
    });
    await seed(db, "DR-OK", "drill", {
      editor: "catalog-import",
      refs: [{ id: "EX-NESTED", contentVersion: VERSION }],
    });
    const version = (await db.doc(`${OBJECTS}/DR-OK/versions/${VERSION}`).get()).data() ?? {};
    await reviewCatalogVersion(db, {
      objectId: "DR-OK",
      contentVersion: VERSION,
      reviewer: "reviewer-1",
      decision: "approved",
      expectedContentSha256: contentHash(version),
    }, FLOW);
    await publishCatalogVersionFlow(db, {
      objectId: "DR-OK",
      contentVersion: VERSION,
      reviewer: "publisher-1",
    }, FLOW);
    expect((await db.doc(`${OBJECTS}/DR-OK`).get()).data()?.status).toBe("published");
  });

  it("refuses a production review that has no gate context and writes nothing", async () => {
    await seed(db, "DR-OK", "drill", { editor: "catalog-import" });
    await expect(reviewCatalogVersion(db, {
      objectId: "DR-OK",
      contentVersion: VERSION,
      reviewer: "reviewer-1",
      decision: "approved",
      expectedContentSha256: "abc",
    }, { target: "production" })).rejects.toThrow(/production execution context is required/);
    expect((await db.doc(`${OBJECTS}/DR-OK/versions/${VERSION}`).get()).data()?.reviewStatus).toBe("pending");
    expect((await rejectedAudits(db, "DR-OK", "review")).length).toBe(0);
  });

  it("runs the CLI against the emulator and refuses production without credentials", async () => {
    await seed(db, "CLI-DR", "drill", { editor: "catalog-import" });
    const version = (await db.doc(`${OBJECTS}/CLI-DR/versions/${VERSION}`).get()).data() ?? {};
    const digest = contentHash(version);
    const missingDigest = spawnSync(process.execPath, [
      trustedFlowPath, "review", "--target", "emulator",
      "--objectId", "CLI-DR", "--contentVersion", VERSION,
      "--reviewer", "reviewer-1", "--decision", "approved",
    ], { cwd: rootDir, env: process.env, encoding: "utf8" });
    expect(missingDigest.status).toBe(1);
    expect(missingDigest.stderr).toMatch(/expectedContentSha256 is required/);

    const reviewed = spawnSync(process.execPath, [
      trustedFlowPath, "review", "--target", "emulator",
      "--objectId", "CLI-DR", "--contentVersion", VERSION,
      "--reviewer", "reviewer-1", "--decision", "approved",
      "--expectedContentSha256", digest,
    ], { cwd: rootDir, env: process.env, encoding: "utf8" });
    expect(reviewed.status, reviewed.stderr).toBe(0);
    expect((await db.doc(`${OBJECTS}/CLI-DR/versions/${VERSION}`).get()).data()?.reviewStatus).toBe("approved");

    const env = { ...process.env };
    delete env.GOOGLE_APPLICATION_CREDENTIALS;
    delete env.FIRESTORE_EMULATOR_HOST;
    const production = spawnSync(process.execPath, [
      trustedFlowPath, "publish", "--target", "production",
      "--project", "skatingx-prod", "--confirm", "skatingx-prod",
      "--objectId", "CLI-DR", "--contentVersion", VERSION, "--reviewer", "publisher-1",
    ], { cwd: rootDir, env, encoding: "utf8" });
    expect(production.status).toBe(1);
    expect(production.stderr).toMatch(/GOOGLE_APPLICATION_CREDENTIALS is not set/);
    expect((await db.doc(`${OBJECTS}/CLI-DR`).get()).data()?.status).toBe("draft");
  });

  it("accepts a context issued by openProductionFlowDb and reviews on the emulator client", async () => {
    const savedHost = process.env.FIRESTORE_EMULATOR_HOST;
    const savedAdc = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    const client = openFirestore("catalog-prod-review-bound", "skatingx-prod");
    await seed(client, "DR-OK", "drill", { editor: "catalog-import" });
    const version = (await client.doc(`${OBJECTS}/DR-OK/versions/${VERSION}`).get()).data() ?? {};
    delete process.env.FIRESTORE_EMULATOR_HOST;
    process.env.GOOGLE_APPLICATION_CREDENTIALS = "/tmp/catalog-review-not-read.json";
    try {
      const { executionContext } = await openProductionFlowDb(
        "skatingx-prod",
        "skatingx-prod",
        async () => "skatingx-prod",
        {
          bindVerifiedAdc: () => ({
            type: "impersonated_service_account",
            delegates: [],
            source_credentials: SOURCE,
            service_account_impersonation_url: POLICY_URL,
          }),
          openProductionFirestore: async () => ({ name: "app" }),
          productionFirestore: async () => client,
        },
      );
      await reviewCatalogVersion(client, {
        objectId: "DR-OK",
        contentVersion: VERSION,
        reviewer: "reviewer-1",
        decision: "approved",
        expectedContentSha256: contentHash(version),
      }, { target: "production", executionContext });
      const saved = (await client.doc(`${OBJECTS}/DR-OK/versions/${VERSION}`).get()).data();
      expect(saved?.reviewStatus).toBe("approved");
      const logs = await client.collection(AUDIT).where("target.id", "==", "DR-OK").get();
      expect(logs.docs.map((item) => item.data()).filter((entry) => entry.action === "review")).toEqual([
        expect.objectContaining({
          action: "review",
          result: "ok",
          operator: "catalog-policy-operator@skatingx-prod.iam.gserviceaccount.com",
        }),
      ]);
    } finally {
      if (savedAdc === undefined) delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
      else process.env.GOOGLE_APPLICATION_CREDENTIALS = savedAdc;
      if (savedHost === undefined) delete process.env.FIRESTORE_EMULATOR_HOST;
      else process.env.FIRESTORE_EMULATOR_HOST = savedHost;
      const app = getApps().find((item) => item.name === "catalog-prod-review-bound");
      if (app) await deleteApp(app);
    }
  });
});
