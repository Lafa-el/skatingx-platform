// Catalog import CLI. Emulator writes stay on demo- projects.
// Production reads and writes are separate switches and both default off.
// Production Firestore and Auth share one named app built from the verified ADC.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync } from "node:fs";
import { register } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
await register(pathToFileURL(path.join(here, "typescript-loader.mjs")).href, { parentURL: import.meta.url });

const { confirmProjectOnStdin, identityFromAdcPayload, parseImportArgs, readLineFromStdin } = await import("./import-guard.mjs");
const { runImportEntry, unconfiguredCredentialProvider } = await import("./import-runner.mjs");

const rootDir = path.resolve(here, "../..");
export const PRODUCTION_APP_NAME = "catalog-run-import-production";
let productionApp;
let boundAdc = null;

function adcDigest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function gitHead() {
  return execFileSync("git", ["rev-parse", "HEAD"], { cwd: rootDir, encoding: "utf8" }).trim();
}

function adcCredentialProvider() {
  return {
    source: "adc",
    async describe() {
      return identityFromAdcPayload(assertBoundAdcUnchanged());
    },
  };
}

export function bindVerifiedAdc(file) {
  let stat;
  try {
    stat = lstatSync(file);
  } catch (error) {
    throw new Error("refusing to run: credential type is not service_account", { cause: error });
  }
  if (stat.isSymbolicLink()) throw new Error("refusing to run: ADC path is a symlink");
  const resolved = path.resolve(file);
  const bytes = readFileSync(file);
  const digest = adcDigest(bytes);
  if (boundAdc && (boundAdc.file !== resolved || boundAdc.sha256 !== digest)) {
    throw new Error("refusing to run: ADC file changed after verification");
  }
  const payload = JSON.parse(bytes.toString("utf8"));
  identityFromAdcPayload(payload);
  const configured = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim() ?? "";
  if (configured !== "" && path.resolve(configured) !== resolved) {
    throw new Error("refusing to run: GOOGLE_APPLICATION_CREDENTIALS does not point at the verified ADC file");
  }
  process.env.GOOGLE_APPLICATION_CREDENTIALS = resolved;
  boundAdc = { file: resolved, sha256: digest, payload };
  return payload;
}

export function assertBoundAdcUnchanged() {
  if (!boundAdc) throw new Error("refusing to run: ADC file is not bound");
  const configured = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim() ?? "";
  if (configured === "" || path.resolve(configured) !== boundAdc.file) {
    throw new Error("refusing to run: GOOGLE_APPLICATION_CREDENTIALS does not point at the verified ADC file");
  }
  const stat = lstatSync(boundAdc.file);
  if (stat.isSymbolicLink()) throw new Error("refusing to run: ADC path is a symlink");
  const bytes = readFileSync(boundAdc.file);
  if (adcDigest(bytes) !== boundAdc.sha256) {
    throw new Error("refusing to run: ADC file changed after verification");
  }
  const payload = JSON.parse(bytes.toString("utf8"));
  identityFromAdcPayload(payload);
  return payload;
}

export async function productionClients(app) {
  const payload = assertBoundAdcUnchanged();
  const identity = identityFromAdcPayload(payload);
  const { getFirestore } = await import("firebase-admin/firestore");
  const { getAuth } = await import("firebase-admin/auth");
  return {
    firestore: getFirestore(app, "(default)"),
    auth: getAuth(app),
    sha256: boundAdc.sha256,
    clientEmail: identity.clientEmail,
  };
}

async function openEmulatorFirestore(projectId, runId) {
  const { initializeApp } = await import("firebase-admin/app");
  const { getFirestore } = await import("firebase-admin/firestore");
  const app = initializeApp({ projectId }, `catalog-run-import-${runId}`);
  return getFirestore(app);
}

export async function openProductionFirestore(adcFile) {
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error("refusing to run: FIRESTORE_EMULATOR_HOST must be unset for production");
  }
  if (process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    throw new Error("refusing to run: FIREBASE_AUTH_EMULATOR_HOST must be unset for production");
  }
  bindVerifiedAdc(adcFile);
  assertBoundAdcUnchanged();
  const { applicationDefault, initializeApp } = await import("firebase-admin/app");
  if (!productionApp) {
    productionApp = initializeApp({
      credential: applicationDefault(),
      projectId: "skatingx-prod",
    }, PRODUCTION_APP_NAME);
  }
  return productionApp;
}

export async function productionFirestore(app) {
  return (await productionClients(app)).firestore;
}

export async function countAuthUsers(app) {
  if (!app) throw new Error("refusing to run: Firebase Auth user count is unavailable");
  const clients = await productionClients(app);
  let count = 0;
  let pageToken;
  do {
    const page = await clients.auth.listUsers(1000, pageToken);
    count += page.users.length;
    pageToken = page.pageToken;
  } while (pageToken);
  return { status: "available", count };
}

async function main() {
  const args = parseImportArgs(process.argv.slice(2));
  const adcFile = args.target === "production"
    ? (process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim()
      || path.join(os.homedir(), ".config", "gcloud", "application_default_credentials.json"))
    : "";
  let app;
  if (args.target === "production") bindVerifiedAdc(adcFile);
  await runImportEntry({
    mode: args.mode,
    runId: args.runId,
    execute: args.execute,
    target: args.target,
    project: args.project,
    confirm: args.confirm,
    actor: args.actor,
    databaseId: "(default)",
    allowProductionRead: args.allowProductionRead,
    allowProductionWrite: args.allowProductionWrite,
    rollback: args.rollback,
    recoverLock: args.recoverLock,
    recoverReason: args.recoverReason,
  }, {
    emulatorHost: process.env.FIRESTORE_EMULATOR_HOST,
    openFirestore: args.target === "production"
      ? async () => {
          app = await openProductionFirestore(adcFile);
          const clients = await productionClients(app);
          return clients.firestore;
        }
      : (projectId) => openEmulatorFirestore(projectId, args.runId),
    credentialProvider: args.target === "production" ? adcCredentialProvider() : unconfiguredCredentialProvider(),
    confirmProject: (projectId) => confirmProjectOnStdin(projectId, readLineFromStdin),
    gitSha: gitHead,
    countAuthUsers: args.target === "production" ? () => countAuthUsers(app) : undefined,
  });
}

const invoked = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (invoked) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
