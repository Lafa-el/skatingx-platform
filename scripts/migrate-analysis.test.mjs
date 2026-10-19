import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import { assertFails, assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc } from "firebase/firestore";

import {
  BLOCKED_PROJECTS,
  MigrationStop,
  EMULATOR_PROJECT,
  mapCheckIn,
  mapEquipment,
  parseArgs,
  planMigration,
  run,
} from "./migrate-analysis.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const script = path.join(root, "scripts", "migrate-analysis.mjs");

const createdAt = "2026-03-01T15:04:05.000Z";

function source() {
  return {
    users: [
      {
        uid: "alice",
        profile: { name: "Example", birthDate: "2015-01-14", points: 40 },
        equipmentRecords: [
          {
            id: "AbCdefghij1234567890",
            symptomKey: "bootout",
            symptomText: "synthetic bite",
            height: "140",
            weight: "32",
            bladeLength: "15",
            leftRockerReadings: [{ point: 0, value: "20" }],
            rightRockerReadings: [{ point: 0, value: "20" }],
            offsets: { leftFront: "内2mm", leftRear: "内2mm", rightFront: "内2mm", rightRear: "内2mm" },
            bend: { front: "18", middle: "22", rear: "20" },
            adjustmentType: "记录未调整",
            feedbackRating: "未上冰验证",
            adjustmentNotes: "",
            missingCore: false,
            ruleHints: ["synthetic hint"],
            createdAt,
          },
        ],
        completedTasks: [{ id: "jd_tech_mon", taskId: "jd_tech_mon", points: 30, createdAt }],
      },
    ],
  };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function countsMatch(plan, fixture) {
  const user = fixture.users[0];
  assert(plan.counts.users === 1, "user count");
  assert(plan.counts.equipment === user.equipmentRecords.length, "equipment count");
  assert(plan.counts.checkIns === user.completedTasks.length, "check-in count");
  assert(plan.counts.profileBackups === 1, "profile backup count");
  assert(plan.counts.gamificationWrites === 0, "training points were not planned");
}

function mappingHolds(plan) {
  const equipment = plan.actions.find((item) => item.kind === "equipment");
  const checkIn = plan.actions.find((item) => item.kind === "checkIn");
  const backup = plan.actions.find((item) => item.kind === "profileBackup");
  assert(equipment.data.id === "abcdefghij1234567890", "equipment id was not normalized");
  assert(equipment.data.symptomKey === "boot-out", "bootout was not mapped");
  assert(equipment.data.adjustmentType === "unchanged", "adjustment label was not mapped");
  assert(equipment.data.feedbackRating === "not-skated", "feedback label was not mapped");
  assert(equipment.data.findings[0].code === "equipment.symptom.boot-out", "finding code");
  assert(equipment.path.endsWith("/athletes/lindsay/equipment/main/records/abcdefghij1234567890"), "equipment path");
  assert(equipment.path.split("/").length === 10, "equipment path is not 10 segments");
  assert(checkIn.data.taskId === "jd_tech_mon" && checkIn.data.points === 30 && checkIn.data.focus === "lean", "check-in");
  assert(checkIn.path.split("/").length === 10, "check-in path is not 10 segments");
  assert(backup.data.points === 40 && backup.data.mergedIntoTrainingPoints === false, "profile points");
  assert(backup.path.endsWith("/migrationBackups/analysis-profile"), "backup path");
  assert(!plan.actions.some((item) => item.path.includes("/gamification/")), "gamification path present");
}

function idempotent(fixture) {
  const first = planMigration(fixture);
  const second = planMigration(fixture);
  assert(
    first.actions.map((item) => item.path).join("\n") === second.actions.map((item) => item.path).join("\n"),
    "rerun changed document ids",
  );
}

function stops(label, fn) {
  try {
    fn();
  } catch (error) {
    assert(error instanceof MigrationStop, `${label} did not stop the migration`);
    return;
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

async function rulesAcceptThePlan(plan) {
  const env = await initializeTestEnvironment({
    projectId: EMULATOR_PROJECT,
    firestore: { rules: readFileSync(path.join(root, "firestore.rules"), "utf8") },
  });
  try {
    await env.clearFirestore();
    const owner = env.authenticatedContext("alice").firestore();
    for (const item of plan.actions) {
      await assertSucceeds(setDoc(doc(owner, item.path), item.data));
      await assertSucceeds(setDoc(doc(owner, item.path), item.data));
      await assertSucceeds(getDoc(doc(owner, item.path)));
    }
    const stranger = env.authenticatedContext("bob").firestore();
    const equipment = plan.actions.find((item) => item.kind === "equipment");
    await assertFails(setDoc(doc(stranger, equipment.path), equipment.data));
    const broken = { ...equipment.data, extra: true };
    await assertFails(setDoc(doc(owner, equipment.path), broken));
    const gamification = doc(owner, "artifacts/skatingx-production/users/alice/athletes/lindsay/gamification/main");
    const before = await getDoc(gamification);
    assert(!before.exists(), "the plan created a training balance");
  } finally {
    await env.cleanup();
  }
}

const fixture = source();
const plan = planMigration(fixture);
countsMatch(plan, fixture);
mappingHolds(plan);
idempotent(fixture);
assert(mapEquipment("alice", "AbC", fixture.users[0].equipmentRecords[0]).id === "abc", "short id");
assert(mapCheckIn("alice", "jd_speed_mon", { taskId: "jd_speed_mon", points: 35, createdAt }).focus === "bounce", "speed focus");

stops("unknown symptom", () =>
  planMigration({
    users: [
      {
        uid: "alice",
        equipmentRecords: [{ ...fixture.users[0].equipmentRecords[0], symptomKey: "mystery" }],
        completedTasks: [],
      },
    ],
  }),
);
stops("id collision", () =>
  planMigration({
    users: [
      {
        uid: "alice",
        equipmentRecords: [
          { ...fixture.users[0].equipmentRecords[0], id: "Ab" },
          { ...fixture.users[0].equipmentRecords[0], id: "ab" },
        ],
        completedTasks: [],
      },
    ],
  }),
);
stops("production target", () => parseArgs(["--target", "production", "--write"]));
stops("production without confirm", () =>
  parseArgs(["--target", "production", "--write", "--project", "skatingx-prod"]),
);
stops("production fixture", () =>
  parseArgs([
    "--target",
    "production",
    "--write",
    "--project",
    "skatingx-prod",
    "--confirm-production",
    "--fixture",
    "source.json",
  ]),
);
stops("prod project", () => parseArgs(["--target", "staging", "--project", "skatingx-prod", "--write", "--confirm-staging"]));
stops("path prefix project", () =>
  parseArgs(["--target", "production", "--write", "--project", "skatingx-production", "--confirm-production"]),
);
const opened = parseArgs(["--target", "production", "--write", "--project", "skatingx-prod", "--confirm-production"]);
assert(opened.write && opened.confirmProduction, "production gate did not open");
assert(opened.target === "production" && opened.project === "skatingx-prod", "production project was not accepted");
assert(!BLOCKED_PROJECTS.has("skatingx-prod"), "skatingx-prod is still blocked");
assert(BLOCKED_PROJECTS.has("skatingx-production"), "path prefix is no longer blocked");

const dry = cli(["--dry-run", "--fixture", path.join(root, "scripts", "migrate-analysis.test.mjs")]);
assert(dry.status !== 0, "a non-fixture file was accepted");

const refused = cli(["--target", "production", "--write", "--project", "skatingx-prod"]);
assert(refused.status === 1, "production without confirmation was allowed");
assert(refused.stderr.includes("--confirm-production"), "missing production confirmation was not named");

const missingKey = cli(["--dry-run"], { GOOGLE_APPLICATION_CREDENTIALS: "" });
assert(missingKey.status === 1, "live read without a key was allowed");
assert(missingKey.stderr.includes("GOOGLE_APPLICATION_CREDENTIALS"), "missing key was not explained");

const fixtureDir = mkdtempSync(path.join(tmpdir(), "m6-target-credential-"));
const fixtureFile = path.join(fixtureDir, "source.json");
writeFileSync(fixtureFile, JSON.stringify(source()));
const stagingWrite = [
  "--write",
  "--target",
  "staging",
  "--project",
  "skatingx-platform",
  "--confirm-staging",
  "--fixture",
  fixtureFile,
];

const dryWithoutWriter = cli(["--dry-run", "--fixture", fixtureFile], {
  TARGET_GOOGLE_APPLICATION_CREDENTIALS: "",
});
assert(dryWithoutWriter.status === 0, `dry-run required a target key: ${dryWithoutWriter.stderr}`);
assert(dryWithoutWriter.stdout.includes("dry-run: no documents written"), "dry-run did not finish without writing");

const missingTarget = cli(stagingWrite, { TARGET_GOOGLE_APPLICATION_CREDENTIALS: "" });
assert(missingTarget.status === 1, "write without a target key was allowed");
assert(missingTarget.stderr.includes("TARGET_GOOGLE_APPLICATION_CREDENTIALS"), "missing target key was not explained");
assert(!missingTarget.stdout.includes("recount matches"), "missing target key still wrote");

const writerInRepo = cli(stagingWrite, { TARGET_GOOGLE_APPLICATION_CREDENTIALS: script });
assert(writerInRepo.status === 1, "a target key inside the repo was accepted");
assert(writerInRepo.stderr.includes("TARGET_GOOGLE_APPLICATION_CREDENTIALS"), "inside-repo target key was not named");
assert(writerInRepo.stderr.includes("repository"), "inside-repo target key was not explained");

const backupInRepo = path.join(root, "m6-staging-backup.json");
const refusedBackup = cli(["--fixture", fixtureFile, "--backup-target", backupInRepo], {
  TARGET_GOOGLE_APPLICATION_CREDENTIALS: "",
  GOOGLE_APPLICATION_CREDENTIALS: "",
});
assert(refusedBackup.status === 1, "a backup path inside the repo was accepted");
assert(refusedBackup.stderr.includes("--backup-target"), "inside-repo backup path was not named");
assert(refusedBackup.stderr.includes("repository"), "inside-repo backup path was not explained");
assert(!existsSync(backupInRepo), "an in-repo backup file was written");

const backupProd = cli(["--backup-target", path.join(fixtureDir, "unused.json"), "--target", "production"]);
assert(backupProd.status === 1, "production without confirmation was allowed");
assert(backupProd.stderr.includes("--confirm-production"), "production backup skipped the confirmation");

const backupFile = path.join(fixtureDir, "staging-backup.json");
let writeCalls = 0;
const lines = [];
const originalLog = console.log;
console.log = (...items) => lines.push(items.join(" "));
try {
  await run(
    ["--fixture", fixtureFile, "--backup-target", backupFile, "--write"],
    { TARGET_GOOGLE_APPLICATION_CREDENTIALS: "", GOOGLE_APPLICATION_CREDENTIALS: "" },
    {
      readTargetDoc: async (docPath) => ({ path: docPath, exists: docPath.endsWith("analysis-profile"), data: { points: 3 } }),
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
assert(!lines.some((line) => line.includes("recount matches")), "backup-target reported a write recount");
const saved = JSON.parse(readFileSync(backupFile, "utf8"));
assert(Array.isArray(saved) && saved.length === plan.actions.length, "backup record count");
assert(saved.every((row) => row.path && Object.hasOwn(row, "exists") && Object.hasOwn(row, "data")), "backup record shape");
const profileRow = saved.find((row) => row.path.endsWith("/migrationBackups/analysis-profile"));
assert(profileRow.exists === true && profileRow.data.points === 3, "existing staging document was not stored");
assert(saved.some((row) => row.exists === false && row.data === null), "missing staging document was not stored");

await rulesAcceptThePlan(plan);
console.log("[test:migration] dry-run, idempotency, field mapping, and emulator rules passed");
