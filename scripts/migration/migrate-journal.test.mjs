import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc } from "firebase/firestore";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

import { buildJournalPlan } from "./journal-map.mjs";
import {
  ANCHOR_PREFIX,
  EMULATOR_PROJECT,
  MigrationStop,
  SOURCE_PROJECT,
  STAGING_PROJECT,
  TARGET_UID,
  assertStagingProject,
  formatTargetShape,
  parseArgs,
  run,
  stagingWriterKeyPath,
  storagePath,
  withLiveSource,
} from "./migrate-journal.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const script = path.join(root, "scripts", "migration", "migrate-journal.mjs");
const OWNER = `${ANCHOR_PREFIX}fixtureOwner00000001`;
const OTHER = `${ANCHOR_PREFIX}otherOwner0000000002`;
const ISO = "2026-06-08T12:00:00.000Z";
const OPTIONS = { anchorPrefix: ANCHOR_PREFIX, targetUid: TARGET_UID };
let assertions = 0;

function assert(condition, message) {
  assertions += 1;
  if (!condition) throw new Error(message);
}

function meta(extra = {}) {
  return {
    athleteId: OWNER,
    sourceApp: "blaze-skate-journal",
    createdAt: ISO,
    updatedAt: ISO,
    ...extra,
  };
}

function sourceFixture() {
  return {
    athletes: [
      {
        id: OWNER,
        data: meta({
          displayName: "skater-placeholder",
          avatarUrl: "https://example.test/avatar",
          birthday: "2014-01-01",
          skatingFrom: "2018",
        }),
      },
    ],
    journal_days: [
      {
        id: "day-1",
        data: meta({
          schemaVersion: "skatingx-journal-v1",
          date: "2026-06-08",
          location: "rink-placeholder",
          dayType: "training",
          overallFeeling: 3,
          energy: 4,
          soreness: "soreness-placeholder",
          trainingFocus: "focus-placeholder",
          coachFeedback: "feedback-placeholder",
          parentNote: "parent-placeholder",
          isCompleted: true,
          lindsayReflection: {
            bestThing: "best-placeholder",
            needsWork: "work-placeholder",
            tomorrowFocus: "tomorrow-placeholder",
          },
        }),
      },
      {
        id: "day-2",
        data: meta({
          date: "2026-07-01",
          location: "rink-placeholder",
          dayType: "rest",
          overallFeeling: 5,
          parentNote: "parent-placeholder",
          isCompleted: false,
          lindsayReflection: {
            bestThing: "best-placeholder",
            needsWork: "work-placeholder",
            tomorrowFocus: "tomorrow-placeholder",
          },
        }),
      },
    ],
    training_sessions: [
      {
        id: "session-1",
        data: meta({
          schemaVersion: "skatingx-journal-v1",
          date: "2026-06-08",
          sessionLabel: "label-placeholder-1",
          sessionType: "ice",
          coachName: "coach-placeholder",
          notes: "notes-placeholder",
          durationMinutes: 45,
          intensity: 3,
          focusTags: ["tag-placeholder"],
        }),
      },
      {
        id: "session-2",
        data: meta({
          date: "2026-06-09",
          sessionLabel: "label-placeholder-2",
          sessionType: "dryland",
          coachName: "coach-placeholder",
          notes: "notes-placeholder",
          durationMinutes: 30,
          intensity: 1,
          focusTags: ["tag-placeholder"],
          iceTimeMinutes: 20,
          drylandMinutes: 10,
          startsPractice: true,
        }),
      },
      {
        id: "session-3",
        data: meta({
          date: "2026-07-01",
          sessionLabel: "label-placeholder-3",
          sessionType: "ice",
          coachName: "coach-placeholder",
          notes: "notes-placeholder",
          durationMinutes: 0,
          intensity: 5,
          focusTags: [],
        }),
      },
    ],
    coach_notes: [],
    body_status: [
      {
        id: "body-1",
        data: meta({
          date: "2026-06-10",
          sleepHours: 8,
          fatigueLevel: 2,
          mood: 6,
          bodyWeightLb: 80,
          heightCm: 150,
          sorenessAreas: ["area-placeholder"],
          injuryNote: "injury-placeholder",
        }),
      },
    ],
    performance_records: [],
    video_refs: [],
    weekly_reviews: [],
    milestones: [],
  };
}

function cli(args, env = {}) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: root,
    env: { ...process.env, GOOGLE_APPLICATION_CREDENTIALS: "", TARGET_GOOGLE_APPLICATION_CREDENTIALS: "", ...env },
    encoding: "utf8",
  });
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

function deepEqual(left, right) {
  if (left === right) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    return left.every((item, index) => deepEqual(item, right[index]));
  }
  if (left && right && typeof left === "object" && typeof right === "object") {
    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();
    if (leftKeys.length !== rightKeys.length) return false;
    return leftKeys.every((key, index) => key === rightKeys[index] && deepEqual(left[key], right[key]));
  }
  return false;
}

function summaryCount(stdout, name) {
  const line = stdout.split("\n").find((item) => item.startsWith("plan-summary "));
  assert(line, "plan summary was not printed");
  const match = line.match(new RegExp(`${name}=(\\d+)`));
  assert(match, `${name} was not printed`);
  return Number(match[1]);
}

const sourceText = readFileSync(script, "utf8");
const readerStart = sourceText.indexOf("export async function withLiveSource");
const readerEnd = sourceText.indexOf("export function loadFixture");
const reader = sourceText.slice(readerStart, readerEnd);
assert(readerStart >= 0 && readerEnd > readerStart, "source reader was not found");
assert(reader.includes(".get("), "source reader does not read");
assert(!/\.(set|update|delete|create|add)\s*\(/.test(reader), "source reader writes");
assert(reader.indexOf("delete env.FIRESTORE_EMULATOR_HOST") >= 0, "source reader keeps the emulator host");
assert(reader.indexOf("delete process.env.FIRESTORE_EMULATOR_HOST") < reader.indexOf("initializeApp"), "emulator host is cleared too late");
assert(sourceText.includes(`export const SOURCE_PROJECT = "${SOURCE_PROJECT}"`), "source project is not fixed");
assert((sourceText.match(/\.set\s*\(/g) ?? []).length === 1, "more than the target set call");
assert(!sourceText.includes("serverTimestamp"), "script mints a timestamp");
assert(!sourceText.includes("\"skatingx-prod\"") && !sourceText.includes("'skatingx-prod'"), "script names the production project");
assert(sourceText.includes("anchorPrefix: ANCHOR_PREFIX") && sourceText.includes("targetUid: TARGET_UID"), "plan options are not pinned");
assert(STAGING_PROJECT === "skatingx-platform", "staging project is not skatingx-platform");
assert(sourceText.includes(`export const STAGING_PROJECT = "${STAGING_PROJECT}"`), "staging project is not fixed");
assert(sourceText.includes('if (args.write && args.target !== "emulator") stop("--write requires --target emulator");'), "staging write rejection changed");
const stagingOpen = sourceText.slice(sourceText.indexOf("async function openStagingDb"), sourceText.indexOf("export async function openTargetDb"));
assert(stagingOpen.indexOf("assertStagingEnvironment") >= 0 && stagingOpen.indexOf("assertStagingEnvironment") < stagingOpen.indexOf("initializeApp"), "staging connects before its guard");
assert(stagingOpen.includes("projectId: STAGING_PROJECT"), "staging client does not use the fixed project");
assert(!stagingOpen.includes(".collection(") && !/\.(set|update|delete|create|add)\s*\(/.test(stagingOpen), "staging opener reads or writes documents");
assert(!stagingOpen.includes("FIRESTORE_EMULATOR_HOST ="), "staging opener changes the emulator host");
const targetReader = sourceText.slice(sourceText.indexOf("export async function readTargetJournal"), sourceText.indexOf("function jsonSafe"));
assert(targetReader.includes("journal/main") && !targetReader.includes("collectionGroup") && !targetReader.includes("listCollections"), "target reader is not limited to the journal subtree");

const production = stops("production", () => parseArgs(["--target", "production", "--fixture", "fixture.json"]));
assert(production.message === "--target production is refused.", "production dry-run was not refused");
const productionWrite = stops("production write", () => parseArgs(["--target", "production", "--write", "--snapshot-out", "/tmp/journal-m4.json"]));
assert(productionWrite.message === "--target production is refused.", "production write was not refused at parse");
const stagingParsed = parseArgs(["--target", "staging", "--fixture", "fixture.json"]);
assert(stagingParsed.target === "staging" && stagingParsed.write === false, "staging dry-run was refused");
const stagingWrite = stops("staging write", () => parseArgs(["--target", "staging", "--write", "--snapshot-out", "/tmp/journal-m4.json"]));
assert(stagingWrite.message === "--write requires --target emulator", "staging write rejection changed");
const wrongProject = stops("staging project id", () => assertStagingProject("demo-skatingx-migration"));
assert(wrongProject.message === "staging project must be skatingx-platform", "wrong staging project was accepted");
const missingTarget = stops("write without target", () => parseArgs(["--write", "--snapshot-out", "/tmp/journal-m4.json"]));
assert(missingTarget.message.includes("--target"), "write without target was not named");
stops("project flag", () => parseArgs(["--project", "blaze-skate-journal", "--target", "emulator"]));
stops("anchor override", () => parseArgs(["--target", "emulator", "--anchor-prefix", ANCHOR_PREFIX]));
stops("uid override", () => parseArgs(["--target", "emulator", "--target-uid", TARGET_UID]));

const gateDir = mkdtempSync(path.join(tmpdir(), "journal-m4-"));
const gateFixture = path.join(gateDir, "source.json");
writeFileSync(gateFixture, JSON.stringify(sourceFixture()));
const gateSnapshot = path.join(gateDir, "snapshot.json");

const insideKey = cli(["--target", "emulator", "--fixture", gateFixture], { GOOGLE_APPLICATION_CREDENTIALS: script });
assert(insideKey.status === 1, "a key inside the repo was accepted");
assert(insideKey.stderr.includes("repository"), "inside-repo key was not explained");
assert(!insideKey.stdout.includes(OWNER), "inside-repo key printed the athlete id");

const insideTargetKey = cli(["--target", "emulator", "--fixture", gateFixture], { TARGET_GOOGLE_APPLICATION_CREDENTIALS: script });
assert(insideTargetKey.status === 1, "a target key inside the repo was accepted");
assert(insideTargetKey.stderr.includes("repository"), "inside-repo target key was not explained");

const insideSnapshot = path.join(root, "journal-m4-snapshot.json");
const refusedSnapshot = cli(["--target", "emulator", "--fixture", gateFixture, "--write", "--snapshot-out", insideSnapshot]);
assert(refusedSnapshot.status === 1, "a snapshot inside the repo was accepted");
assert(refusedSnapshot.stderr.includes("repository"), "inside-repo snapshot was not explained");
assert(!existsSync(insideSnapshot), "an in-repo snapshot was written");

const missingSnapshot = cli(["--target", "emulator", "--fixture", gateFixture, "--write"]);
assert(missingSnapshot.status === 1, "write without a snapshot path was allowed");
assert(missingSnapshot.stderr.includes("--snapshot-out"), "missing snapshot path was not named");

const savedHost = process.env.FIRESTORE_EMULATOR_HOST;
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
let hostDuringRead = "not-called";
await withLiveSource({ FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080" }, async () => {
  hostDuringRead = process.env.FIRESTORE_EMULATOR_HOST ?? "cleared";
});
assert(hostDuringRead === "cleared", "live source read kept the emulator host");
assert(process.env.FIRESTORE_EMULATOR_HOST === "127.0.0.1:8080", "emulator host was not restored");
if (savedHost === undefined) delete process.env.FIRESTORE_EMULATOR_HOST;
else process.env.FIRESTORE_EMULATOR_HOST = savedHost;

const events = [];
await run(["--target", "emulator", "--fixture", gateFixture, "--write", "--snapshot-out", gateSnapshot], { GOOGLE_APPLICATION_CREDENTIALS: "" }, {
  openTargetDb: async () => {
    events.push("open");
    return { tag: "db" };
  },
  readTargetJournal: async () => {
    events.push("read-target");
    return {};
  },
  collectSnapshot: async () => {
    events.push("snapshot");
    return { source: {}, target: [] };
  },
  writeSnapshot: () => {
    events.push("write-snapshot");
  },
  writeDocuments: async () => {
    events.push("write");
  },
  postCheck: async () => {
    events.push("post-check");
    return { writes: [], skips: Array.from({ length: 7 }, () => ({ path: "journal/days/day-1", reason: "already-identical" })) };
  },
});
assert(events.join(",") === "open,read-target,snapshot,write-snapshot,write,post-check", "snapshot was not written before the database");
assert(!existsSync(gateSnapshot), "injected snapshot writer touched the file");

const dryEvents = [];
await run(["--target", "emulator", "--fixture", gateFixture], { GOOGLE_APPLICATION_CREDENTIALS: "" }, {
  openTargetDb: async () => ({ tag: "db" }),
  readTargetJournal: async () => ({}),
  collectSnapshot: async () => {
    dryEvents.push("snapshot");
    return { source: {}, target: [] };
  },
  writeDocuments: async () => {
    dryEvents.push("write");
  },
});
assert(dryEvents.length === 0, "dry-run wrote or snapshotted");

const shape = formatTargetShape({
  "journal/days/day-1": { parentNote: "secret-note", legacy: { appId: "blaze-skate-journal", documentId: "day-1" } },
});
assert(shape === "target-shape journal/days/day-1 fields=legacy.appId,legacy.documentId,parentNote", "target shape");
assert(!shape.includes("secret-note"), "target shape included a field value");

async function attempt(argv, env, deps = {}) {
  const counts = { source: 0, target: 0 };
  try {
    await run(argv, env, {
      readSource: async () => {
        counts.source += 1;
        throw new Error("source connected");
      },
      openTargetDb: async () => {
        counts.target += 1;
        throw new Error("target connected");
      },
      ...deps,
    });
    return { counts, error: null };
  } catch (error) {
    return { counts, error };
  }
}

const savedStagingHost = process.env.FIRESTORE_EMULATOR_HOST;
delete process.env.FIRESTORE_EMULATOR_HOST;
const writerKey = stagingWriterKeyPath();
const stagingEnv = {
  GOOGLE_APPLICATION_CREDENTIALS: "",
  TARGET_GOOGLE_APPLICATION_CREDENTIALS: writerKey,
};
const wrongKey = path.join(gateDir, "not-the-writer.json");
const wrongPath = await attempt(["--target", "staging", "--fixture", gateFixture], {
  ...stagingEnv,
  TARGET_GOOGLE_APPLICATION_CREDENTIALS: wrongKey,
});
assert(wrongPath.counts.source === 0 && wrongPath.counts.target === 0, "wrong writer path connected");
assert(wrongPath.error instanceof MigrationStop, "wrong writer path did not stop");
assert(wrongPath.error.message.includes("migration-writer.json"), "wrong writer path was not named");
assert(!wrongPath.error.message.includes(wrongKey), "rejected writer path was echoed");

const missingWriter = await attempt(["--target", "staging", "--fixture", gateFixture], {
  GOOGLE_APPLICATION_CREDENTIALS: "",
  TARGET_GOOGLE_APPLICATION_CREDENTIALS: "",
});
assert(missingWriter.counts.source === 0 && missingWriter.counts.target === 0, "missing writer key connected");
assert(missingWriter.error instanceof MigrationStop && missingWriter.error.message.includes("unset"), "missing writer key was not named");

const insideWriter = await attempt(["--target", "staging", "--fixture", gateFixture], {
  GOOGLE_APPLICATION_CREDENTIALS: "",
  TARGET_GOOGLE_APPLICATION_CREDENTIALS: script,
});
assert(insideWriter.counts.source === 0 && insideWriter.counts.target === 0, "in-repo writer key connected");
assert(insideWriter.error instanceof MigrationStop && insideWriter.error.message.includes("repository"), "in-repo writer key was not named");

process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
const hosted = await attempt(["--target", "staging", "--fixture", gateFixture], {
  ...stagingEnv,
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080",
});
assert(hosted.counts.source === 0 && hosted.counts.target === 0, "staging connected while the emulator host was set");
assert(hosted.error instanceof MigrationStop && hosted.error.message.includes("FIRESTORE_EMULATOR_HOST"), "emulator host was not named");
assert(process.env.FIRESTORE_EMULATOR_HOST === "127.0.0.1:8080", "staging guard cleared the emulator host");
delete process.env.FIRESTORE_EMULATOR_HOST;

const missingSource = await attempt(["--target", "staging"], stagingEnv);
assert(missingSource.counts.source === 0 && missingSource.counts.target === 0, "missing source key connected");
assert(missingSource.error instanceof MigrationStop && missingSource.error.message.includes("GOOGLE_APPLICATION_CREDENTIALS"), "missing source key was not named");

const parsedWrite = await attempt(["--target", "staging", "--write", "--snapshot-out", gateSnapshot], stagingEnv);
assert(parsedWrite.counts.source === 0 && parsedWrite.counts.target === 0, "staging write connected");
assert(parsedWrite.error instanceof MigrationStop && parsedWrite.error.message === "--write requires --target emulator", "staging write reached the database");

const parsedProduction = await attempt(["--target", "production", "--fixture", gateFixture], stagingEnv);
assert(parsedProduction.counts.source === 0 && parsedProduction.counts.target === 0, "production connected");
assert(parsedProduction.error instanceof MigrationStop && parsedProduction.error.message === "--target production is refused.", "production reached the database");

const parsedProject = await attempt(["--project", "skatingx-platform", "--target", "staging", "--fixture", gateFixture], stagingEnv);
assert(parsedProject.counts.source === 0 && parsedProject.counts.target === 0, "--project connected");
assert(parsedProject.error instanceof MigrationStop && parsedProject.error.message.includes("--project"), "--project was not named");

const seen = [];
let sideWrites = 0;
const fakeTarget = {
  collection(name) {
    seen.push(name);
    return { get: async () => ({ docs: [] }) };
  },
  doc() {
    throw new Error("staging read used a document path");
  },
};
const stagingDry = await run(["--target", "staging", "--fixture", gateFixture], stagingEnv, {
  openTargetDb: async () => fakeTarget,
  readSource: async () => {
    throw new Error("fixture run read the live source");
  },
  collectSnapshot: async () => {
    sideWrites += 1;
    return { source: {}, target: [] };
  },
  writeDocuments: async () => {
    sideWrites += 1;
  },
});
assert(stagingDry.plan.writes.length === 7 && stagingDry.plan.skips.length === 0, "staging fixture plan");
assert(sideWrites === 0, "staging dry-run wrote");
const journalRoot = `artifacts/skatingx-production/users/${TARGET_UID}/journal/main/`;
assert(seen.length === 8 && seen.every((name) => name.startsWith(journalRoot)), "staging read left the journal subtree");
assert(seen.map((name) => name.slice(journalRoot.length)).join(",") === "athlete,days,sessions,coachNotes,bodyStatus,performance,videos,weeklyReviews", "staging collection list changed");
if (savedStagingHost === undefined) delete process.env.FIRESTORE_EMULATOR_HOST;
else process.env.FIRESTORE_EMULATOR_HOST = savedStagingHost;

function adminDb() {
  const app = initializeApp({ projectId: EMULATOR_PROJECT }, "journal-m4-test");
  return getFirestore(app);
}

async function storedDocs(db) {
  const user = db.doc(`${"artifacts/skatingx-production"}/users/${TARGET_UID}`);
  const found = [];
  async function walk(ref) {
    const collections = await ref.listCollections();
    for (const collection of collections) {
      const refs = await collection.listDocuments();
      for (const item of refs) {
        const snap = await item.get();
        if (snap.exists) found.push({ path: item.path, data: snap.data() });
        await walk(item);
      }
    }
  }
  await walk(user);
  return found;
}

const testEnv = await initializeTestEnvironment({
  projectId: EMULATOR_PROJECT,
  firestore: { rules: readFileSync(path.join(root, "firestore.rules"), "utf8") },
});
const database = adminDb();

const badFixture = path.join(gateDir, "two-athletes.json");
const badSource = sourceFixture();
badSource.journal_days[1].data.athleteId = OTHER;
writeFileSync(badFixture, JSON.stringify(badSource));
const badSnapshot = path.join(gateDir, "bad-snapshot.json");
await testEnv.clearFirestore();
const badWrite = cli(["--target", "emulator", "--fixture", badFixture, "--write", "--snapshot-out", badSnapshot]);
assert(badWrite.status === 1, `second athleteId was accepted: ${badWrite.stderr}`);
assert(badWrite.stderr.includes("more than one athleteId"), "second athleteId was not named");
assert(!badWrite.stderr.includes(OWNER) && !badWrite.stdout.includes(OWNER), "second athleteId printed an id");
assert(!badWrite.stderr.includes(OTHER) && !badWrite.stdout.includes(OTHER), "second athleteId printed the other id");
assert(!existsSync(badSnapshot), "failed mapping wrote a snapshot");
assert((await storedDocs(database)).length === 0, "failed mapping wrote target documents");

await testEnv.clearFirestore();
const dry = cli(["--target", "emulator", "--fixture", gateFixture, "--snapshot-out", gateSnapshot]);
assert(dry.status === 0, `dry-run failed: ${dry.stderr}`);
assert(summaryCount(dry.stdout, "writes") === 7, "dry-run write count");
assert(summaryCount(dry.stdout, "skips") === 0, "dry-run skip count");
assert(dry.stdout.includes("dry-run: no documents written"), "dry-run reported a write");
assert(dry.stdout.includes("anchor: pH6yf0RX"), "anchor prefix was not printed");
assert(!dry.stdout.includes(OWNER), "dry-run printed the athlete id");
assert(!dry.stdout.includes("skater-placeholder"), "dry-run printed document text");
assert((dry.stdout.match(/^write-path /gm) ?? []).length === 7, "dry-run path list");
assert(!existsSync(gateSnapshot), "dry-run wrote a snapshot");
assert((await storedDocs(database)).length === 0, "dry-run created documents");

const written = cli(["--target", "emulator", "--fixture", gateFixture, "--write", "--snapshot-out", gateSnapshot]);
assert(written.status === 0, `write failed: ${written.stderr}`);
assert(summaryCount(written.stdout, "writes") === 7, "write count");
assert(summaryCount(written.stdout, "skips") === 0, "write skip count");
assert(written.stdout.includes("wrote 7 documents"), "write count line");
assert(written.stdout.includes("post-check writes=0 skips=7"), "post-check");
assert(written.stdout.includes("snapshot written: sourceDocs=7 targetDocs=0"), "snapshot counts");
assert(!written.stdout.includes(OWNER), "write printed the athlete id");
assert(!written.stdout.includes("notes-placeholder"), "write printed document text");
const snapshot = JSON.parse(readFileSync(gateSnapshot, "utf8"));
assert(snapshot.source.athletes.length === 1, "snapshot missed athletes");
assert(snapshot.source.journal_days.length === 2, "snapshot missed days");
assert(snapshot.target.length === 0, "snapshot target was not empty");
const plan = buildJournalPlan(sourceFixture(), {}, OPTIONS);
const stored = await storedDocs(database);
assert(stored.length === 7, `stored ${stored.length} documents`);
for (const item of plan.writes) {
  const full = storagePath(item.path);
  assert(full.split("/").length % 2 === 0, "stored path is odd");
  const match = stored.find((row) => row.path === full);
  assert(match, `missing ${item.path}`);
  assert(deepEqual(match.data, item.data), `stored document differed for ${item.path}`);
}
const owner = testEnv.authenticatedContext(TARGET_UID).firestore();
const ownerSnap = await getDoc(doc(owner, storagePath("journal/athlete/main")));
assert(ownerSnap.exists(), "owner could not read the athlete profile");

const secondSnapshot = path.join(gateDir, "second.json");
const again = cli(["--target", "emulator", "--fixture", gateFixture, "--write", "--snapshot-out", secondSnapshot]);
assert(again.status === 0, `second write failed: ${again.stderr}`);
assert(summaryCount(again.stdout, "writes") === 0, "second write count");
assert(summaryCount(again.stdout, "skips") === 7, "second skip count");
assert(again.stdout.includes("wrote 0 documents"), "second write still wrote");
assert(again.stdout.includes("post-check writes=0 skips=7"), "second post-check");
assert((await storedDocs(database)).length === 7, "second write changed the document set");

await testEnv.cleanup();
console.log(`[test:migration] journal emulator dry-run, write, idempotent rerun, and guards passed assertions=${assertions}`);
console.log(written.stdout.split("\n").find((line) => line.startsWith("plan-summary")));
console.log(again.stdout.split("\n").find((line) => line.startsWith("plan-summary")));
