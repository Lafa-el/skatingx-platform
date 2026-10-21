import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { register } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc } from "firebase/firestore";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

import { buildMigrationPlan, createEmptyTargetState } from "./training-map.mjs";
import {
  EMULATOR_PROJECT,
  MigrationStop,
  SOURCE_PROJECT,
  STAGING_PROJECT,
  TARGET_UID,
  assertStagingEnvironment,
  assertWriterCredential,
  formatTargetState,
  parseArgs,
  run,
} from "./migrate-training.mjs";

register(new URL("./resolve-typescript.mjs", import.meta.url), {
  parentURL: import.meta.url,
});

const domain = await import("@skatingx/skating-domain");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const script = path.join(root, "scripts", "migration", "migrate-training.mjs");
const executionDate = "2024-05-03";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function entry(date, time) {
  return { date, time };
}

function withName(doc) {
  return { ...doc, username: "Lindsay" };
}

const lindsayDoc = withName({
  tasks: [],
  taskHistory: {},
  completedDays: [],
  records: [entry("2024-01-01", 40), entry("2024-02-01", 41), entry("2024-03-01", 42)],
  records777: [entry("2024-01-02", 50)],
  records1000: [entry("2024-01-03", 60)],
  records1500: [entry("2024-01-04", 70)],
  recordsStart: [entry("2024-01-05", 10)],
  recordsLap: [entry("2024-01-06", 20)],
  races: [1, 2, 3, 4, 5, 6].map((id) => ({ id, name: `meet-${id}`, date: `2024-06-0${id}` })),
  customRewards: [{ id: 1, name: "snack", cost: 200, icon: "x" }],
  points: 5,
  pointsPerTask: 10,
  dailyBonusPoints: 20,
  parentPin: "9999",
  avatar: "data:image/png;base64,AAAA",
  isPro: true,
  lastLoginDate: "2024-04-01",
  weeklyTemplate: { 0: "rest", 1: "ice", 2: "sprint", 3: "tempo", 4: "tech", 5: "interval", 6: "long" },
});

const taskDoc = withName({
  tasks: [
    { id: 15, text: "first", completed: false },
    { id: "15", text: "second", completed: true, target: "3x", desc: "how", isTemplate: true },
  ],
  taskHistory: { "2024-05-01": [{ id: 7, text: "archived", completed: false }] },
  completedDays: ["2024-05-02", "2024-05-01"],
  points: 30,
  lastLoginDate: "2024-05-02",
});

const goalDoc = withName({
  competitionGoalsV1: [{ id: "goal_1", title: "city" }],
  trainingPlansV1: [{ id: "plan_1", title: "week", goalId: "goal_1" }],
  activeTrainingPlanId: "plan_1",
  races: [{ id: 9, name: "final", date: "2024-07-01" }],
});

const customDoc = withName({
  records: [entry("2024-01-01", 10)],
  records_500m: [entry("2024-01-02", 11)],
  records_IceDay: [entry("2024-01-03", 12)],
  pointsPerTask: 15,
  dailyBonusPoints: 20,
});

function cli(args, env = {}) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: root,
    env: { ...process.env, GOOGLE_APPLICATION_CREDENTIALS: "", ...env },
    encoding: "utf8",
  });
}

function baseArgs(fixturePath, extra = []) {
  return [
    "--target",
    "emulator",
    "--fixture",
    fixturePath,
    "--source-uid",
    "fixture-source",
    "--target-uid",
    TARGET_UID,
    "--execution-date",
    executionDate,
    ...extra,
  ];
}

function summaryLine(stdout) {
  const line = stdout.split("\n").find((item) => item.startsWith("plan-summary "));
  assert(line, "plan summary was not printed");
  return line;
}

function kindCounts(line) {
  const match = line.match(/kinds=(\S+)/);
  assert(match, "kind counts were not printed");
  return Object.fromEntries(match[1].split(",").map((part) => {
    const [kind, count] = part.split(":");
    return [kind, Number(count)];
  }));
}

function added(line, name) {
  const match = line.match(new RegExp(`${name}=(\\d+)`));
  assert(match, `${name} was not printed`);
  return Number(match[1]);
}

function redKeys(value, found = []) {
  if (Array.isArray(value)) {
    value.forEach((item) => redKeys(item, found));
    return found;
  }
  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      if (key === "parentPin" || key === "avatar" || key === "isPro") found.push(key);
      redKeys(item, found);
    }
  }
  return found;
}

function stops(label, fn) {
  try {
    fn();
  } catch (error) {
    assert(error instanceof MigrationStop, `${label} did not stop`);
    return error;
  }
  throw new Error(`${label} did not stop`);
}

const sourceText = readFileSync(script, "utf8");
const sourceStart = sourceText.indexOf("export async function readSourceProfile");
const sourceEnd = sourceText.indexOf("function jsonSafe");
const sourceReader = sourceText.slice(sourceStart, sourceEnd);
assert(sourceStart >= 0 && sourceEnd > sourceStart, "source reader was not found");
assert(sourceReader.includes(".get("), "source reader does not read");
assert(!/\.(set|update|delete|create)\s*\(/.test(sourceReader), "source reader writes");
assert(sourceReader.includes("SOURCE_PROJECT"), "source reader lost its project");
assert(sourceText.includes(`export const SOURCE_PROJECT = "${SOURCE_PROJECT}"`), "source project id");
assert(!sourceText.includes('"skatingx-prod"'), "production project id is present");
assert(STAGING_PROJECT === "skatingx-platform", "staging project");
assert(sourceText.includes(`export const STAGING_PROJECT = "${STAGING_PROJECT}"`), "staging project is not fixed");
assert(sourceText.includes("projectId: STAGING_PROJECT"), "staging client does not use the fixed project");
assert(sourceText.includes("does not read Firebase Auth"), "identity chain comment is missing");

const wrongUid = stops("wrong target uid", () =>
  parseArgs(["--target", "emulator", "--source-uid", "fixture-source", "--target-uid", "someone-else", "--execution-date", executionDate]),
);
assert(!wrongUid.message.includes("someone-else"), "rejected target uid was echoed");

const stagingDryRun = parseArgs(["--target", "staging", "--source-uid", "fixture-source", "--target-uid", TARGET_UID, "--execution-date", executionDate]);
assert(stagingDryRun.target === "staging" && stagingDryRun.write === false, "staging dry-run did not parse");
const stagingWrite = stops("staging write", () =>
  parseArgs(["--target", "staging", "--write", "--source-uid", "fixture-source", "--target-uid", TARGET_UID, "--execution-date", executionDate, "--snapshot-out", "/tmp/m5-snapshot.json"]),
);
assert(stagingWrite.message.includes("not authorized"), "staging write refusal was not explained");
stops("production", () => parseArgs(["--target", "production", "--write", "--source-uid", "fixture-source", "--target-uid", TARGET_UID, "--execution-date", executionDate, "--snapshot-out", "/tmp/m4-snapshot.json"]));
stops("project flag", () => parseArgs(["--project", "skatingx-prod", "--target", "staging", "--source-uid", "fixture-source", "--target-uid", TARGET_UID, "--execution-date", executionDate]));
const emulatorHost = stops("emulator host", () => assertStagingEnvironment({ FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080" }));
assert(emulatorHost.message.includes("FIRESTORE_EMULATOR_HOST"), "emulator conflict was not explained");
const writerInside = stops("writer key", () => assertWriterCredential({ TARGET_GOOGLE_APPLICATION_CREDENTIALS: script }));
assert(writerInside.message.includes("repository"), "inside-repo writer key was not explained");
const stateLine = formatTargetState(
  { points: 5, tasks: [{ text: "secret-task" }] },
  createEmptyTargetState(TARGET_UID, "lindsay"),
);
assert(stateLine === "target-state legacyPoints=5 points=0 records=none weeklyTemplate=empty", "target state summary");
assert(!stateLine.includes("secret-task"), "target state summary included task text");

const gateDir = mkdtempSync(path.join(tmpdir(), "training-m4-"));
const gateFixture = path.join(gateDir, "profile.json");
writeFileSync(gateFixture, JSON.stringify(lindsayDoc));
const gateSnapshot = path.join(gateDir, "snapshot.json");

const staging = cli(["--target", "staging", "--write", "--fixture", gateFixture, "--source-uid", "fixture-source", "--target-uid", TARGET_UID, "--execution-date", executionDate, "--snapshot-out", gateSnapshot]);
assert(staging.status === 1, "staging write was allowed");
assert(staging.stderr.includes("not authorized"), "staging write refusal was not explained");
assert(!staging.stdout.includes("wrote"), "staging write still wrote");
assert(!existsSync(gateSnapshot), "staging write created a snapshot");
assert(!staging.stderr.includes("cause"), "staging error printed a cause");

const stagingEmulator = cli(["--target", "staging", "--fixture", gateFixture, "--source-uid", "fixture-source", "--target-uid", TARGET_UID, "--execution-date", executionDate], {
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080",
});
assert(stagingEmulator.status === 1, "staging with the emulator host was allowed");
assert(stagingEmulator.stderr.includes("FIRESTORE_EMULATOR_HOST"), "emulator conflict was not named");
assert(!stagingEmulator.stdout.includes("dry-run: no documents written"), "emulator conflict still finished a dry-run");
assert(!stagingEmulator.stdout.includes("wrote"), "emulator conflict wrote documents");

const production = cli(["--target", "production", "--write", "--fixture", gateFixture, "--source-uid", "fixture-source", "--target-uid", TARGET_UID, "--execution-date", executionDate, "--snapshot-out", gateSnapshot]);
assert(production.status === 1, "production write was allowed");
assert(production.stderr.includes("not authorized"), "production refusal was not explained");
assert(!existsSync(gateSnapshot), "production refusal wrote a snapshot");

const insideKey = cli(baseArgs(gateFixture), { GOOGLE_APPLICATION_CREDENTIALS: script });
assert(insideKey.status === 1, "a key inside the repo was accepted");
assert(insideKey.stderr.includes("repository"), "inside-repo key was not explained");

const missingSnapshot = cli([...baseArgs(gateFixture), "--write"]);
assert(missingSnapshot.status === 1, "write without a snapshot path was allowed");
assert(missingSnapshot.stderr.includes("--snapshot-out"), "missing snapshot path was not named");

const insideSnapshot = path.join(root, "m4-training-snapshot.json");
const refusedSnapshot = cli([...baseArgs(gateFixture), "--write", "--snapshot-out", insideSnapshot]);
assert(refusedSnapshot.status === 1, "a snapshot inside the repo was accepted");
assert(!existsSync(insideSnapshot), "an in-repo snapshot was written");

const mismatchFile = path.join(gateDir, "mismatch.json");
writeFileSync(mismatchFile, JSON.stringify({ ...lindsayDoc, username: "Fixture" }));
const mismatch = cli([...baseArgs(mismatchFile), "--write", "--snapshot-out", gateSnapshot]);
assert(mismatch.status === 1, "username mismatch was accepted");
assert(mismatch.stderr.includes("username"), "username mismatch was not explained");
assert(!mismatch.stderr.includes("Fixture"), "rejected username was echoed");
assert(!mismatch.stdout.includes("Fixture"), "rejected username was printed");
assert(!existsSync(gateSnapshot), "username mismatch wrote a snapshot");

const unknownFile = path.join(gateDir, "unknown.json");
writeFileSync(unknownFile, JSON.stringify({ username: "Lindsay", mystery: true }));
const unknown = cli([...baseArgs(unknownFile), "--write", "--snapshot-out", gateSnapshot]);
assert(unknown.status === 1, "unknown key was accepted");
assert(unknown.stderr.includes("mystery"), "unknown key was not named");
assert(!existsSync(gateSnapshot), "unknown key wrote a snapshot");

const live = cli(["--target", "emulator", "--source-uid", "fixture-source", "--target-uid", TARGET_UID, "--execution-date", executionDate], {
  GOOGLE_APPLICATION_CREDENTIALS: "",
});
assert(live.status === 1, "live read without a key was allowed");
assert(live.stderr.includes("GOOGLE_APPLICATION_CREDENTIALS"), "missing key was not explained");

const events = [];
const orderFixture = path.join(gateDir, "order.json");
writeFileSync(orderFixture, JSON.stringify({ username: "Lindsay", points: 1 }));
await run(baseArgs(orderFixture, ["--write", "--snapshot-out", gateSnapshot]), {}, {
  openTargetDb: async () => {
    events.push("open");
    return { tag: "db" };
  },
  readTargetState: async () => {
    events.push("read-target");
    return createEmptyTargetState(TARGET_UID, "lindsay");
  },
  collectSnapshot: async () => {
    events.push("snapshot");
    return [];
  },
  writeSnapshot: () => {
    events.push("write-snapshot");
  },
  writeDocuments: async () => {
    events.push("write");
  },
});
assert(events.join(",") === "open,read-target,snapshot,write-snapshot,write", "snapshot was not written before the database");

const dryEvents = [];
await run(baseArgs(orderFixture, ["--snapshot-out", gateSnapshot]), {}, {
  openTargetDb: async () => ({ tag: "db" }),
  readTargetState: async () => createEmptyTargetState(TARGET_UID, "lindsay"),
  collectSnapshot: async () => {
    dryEvents.push("snapshot");
    return [];
  },
  writeDocuments: async () => {
    dryEvents.push("write");
  },
});
assert(dryEvents.length === 0, "dry-run wrote or snapshotted");

function adminDb() {
  const app = initializeApp({ projectId: EMULATOR_PROJECT }, "training-m4-test");
  return getFirestore(app);
}

async function listDocs(db) {
  const paths = [];
  async function walk(ref) {
    const collections = await ref.listCollections();
    for (const collection of collections) {
      const refs = await collection.listDocuments();
      for (const item of refs) {
        const snap = await item.get();
        if (snap.exists) paths.push(item.path);
        await walk(item);
      }
    }
  }
  await walk(db);
  return paths.sort();
}

function planPaths(doc) {
  const plan = buildMigrationPlan(doc, createEmptyTargetState(TARGET_UID, "lindsay"), executionDate);
  return plan.writes.map((write) => write.path).sort();
}

const testEnv = await initializeTestEnvironment({
  projectId: EMULATOR_PROJECT,
  firestore: { rules: readFileSync(path.join(root, "firestore.rules"), "utf8") },
});
const database = adminDb();

async function writeScenario(name, profile) {
  await testEnv.clearFirestore();
  const dir = mkdtempSync(path.join(tmpdir(), `training-m4-${name}-`));
  const fixturePath = path.join(dir, "profile.json");
  const snapshotPath = path.join(dir, "snapshot.json");
  writeFileSync(fixturePath, JSON.stringify(profile));
  const dry = cli(baseArgs(fixturePath, ["--snapshot-out", snapshotPath]));
  assert(dry.status === 0, `${name} dry-run failed: ${dry.stderr}`);
  assert(dry.stdout.includes("dry-run: no documents written"), `${name} dry-run reported a write`);
  assert(!existsSync(snapshotPath), `${name} dry-run wrote a snapshot`);
  assert((await listDocs(database)).length === 0, `${name} dry-run created documents`);
  const written = cli(baseArgs(fixturePath, ["--write", "--snapshot-out", snapshotPath]));
  assert(written.status === 0, `${name} write failed: ${written.stderr}`);
  const line = summaryLine(written.stdout);
  assert(summaryLine(dry.stdout) === line, `${name} dry-run summary differed from the write`);
  const expected = planPaths(profile);
  const paths = await listDocs(database);
  assert(paths.join("\n") === expected.join("\n"), `${name} document paths did not match the plan\n${paths.join("\n")}\n---\n${expected.join("\n")}`);
  const snapshot = JSON.parse(readFileSync(snapshotPath, "utf8"));
  assert(snapshot.length === expected.length, `${name} snapshot length`);
  assert(snapshot.every((row) => row.exists === false && row.data === null), `${name} snapshot was not the empty target`);
  assert(redKeys(snapshot).length === 0, `${name} snapshot contains a red-line key`);
  const owner = testEnv.authenticatedContext(TARGET_UID).firestore();
  const docs = [];
  for (const docPath of paths) {
    const snap = await getDoc(doc(owner, docPath));
    assert(snap.exists(), `${name} owner could not read ${docPath}`);
    const data = snap.data();
    docs.push({ path: docPath, data });
    assert(redKeys(data).length === 0, `${name} written document contains a red-line key`);
    assert(typeof data.updatedAt?.toDate === "function", `${name} document is missing updatedAt`);
  }
  const again = cli(baseArgs(fixturePath, ["--write", "--snapshot-out", path.join(dir, "second.json")]));
  assert(again.status === 0, `${name} second write failed: ${again.stderr}`);
  const second = summaryLine(again.stdout);
  assert(added(second, "tasksAdded") === 0, `${name} second write appended tasks`);
  assert(added(second, "historyTasksAdded") === 0, `${name} second write appended history`);
  assert(added(second, "recordsAdded") === 0, `${name} second write appended records`);
  const after = await listDocs(database);
  assert(after.join("\n") === paths.join("\n"), `${name} second write changed the document set`);
  return { line, docs, owner };
}

const lindsay = await writeScenario("lindsay", lindsayDoc);
const lindsayKinds = kindCounts(lindsay.line);
assert(lindsayKinds.state === 1, "lindsay state count");
assert(lindsayKinds.gamification === 1, "lindsay points");
assert(lindsayKinds.recordsDoc === 6, "lindsay record docs");
assert(lindsayKinds.backupDoc === 1, "lindsay backup");
assert(lindsayKinds.taskHistoryDay === 0, "lindsay history");
assert(added(lindsay.line, "recordsAdded") === 8, "lindsay record entries");
assert(added(lindsay.line, "tasksAdded") === 0, "lindsay tasks");
assert(lindsay.line.includes("backupKeys=races"), "lindsay backup keys");
assert(lindsay.line.includes("parentPin:red-line"), "lindsay pin skip");
assert(lindsay.line.includes("avatar:red-line"), "lindsay avatar skip");
assert(lindsay.line.includes("isPro:red-line"), "lindsay pro skip");
const lindsayState = domain.normalizeTrainingState(lindsay.docs.find((item) => item.path.endsWith("/training/state")).data);
assert(lindsayState.lastLoginDate === "", "lindsay state stored a login date without today's tasks");
assert(lindsayState.weeklyTemplate.monday === "ice", "lindsay template was not readable");
const lindsayEntries = lindsay.docs
  .filter((item) => item.path.includes("/records/"))
  .map((item) => domain.normalizeDistanceRecordsDocument(item.data.distanceId, item.data.label, item.data).entries.length);
assert(lindsayEntries.reduce((sum, count) => sum + count, 0) === 8, "lindsay normalized record count");

const tasks = await writeScenario("tasks", taskDoc);
const taskKinds = kindCounts(tasks.line);
assert(taskKinds.state === 1 && taskKinds.taskHistoryDay === 1 && taskKinds.gamification === 1, "task kind counts");
assert(taskKinds.recordsDoc === 0 && taskKinds.backupDoc === 0, "task fixture wrote records or a backup");
assert(added(tasks.line, "tasksAdded") === 2, "task append count");
assert(added(tasks.line, "historyTasksAdded") === 1, "history append count");
const taskState = domain.normalizeTrainingState(tasks.docs.find((item) => item.path.endsWith("/training/state")).data);
assert(taskState.lastLoginDate === executionDate, "lastLoginDate was not the execution date");
assert(taskState.todayTasks.map((task) => task.id).join() === "legacy-task-15,legacy-task-15-1", "task ids");
assert(taskState.todayTasks[1].source === "academy", "academy source");
assert(taskState.todayTasks[1].description === "how", "task description");
const history = tasks.docs.find((item) => item.path.endsWith("/taskHistory/2024-05-01")).data;
assert(history.dateId === "2024-05-01" && history.archivedAt === "2024-05-01T00:00:00.000Z", "history day shape");
const historyTask = domain.normalizeTask(history.tasks[0]);
assert(historyTask.id === "legacy-task-7" && historyTask.text === "archived", "history task was not accepted");
const game = tasks.docs.find((item) => item.path.endsWith("/gamification/main")).data;
assert(game.points === 30, "points were not kept");
assert(game.completedDays.join() === "2024-05-01,2024-05-02", "completed days");
assert(game.streakDays === 2, "streak was not recomputed from the execution date");

const goals = await writeScenario("goals", goalDoc);
const goalKinds = kindCounts(goals.line);
assert(goalKinds.backupDoc === 1, "goal backup");
assert(goalKinds.state + goalKinds.recordsDoc + goalKinds.gamification + goalKinds.taskHistoryDay === 0, "goals wrote business documents");
assert(goals.line.includes("backupKeys=activeTrainingPlanId,competitionGoalsV1,races,trainingPlansV1"), "goal backup keys");
assert(!goals.docs.some((item) => item.path.includes("/planning/")), "goals landed in planning");

const custom = await writeScenario("custom", customDoc);
const customKinds = kindCounts(custom.line);
assert(customKinds.recordsDoc === 2 && customKinds.gamification === 1, "custom kind counts");
assert(added(custom.line, "recordsAdded") === 3, "custom record entries");
const fiveHundred = domain.normalizeDistanceRecordsDocument(
  "500m",
  "500m",
  custom.docs.find((item) => item.path.endsWith("/records/500m")).data,
);
assert(fiveHundred.entries.map((item) => item.id).join() === "legacy-time-500m-0,legacy-time-500m-0-0", "merged record ids");
assert(fiveHundred.entries.every((item) => item.timeSeconds > 0), "record times were dropped");
const ice = custom.docs.find((item) => item.path.endsWith("/records/iceday")).data;
assert(domain.normalizeDistanceRecordsDocument("iceday", ice.label, ice).label === "IceDay", "custom label");
const customGame = custom.docs.find((item) => item.path.endsWith("/gamification/main")).data;
assert(customGame.pointsPerTask === 15, "non-default points per task");
assert(!Object.prototype.hasOwnProperty.call(customGame, "dailyBonusPoints"), "default daily bonus was written");

await testEnv.cleanup();
console.log("[test:migration] training emulator dry-run, write, normalize, red-line, and idempotent rerun passed");
console.log(lindsay.line);
console.log(tasks.line);
console.log(goals.line);
console.log(custom.line);
