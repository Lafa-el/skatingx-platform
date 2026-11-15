import { afterEach, describe, expect, it, vi } from "vitest";

const created: Array<{ name?: string; options?: { projectId?: string } }> = [];

vi.mock("firebase-admin/app", () => ({
  initializeApp: (options: { projectId?: string }, name?: string) => {
    const app = { name, options };
    created.push(app);
    return app;
  },
  applicationDefault: () => {
    throw new Error("applicationDefault must not be called");
  },
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
import { countAuthUsers, credentialFromVerifiedAdc, openProductionFirestore } from "../../scripts/catalog/run-import.mjs";

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
    delete process.env.FIRESTORE_EMULATOR_HOST;
    const first = await openProductionFirestore(payload);
    const second = await openProductionFirestore(payload);
    expect(second).toBe(first);
    expect(created).toHaveLength(1);
    expect(created[0]?.name).toBe("catalog-run-import-production");
    expect(created[0]?.options?.projectId).toBe("skatingx-prod");
    const counted = await countAuthUsers(first);
    expect(counted).toEqual({ status: "available", count: 2 });
    const credential = credentialFromVerifiedAdc(payload);
    expect(JSON.stringify(credential)).not.toContain("synthetic-secret");
    process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
    await expect(openProductionFirestore(payload)).rejects.toThrow(/FIREBASE_AUTH_EMULATOR_HOST must be unset/);
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
});
