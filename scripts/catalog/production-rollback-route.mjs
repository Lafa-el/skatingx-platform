// Production-shaped rollback routing against the local emulator.
// The Firestore client is created while FIRESTORE_EMULATOR_HOST is set, then pinned.
// The process refuses to continue if that client is not an emulator endpoint.
import { register } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const here = path.dirname(fileURLToPath(import.meta.url));
await register(pathToFileURL(path.join(here, "typescript-loader.mjs")).href, { parentURL: import.meta.url });

const { rollbackImport } = await import("./import-core.mjs");
const { runImportEntry } = await import("./import-runner.mjs");

const mode = process.argv[2];
const runId = process.argv[3];
const emulatorProject = "demo-skatingx-import";
const host = process.env.FIRESTORE_EMULATOR_HOST ?? "";
const app = initializeApp({ projectId: emulatorProject }, `production-rollback-route-${process.pid}`);
const emulatorDb = getFirestore(app);

function pinnedProductionDb() {
  const settings = emulatorDb._settings ?? {};
  const pinned = `${settings.servicePath ?? ""}:${settings.port ?? ""}`;
  if (host === "" || settings.ssl !== false || pinned !== host) {
    throw new Error(`refusing test: Firestore client is not pinned to the emulator (${pinned})`);
  }
  delete process.env.FIRESTORE_EMULATOR_HOST;
  delete process.env.FIREBASE_AUTH_EMULATOR_HOST;
  return {
    _settings: {
      projectId: "skatingx-prod",
      databaseId: "(default)",
      servicePath: settings.servicePath,
      port: settings.port,
      ssl: false,
    },
    databaseId: "(default)",
    collection: (name) => emulatorDb.collection(name),
    doc: (docPath) => emulatorDb.doc(docPath),
    getAll: (...refs) => emulatorDb.getAll(...refs),
    batch: () => emulatorDb.batch(),
    runTransaction: (updateFunction, options) => emulatorDb.runTransaction(updateFunction, options),
  };
}

function productionDeps(db) {
  return {
    emulatorHost: "",
    openFirestore: async () => db,
    confirmProject: async () => "skatingx-prod",
    gitSha: () => "production-rollback-route",
    writeReport: () => {},
    credentialProvider: {
      source: "production-rollback-route",
      async describe() {
        return {
          type: "service_account",
          clientEmail: "catalog-importer@skatingx-prod.iam.gserviceaccount.com",
          projectId: "skatingx-prod",
        };
      },
    },
    countAuthUsers: async () => ({ status: "available", count: 1 }),
    countBusiness: async () => ({ status: "available", firestoreUsers: 1, raceResults: 1, videoMetadata: 0, raceVideos: 0 }),
  };
}

const productionRequest = {
  target: "production",
  project: "skatingx-prod",
  confirm: "skatingx-prod",
  actor: "catalog-import",
  databaseId: "(default)",
  runId,
  allowProductionWrite: true,
};

if (mode === "import") {
  const db = pinnedProductionDb();
  await runImportEntry({ ...productionRequest, mode: "initial", execute: true }, productionDeps(db));
  process.stdout.write(`${JSON.stringify({ imported: true })}\n`);
} else if (mode === "rollback") {
  const db = pinnedProductionDb();
  const outcome = await runImportEntry({
    ...productionRequest,
    mode: "initial",
    execute: false,
    rollback: true,
  }, productionDeps(db));
  process.stdout.write(`${JSON.stringify(outcome.publicReport)}\n`);
} else if (mode === "crash-snapshots") {
  try {
    await rollbackImport(emulatorDb, runId, { crashAfterSnapshots: 1 });
    throw new Error("snapshot crash did not fire");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("injected rollback crash after snapshots")) throw error;
    process.stdout.write(`${JSON.stringify({ crashed: "snapshots" })}\n`);
  }
} else if (mode === "resume") {
  const db = pinnedProductionDb();
  try {
    await runImportEntry({
      ...productionRequest,
      mode: "resume",
      execute: true,
    }, productionDeps(db));
    throw new Error("partial resume was accepted");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("resume refused")) throw error;
    process.stdout.write(`${JSON.stringify({ refused: true })}\n`);
  }
} else if (mode === "recover") {
  const db = pinnedProductionDb();
  const outcome = await runImportEntry({
    ...productionRequest,
    mode: "resume",
    execute: true,
    recoverLock: true,
    recoverReason: "holder crashed",
  }, productionDeps(db));
  process.stdout.write(`${JSON.stringify(outcome.publicReport)}\n`);
} else {
  throw new Error(`unknown production rollback route mode ${mode}`);
}
