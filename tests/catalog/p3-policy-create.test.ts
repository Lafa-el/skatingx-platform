import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { getApps, initializeApp } from "firebase-admin/app";
import { type Firestore, getFirestore } from "firebase-admin/firestore";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  assertProductionCommand,
  createSafetyPolicy,
  openProductionFlowDb,
  policyDocId,
} from "../../scripts/catalog/trusted-flow.mjs";

const PROJECT_ID = "demo-skatingx-import";
const ROOT = "artifacts/skatingx-production";
const POLICIES = `${ROOT}/trainingCatalogSafetyPolicies`;
const AUDIT = `${ROOT}/trainingCatalogAuditLogs`;
const POLICY_ID = "youth-conditional-v1";
const POLICY_VERSION = "1";
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const policyFile = path.join(rootDir, "scripts/catalog/policies/youth-conditional-v1--v1.json");
const ORIGINAL = readFileSync(policyFile, "utf8");
const IMPERSONATION_URL =
  "https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/catalog-importer@skatingx-prod.iam.gserviceaccount.com:generateAccessToken";
const SOURCE = {
  type: "authorized_user",
  client_id: "synthetic-client",
  client_secret: "synthetic-secret",
  refresh_token: "synthetic-refresh",
};

function openFirestore(): Firestore {
  const existing = getApps().find((app) => app.name === "catalog-p3-policy-create");
  const app = existing ?? initializeApp({ projectId: PROJECT_ID }, "catalog-p3-policy-create");
  return getFirestore(app);
}

describe("P3-16 gated policy create", () => {
  const db = openFirestore();
  const docId = policyDocId(POLICY_ID, POLICY_VERSION);

  beforeEach(async () => {
    await clear();
  });

  afterAll(async () => {
    writeFileSync(policyFile, ORIGINAL);
    await clear();
  });

  async function clear(): Promise<void> {
    await db.doc(`${POLICIES}/${docId}`).delete();
    const logs = await db.collection(AUDIT).where("target.id", "==", docId).get();
    await Promise.all(logs.docs.map((doc) => doc.ref.delete()));
  }

  async function withFile(content: unknown, run: () => Promise<void>): Promise<void> {
    writeFileSync(policyFile, `${JSON.stringify(content, null, 2)}\n`);
    try {
      await run();
    } finally {
      writeFileSync(policyFile, ORIGINAL);
    }
  }

  it("C1 creates the pinned draft and one policy_create audit", async () => {
    await createSafetyPolicy(db, { policyId: POLICY_ID, policyVersion: POLICY_VERSION, actor: "operator-1" });
    const saved = (await db.doc(`${POLICIES}/${docId}`).get()).data();
    expect(saved?.status).toBe("draft");
    expect(saved?.reviewStatus).toBe("pending");
    expect(saved).not.toHaveProperty("reviewer");
    expect(saved).not.toHaveProperty("reviewedAt");
    expect(saved).not.toHaveProperty("reviewedContentSha256");
    expect(saved).not.toHaveProperty("publishedAt");
    const logs = await db.collection(AUDIT).where("target.id", "==", docId).get();
    expect(logs.docs.map((doc) => doc.data())).toEqual([
      expect.objectContaining({ action: "policy_create", actor: "operator-1", result: "ok" }),
    ]);
  });

  it("C2 refuses to overwrite an existing policy document", async () => {
    await db.doc(`${POLICIES}/${docId}`).set({ marker: "keep" });
    await expect(createSafetyPolicy(db, {
      policyId: POLICY_ID,
      policyVersion: POLICY_VERSION,
      actor: "operator-1",
    })).rejects.toThrow(/policy already exists/);
    expect((await db.doc(`${POLICIES}/${docId}`).get()).data()).toEqual({ marker: "keep" });
    const logs = await db.collection(AUDIT).where("target.id", "==", docId).get();
    expect(logs.docs.map((doc) => doc.data())).toEqual([
      expect.objectContaining({ action: "policy_create", result: "rejected" }),
    ]);
  });

  it("C3 refuses a pinned file whose content hash no longer matches", async () => {
    const content = JSON.parse(ORIGINAL) as Record<string, unknown>;
    content.ageBands = ["age8_10"];
    await withFile(content, async () => {
      await expect(createSafetyPolicy(db, {
        policyId: POLICY_ID,
        policyVersion: POLICY_VERSION,
        actor: "operator-1",
      })).rejects.toThrow(/pinned digest/);
    });
    expect((await db.doc(`${POLICIES}/${docId}`).get()).exists).toBe(false);
  });

  it("C4 refuses a pinned file whose identity does not match the request", async () => {
    const content = JSON.parse(ORIGINAL) as Record<string, unknown>;
    content.policyId = "other-policy";
    await withFile(content, async () => {
      await expect(createSafetyPolicy(db, {
        policyId: POLICY_ID,
        policyVersion: POLICY_VERSION,
        actor: "operator-1",
      })).rejects.toThrow(/policyId/);
    });
    content.policyId = POLICY_ID;
    content.policyVersion = "9";
    await withFile(content, async () => {
      await expect(createSafetyPolicy(db, {
        policyId: POLICY_ID,
        policyVersion: POLICY_VERSION,
        actor: "operator-1",
      })).rejects.toThrow(/policyVersion/);
    });
    expect((await db.doc(`${POLICIES}/${docId}`).get()).exists).toBe(false);
  });

  it("C5 refuses content that is not a pending draft without review metadata", async () => {
    const content = JSON.parse(ORIGINAL) as Record<string, unknown>;
    content.status = "published";
    await withFile(content, async () => {
      await expect(createSafetyPolicy(db, {
        policyId: POLICY_ID,
        policyVersion: POLICY_VERSION,
        actor: "operator-1",
      })).rejects.toThrow(/status must be draft/);
    });
    content.status = "draft";
    content.reviewStatus = "approved";
    await withFile(content, async () => {
      await expect(createSafetyPolicy(db, {
        policyId: POLICY_ID,
        policyVersion: POLICY_VERSION,
        actor: "operator-1",
      })).rejects.toThrow(/reviewStatus must be pending/);
    });
    content.reviewStatus = "pending";
    content.reviewer = "someone";
    await withFile(content, async () => {
      await expect(createSafetyPolicy(db, {
        policyId: POLICY_ID,
        policyVersion: POLICY_VERSION,
        actor: "operator-1",
      })).rejects.toThrow(/review metadata/);
    });
    expect((await db.doc(`${POLICIES}/${docId}`).get()).exists).toBe(false);
  });

  it("C6 refuses a policy version that has no pinned content", async () => {
    const unpinned = policyDocId(POLICY_ID, "2");
    await expect(createSafetyPolicy(db, {
      policyId: POLICY_ID,
      policyVersion: "2",
      actor: "operator-1",
    })).rejects.toThrow(/no pinned content for this policy version/);
    const logs = await db.collection(AUDIT).where("target.id", "==", unpinned).get();
    await Promise.all(logs.docs.map((doc) => doc.ref.delete()));
  });

  it("C7 keeps policy-create on the production gate and refuses the importer", async () => {
    expect(() => assertProductionCommand("policy-create")).not.toThrow();
    const savedHost = process.env.FIRESTORE_EMULATOR_HOST;
    const savedAdc = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    delete process.env.FIRESTORE_EMULATOR_HOST;
    process.env.GOOGLE_APPLICATION_CREDENTIALS = "/tmp/p3-16-not-read.json";
    let opened = false;
    try {
      await expect(openProductionFlowDb(
        "skatingx-prod",
        "skatingx-prod",
        async () => "skatingx-prod",
        {
          bindVerifiedAdc: () => ({
            type: "impersonated_service_account",
            delegates: [],
            source_credentials: SOURCE,
            service_account_impersonation_url: IMPERSONATION_URL,
          }),
          openProductionFirestore: async () => {
            opened = true;
            return { name: "app" };
          },
          productionFirestore: async () => {
            opened = true;
            return db;
          },
        },
      )).rejects.toThrow(/service account is not allowed/);
      expect(opened).toBe(false);
    } finally {
      if (savedAdc === undefined) delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
      else process.env.GOOGLE_APPLICATION_CREDENTIALS = savedAdc;
      if (savedHost === undefined) delete process.env.FIRESTORE_EMULATOR_HOST;
      else process.env.FIRESTORE_EMULATOR_HOST = savedHost;
    }
  });
});
