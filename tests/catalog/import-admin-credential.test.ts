import { spawnSync } from "node:child_process";
import http from "node:http";
import https from "node:https";
import { mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { describe, expect, it } from "vitest";

import { assertBoundAdcUnchanged, bindVerifiedAdc, openProductionFirestore, productionClients, productionFirestore } from "../../scripts/catalog/run-import.mjs";

const rootDir = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");

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

describe("firebase-admin production credential", () => {
  it("constructs Firestore and Auth from application default credentials without a network request", async () => {
    const previousHost = process.env.FIRESTORE_EMULATOR_HOST;
    const previousAuth = process.env.FIREBASE_AUTH_EMULATOR_HOST;
    const previousAdc = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    const calls: string[] = [];
    const originalConnect = net.Socket.prototype.connect;
    const originalHttp = http.request;
    const originalHttps = https.request;
    net.Socket.prototype.connect = function connect(...args: unknown[]) {
      calls.push("socket");
      return originalConnect.apply(this, args as never);
    };
    http.request = ((...args: unknown[]) => {
      calls.push("http");
      return originalHttp.apply(http, args as never);
    }) as typeof http.request;
    https.request = ((...args: unknown[]) => {
      calls.push("https");
      return originalHttps.apply(https, args as never);
    }) as typeof https.request;
    delete process.env.FIRESTORE_EMULATOR_HOST;
    delete process.env.FIREBASE_AUTH_EMULATOR_HOST;
    try {
      const dir = mkdtempSync(path.join(tmpdir(), "skatingx-real-adc-"));
      const file = path.join(dir, "adc.json");
      writeFileSync(file, JSON.stringify(payload));
      delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
      const app = await openProductionFirestore(file);
      const firestore = await productionFirestore(app);
      const auth = getAuth(app);
      const clients = await productionClients(app);
      expect(firestore).toBeTruthy();
      expect(auth).toBeTruthy();
      expect(clients.firestore).toBe(firestore);
      expect(clients.auth).toBe(auth);
      expect(clients.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(clients.clientEmail).toBe("catalog-importer@skatingx-prod.iam.gserviceaccount.com");
      expect(calls).toEqual([]);
      const other = path.join(dir, "other.json");
      writeFileSync(other, JSON.stringify(payload));
      process.env.GOOGLE_APPLICATION_CREDENTIALS = other;
      expect(() => assertBoundAdcUnchanged()).toThrow(/GOOGLE_APPLICATION_CREDENTIALS does not point/);
      process.env.GOOGLE_APPLICATION_CREDENTIALS = file;
      writeFileSync(file, JSON.stringify({ ...payload, delegates: ["other@skatingx-prod.iam.gserviceaccount.com"] }));
      await expect(productionFirestore(app)).rejects.toThrow(/ADC file changed after verification/);
      const link = path.join(dir, "adc-link.json");
      symlinkSync(file, link);
      expect(() => bindVerifiedAdc(link)).toThrow(/ADC path is a symlink/);
    } finally {
      net.Socket.prototype.connect = originalConnect;
      http.request = originalHttp;
      https.request = originalHttps;
      if (previousHost === undefined) delete process.env.FIRESTORE_EMULATOR_HOST;
      else process.env.FIRESTORE_EMULATOR_HOST = previousHost;
      if (previousAuth === undefined) delete process.env.FIREBASE_AUTH_EMULATOR_HOST;
      else process.env.FIREBASE_AUTH_EMULATOR_HOST = previousAuth;
      if (previousAdc === undefined) delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
      else process.env.GOOGLE_APPLICATION_CREDENTIALS = previousAdc;
    }
  });

  it("binds a fixture ADC with an empty delegates array", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "skatingx-empty-delegates-"));
    const file = path.join(dir, "adc.json");
    writeFileSync(file, JSON.stringify({ ...payload, delegates: [] }));
    const child = spawnSync(process.execPath, [
      "--input-type=module",
      "-e",
      [
        "import { bindVerifiedAdc } from \"./scripts/catalog/run-import.mjs\";",
        "const bound = bindVerifiedAdc(process.argv[1]);",
        "if (!Array.isArray(bound.delegates) || bound.delegates.length !== 0) process.exit(2);",
      ].join("\n"),
      file,
    ], {
      cwd: rootDir,
      encoding: "utf8",
      env: { ...process.env, GOOGLE_APPLICATION_CREDENTIALS: file },
    });
    expect(child.status, child.stderr).toBe(0);
  });

  it("rejects a plain getAccessToken credential for Firestore", () => {
    const app = initializeApp({
      credential: {
        getAccessToken: async () => ({ access_token: "synthetic", expires_in: 3600 }),
      },
      projectId: "skatingx-prod",
    }, "plain-get-access-token");
    expect(() => getFirestore(app)).toThrow(expect.objectContaining({ code: "firestore/invalid-credential" }));
  });
});
