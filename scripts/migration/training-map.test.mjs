import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  MigrationStop,
  buildMigrationPlan,
  calculateStreakDays,
  createEmptyTargetState,
} from "./training-map.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const script = path.join(root, "scripts", "migration", "training-map.mjs");
const executionDate = "2024-05-03";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function entry(date, time) {
  return { date, time };
}

function target(overrides = {}) {
  const state = createEmptyTargetState("new-user", "lindsay");
  return {
    ...state,
    ...overrides,
    trainingState: { ...state.trainingState, ...overrides.trainingState },
    gamification: { ...state.gamification, ...overrides.gamification },
    records: overrides.records ?? state.records,
    taskHistory: overrides.taskHistory ?? state.taskHistory,
  };
}

function plan(doc, state = target(), date = executionDate) {
  return buildMigrationPlan(doc, state, date);
}

function writesOf(result, kind) {
  return result.writes.filter((write) => write.kind === kind);
}

function forbiddenKeys(value, found = []) {
  if (Array.isArray(value)) {
    value.forEach((item) => forbiddenKeys(item, found));
    return found;
  }
  if (!value || typeof value !== "object") return found;
  for (const key of Object.keys(value)) {
    if (key === "parentPin" || key === "avatar" || key === "isPro") found.push(key);
    forbiddenKeys(value[key], found);
  }
  return found;
}

const lindsayDoc = {
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
  customDistances: ["起跑", "单圈", "500m", "777m", "1000m", "1500m"],
  rewardHistory: [],
  points: 5,
  pointsPerTask: 10,
  dailyBonusPoints: 20,
  parentPin: "9999",
  avatar: "data:image/png;base64,AAAA",
  isPro: true,
  language: "zh",
  theme: "purple",
  username: "Fixture",
  lastLoginDate: "2024-04-01",
  ownerUid: "source",
  sourceApp: "blaze-skate-training",
  schemaVersion: "skatingx-training-v1",
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-04-01T00:00:00.000Z",
  weeklyTemplate: { 0: "rest", 1: "ice", 2: "sprint", 3: "tempo", 4: "tech", 5: "interval", 6: "long" },
};

const taskDoc = {
  tasks: [
    { id: 15, text: "first", completed: false },
    { id: "15", text: "second", completed: true, target: "3x", desc: "how", isTemplate: true },
  ],
  taskHistory: {
    "2024-05-01": [{ id: 7, text: "archived", completed: false }],
  },
  completedDays: ["2024-05-02", "2024-05-01"],
  points: 30,
  lastLoginDate: "2024-05-02",
};

const goalDoc = {
  competitionGoalsV1: [{ id: "goal_1", title: "city" }],
  trainingPlansV1: [{ id: "plan_1", title: "week", goalId: "goal_1" }],
  activeTrainingPlanId: "plan_1",
  races: [{ id: 9, name: "final", date: "2024-07-01" }],
};

function testLindsayShape() {
  const state = target({ gamification: { points: 9, completedDays: [], streakDays: 0 } });
  const result = plan(lindsayDoc, state);
  assert(JSON.stringify(result) === JSON.stringify(plan(lindsayDoc, state)), "lindsay plan is stable");
  assert(result.backup && Object.keys(result.backup).join() === "races", "backup is only races");
  assert(result.backup.races.length === 6, "six races");
  const stateWrite = writesOf(result, "state")[0];
  assert(stateWrite.payload.weeklyTemplate.sunday === "rest", "0 maps to sunday");
  assert(stateWrite.payload.weeklyTemplate.monday === "ice", "1 maps to monday");
  assert(!Object.prototype.hasOwnProperty.call(stateWrite.payload, "lastLoginDate"), "empty tasks do not set lastLoginDate");
  assert(!Object.prototype.hasOwnProperty.call(stateWrite.payload, "todayTasks"), "no today tasks were added");
  const records = writesOf(result, "recordsDoc");
  assert(records.length === 6, "six distance docs");
  const fiveHundred = records.find((write) => write.payload.distanceId === "500m");
  assert(fiveHundred.payload.entries.length === 3, "three 500m entries");
  assert(fiveHundred.payload.entries[0].id === "legacy-time-500m-0", "time id");
  assert(fiveHundred.payload.unit === "seconds", "unit");
  assert(records.find((write) => write.payload.distanceId === "start").payload.label === "起跑", "start label");
  assert(writesOf(result, "gamification").length === 0, "defaults and smaller points do not write gamification");
  assert(result.skips.some((skip) => skip.field === "parentPin" && skip.reason === "red-line"), "pin skipped");
  assert(result.skips.some((skip) => skip.field === "pointsPerTask" && skip.reason === "old-default"), "default points per task skipped");
  assert(forbiddenKeys(result).length === 0, `red-line key leaked: ${forbiddenKeys(result).join(",")}`);
  const body = JSON.stringify({ writes: result.writes, backup: result.backup });
  assert(!body.includes("parentPin") && !body.includes("avatar") && !body.includes("isPro"), "red-line text in writes or backup");
  assert(!body.includes("9999") && !body.includes("AAAA"), "red-line values copied");
}

function testTaskShape() {
  const higher = plan(taskDoc, target({ gamification: { points: 10, completedDays: ["2024-05-03"], streakDays: 0 } }));
  const game = writesOf(higher, "gamification")[0];
  assert(game.payload.points === 30, "larger points win");
  assert(game.payload.completedDays.join() === "2024-05-01,2024-05-02,2024-05-03", "completed day union");
  assert(game.payload.streakDays === 3, "streak recomputed");
  assert(calculateStreakDays(["2024-05-01", "2024-05-02", "2024-05-03"], "2024-05-03") === 3, "streak helper");
  const tasks = writesOf(higher, "state")[0].payload.todayTasks;
  assert(tasks.map((task) => task.id).join() === "legacy-task-15,legacy-task-15-1", "colliding ids");
  assert(tasks[1].source === "academy" && tasks[1].description === "how" && tasks[1].completedAt === "2024-05-02T00:00:00.000Z", "template task shape");
  assert(writesOf(higher, "state")[0].payload.lastLoginDate === executionDate, "lastLoginDate is the execution date");
  const history = writesOf(higher, "taskHistoryDay")[0];
  assert(history.path.endsWith("/taskHistory/2024-05-01"), "history path");
  assert(history.payload.archivedAt === "2024-05-01T00:00:00.000Z", "archivedAt");
  assert(history.payload.tasks[0].createdAt === "2024-05-01T00:00:00.000Z", "history createdAt");

  const lower = plan(taskDoc, target({ gamification: { points: 40, completedDays: [], streakDays: 0 } }));
  assert(!Object.prototype.hasOwnProperty.call(writesOf(lower, "gamification")[0].payload, "points"), "smaller points are not written");
  assert(lower.skips.some((skip) => skip.field === "points" && skip.reason === "points-not-greater"), "smaller points are skipped");

  const existing = { id: "legacy-task-15", text: "kept", completed: false, source: "manual", createdAt: "2024-01-01T00:00:00.000Z" };
  const appended = plan(taskDoc, target({
    trainingState: { todayTasks: [existing], weeklyTemplate: createEmptyTargetState("new-user", "lindsay").trainingState.weeklyTemplate, lastLoginDate: "2024-05-01" },
    gamification: { points: 40, completedDays: ["2024-05-01", "2024-05-02", "2024-05-03"], streakDays: 3 },
  }));
  const merged = writesOf(appended, "state")[0].payload.todayTasks;
  assert(merged[0] === existing, "existing task object is kept");
  assert(merged.length === 2 && merged[1].id === "legacy-task-15-1", "only the new id is appended");
  assert(writesOf(appended, "gamification").length === 0, "unchanged gamification is not written");
}

function testGoalShape() {
  const result = plan(goalDoc);
  assert(writesOf(result, "state").length === 0, "goals do not write training state");
  assert(writesOf(result, "recordsDoc").length === 0, "goals do not write records");
  assert(writesOf(result, "gamification").length === 0, "goals do not write gamification");
  assert(writesOf(result, "backupDoc").length === 1, "one backup");
  assert(result.writes[0].path === "artifacts/skatingx-production/users/new-user/migrationBackups/training-unmapped", "backup path");
  assert(Object.keys(result.backup).join() === "competitionGoalsV1,trainingPlansV1,activeTrainingPlanId,races", "backup keys");
  assert(result.backup.trainingPlansV1[0].title === "week", "plan kept as-is");
  assert(!JSON.stringify(result.writes).includes("/planning/"), "plans stay out of planning");
}

function testExceptionsAndCustomRecords() {
  let thrown = null;
  try {
    plan({ tasks: [], mystery: true });
  } catch (error) {
    thrown = error;
  }
  assert(thrown instanceof MigrationStop && thrown.message.includes("mystery"), "unknown key was not named");

  thrown = null;
  try {
    plan({ records: [{ date: "2024/01/01", time: 1 }] });
  } catch (error) {
    thrown = error;
  }
  assert(thrown instanceof MigrationStop && thrown.message.includes("YYYY-MM-DD"), "bad date was accepted");

  thrown = null;
  try {
    plan({ records_: [{ date: "2024-01-01", time: 1 }] });
  } catch (error) {
    thrown = error;
  }
  assert(thrown instanceof MigrationStop && thrown.message.includes("empty distance id"), "empty custom distance was accepted");

  const custom = plan({
    records: [entry("2024-01-01", 10)],
    records_500m: [entry("2024-01-02", 11)],
    records_IceDay: [entry("2024-01-03", 12)],
    pointsPerTask: 15,
    dailyBonusPoints: 20,
  });
  const fiveHundred = writesOf(custom, "recordsDoc").find((write) => write.payload.distanceId === "500m");
  assert(fiveHundred.payload.entries.map((item) => item.id).join() === "legacy-time-500m-0,legacy-time-500m-0-0", "500m merge keeps both ids");
  assert(fiveHundred.payload.entries[1].timeSeconds === 11, "merged entry kept its time");
  const customDistance = writesOf(custom, "recordsDoc").find((write) => write.payload.distanceId === "iceday");
  assert(customDistance.payload.label === "IceDay", "new distance label");
  assert(writesOf(custom, "gamification")[0].payload.pointsPerTask === 15, "non-default points per task");
  assert(!Object.prototype.hasOwnProperty.call(writesOf(custom, "gamification")[0].payload, "dailyBonusPoints"), "default bonus is not written");

  const existingEntry = { id: "legacy-time-500m-0", date: "2023-01-01", timeSeconds: 9, source: "manual", createdAt: "2023-01-01T00:00:00.000Z" };
  const again = plan(
    { records: [entry("2024-01-01", 10)] },
    target({ records: { "500m": { distanceId: "500m", label: "500m", unit: "seconds", entries: [existingEntry] } } }),
  );
  assert(writesOf(again, "recordsDoc").length === 0, "existing time entry is not duplicated");
}

function testModuleDoesNoIo() {
  const source = readFileSync(script, "utf8");
  assert(!source.includes("firebase-admin"), "firebase admin import");
  assert(!/\.(set|update|delete|create)\s*\(/.test(source), "write call");
  assert(!source.includes("new Date()"), "system clock");
}

function testPathsUseArguments() {
  const result = plan(taskDoc, target());
  assert(result.writes[0].path === "artifacts/skatingx-production/users/new-user/athletes/lindsay/training/state", "state path");
  const other = plan(taskDoc, createEmptyTargetState("other-user", "athlete-2"));
  assert(other.writes[0].path.includes("/users/other-user/athletes/athlete-2/"), "ids come from targetState");
}

testLindsayShape();
testTaskShape();
testGoalShape();
testExceptionsAndCustomRecords();
testModuleDoesNoIo();
testPathsUseArguments();
console.log("training-map.test.mjs ok");
