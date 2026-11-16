// Real stdin confirmation chain for the production runner. The database is a local stub.
import { register } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
await register(pathToFileURL(path.join(here, "typescript-loader.mjs")).href, { parentURL: import.meta.url });

const { confirmProjectOnStdin, readLineFromStdin } = await import("./import-guard.mjs");
const { runImportEntry } = await import("./import-runner.mjs");

const mode = process.argv[2];
delete process.env.FIRESTORE_EMULATOR_HOST;
delete process.env.FIREBASE_AUTH_EMULATOR_HOST;

function emptySnap() {
  return { exists: false, data: () => undefined, docs: [], size: 0, ref: { path: "" } };
}

function presentSnap(data) {
  return {
    exists: true,
    data: () => data,
    docs: [],
    size: 1,
    updateTime: { toMillis: () => 5 },
    ref: { path: "lock" },
  };
}

const db = {
  _settings: { projectId: "skatingx-prod", databaseId: "(default)" },
  databaseId: "(default)",
  collection() {
    return { get: async () => emptySnap(), listDocuments: async () => [] };
  },
  doc(docPath) {
    return {
      path: docPath,
      get: async () => {
        if (mode === "initial" || mode === "rollback") return emptySnap();
        if (String(docPath).includes("trainingCatalogMigrations")) {
          return presentSnap({
            importedAt: "2026-11-15T00:00:00.000Z",
            actor: "catalog-import",
            operator: "catalog-import",
            serviceAccount: "catalog-importer@skatingx-prod.iam.gserviceaccount.com",
            status: "running",
            runId: "stdin-run",
          });
        }
        if (String(docPath).endsWith("__import_lock")) {
          return presentSnap({
            token: "held-token",
            status: "held",
            runId: "stdin-run",
            actor: "catalog-import",
            purpose: mode === "recover" ? "import" : "rollback",
          });
        }
        return emptySnap();
      },
    };
  },
  getAll() {
    return [];
  },
  async runTransaction() {
    throw new Error("confirmation-accepted");
  },
};

const writing = {
  target: "production",
  project: "skatingx-prod",
  confirm: "skatingx-prod",
  actor: "catalog-import",
  databaseId: "(default)",
  runId: "stdin-run",
  allowProductionWrite: true,
  execute: mode !== "rollback",
  rollback: mode === "rollback",
  mode: mode === "initial" || mode === "rollback" ? "initial" : "resume",
  recoverLock: mode === "recover",
  recoverReason: mode === "recover" ? "holder crashed" : "",
};

try {
  await runImportEntry(writing, {
    emulatorHost: "",
    now: () => new Date("2026-11-15T00:00:00.000Z"),
    gitSha: () => "stdin-chain",
    openFirestore: async () => db,
    confirmProject: (projectId) => confirmProjectOnStdin(projectId, readLineFromStdin),
    credentialProvider: {
      source: "stdin-chain",
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
  });
  process.stdout.write("confirmation-accepted\n");
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("confirmation was rejected")) {
    process.stderr.write(`${message}\n`);
    process.exit(2);
  }
  process.stdout.write("confirmation-accepted\n");
  process.stderr.write(`${message}\n`);
}
