import { getApps, initializeApp } from "firebase-admin/app";
import { type Firestore, getFirestore } from "firebase-admin/firestore";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  assertExecutionTarget,
  identityFromAdcPayload,
  parseImportArgs,
} from "../../scripts/catalog/import-guard.mjs";
import {
  assertProductionCommand,
  assertProductionProject,
  openProductionFlowDb,
  parseArgs,
  reviewKnowledgeArticle,
} from "../../scripts/catalog/trusted-flow.mjs";

const PROJECT_ID = "demo-skatingx-import";
const ROOT = "artifacts/skatingx-production";
const ARTICLES = `${ROOT}/trainingCatalogKnowledgeArticles`;
const AUDIT = `${ROOT}/trainingCatalogAuditLogs`;
const PROBE = "KA-PROD-GATE";
const IMPORTER = "catalog-importer@skatingx-prod.iam.gserviceaccount.com";
const IMPERSONATION_URL =
  "https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/catalog-importer@skatingx-prod.iam.gserviceaccount.com:generateAccessToken";
const SOURCE = {
  type: "authorized_user",
  client_id: "synthetic-client",
  client_secret: "synthetic-secret",
  refresh_token: "synthetic-refresh",
};

function openFirestore(): Firestore {
  const existing = getApps().find((app) => app.name === "catalog-p3-production-gate");
  const app = existing ?? initializeApp({ projectId: PROJECT_ID }, "catalog-p3-production-gate");
  return getFirestore(app);
}

describe("P3 production review gate on the emulator", () => {
  let db: Firestore;

  beforeAll(async () => {
    expect(PROJECT_ID.startsWith("demo-")).toBe(true);
    expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy();
    db = openFirestore();
    await db.doc(`${ARTICLES}/${PROBE}`).delete();
    const logs = await db.collection(AUDIT).where("target.id", "==", PROBE).get();
    if (!logs.empty) {
      const batch = db.batch();
      for (const item of logs.docs) batch.delete(item.ref);
      await batch.commit();
    }
  });

  afterAll(async () => {
    if (!db) return;
    const batch = db.batch();
    batch.delete(db.doc(`${ARTICLES}/${PROBE}`));
    const logs = await db.collection(AUDIT).where("target.id", "==", PROBE).get();
    for (const item of logs.docs) batch.delete(item.ref);
    await batch.commit();
  });

  it("N1 refuses a production review against the emulator and writes nothing", async () => {
    await expect(reviewKnowledgeArticle(db, {
      articleId: PROBE,
      reviewer: "reviewer-1",
      decision: "approved",
    }, { target: "production" })).rejects.toThrow(/production project id must be skatingx-prod/);

    expect((await db.doc(`${ARTICLES}/${PROBE}`).get()).exists).toBe(false);
    expect((await db.collection(AUDIT).where("target.id", "==", PROBE).get()).size).toBe(0);
  });

  it("N2 refuses a non-production project and a production project while the emulator host is set", () => {
    expect(() => assertProductionProject(db)).toThrow(/refusing to run: production project id must be skatingx-prod/);
    const posed = { _settings: { projectId: "skatingx-prod" } };
    expect(() => assertProductionProject(posed as never)).toThrow(
      /refusing to run: FIRESTORE_EMULATOR_HOST must be unset for production/,
    );
  });

  it("N3 fail-closes the production execution target", () => {
    const ready = {
      target: "production" as const,
      projectId: "skatingx-prod",
      confirm: "skatingx-prod",
      emulatorHost: "",
      databaseId: "(default)",
    };
    expect(() => assertExecutionTarget({ ...ready, confirm: "demo-skatingx-import" })).toThrow(
      /--confirm must equal the production project id/,
    );
    expect(() => assertExecutionTarget({ ...ready, emulatorHost: "127.0.0.1:8080" })).toThrow(
      /FIRESTORE_EMULATOR_HOST must be unset for production/,
    );
    expect(() => assertExecutionTarget({ ...ready, databaseId: "other" })).toThrow(
      /database id must be \(default\)/,
    );
    expect(assertExecutionTarget(ready)).toEqual({ target: "production", phase: "preflight" });
    expect(assertExecutionTarget({ ...ready, execute: true })).toEqual({ target: "production", phase: "execute" });
  });

  it("N4 accepts only an impersonated catalog-importer credential", () => {
    expect(() => identityFromAdcPayload({ type: "authorized_user" })).toThrow(
      /credential type is not service_account/,
    );
    expect(() => identityFromAdcPayload({
      type: "impersonated_service_account",
      delegates: ["other@example.com"],
      source_credentials: SOURCE,
      service_account_impersonation_url: IMPERSONATION_URL,
    })).toThrow(/delegates are not accepted/);
    expect(identityFromAdcPayload({
      type: "impersonated_service_account",
      delegates: [],
      source_credentials: SOURCE,
      service_account_impersonation_url: IMPERSONATION_URL,
    }).clientEmail).toBe(IMPORTER);
  });

  it("N5 rejects --yes, an unknown argument, and a missing target", () => {
    expect(() => parseImportArgs([
      "--target",
      "emulator",
      "--project",
      "demo-x",
      "--runId",
      "r",
      "--yes",
    ])).toThrow(/--yes is not a confirmation/);
    expect(() => parseImportArgs([
      "--target",
      "emulator",
      "--project",
      "demo-x",
      "--runId",
      "r",
      "--bogus",
    ])).toThrow(/unknown argument/);
    expect(() => parseImportArgs(["--project", "skatingx-prod", "--runId", "r"])).toThrow(
      /--target emulator\|production is required/,
    );
  });
});

describe("P3-8 production gate tightening", () => {
  const readLine = async () => "skatingx-prod";

  it("rejects an unknown argument and keeps known article-review args", () => {
    expect(() => parseArgs(["article-review", "--bogus", "x"])).toThrow(/unknown argument --bogus/);
    expect(parseArgs(["article-review", "--articleId", "KA-1", "--reviewer", "r", "--decision", "approved"])).toEqual({
      command: "article-review",
      args: { articleId: "KA-1", reviewer: "r", decision: "approved" },
    });
    expect(() => parseArgs(["review", "--yes"])).toThrow(/--yes is not a confirmation/);
  });

  it("allows only article and policy commands in production", () => {
    for (const command of ["article-review", "article-publish", "policy-review", "policy-publish"]) {
      expect(() => assertProductionCommand(command)).not.toThrow();
    }
    for (const command of ["review", "publish", "withdraw", "revoke", "link-review", "link-publish", "link-withdraw"]) {
      expect(() => assertProductionCommand(command)).toThrow(/is not allowed with --target production/);
    }
  });

  it("refuses a production open when the project id is wrong", async () => {
    await expect(openProductionFlowDb("demo-x", "demo-x", readLine)).rejects.toThrow(
      /production project id must be skatingx-prod/,
    );
  });

  it("refuses a production open when confirm does not match the project", async () => {
    await expect(openProductionFlowDb("skatingx-prod", "demo-x", readLine)).rejects.toThrow(
      /--confirm must equal the production project id/,
    );
  });

  it("refuses a production open when the ADC file is not set", async () => {
    const savedAdc = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    const savedHost = process.env.FIRESTORE_EMULATOR_HOST;
    delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
    // The project and confirm checks pass first. The emulator host check is next,
    // so this test has to clear it to reach the ADC refusal.
    delete process.env.FIRESTORE_EMULATOR_HOST;
    try {
      await expect(openProductionFlowDb("skatingx-prod", "skatingx-prod", readLine)).rejects.toThrow(
        /GOOGLE_APPLICATION_CREDENTIALS is not set/,
      );
    } finally {
      if (savedAdc === undefined) delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
      else process.env.GOOGLE_APPLICATION_CREDENTIALS = savedAdc;
      if (savedHost === undefined) delete process.env.FIRESTORE_EMULATOR_HOST;
      else process.env.FIRESTORE_EMULATOR_HOST = savedHost;
    }
  });
});
