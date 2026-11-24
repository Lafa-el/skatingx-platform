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
  contentHash,
  enablePolicyPointer,
  openProductionFlowDb,
  parseArgs,
  reviewKnowledgeArticle,
} from "../../scripts/catalog/trusted-flow.mjs";

const PROJECT_ID = "demo-skatingx-import";
const ROOT = "artifacts/skatingx-production";
const ARTICLES = `${ROOT}/trainingCatalogKnowledgeArticles`;
const AUDIT = `${ROOT}/trainingCatalogAuditLogs`;
const PROBE = "KA-PROD-GATE";
const POINTER_PROBE = "gate-pointer";
const IMPORTER = "catalog-importer@skatingx-prod.iam.gserviceaccount.com";
const POLICY_OPERATOR = "catalog-policy-operator@skatingx-prod.iam.gserviceaccount.com";
const IMPERSONATION_URL =
  "https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/catalog-importer@skatingx-prod.iam.gserviceaccount.com:generateAccessToken";
const POLICY_IMPERSONATION_URL =
  "https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/catalog-policy-operator@skatingx-prod.iam.gserviceaccount.com:generateAccessToken";
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
    // A direct production call has no gate-issued context, so it is refused
    // before the project check and before any Firestore read or write.
    await expect(reviewKnowledgeArticle(db, {
      articleId: PROBE,
      reviewer: "reviewer-1",
      decision: "approved",
    }, { target: "production" })).rejects.toThrow(/production execution context is required/);

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

describe("P3-14 production execution context", () => {
  let db: Firestore;

  beforeAll(async () => {
    expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy();
    db = openFirestore();
    await db.doc(`${ARTICLES}/${PROBE}`).delete();
    await db.doc(`${ROOT}/trainingCatalogSafetyPolicyPointers/${POINTER_PROBE}`).delete();
  });

  async function untouched(id: string): Promise<void> {
    expect((await db.doc(`${ARTICLES}/${id}`).get()).exists).toBe(false);
    expect((await db.collection(AUDIT).where("target.id", "==", id).get()).size).toBe(0);
  }

  it("refuses a production review and a pointer write that have no gate context", async () => {
    await expect(reviewKnowledgeArticle(db, {
      articleId: PROBE,
      reviewer: "reviewer-1",
      decision: "approved",
      expectedContentSha256: "abc",
    }, { target: "production", operator: "attacker@example.com" })).rejects.toThrow(
      /production execution context is required/,
    );
    await untouched(PROBE);

    await expect(enablePolicyPointer(db, {
      policyId: POINTER_PROBE,
      policyVersion: "1",
      reason: "enable",
    }, { target: "production", operator: "attacker@example.com" })).rejects.toThrow(
      /production execution context is required/,
    );
    expect((await db.doc(`${ROOT}/trainingCatalogSafetyPolicyPointers/${POINTER_PROBE}`).get()).exists).toBe(false);
    expect((await db.collection(AUDIT).where("target.id", "==", POINTER_PROBE).get()).size).toBe(0);
  });

  it("refuses a production write whose context is only a lookalike object", async () => {
    await expect(reviewKnowledgeArticle(db, {
      articleId: PROBE,
      reviewer: "reviewer-1",
      decision: "approved",
      expectedContentSha256: "abc",
    }, {
      target: "production",
      executionContext: { operator: "attacker@example.com" },
    })).rejects.toThrow(/production execution context is required/);
    await untouched(PROBE);

    await expect(enablePolicyPointer(db, {
      policyId: POINTER_PROBE,
      policyVersion: "1",
      reason: "enable",
    }, {
      target: "production",
      executionContext: { operator: "attacker@example.com" },
    })).rejects.toThrow(/production execution context is required/);
    expect((await db.collection(AUDIT).where("target.id", "==", POINTER_PROBE).get()).size).toBe(0);
  });

  it("accepts a context issued by openProductionFlowDb and ignores a caller operator", async () => {
    const savedHost = process.env.FIRESTORE_EMULATOR_HOST;
    const savedAdc = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    delete process.env.FIRESTORE_EMULATOR_HOST;
    process.env.GOOGLE_APPLICATION_CREDENTIALS = "/tmp/p3-14-not-read.json";
    const draft = { status: "draft", reviewStatus: "pending", title: "gate" };
    const digest = contentHash(draft);
    const audits: Record<string, unknown>[] = [];
    const productionDb = {
      _settings: { projectId: "skatingx-prod" },
      doc: () => ({ path: "doc" }),
      collection: () => ({ doc: () => ({ path: "audit" }) }),
      runTransaction: async (run: (tx: {
        get: () => Promise<{ exists: boolean; data: () => typeof draft }>;
        update: () => void;
        set: (_ref: unknown, data: Record<string, unknown>) => void;
      }) => Promise<void>) => {
        await run({
          get: async () => ({ exists: true, data: () => draft }),
          update: () => undefined,
          set: (_ref, data) => { audits.push(data); },
        });
      },
    };
    let opened = false;
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
            service_account_impersonation_url: POLICY_IMPERSONATION_URL,
          }),
          openProductionFirestore: async () => {
            opened = true;
            return { name: "app" };
          },
          productionFirestore: () => productionDb as never,
        },
      );
      expect(opened).toBe(true);
      await reviewKnowledgeArticle(productionDb as never, {
        articleId: "KA-GATE-ACCEPT",
        reviewer: "reviewer-1",
        decision: "approved",
        expectedContentSha256: digest,
      }, {
        target: "production",
        executionContext,
        operator: "attacker@example.com",
      });
      expect(audits).toEqual([
        expect.objectContaining({
          action: "article_review",
          actor: "reviewer-1",
          operator: POLICY_OPERATOR,
          result: "ok",
          reviewedContentSha256: digest,
        }),
      ]);
    } finally {
      if (savedAdc === undefined) delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
      else process.env.GOOGLE_APPLICATION_CREDENTIALS = savedAdc;
      if (savedHost === undefined) delete process.env.FIRESTORE_EMULATOR_HOST;
      else process.env.FIRESTORE_EMULATOR_HOST = savedHost;
    }
  });

  it("does not open a database when the policy confirmation is rejected or EOF", async () => {
    const savedHost = process.env.FIRESTORE_EMULATOR_HOST;
    const savedAdc = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    delete process.env.FIRESTORE_EMULATOR_HOST;
    process.env.GOOGLE_APPLICATION_CREDENTIALS = "/tmp/p3-14-not-read.json";
    const bindVerifiedAdc = () => ({
      type: "impersonated_service_account",
      delegates: [],
      source_credentials: SOURCE,
      service_account_impersonation_url: POLICY_IMPERSONATION_URL,
    });
    try {
      for (const entered of ["IMPORT", "wrong", "", "Skatingx-Prod", undefined]) {
        let opened = false;
        await expect(openProductionFlowDb(
          "skatingx-prod",
          "skatingx-prod",
          async () => entered,
          {
            bindVerifiedAdc,
            openProductionFirestore: async () => {
              opened = true;
              return { name: "app" };
            },
            productionFirestore: () => {
              opened = true;
              return db;
            },
          },
        )).rejects.toThrow(/policy operations require the exact target project id/);
        expect(opened).toBe(false);
      }
    } finally {
      if (savedAdc === undefined) delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
      else process.env.GOOGLE_APPLICATION_CREDENTIALS = savedAdc;
      if (savedHost === undefined) delete process.env.FIRESTORE_EMULATOR_HOST;
      else process.env.FIRESTORE_EMULATOR_HOST = savedHost;
    }
  });

  it("refuses the importer identity on the policy path and opens nothing", async () => {
    const savedHost = process.env.FIRESTORE_EMULATOR_HOST;
    const savedAdc = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    delete process.env.FIRESTORE_EMULATOR_HOST;
    process.env.GOOGLE_APPLICATION_CREDENTIALS = "/tmp/p3-15-not-read.json";
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
          productionFirestore: () => {
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
