import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  ALLOWED_PRODUCTION_SERVICE_ACCOUNTS,
  FIRESTORE_USERS_COLLECTION,
  RACE_RESULT_PATH,
  RACE_VIDEO_PATH,
  VIDEO_METADATA_PATH,
  assertBusinessCountsForProduction,
  assertExecutionTarget,
  assertServiceAccountIdentity,
  identityFromAdcPayload,
  confirmProjectOnStdin,
  countBusinessData,
  formatExecutionSummary,
  parseImportArgs,
  resolveAuthUserCount,
} from "../../scripts/catalog/import-guard.mjs";

const rootDir = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");
const runImportPath = path.join(rootDir, "scripts/catalog/run-import.mjs");

function runImport(args: string[], env: NodeJS.ProcessEnv, input = "") {
  return spawnSync(process.execPath, [runImportPath, ...args], {
    cwd: rootDir,
    encoding: "utf8",
    env,
    input,
  });
}

describe("catalog import target guards", () => {
  it("rejects a credential that is not a service account, a missing email, and the wrong project", () => {
    expect(ALLOWED_PRODUCTION_SERVICE_ACCOUNTS).toEqual([
      "catalog-importer@skatingx-prod.iam.gserviceaccount.com",
    ]);
    expect(() => assertServiceAccountIdentity({ credential: { type: "authorized_user", clientEmail: "a@b.c", projectId: "skatingx-prod" }, projectId: "skatingx-prod" })).toThrow(/service_account/);
    expect(() =>
      assertServiceAccountIdentity({
        credential: { type: "service_account", projectId: "skatingx-prod" },
        projectId: "skatingx-prod",
        allowedEmails: ["import@skatingx-prod.iam.gserviceaccount.com"],
      }),
    ).toThrow(/email is missing/);
    expect(() =>
      assertServiceAccountIdentity({
        credential: {
          type: "service_account",
          clientEmail: "import@skatingx-prod.iam.gserviceaccount.com",
          projectId: "other-project",
        },
        projectId: "skatingx-prod",
        allowedEmails: ["import@skatingx-prod.iam.gserviceaccount.com"],
      }),
    ).toThrow(/does not match the target project/);
    expect(
      assertServiceAccountIdentity({
        credential: {
          type: "service_account",
          clientEmail: "import@skatingx-prod.iam.gserviceaccount.com",
          projectId: "skatingx-prod",
        },
        projectId: "skatingx-prod",
        allowedEmails: ["import@skatingx-prod.iam.gserviceaccount.com"],
      }).clientEmail,
    ).toBe("import@skatingx-prod.iam.gserviceaccount.com");
  });

  it("refuses production when the emulator host is still set", () => {
    expect(() =>
      assertExecutionTarget({
        target: "production",
        projectId: "skatingx-prod",
        confirm: "skatingx-prod",
        emulatorHost: "127.0.0.1:8080",
        execute: true,
        databaseId: "(default)",
      }),
    ).toThrow(/FIRESTORE_EMULATOR_HOST/);
    expect(() =>
      assertExecutionTarget({
        target: "production",
        projectId: "other-project",
        confirm: "other-project",
        emulatorHost: "",
        execute: true,
        databaseId: "(default)",
      }),
    ).toThrow(/skatingx-prod/);
  });

  it("requires the operator to type the project id and does not accept --yes", async () => {
    await expect(confirmProjectOnStdin("skatingx-prod", async () => "wrong\n")).rejects.toThrow(/confirmation was rejected/);
    await expect(confirmProjectOnStdin("skatingx-prod", async () => "")).rejects.toThrow(/confirmation was rejected/);
    await expect(confirmProjectOnStdin("skatingx-prod", async () => "Skatingx-Prod")).rejects.toThrow(/confirmation was rejected/);
    await expect(confirmProjectOnStdin("skatingx-prod", async () => "skatingx-prod")).resolves.toBe("skatingx-prod");
    await expect(confirmProjectOnStdin("skatingx-prod", async () => "IMPORT")).resolves.toBe("IMPORT");
    expect(() => parseImportArgs(["--target", "emulator", "--project", "demo-x", "--runId", "r", "--yes"])).toThrow(/--yes/);
    expect(() => parseImportArgs(["--target", "emulator", "--project", "demo-x", "--runId", "r", "--recover-lock", "--mode", "resume"])).toThrow(/requires --execute/);
    expect(() => parseImportArgs(["--target", "emulator", "--project", "demo-x", "--runId", "r", "--recover-lock", "--execute", "--rollback"])).toThrow(/cannot be combined with rollback/);
    expect(() => parseImportArgs(["--target", "emulator", "--project", "demo-x", "--runId", "a/b", "--mode", "initial"])).toThrow(/single document id/);
    expect(() => parseImportArgs(["--target", "emulator", "--project", "demo-x", "--runId", ".", "--mode", "initial"])).toThrow(/single document id/);
    expect(() => parseImportArgs(["--target", "emulator", "--project", "demo-x", "--runId", "..", "--mode", "initial"])).toThrow(/single document id/);
  });

  it("does not print an unknown Auth count as zero and fail-closes production", () => {
    const auth = resolveAuthUserCount({ status: "unavailable", reason: "not configured" });
    expect(auth.status).toBe("unavailable");
    const text = formatExecutionSummary({
      target: "production",
      projectId: "skatingx-prod",
      databaseId: "(default)",
      identity: "unverified",
      runId: "r",
      mode: "initial",
      actor: "catalog-import",
      gitSha: "abc",
      workbookSha256: "def",
      plannedContentWrites: 514,
      plannedAuditWrites: 257,
      plannedMigrationCreates: 1,
      baseBudget: 778,
      authUsers: auth,
      business: { status: "unavailable" },
    });
    expect(text).toContain("authUsers: unavailable");
    expect(text).not.toContain("authUsers: 0");
    expect(text).toContain(RACE_RESULT_PATH);
    expect(text).toContain(VIDEO_METADATA_PATH);
    expect(() => assertBusinessCountsForProduction(auth, { status: "unavailable" })).toThrow(/Auth user count is unavailable/);
  });

  it("counts Firestore users, race-day results, and video metadata from the schema paths", async () => {
    const eventRef = {
      collection(name: string) {
        return { get: async () => ({ size: name === "videos" ? 3 : 2 }) };
      },
    };
    const userRef = {
      collection(name: string) {
        if (name === "raceDay") return { listDocuments: async () => [eventRef] };
        if (name === "videos") return { get: async () => ({ size: 4 }) };
        throw new Error(`unexpected user collection ${name}`);
      },
    };
    const db = {
      collection(collectionPath: string) {
        expect(collectionPath).toBe(FIRESTORE_USERS_COLLECTION);
        return { listDocuments: async () => [userRef] };
      },
    };
    const counts = await countBusinessData(db as never);
    expect(counts).toMatchObject({
      status: "available",
      firestoreUsers: 1,
      raceResults: 2,
      videoMetadata: 7,
      raceVideos: 3,
    });
    expect(counts.paths?.raceResults).toBe(RACE_RESULT_PATH);
    expect(counts.paths?.raceVideos).toBe(RACE_VIDEO_PATH);
  });

  it("accepts only impersonated ADC and stops production before opening Firestore", () => {
    expect(() => identityFromAdcPayload({ type: "service_account", private_key: "secret" })).toThrow(/long-lived service account keys/);
    expect(() => identityFromAdcPayload({ type: "authorized_user" })).toThrow(/credential type is not service_account/);
    expect(() => identityFromAdcPayload({
      type: "impersonated_service_account",
      delegates: ["other@skatingx-prod.iam.gserviceaccount.com"],
      source_credentials: { type: "authorized_user", client_id: "synthetic-client", client_secret: "synthetic-secret", refresh_token: "synthetic-refresh" },
      service_account_impersonation_url: "https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/catalog-importer@skatingx-prod.iam.gserviceaccount.com:generateAccessToken",
    })).toThrow(/delegates are not accepted/);
    expect(() => identityFromAdcPayload({
      type: "impersonated_service_account",
      delegates: { chain: "not-an-array" },
      source_credentials: { type: "authorized_user", client_id: "synthetic-client", client_secret: "synthetic-secret", refresh_token: "synthetic-refresh" },
      service_account_impersonation_url: "https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/catalog-importer@skatingx-prod.iam.gserviceaccount.com:generateAccessToken",
    })).toThrow(/delegates are not accepted/);
    const source = { type: "authorized_user", client_id: "synthetic-client", client_secret: "synthetic-secret", refresh_token: "synthetic-refresh" };
    const url = "https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/catalog-importer@skatingx-prod.iam.gserviceaccount.com:generateAccessToken";
    expect(identityFromAdcPayload({
      type: "impersonated_service_account",
      delegates: [],
      quota_project_id: "some-other-quota-project",
      universe_domain: "googleapis.com",
      source_credentials: source,
      service_account_impersonation_url: url,
    })).toMatchObject({
      clientEmail: "catalog-importer@skatingx-prod.iam.gserviceaccount.com",
      projectId: "skatingx-prod",
    });
    expect(() => identityFromAdcPayload({
      type: "impersonated_service_account",
      universe_domain: "example.com",
      source_credentials: source,
      service_account_impersonation_url: url,
    })).toThrow(/universe domain is not accepted/);
    expect(() => identityFromAdcPayload({
      type: "impersonated_service_account",
      token_uri: "https://example.com/token",
      source_credentials: source,
      service_account_impersonation_url: url,
    })).toThrow(/unexpected credential endpoint/);
    expect(() => identityFromAdcPayload({
      type: "impersonated_service_account",
      source_credentials: { ...source, private_key: "nested" },
      service_account_impersonation_url: "https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/catalog-importer@skatingx-prod.iam.gserviceaccount.com:generateAccessToken",
    })).toThrow(/long-lived service account keys/);
    expect(() => identityFromAdcPayload({
      type: "impersonated_service_account",
      source_credentials: source,
      service_account_impersonation_url: "https://evil.example/v1/projects/-/serviceAccounts/catalog-importer@skatingx-prod.iam.gserviceaccount.com:generateAccessToken",
    })).toThrow(/impersonation url is not a Google IAM endpoint/);
    expect(identityFromAdcPayload({
      type: "impersonated_service_account",
      source_credentials: source,
      service_account_impersonation_url: "https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/catalog-importer@skatingx-prod.iam.gserviceaccount.com:generateAccessToken",
    })).toMatchObject({
      type: "service_account",
      clientEmail: "catalog-importer@skatingx-prod.iam.gserviceaccount.com",
      projectId: "skatingx-prod",
    });
    const env: NodeJS.ProcessEnv = { ...process.env, GOOGLE_APPLICATION_CREDENTIALS: path.join(rootDir, "missing-adc.json") };
    delete env.FIRESTORE_EMULATOR_HOST;
    const child = runImport(
      ["--target", "production", "--project", "skatingx-prod", "--confirm", "skatingx-prod", "--mode", "initial", "--runId", "prod-run", "--execute"],
      env,
      "skatingx-prod\n",
    );
    expect(child.status).not.toBe(0);
    expect(child.stderr).toMatch(/credential type is not service_account/);
    expect(child.stderr).not.toMatch(/actualContentWrites|privateKey|private_key/);
    expect(child.stdout).not.toContain("actualContentWrites");
  });
});
