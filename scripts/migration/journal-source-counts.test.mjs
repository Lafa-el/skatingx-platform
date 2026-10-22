import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MigrationStop, assertLiveEnvironment, renderReport } from "./journal-source-counts.mjs";

const script = fileURLToPath(new URL("./journal-source-counts.mjs", import.meta.url));
const anchorId = "abcdefghijklmnopQRSTUV123456";
const otherId = "zzzzzzzzOtherAthlete0000000001";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function source() {
  return {
    athletes: [
      { id: anchorId, data: { athleteId: anchorId, displayName: "do-not-commit-name", bio: "secret-bio" } },
      { id: "legacy-doc", data: { athleteId: otherId, displayName: "other" } },
      { id: "blank", data: { displayName: "missing" } },
    ],
    journal_days: [
      {
        id: "d1",
        data: {
          athleteId: anchorId,
          date: "2024-01-02",
          diaryContent: "do-not-commit-body",
          extraNote: "spread-field",
          lindsayReflection: { bestThing: "secret-best", needsWork: "secret-work" },
          createdAt: "2024-01-02T00:00:00.000Z",
        },
      },
      { id: "d2", data: { athleteId: anchorId, date: "2024-03-04", diaryContent: "more" } },
      { id: "d3", data: { athleteId: otherId, date: "2020-01-01", diaryContent: "other-body" } },
      { id: "d4", data: { date: "not-a-date" } },
    ],
    training_sessions: [{ id: "s1", data: { athleteId: anchorId, date: "2024-01-02", duration: 30 } }],
    coach_notes: [],
    body_status: [],
    performance_records: [],
    video_refs: [
      { id: "v1", data: { athleteId: anchorId, externalUrl: "https://www.youtube.com/watch?v=secret" } },
      { id: "v2", data: { athleteId: anchorId, externalUrl: "https://youtu.be/secret" } },
      { id: "v3", data: { athleteId: anchorId, externalUrl: "not a url" } },
      { id: "v4", data: { athleteId: anchorId } },
    ],
    weekly_reviews: [
      { id: "w1", data: { athleteId: anchorId, weekStart: "2024-01-01" } },
      { id: "w2", data: { athleteId: otherId, weekStart: "2024-06-03" } },
    ],
    milestones: [],
  };
}

function testReport() {
  const text = renderReport(source(), "fixture");
  assert(text.includes("collection=journal_days docs=4 distinctAthleteId=2 missingAthleteId=1"), text);
  assert(text.includes("field journal_days extraNote docs=1 types=string"), "spread field missing");
  assert(text.includes("field journal_days lindsayReflection.bestThing docs=1 types=string"), "nested field missing");
  assert(text.includes("date journal_days min=2020-01-01 max=2024-03-04 invalid=1"), "date span");
  assert(text.includes("weekStart weekly_reviews min=2024-01-01 max=2024-06-03 invalid=0"), "week span");
  assert(text.includes("anchor prefix=abcdefgh journal_days=2"), "anchor prefix");
  assert(text.includes("anchor-collection journal_days docs=2"), "anchor days");
  assert(text.includes("athletes idEquals=1 idDiffers=1 idMissing=1"), "athlete id compare");
  assert(text.includes("video-domains www.youtube.com,youtu.be invalid=1 empty=1"), "domains");
  assert(text.includes("milestones docs=0 empty=true"), "milestones");
  assert(!text.includes(anchorId), "full anchor uid leaked");
  assert(!text.includes(otherId), "other uid leaked");
  assert(!text.includes("do-not-commit-body"), "diary body leaked");
  assert(!text.includes("secret-bio"), "profile text leaked");
  assert(!text.includes("watch?v"), "full url leaked");
}

function testTieStopsTheAnchor() {
  const tied = source();
  tied.journal_days.push({ id: "d5", data: { athleteId: otherId, date: "2024-02-02" } });
  const text = renderReport(tied, "fixture");
  assert(text.includes("anchor status=tie journal_days=2"), text);
  assert(!text.includes("prefix="), "a tied census printed a prefix");
}

function testSourceHasNoWrites() {
  const file = readFileSync(script, "utf8");
  assert(!/\.(set|update|delete|create|add)\s*\(/.test(file), "write call");
  assert(!/WriteBatch|BulkWriter|setDoc|updateDoc|deleteDoc|writeBatch/.test(file), "write helper");
  assert(!file.includes("journal-migration-reader.json"), "key path is hardcoded");
  assert(!file.includes("/Users/"), "home path is hardcoded");
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
}

function testFixtureCli() {
  const dir = mkdtempSync(path.join(tmpdir(), "journal-counts-"));
  const fixture = path.join(dir, "fixture.json");
  writeFileSync(fixture, JSON.stringify(source()));
  const result = spawnSync(process.execPath, [script, "--fixture", fixture], { encoding: "utf8" });
  assert(result.status === 0, result.stderr || "fixture cli failed");
  assert(result.stdout.includes("mode=fixture"), "mode");
  assert(result.stdout.includes("prefix=abcdefgh"), "prefix");
  assert(!result.stdout.includes(anchorId), "cli leaked the uid");
  assert(!result.stdout.includes("do-not-commit-body"), "cli leaked a diary body");
}

function testCliRejectsALiveReadWithoutAKey() {
  const result = spawnSync(process.execPath, [script, "--limit", "1"], {
    encoding: "utf8",
    env: { ...process.env, GOOGLE_APPLICATION_CREDENTIALS: "", FIRESTORE_EMULATOR_HOST: "", FIREBASE_AUTH_EMULATOR_HOST: "" },
  });
  assert(result.status === 1, "live read without a key exited 0");
  assert(result.stderr.includes("GOOGLE_APPLICATION_CREDENTIALS"), result.stderr);
  assert(!result.stderr.includes("private_key"), "stderr included key material");
}

testReport();
testTieStopsTheAnchor();
testSourceHasNoWrites();
testLiveGuards();
testFixtureCli();
testCliRejectsALiveReadWithoutAKey();
console.log("journal-source-counts.test.mjs ok");
