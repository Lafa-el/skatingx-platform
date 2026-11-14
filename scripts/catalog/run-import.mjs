// Catalog import CLI. Emulator writes are allowed only for demo- projects.
// Production mode stops before opening Firestore.
import { execFileSync } from "node:child_process";
import { register } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
await register(pathToFileURL(path.join(here, "typescript-loader.mjs")).href, { parentURL: import.meta.url });

const { confirmProjectOnStdin, parseImportArgs, readLineFromStdin } = await import("./import-guard.mjs");
const { runImportEntry, unconfiguredCredentialProvider } = await import("./import-runner.mjs");

const rootDir = path.resolve(here, "../..");

function gitHead() {
  return execFileSync("git", ["rev-parse", "HEAD"], { cwd: rootDir, encoding: "utf8" }).trim();
}

async function openEmulatorFirestore(projectId, runId) {
  const { initializeApp } = await import("firebase-admin/app");
  const { getFirestore } = await import("firebase-admin/firestore");
  const app = initializeApp({ projectId }, `catalog-run-import-${runId}`);
  return getFirestore(app);
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
  }, {
    emulatorHost: process.env.FIRESTORE_EMULATOR_HOST,
    openFirestore: (projectId) => openEmulatorFirestore(projectId, args.runId),
    credentialProvider: unconfiguredCredentialProvider(),
    confirmProject: (projectId) => confirmProjectOnStdin(projectId, readLineFromStdin),
    gitSha: gitHead,
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
