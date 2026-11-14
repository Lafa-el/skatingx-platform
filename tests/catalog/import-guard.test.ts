import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  ALLOWED_PRODUCTION_SERVICE_ACCOUNTS,
  FIRESTORE_USERS_COLLECTION,
  RACE_RESULT_PATH,
  VIDEO_METADATA_PATH,
  assertBusinessCountsForProduction,
  assertExecutionTarget,
  assertProductionConnectionDisabled,
  assertServiceAccountIdentity,
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
    expect(ALLOWED_PRODUCTION_SERVICE_ACCOUNTS).toEqual([]);
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
    await expect(confirmProjectOnStdin("skatingx-prod", async () => "wrong\n")).rejects.toThrow(/stdin confirmation/);
    await expect(confirmProjectOnStdin("skatingx-prod", async () => "skatingx-prod")).resolves.toBeUndefined();
    expect(() => parseImportArgs(["--target", "emulator", "--project", "demo-x", "--runId", "r", "--yes"])).toThrow(/--yes/);
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
      baseBudget: 772,
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
    const user = {
      ref: {
        collection(name: string) {
          if (name === "raceDay") {
            return {
              get: async () => ({
                docs: [
                  {
                    ref: {
                      collection: () => ({ get: async () => ({ size: 2 }) }),
                    },
                  },
                ],
              }),
            };
          }
          if (name === "videos") return { get: async () => ({ size: 4 }) };
          throw new Error(`unexpected user collection ${name}`);
        },
      },
    };
    const db = {
      collection(collectionPath: string) {
        expect(collectionPath).toBe(FIRESTORE_USERS_COLLECTION);
        return { get: async () => ({ size: 1, docs: [user] }) };
      },
    };
    const counts = await countBusinessData(db as never);
    expect(counts).toMatchObject({ status: "available", firestoreUsers: 1, raceResults: 2, videoMetadata: 4 });
    expect(counts.paths?.raceResults).toBe(RACE_RESULT_PATH);
  });

  it("stops a fully confirmed production execution before opening Firestore", () => {
    expect(() => assertProductionConnectionDisabled()).toThrow(/production Firestore connection is disabled/);
    const env = { ...process.env };
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
