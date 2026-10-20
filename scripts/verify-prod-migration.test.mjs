import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import { LINDSAY_GAMIFICATION_POINTS, LINDSAY_UID, PROD_EXPECTED, SOURCE_CURRENT_SKIP, reportLines, verifyMigration } from "./verify-prod-migration.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const script = path.join(root, "scripts", "verify-prod-migration.mjs");
const uid = "lindsay-user";
const checkInUid = "check-in-owner";
const base = `artifacts/skatingx-production/users/${uid}`;
const checkInBase = `artifacts/skatingx-production/users/${checkInUid}`;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function expected() {
  return {
    analysis: { users: 1, backups: 1, checkIns: 1 },
    current: { copy: 4, equipment: 0, checkIns: 1 },
    lindsay: { uid, gamificationPoints: 12 },
    checkInOwner: { uid: checkInUid },
  };
}

function documents() {
  return [
    { path: `${base}/settings/main`, data: { activeAthleteId: "lindsay", language: "zh", theme: "dark" } },
    {
      path: `${base}/athletes/lindsay/training/state`,
      data: { todayTasks: [], weeklyTemplate: { monday: "" }, lastLoginDate: "2026-10-20", pointsPerTask: 10, dailyBonusPoints: 5 },
    },
    {
      path: `${base}/raceDay/buffalo`,
      data: {
        eventId: "buffalo",
        name: "Buffalo",
        dates: ["2026-10-24"],
        timeZone: "America/New_York",
        venue: null,
        verification: "pending",
        source: "manual",
        sourceNote: "fixture",
        schemaVersion: 1,
      },
    },
    { path: `${base}/athletes/lindsay/gamification/main`, data: { points: 12, streakDays: 1, completedDays: [] } },
    { path: `${checkInBase}/migrationBackups/analysis-profile`, data: { points: 0, mergedIntoTrainingPoints: false } },
    { path: `${checkInBase}/athletes/lindsay/planning/main/completedTasks/jd_tech_thu`, data: { points: 15, focus: "lean" } },
  ];
}

function check(result, name) {
  const found = result.checks.find((item) => item.name === name);
  assert(found, `missing check ${name}`);
  return found;
}

const match = verifyMigration(documents(), expected());
assert(match.ok, "matching counts did not pass");
assert(reportLines(match).at(-1) === "result PASS", "match report");
assert(check(match, "check-in owner backup").ok, "check-in owner backup was not found");
assert(check(match, "check-in owner check-in").ok, "check-in owner check-in was not found");
assert(!match.checks.some((item) => item.name.includes("check-in owner gamification")), "check-in owner gamification was checked");
assert(match.checks.every((item) => item.expected !== SOURCE_CURRENT_SKIP.backups), "source skip backups were asserted");
const prodChecks = verifyMigration([], PROD_EXPECTED);
assert(prodChecks.checks.every((item) => item.expected !== 53), "53 was asserted against prod");
assert(prodChecks.checks.some((item) => item.name === "analysis backups" && item.expected === 54), "prod backups are not 54");
assert(LINDSAY_UID === "baWEw6SZKcQItvcDdpF64ZNe5W12", "lindsay uid");
assert(LINDSAY_GAMIFICATION_POINTS === 0, "lindsay points were not the source zero");
assert(PROD_EXPECTED.checkInOwner.uid === "lefwGmZ9KyW3d4NswdwF4T2VvEH3", "check-in owner uid");

const mismatchExpected = expected();
mismatchExpected.current = { ...mismatchExpected.current, copy: 5 };
const mismatch = verifyMigration(documents(), mismatchExpected);
assert(!mismatch.ok, "wrong copy count passed");
assert(check(mismatch, "current copy").ok === false, "copy mismatch was not a failure");
assert(reportLines(mismatch).some((line) => line === "FAIL current copy 4 expected 5"), "copy failure was not listed");

const orphaned = documents();
orphaned.push({ path: `${base}/notes/scratch`, data: { text: "extra" } });
const orphan = verifyMigration(orphaned, expected());
assert(!orphan.ok, "orphan passed");
assert(check(orphan, "orphans").items.includes(`${base}/notes/scratch`), "orphan path was not listed");
assert(reportLines(orphan).some((line) => line === `FAIL orphans ${base}/notes/scratch`), "orphan failure batch");

const duplicated = documents();
duplicated.push(duplicated[0]);
const duplicate = verifyMigration(duplicated, expected());
assert(check(duplicate, "duplicate ids").ok === false, "duplicate id passed");
assert(check(duplicate, "duplicate ids").items.includes(`${base}/settings/main`), "duplicate path was not listed");

const unpinned = verifyMigration(documents(), { ...expected(), lindsay: { uid, gamificationPoints: null } });
assert(check(unpinned, "lindsay gamification points").items.includes("expected source value is not set"), "unpinned points passed");
const wrongPoints = verifyMigration(documents(), { ...expected(), lindsay: { uid, gamificationPoints: 99 } });
assert(check(wrongPoints, "lindsay gamification points").ok === false, "points mismatch passed");
const withoutPoints = documents().filter((document) => !document.path.endsWith("/gamification/main"));
const absent = verifyMigration(withoutPoints, { ...expected(), lindsay: { uid, gamificationDocument: "absent" } });
assert(check(absent, "lindsay gamification points").ok, "missing gamification document was rejected");
const presentWhenAbsent = verifyMigration(documents(), { ...expected(), lindsay: { uid, gamificationDocument: "absent" } });
assert(check(presentWhenAbsent, "lindsay gamification points").items.includes("document exists"), "a present gamification document passed an absent assertion");

const source = readFileSync(script, "utf8");
assert(!source.includes(".set(") && !source.includes(".delete(") && !source.includes(".update("), "verify script writes");
assert(!source.includes("skatingx-platform") || source.includes("does not read skatingx-platform"), "verify script reads the source project");

function cli(args) {
  return spawnSync(process.execPath, [script, ...args], { cwd: root, env: process.env, encoding: "utf8" });
}

const fixtureDir = mkdtempSync(path.join(tmpdir(), "verify-prod-"));
const matchFile = path.join(fixtureDir, "match.json");
const mismatchFile = path.join(fixtureDir, "mismatch.json");
writeFileSync(matchFile, JSON.stringify({ documents: documents(), expected: expected() }));
writeFileSync(mismatchFile, JSON.stringify({ documents: orphaned, expected: expected() }));
const passed = cli(["--fixture", matchFile, "--fail-on-diff"]);
assert(passed.status === 0, "matching fixture failed the process");
assert(passed.stdout.includes("result PASS"), "matching fixture did not pass");
const failed = cli(["--fixture", mismatchFile, "--fail-on-diff"]);
assert(failed.status === 1, "orphan fixture did not fail the process");
assert(failed.stdout.includes("result FAIL"), "orphan fixture did not report FAIL");
assert(failed.stdout.includes(`FAIL orphans ${base}/notes/scratch`), "cli did not list the orphan");

console.log("[test:migration] prod verify counts, mismatch, orphan, and fail-on-diff passed");
