import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import {
  MigrationStop,
  approximateBytes,
  assertLiveEnvironment,
  describeProfileStructure,
  findLindsayCandidates,
  hasRealTrainingData,
  median,
  renderReport,
  summarizeAggregates,
} from "./training-source-counts.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const script = path.join(root, "scripts", "migration", "training-source-counts.mjs");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sourceText() {
  return {
    userPathCount: 3,
    userDocumentCount: 2,
    profiles: [
      { uid: "missing", data: null },
      {
        uid: "guest",
        data: {
          username: "",
          points: 0,
          tasks: [],
          taskHistory: {},
          records: [],
          customRewards: [{ id: 1, name: "snack", cost: 1, icon: "x" }],
          pointsPerTask: 10,
          dailyBonusPoints: 20,
          isPro: false,
        },
      },
      {
        uid: "skater",
        data: {
          username: "Lindsay Fixture",
          points: 3,
          parentPin: "1234",
          avatar: "data:image/png;base64,AAAA",
          tasks: [{ id: 15, text: "secret text", completed: true }],
          taskHistory: { "2026-01-02": [{ id: 16, text: "also secret", completed: false }] },
          competitionGoalsV1: [{ id: "goal_1", title: "secret goal" }],
          trainingPlansV1: [],
          records: [{ date: "2026-01-01", time: 49.5 }],
          records777: [],
          records_Custom: [{ date: "2026-01-03", time: 12 }],
          rewardHistory: [],
          races: [],
          completedDays: ["2026-01-02"],
          pointsPerTask: 15,
          dailyBonusPoints: 20,
          isPro: true,
          weeklyTemplate: { 0: "rest" },
        },
      },
    ],
  };
}

function testAggregates() {
  const report = summarizeAggregates(sourceText());
  assert(report.userPathCount === 3, "user paths");
  assert(report.userDocumentCount === 2, "user documents");
  assert(report.profileDocuments === 2, "profiles");
  assert(report.topLevelKeyCounts.tasks === 2, "tasks key census");
  assert(report.topLevelKeyCounts.parentPin === 1, "parent pin is counted as a key only");
  assert(report.arrays.tasks.max === 1, "tasks max");
  assert(report.arrays.tasks.median === 0.5, "tasks median");
  assert(report.arrays.taskHistoryDates.max === 1, "history dates");
  assert(report.arrays.competitionGoalsV1.max === 1, "goals");
  assert(report.recordArrays.records.max === 1, "500m key");
  assert(report.recordArrays.records_Custom.documents === 1, "custom record key");
  assert(report.pointsPerTask["10"] === 1 && report.pointsPerTask["15"] === 1, "points per task histogram");
  assert(report.realTrainingProfiles === 1, "default rewards are not real training data");
  assert(hasRealTrainingData(sourceText().profiles[1].data) === false, "empty guest");
  const dumped = JSON.stringify(report);
  assert(!dumped.includes("secret"), "aggregate leaked text");
  assert(!dumped.includes("1234"), "aggregate leaked a pin");
  assert(!dumped.includes("AAAA"), "aggregate leaked an avatar");
  assert(!dumped.includes("49.5"), "aggregate leaked a time");
  assert(!dumped.includes("Lindsay"), "aggregate leaked a username");
  assert(!dumped.includes("skater"), "aggregate leaked a uid");
}

function testStructureOmitsValues() {
  const data = sourceText().profiles[2].data;
  const structure = describeProfileStructure(data);
  assert(structure.arrayLengths.tasks === 1, "task length");
  assert(structure.arrayLengths.taskHistoryDates === 1, "history length");
  assert(structure.arrayLengths.records.records === 1, "records length");
  assert(structure.arrayLengths.records.records_Custom === 1, "custom length");
  assert(structure.topLevel.keys.tasks.itemFields.id.type === "number", "task id type");
  assert(structure.topLevel.keys.tasks.itemFields.text.type === "string", "task text type");
  assert(structure.approximateBytes === approximateBytes(data), "byte count");
  const dumped = JSON.stringify(structure);
  assert(!dumped.includes("secret"), "structure leaked text");
  assert(!dumped.includes("1234"), "structure leaked a pin");
  assert(!dumped.includes("AAAA"), "structure leaked an avatar");
  assert(!dumped.includes("49.5"), "structure leaked a time");
  assert(!dumped.includes("Lindsay"), "structure leaked a username");
}

function testCandidatesStaySeparate() {
  const report = renderReport(sourceText());
  assert(report.candidates.length === 1, "one candidate");
  assert(report.candidates[0].uid === "skater", "candidate uid");
  assert(report.candidates[0].username === "Lindsay Fixture", "candidate username");
  assert(findLindsayCandidates([{ uid: "a", data: { username: "lindSAY q" } }]).length === 1, "case");
  assert(findLindsayCandidates([{ uid: "a", data: { username: "guest" } }]).length === 0, "non match");
  const publicPart = JSON.stringify({ aggregate: report.aggregate, structures: report.structures });
  assert(!publicPart.includes("Lindsay Fixture"), "public report leaked the username");
  assert(!publicPart.includes("skater"), "public report leaked the uid");
}

function testMedian() {
  assert(median([]) === null, "empty median");
  assert(median([4, 1, 3]) === 3, "odd median");
  assert(median([1, 2, 3, 4]) === 2.5, "even median");
}

function testLiveGuards() {
  let threw = false;
  try {
    assertLiveEnvironment({ FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080" });
  } catch (error) {
    threw = error instanceof MigrationStop && error.message.includes("FIRESTORE_EMULATOR_HOST");
  }
  assert(threw, "emulator host was allowed");

  threw = false;
  try {
    assertLiveEnvironment({});
  } catch (error) {
    threw = error instanceof MigrationStop && error.message.includes("GOOGLE_APPLICATION_CREDENTIALS");
  }
  assert(threw, "missing key was allowed");

  threw = false;
  try {
    assertLiveEnvironment({ GOOGLE_APPLICATION_CREDENTIALS: script });
  } catch (error) {
    threw = error instanceof MigrationStop && error.message.includes("inside the repository");
  }
  assert(threw, "in-repo key was allowed");
}

function testSourceHasNoWrites() {
  const source = readFileSync(script, "utf8");
  assert(!/\.(set|update|delete|create)\s*\(/.test(source), "write call");
  assert(!/WriteBatch|BulkWriter|setDoc|updateDoc|deleteDoc/.test(source), "write helper");
}

function testFixtureCli() {
  const dir = mkdtempSync(path.join(tmpdir(), "training-counts-"));
  const fixture = path.join(dir, "fixture.json");
  writeFileSync(fixture, JSON.stringify(sourceText()));
  const result = spawnSync(process.execPath, [script, "--fixture", fixture], { encoding: "utf8" });
  assert(result.status === 0, result.stderr || "fixture cli failed");
  assert(result.stdout.includes("=== AGGREGATE ==="), "aggregate marker");
  assert(result.stdout.includes("=== LOCAL ONLY ==="), "local marker");
  assert(result.stdout.includes("uid=skater username=Lindsay Fixture"), "local candidate");
  const aggregate = result.stdout.split("=== LINDSAY STRUCTURE ===")[0];
  assert(!aggregate.includes("secret"), "cli aggregate leaked text");
  assert(!aggregate.includes("1234"), "cli aggregate leaked a pin");
}

function testCliRejectsALiveReadWithoutAKey() {
  const result = spawnSync(process.execPath, [script, "--live"], {
    encoding: "utf8",
    env: { ...process.env, GOOGLE_APPLICATION_CREDENTIALS: "", FIRESTORE_EMULATOR_HOST: "", FIREBASE_AUTH_EMULATOR_HOST: "" },
  });
  assert(result.status === 1, "live read without a key exited 0");
  assert(result.stderr.includes("GOOGLE_APPLICATION_CREDENTIALS"), "missing key was not explained");
  assert(!result.stderr.includes("private_key"), "stderr included key material");
}

testAggregates();
testStructureOmitsValues();
testCandidatesStaySeparate();
testMedian();
testLiveGuards();
testSourceHasNoWrites();
testFixtureCli();
testCliRejectsALiveReadWithoutAKey();
console.log("training-source-counts.test.mjs ok");
