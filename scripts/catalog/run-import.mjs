// Catalog import CLI. Emulator writes stay on demo- projects.
// Production reads and writes are separate switches and both default off.
// Production credentials come from impersonated ADC, never a long-lived JSON key.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { register } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
await register(pathToFileURL(path.join(here, "typescript-loader.mjs")).href, { parentURL: import.meta.url });

const { confirmProjectOnStdin, identityFromAdcPayload, parseImportArgs, readLineFromStdin } = await import("./import-guard.mjs");
const { runImportEntry, unconfiguredCredentialProvider } = await import("./import-runner.mjs");

const rootDir = path.resolve(here, "../..");

function gitHead() {
  return execFileSync("git", ["rev-parse", "HEAD"], { cwd: rootDir, encoding: "utf8" }).trim();
}

function adcCredentialProvider() {
  return {
    source: "adc",
    async describe() {
      const configured = process.env.GOOGLE_APPLICATION_CREDENTIALS;
      const file = configured && configured.trim() !== ""
        ? configured
        : path.join(os.homedir(), ".config", "gcloud", "application_default_credentials.json");
      let payload;
      try {
        payload = JSON.parse(readFileSync(file, "utf8"));
      } catch (error) {
        throw new Error("refusing to run: credential type is not service_account", { cause: error });
      }
      return identityFromAdcPayload(payload);
    },
  };
}

async function openEmulatorFirestore(projectId, runId) {
  const { initializeApp } = await import("firebase-admin/app");
  const { getFirestore } = await import("firebase-admin/firestore");
  const app = initializeApp({ projectId }, `catalog-run-import-${runId}`);
  return getFirestore(app);
}

async function openProductionFirestore(runId) {
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error("refusing to run: FIRESTORE_EMULATOR_HOST must be unset for production");
  }
  const { applicationDefault, initializeApp } = await import("firebase-admin/app");
  const { getFirestore } = await import("firebase-admin/firestore");
  const app = initializeApp({
    credential: applicationDefault(),
    projectId: "skatingx-prod",
  }, `catalog-run-import-${runId}`);
  return getFirestore(app);
}

async function countAuthUsers() {
  const { getAuth } = await import("firebase-admin/auth");
  let count = 0;
  let pageToken;
  do {
    const page = await getAuth().listUsers(1000, pageToken);
    count += page.users.length;
    pageToken = page.pageToken;
  } while (pageToken);
  return { status: "available", count };
}

async function main() {
  const args = parseImportArgs(process.argv.slice(2));
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
      ? () => openProductionFirestore(args.runId)
      : (projectId) => openEmulatorFirestore(projectId, args.runId),
    credentialProvider: args.target === "production" ? adcCredentialProvider() : unconfiguredCredentialProvider(),
    confirmProject: (projectId) => confirmProjectOnStdin(projectId, readLineFromStdin),
    gitSha: gitHead,
    countAuthUsers: args.target === "production" ? countAuthUsers : undefined,
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
