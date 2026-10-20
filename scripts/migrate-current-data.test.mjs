import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import { assertFails, assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { Timestamp, doc, setDoc } from "firebase/firestore";

import {
  BLOCKED_PROJECTS,
  EMULATOR_PROJECT,
  MigrationStop,
  parseArgs,
  planCopy,
  run,
  skipReason,
} from "./migrate-current-data.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const script = path.join(root, "scripts", "migrate-current-data.mjs");
const uid = "alice";
const base = `artifacts/skatingx-production/users/${uid}`;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function stops(label, fn) {
  try {
    fn();
  } catch (error) {
    assert(error instanceof MigrationStop, `${label} did not stop the migration`);
    return error.message;
  }
  throw new Error(`${label} did not stop`);
}

function cli(args, env = {}) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: root,
    env: { ...process.env, ...env },
    encoding: "utf8",
  });
}

function source() {
  const createdAt = Timestamp.fromDate(new Date("2026-10-19T12:00:00.000Z"));
  return {
    documents: [
      { path: `${base}/settings/main`, data: { locale: "zh" } },
      { path: `${base}/athletes/lindsay/training/state`, data: { focus: "lean" } },
      {
        path: `${base}/raceDay/test-event`,
        data: {
          eventId: "test-event",
          name: "Test Championships",
          dates: ["2026-10-24"],
          timeZone: "America/New_York",
          venue: null,
          verification: "pending",
          source: "manual",
          sourceNote: "fixture",
          verifiedAt: null,
          schemaVersion: 1,
          createdAt,
          updatedAt: createdAt,
        },
      },
      { path: `${base}/athletes/lindsay/equipment/main/records/abcdefghij1234567890`, data: { id: "kept-out" } },
      { path: `${base}/athletes/lindsay/planning/main/completedTasks/jd_tech_mon`, data: { points: 30 } },
      { path: `${base}/migrationBackups/analysis-profile`, data: { points: 40, mergedIntoTrainingPoints: false } },
    ],
  };
}

async function rulesAcceptTheCopy(plan) {
  const env = await initializeTestEnvironment({
    projectId: EMULATOR_PROJECT,
    firestore: { rules: readFileSync(path.join(root, "firestore.rules"), "utf8") },
  });
  try {
    await env.clearFirestore();
    const owner = env.authenticatedContext(uid).firestore();
    for (const item of plan.actions) {
      await assertSucceeds(setDoc(doc(owner, item.path), item.data));
      await assertSucceeds(setDoc(doc(owner, item.path), item.data));
    }
    const stranger = env.authenticatedContext("bob").firestore();
    const settings = plan.actions.find((item) => item.path.endsWith("/settings/main"));
    await assertFails(setDoc(doc(stranger, settings.path), settings.data));
    const event = plan.actions.find((item) => item.path.endsWith("/raceDay/test-event"));
    await assertFails(setDoc(doc(owner, event.path), { ...event.data, extra: true }));
  } finally {
    await env.cleanup();
  }
}

const fixture = source();
const plan = planCopy(fixture);
assert(plan.counts.copy === 3, "copy count");
assert(plan.counts.skipped === 3, "skip count");
assert(plan.counts.humanReview === 3, "skipped data was not flagged");
assert(plan.counts.inventory.settings === 1, "settings inventory");
assert(plan.counts.inventory.raceDay === 1, "race day inventory");
assert(plan.counts.inventory["athletes/training"] === 1, "training inventory");
assert(plan.actions.every((item) => item.data === fixture.documents.find((doc) => doc.path === item.path).data), "copy changed the fields");
assert(!plan.actions.some((item) => skipReason(item.path)), "a skipped path was copied");
assert(plan.humanReview.map((item) => item.reason).sort().join() === "analysis-profile-backup,equipment-history,planning-check-in", "review reasons");
const again = planCopy(fixture);
assert(again.actions.map((item) => item.path).join("\n") === plan.actions.map((item) => item.path).join("\n"), "rerun changed paths");

stops("duplicate path", () => planCopy({ documents: [fixture.documents[0], fixture.documents[0]] }));
stops("outside root", () => planCopy({ documents: [{ path: "other/settings/main", data: { locale: "zh" } }] }));
const missingConfirm = stops("production without confirm", () =>
  parseArgs(["--target", "production", "--project", "skatingx-prod", "--write"]),
);
assert(missingConfirm.includes("--confirm-production"), "missing production confirm was not named");
const opened = parseArgs(["--target", "production", "--project", "skatingx-prod", "--write", "--confirm-production"]);
assert(opened.write && opened.target === "production" && opened.project === "skatingx-prod", "production gate did not open");
stops("path prefix project", () => parseArgs(["--target", "production", "--project", "skatingx-production", "--write", "--confirm-production"]));
stops("source project as target", () => parseArgs(["--target", "production", "--project", "skatingx-platform", "--write", "--confirm-production"]));
assert(BLOCKED_PROJECTS.has("skatingx-production") && BLOCKED_PROJECTS.has("skatingx-platform"), "block list");
assert(!BLOCKED_PROJECTS.has("skatingx-prod"), "production project stayed blocked");

const fixtureDir = mkdtempSync(path.join(tmpdir(), "m6-current-data-"));
const fixtureFile = path.join(fixtureDir, "source.json");
writeFileSync(fixtureFile, JSON.stringify({ documents: [{ path: `${base}/settings/main`, data: { locale: "zh" } }] }));

const refused = cli(["--fixture", fixtureFile, "--target", "production", "--project", "skatingx-prod", "--write"], {
  GOOGLE_APPLICATION_CREDENTIALS: "",
  TARGET_GOOGLE_APPLICATION_CREDENTIALS: "",
});
assert(refused.status === 1, "production write without confirm was allowed");
assert(refused.stderr.includes("--confirm-production"), "CLI did not name the missing confirm flag");

const backupInRepo = path.join(root, "m6-current-backup.json");
const refusedBackup = cli(["--fixture", fixtureFile, "--backup-target", backupInRepo], {
  GOOGLE_APPLICATION_CREDENTIALS: "",
  TARGET_GOOGLE_APPLICATION_CREDENTIALS: "",
});
assert(refusedBackup.status === 1, "a backup path inside the repo was accepted");
assert(refusedBackup.stderr.includes("--backup-target"), "inside-repo backup path was not named");
assert(refusedBackup.stderr.includes("repository"), "inside-repo backup path was not explained");
assert(!existsSync(backupInRepo), "an in-repo backup file was written");

const backupFile = path.join(fixtureDir, "target-backup.json");
let writeCalls = 0;
const lines = [];
const originalLog = console.log;
console.log = (...items) => lines.push(items.join(" "));
try {
  await run(
    ["--fixture", fixtureFile, "--backup-target", backupFile, "--write"],
    { GOOGLE_APPLICATION_CREDENTIALS: "", TARGET_GOOGLE_APPLICATION_CREDENTIALS: "" },
    {
      readTargetDoc: async () => ({ exists: false, data: null }),
      writePlan: () => {
        writeCalls += 1;
      },
    },
  );
} finally {
  console.log = originalLog;
}
assert(writeCalls === 0, "backup-target wrote documents");
assert(lines.some((line) => line.includes("no documents written")), "backup-target did not report that it wrote nothing");
assert(!lines.some((line) => line.includes("recount matches")), "backup-target reported a write");
const saved = JSON.parse(readFileSync(backupFile, "utf8"));
assert(saved.length === 1 && saved[0].exists === false && saved[0].data === null, "backup record");

await rulesAcceptTheCopy(plan);
console.log("[test:migration] current-data copy, skip report, production gate, and emulator rules passed");
