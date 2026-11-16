import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

const created: Array<{ name?: string; options?: { projectId?: string } }> = [];

vi.mock("firebase-admin/app", () => ({
  initializeApp: (options: { projectId?: string }, name?: string) => {
    const app = { name, options };
    created.push(app);
    return app;
  },
  applicationDefault: () => ({
    getAccessToken: async () => ({ access_token: "synthetic-access-token", expires_in: 3600 }),
  }),
}));

vi.mock("firebase-admin/auth", () => ({
  getAuth: (app?: { name?: string }) => {
    if (!app) throw new Error("getAuth requires the named app");
    return {
      listUsers: async () => ({ users: [{ uid: "a" }, { uid: "b" }], pageToken: undefined }),
    };
  },
}));

vi.mock("firebase-admin/firestore", () => ({
  getFirestore: (app: { name?: string }) => ({ app, projectId: "skatingx-prod" }),
}));

vi.mock("google-auth-library", () => ({
  GoogleAuth: class {
    async getClient() {
      return { source: "authorized-user" };
    }
  },
  Impersonated: class {
    async getAccessToken() {
      return { token: "synthetic-access-token" };
    }
  },
}));

import { productionWriteIdentity } from "../../scripts/catalog/import-core.mjs";
import { runImportEntry } from "../../scripts/catalog/import-runner.mjs";
import { countAuthUsers, openProductionFirestore } from "../../scripts/catalog/run-import.mjs";

const payload = {
  type: "impersonated_service_account",
  source_credentials: {
    type: "authorized_user",
    client_id: "synthetic-client",
    client_secret: "synthetic-secret",
    refresh_token: "synthetic-refresh",
  },
  service_account_impersonation_url:
    "https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/catalog-importer@skatingx-prod.iam.gserviceaccount.com:generateAccessToken",
};

describe("production import entry", () => {
  afterEach(() => {
    delete process.env.FIREBASE_AUTH_EMULATOR_HOST;
  });

  it("shares one named app between Firestore and Auth", async () => {
    const previous = process.env.FIRESTORE_EMULATOR_HOST;
    const previousAdc = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    delete process.env.FIRESTORE_EMULATOR_HOST;
    const dir = mkdtempSync(path.join(tmpdir(), "skatingx-adc-"));
    const file = path.join(dir, "adc.json");
    writeFileSync(file, JSON.stringify(payload));
    delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
    const first = await openProductionFirestore(file);
    const second = await openProductionFirestore(file);
    expect(second).toBe(first);
    expect(created).toHaveLength(1);
    expect(created[0]?.name).toBe("catalog-run-import-production");
    expect(created[0]?.options?.projectId).toBe("skatingx-prod");
    expect(process.env.GOOGLE_APPLICATION_CREDENTIALS).toBe(path.resolve(file));
    const counted = await countAuthUsers(first);
    expect(counted).toEqual({ status: "available", count: 2 });
    expect(JSON.stringify(created)).not.toContain("synthetic-secret");
    process.env.GOOGLE_APPLICATION_CREDENTIALS = path.join(dir, "other.json");
    await expect(openProductionFirestore(file)).rejects.toThrow(/does not point at the verified ADC file/);
    process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
    delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
    await expect(openProductionFirestore(file)).rejects.toThrow(/FIREBASE_AUTH_EMULATOR_HOST must be unset/);
    if (previousAdc === undefined) delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
    else process.env.GOOGLE_APPLICATION_CREDENTIALS = previousAdc;
    if (previous === undefined) delete process.env.FIRESTORE_EMULATOR_HOST;
    else process.env.FIRESTORE_EMULATOR_HOST = previous;
  });

  it("clears the write grant when opening production fails before confirmation", async () => {
    let confirmed = 0;
    await expect(runImportEntry({
      target: "production",
      project: "skatingx-prod",
      confirm: "skatingx-prod",
      mode: "initial",
      runId: "prod-open-fail",
      execute: true,
      actor: "catalog-import",
      databaseId: "(default)",
      allowProductionWrite: true,
    }, {
      emulatorHost: "",
      now: () => new Date("2026-11-15T00:00:00.000Z"),
      gitSha: () => "runner-git",
      openFirestore: async () => {
        throw new Error("open failed");
      },
      credentialProvider: {
        source: "test-fixture",
        async describe() {
          return {
            type: "service_account",
            clientEmail: "catalog-importer@skatingx-prod.iam.gserviceaccount.com",
            projectId: "skatingx-prod",
          };
        },
      },
      allowedEmails: ["catalog-importer@skatingx-prod.iam.gserviceaccount.com"],
      confirmProject: async () => {
        confirmed += 1;
        return "IMPORT";
      },
      countAuthUsers: async () => ({ status: "available", count: 1 }),
      countBusiness: async () => ({ status: "available", firestoreUsers: 0, raceResults: 0, videoMetadata: 0, raceVideos: 0 }),
    })).rejects.toThrow(/open failed/);
    expect(confirmed).toBe(0);
    expect(productionWriteIdentity()).toBeNull();
  });

  it("rejects an empty confirmation and keeps a parallel read from clearing the writer", async () => {
    const previous = process.env.FIRESTORE_EMULATOR_HOST;
    delete process.env.FIRESTORE_EMULATOR_HOST;
    const db = fakeProductionDb();
    const identity = {
      source: "test-fixture",
      async describe() {
        return {
          type: "service_account",
          clientEmail: "catalog-importer@skatingx-prod.iam.gserviceaccount.com",
          projectId: "skatingx-prod",
        };
      },
    };
    const shared = {
      emulatorHost: "",
      now: () => new Date("2026-11-15T00:00:00.000Z"),
      gitSha: () => "runner-git",
      openFirestore: async () => db,
      credentialProvider: identity,
      allowedEmails: ["catalog-importer@skatingx-prod.iam.gserviceaccount.com"],
      countAuthUsers: async () => ({ status: "available", count: 1 }),
      countBusiness: async () => ({ status: "available", firestoreUsers: 0, raceResults: 0, videoMetadata: 0, raceVideos: 0 }),
    };
    await expect(runImportEntry({
      target: "production",
      project: "skatingx-prod",
      confirm: "skatingx-prod",
      mode: "initial",
      runId: "prod-empty-confirm",
      execute: true,
      actor: "catalog-import",
      databaseId: "(default)",
      allowProductionWrite: true,
    }, {
      ...shared,
      confirmProject: async () => undefined,
    })).rejects.toThrow(/confirmation was rejected/);
    expect(productionWriteIdentity()).toBeNull();

    let grantDuringRead = "";
    let secondWriteRefused: boolean = false;
    const writer = runImportEntry({
      target: "production",
      project: "skatingx-prod",
      confirm: "skatingx-prod",
      mode: "initial",
      runId: "prod-writer",
      execute: true,
      actor: "catalog-import",
      databaseId: "(default)",
      allowProductionWrite: true,
    }, {
      ...shared,
      confirmProject: async () => "IMPORT",
      afterGrant: async () => {
        await runImportEntry({
          target: "production",
          project: "skatingx-prod",
          confirm: "skatingx-prod",
          mode: "initial",
          runId: "prod-reader",
          execute: false,
          actor: "catalog-import",
          databaseId: "(default)",
          allowProductionRead: true,
        }, shared);
        grantDuringRead = JSON.stringify(productionWriteIdentity());
        await expect(runImportEntry({
          target: "production",
          project: "skatingx-prod",
          confirm: "skatingx-prod",
          mode: "initial",
          runId: "prod-second",
          execute: true,
          actor: "catalog-import",
          databaseId: "(default)",
          allowProductionWrite: true,
        }, {
          ...shared,
          confirmProject: async () => "IMPORT",
        })).rejects.toThrow(/already active/);
        secondWriteRefused = true;
      },
    });
    await expect(writer).rejects.toThrow();
    expect(secondWriteRefused).toBe(true);
    expect(grantDuringRead).toContain("catalog-importer@skatingx-prod.iam.gserviceaccount.com");
    expect(productionWriteIdentity()).toBeNull();
    if (previous === undefined) delete process.env.FIRESTORE_EMULATOR_HOST;
    else process.env.FIRESTORE_EMULATOR_HOST = previous;
  });
});

function fakeProductionDb() {
  const empty = { docs: [], empty: true, exists: false, data: () => undefined };
  const query = {
    get: async () => empty,
    listDocuments: async () => [],
  };
  return {
    _settings: { projectId: "skatingx-prod", databaseId: "(default)" },
    collection: () => query,
    doc: () => ({
      get: async () => empty,
      collection: () => query,
    }),
  };
}
