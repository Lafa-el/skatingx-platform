// Real stdin confirmation chain for the production runner. The database is a local stub.
import { register } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
await register(pathToFileURL(path.join(here, "typescript-loader.mjs")).href, { parentURL: import.meta.url });

const { confirmProjectOnStdin, readLineFromStdin } = await import("./import-guard.mjs");
const { buildImportPlan, runImportEntry } = await import("./import-runner.mjs");

const mode = process.argv[2];
delete process.env.FIRESTORE_EMULATOR_HOST;
delete process.env.FIREBASE_AUTH_EMULATOR_HOST;

const importedAt = "2026-11-15T00:00:00.000Z";
const plan = buildImportPlan(importedAt, "stdin-run");
const lockVersion = {
  marker: "stdin-lock-v1",
  isEqual(other) {
    return Boolean(other) && other.marker === "stdin-lock-v1";
  },
};

function emptySnap(docPath = "") {
  return { exists: false, data: () => undefined, docs: [], size: 0, empty: true, ref: { path: docPath } };
}

function presentSnap(data, docPath) {
  return {
    exists: true,
    data: () => data,
    docs: [],
    size: 1,
    updateTime: lockVersion,
    ref: { path: docPath },
  };
}

const migration = {
  runId: "stdin-run",
  actor: "catalog-import",
  operator: "catalog-import",
  serviceAccount: "catalog-importer@skatingx-prod.iam.gserviceaccount.com",
  importedAt,
  workbookSha256: plan.workbookSha256,
  planSummary: plan.planSummary,
  projectId: "skatingx-prod",
  databaseId: "(default)",
  status: "completed",
  committedObjectIds: [],
};

function snapFor(docPath) {
  if (mode === "initial") return emptySnap(docPath);
  if (String(docPath).endsWith("/stdin-run")) return presentSnap(migration, docPath);
  if (String(docPath).endsWith("__import_lock")) {
    return presentSnap({
      token: "held-token",
      status: mode === "recover" ? "held" : "released",
      runId: "stdin-run",
      actor: "catalog-import",
      purpose: "import",
    }, docPath);
  }
  return emptySnap(docPath);
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
      get: async () => snapFor(docPath),
      listCollections: async () => [],
      collection() {
        return { get: async () => emptySnap(docPath), listDocuments: async () => [] };
      },
    };
  },
  getAll() {
    return [];
  },
  async runTransaction() {
    throw new Error(`post-confirm checkpoint ${mode}`);
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

let confirmed = false;
try {
  await runImportEntry(writing, {
    emulatorHost: "",
    now: () => new Date("2026-11-15T00:00:00.000Z"),
    gitSha: () => "stdin-chain",
    openFirestore: async () => db,
    confirmProject: async (projectId) => {
      const value = await confirmProjectOnStdin(projectId, readLineFromStdin);
      confirmed = true;
      return value;
    },
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
  process.stderr.write("confirmation gate returned without its checkpoint\n");
  process.exit(1);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("confirmation was rejected")) {
    process.stderr.write(`${message}\n`);
    process.exit(2);
  }
  if (!confirmed || !message.includes(`post-confirm checkpoint ${mode}`)) {
    process.stderr.write(`${message}\n`);
    process.exit(1);
  }
  process.stdout.write("confirmation-accepted\n");
  process.stderr.write(`${message}\n`);
}
