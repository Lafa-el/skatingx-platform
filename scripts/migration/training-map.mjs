/**
 * Pure mapping from a legacy training profile/main object to a SkatingX write plan.
 * No Firestore client and no clock read. M4 owns the actual writes and server timestamps.
 *
 * Target document updatedAt is left unset here. The contract's serverTimestamp()
 * is applied when M4 writes, because this function cannot mint one.
 */

export const PLATFORM_APP_ID = "skatingx-production";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const ALLOWED_KEYS = new Set([
  "activeTrainingPlanId",
  "avatar",
  "competitionGoalsV1",
  "completedDays",
  "createdAt",
  "customDistances",
  "customRewards",
  "dailyBonusPoints",
  "isPro",
  "language",
  "lastLoginDate",
  "ownerUid",
  "parentPin",
  "points",
  "pointsPerTask",
  "raceDate",
  "races",
  "records",
  "records1000",
  "records1500",
  "records777",
  "recordsLap",
  "recordsStart",
  "rewardHistory",
  "schemaVersion",
  "sourceApp",
  "taskHistory",
  "tasks",
  "theme",
  "trainingPlansV1",
  "updatedAt",
  "username",
  "weeklyTemplate",
]);

const RED_LINE_KEYS = ["parentPin", "avatar", "isPro"];

const SKIP_FIELDS = [
  ["customRewards", "not-migrated"],
  ["rewardHistory", "not-migrated"],
  ["customDistances", "not-migrated"],
  ["language", "not-migrated"],
  ["theme", "not-migrated"],
  ["username", "not-migrated"],
  ["ownerUid", "not-migrated"],
  ["sourceApp", "not-migrated"],
  ["schemaVersion", "not-migrated"],
  ["createdAt", "not-migrated"],
  ["updatedAt", "not-migrated"],
  ["parentPin", "red-line"],
  ["avatar", "red-line"],
  ["isPro", "red-line"],
];

const BACKUP_KEYS = [
  "competitionGoalsV1",
  "trainingPlansV1",
  "activeTrainingPlanId",
  "races",
  "raceDate",
];

const WEEK_DAYS = [
  ["1", "monday"],
  ["2", "tuesday"],
  ["3", "wednesday"],
  ["4", "thursday"],
  ["5", "friday"],
  ["6", "saturday"],
  ["0", "sunday"],
];

const WEEK_DAY_ORDER = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

const FIXED_RECORD_KEYS = {
  records: ["500m", "500m"],
  records777: ["777m", "777m"],
  records1000: ["1000m", "1000m"],
  records1500: ["1500m", "1500m"],
  recordsStart: ["start", "起跑"],
  recordsLap: ["lap", "单圈"],
};

const NORMALIZED_RECORD_KEYS = {
  "500m": ["500m", "500m"],
  "777m": ["777m", "777m"],
  "1000m": ["1000m", "1000m"],
  "1500m": ["1500m", "1500m"],
  Start: ["start", "起跑"],
  Lap: ["lap", "单圈"],
};

export class MigrationStop extends Error {
  constructor(message) {
    super(message);
    this.name = "MigrationStop";
  }
}

function stop(message) {
  throw new MigrationStop(message);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function previousDateString(dateStr) {
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() - 1);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Same calendar walk as packages/skating-domain calculateStreakDays. */
export function calculateStreakDays(completedDays, today) {
  if (completedDays.length === 0) return 0;
  const set = new Set(completedDays);
  const yesterday = previousDateString(today);
  if (!set.has(today) && !set.has(yesterday)) return 0;
  let streak = 0;
  let cursor = set.has(today) ? today : yesterday;
  while (set.has(cursor)) {
    streak += 1;
    cursor = previousDateString(cursor);
  }
  return streak;
}

export function createEmptyTargetState(uid, athleteId) {
  return {
    uid,
    athleteId,
    trainingState: {
      todayTasks: [],
      weeklyTemplate: {
        monday: "",
        tuesday: "",
        wednesday: "",
        thursday: "",
        friday: "",
        saturday: "",
        sunday: "",
      },
      lastLoginDate: "",
    },
    gamification: {
      points: 0,
      completedDays: [],
      streakDays: 0,
    },
    records: {},
    taskHistory: {},
  };
}

function assertDate(value, label) {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) stop(`${label} is not YYYY-MM-DD`);
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  const roundTrip = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  if (roundTrip !== value) stop(`${label} is not YYYY-MM-DD`);
  return value;
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function allowedKey(key) {
  return ALLOWED_KEYS.has(key) || key.startsWith("records_");
}

function claimId(raw, index, used, prefix) {
  const blank = raw === null || raw === undefined || raw === "";
  const base = blank ? `${prefix}-${index}` : `${prefix}-${String(raw)}`;
  if (!used.has(base)) {
    used.add(base);
    return base;
  }
  let next = `${base}-${index}`;
  while (used.has(next)) next = `${next}-${index}`;
  used.add(next);
  return next;
}

function mapTask(task, index, used, createdAt) {
  if (!isPlainObject(task)) stop(`Task ${index} is not an object`);
  if (typeof task.text !== "string" || task.text === "") stop(`Task ${index} is missing text`);
  const completed = task.completed === true;
  const mapped = {
    id: claimId(task.id, index, used, "legacy-task"),
    text: task.text,
    source: task.isTemplate === true ? "academy" : "manual",
    completed,
    createdAt,
  };
  if (typeof task.target === "string" && task.target.trim() !== "") mapped.target = task.target.trim();
  if (typeof task.desc === "string" && task.desc.trim() !== "") mapped.description = task.desc.trim();
  if (completed) mapped.completedAt = createdAt;
  return mapped;
}

function mapTaskList(tasks, createdAt) {
  if (!Array.isArray(tasks)) stop("tasks must be an array");
  const used = new Set();
  return tasks.map((task, index) => mapTask(task, index, used, createdAt));
}

function appendMissing(existing, incoming) {
  const ids = new Set(existing.map((item) => item.id));
  const added = incoming.filter((item) => !ids.has(item.id));
  return { merged: [...existing, ...added], added: added.length };
}

function normalizeRecordDistance(distance) {
  const raw = String(distance ?? "").trim();
  if (!raw) return "";
  const compactLower = raw.replace(/\s+/g, "").toLowerCase();
  if (compactLower === "start" || raw === "起跑") return "Start";
  if (compactLower === "lap" || raw === "单圈") return "Lap";
  const known = raw.match(/(^|[^0-9])(500|777|1000|1500)\s*m?([^0-9]|$)/i);
  if (known) return `${known[2]}m`;
  return raw.replace(/\s+/g, " ");
}

function recordDestination(key) {
  if (FIXED_RECORD_KEYS[key]) {
    const [distanceId, label] = FIXED_RECORD_KEYS[key];
    return { distanceId, label };
  }
  if (!key.startsWith("records_")) stop(`Unknown record key ${key}`);
  const suffix = key.slice("records_".length);
  const normalized = normalizeRecordDistance(suffix);
  if (NORMALIZED_RECORD_KEYS[normalized]) {
    const [distanceId, label] = NORMALIZED_RECORD_KEYS[normalized];
    return { distanceId, label };
  }
  const distanceId = suffix.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
  if (!distanceId) stop(`Record key ${key} has an empty distance id`);
  return { distanceId, label: suffix };
}

function mapTimeEntry(entry, index, used, distanceId, key) {
  if (!isPlainObject(entry)) stop(`${key} entry ${index} is not an object`);
  const date = assertDate(entry.date, `${key} entry ${index} date`);
  if (typeof entry.time !== "number" || !Number.isFinite(entry.time)) stop(`${key} entry ${index} time is not a number`);
  return {
    id: claimId(index, index, used, `legacy-time-${distanceId}`),
    date,
    timeSeconds: entry.time,
    source: "manual",
    createdAt: `${date}T00:00:00.000Z`,
  };
}

function userPath(uid) {
  return `artifacts/${PLATFORM_APP_ID}/users/${uid}`;
}

function athletePath(uid, athleteId) {
  return `${userPath(uid)}/athletes/${athleteId}`;
}

function assertTarget(targetState) {
  if (!isPlainObject(targetState)) stop("targetState must be an object");
  if (typeof targetState.uid !== "string" || targetState.uid === "") stop("targetState.uid is required");
  if (typeof targetState.athleteId !== "string" || targetState.athleteId === "") stop("targetState.athleteId is required");
  const training = targetState.trainingState;
  if (!isPlainObject(training) || !Array.isArray(training.todayTasks) || !isPlainObject(training.weeklyTemplate)) {
    stop("targetState.trainingState is missing todayTasks or weeklyTemplate");
  }
  const game = targetState.gamification;
  if (!isPlainObject(game) || typeof game.points !== "number" || !Array.isArray(game.completedDays) || typeof game.streakDays !== "number") {
    stop("targetState.gamification is incomplete");
  }
  if (!isPlainObject(targetState.records) || !isPlainObject(targetState.taskHistory)) {
    stop("targetState.records and taskHistory must be objects");
  }
}

function forbiddenKey(value, path) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => forbiddenKey(item, `${path}[${index}]`));
    return;
  }
  if (!isPlainObject(value)) return;
  for (const key of Object.keys(value)) {
    if (RED_LINE_KEYS.includes(key)) stop(`Red-line key ${key} at ${path}`);
    forbiddenKey(value[key], `${path}.${key}`);
  }
}

function collectRecordGroups(legacyDoc) {
  const groups = {};
  const keys = Object.keys(legacyDoc).filter((key) => hasOwn(FIXED_RECORD_KEYS, key) || key.startsWith("records_")).sort();
  for (const key of keys) {
    const value = legacyDoc[key];
    if (!Array.isArray(value)) stop(`${key} must be an array`);
    const destination = recordDestination(key);
    const bucket = groups[destination.distanceId] ?? { ...destination, batches: [] };
    bucket.batches.push({ key, entries: value });
    groups[destination.distanceId] = bucket;
  }
  return Object.values(groups).sort((a, b) => a.distanceId.localeCompare(b.distanceId));
}

function buildRecordWrites(legacyDoc, targetState, uid, athleteId) {
  const writes = [];
  for (const group of collectRecordGroups(legacyDoc)) {
    const used = new Set();
    const incoming = [];
    for (const batch of group.batches) {
      batch.entries.forEach((entry, index) => {
        incoming.push(mapTimeEntry(entry, index, used, group.distanceId, batch.key));
      });
    }
    const existingDoc = targetState.records[group.distanceId];
    const existingEntries = Array.isArray(existingDoc?.entries) ? existingDoc.entries : [];
    const { merged, added } = appendMissing(existingEntries, incoming);
    if (added === 0) continue;
    writes.push({
      kind: "recordsDoc",
      path: `${athletePath(uid, athleteId)}/training/main/records/${group.distanceId}`,
      payload: {
        distanceId: group.distanceId,
        label: typeof existingDoc?.label === "string" ? existingDoc.label : group.label,
        unit: "seconds",
        entries: merged,
      },
    });
  }
  return writes;
}

function buildTaskWrites(legacyDoc, targetState, executionDate, uid, athleteId) {
  const writes = [];
  const statePayload = {};
  const tasks = legacyDoc.tasks;
  if (Array.isArray(tasks) && tasks.length > 0) {
    const lastLoginDate = assertDate(legacyDoc.lastLoginDate, "lastLoginDate");
    const mapped = mapTaskList(tasks, `${lastLoginDate}T00:00:00.000Z`);
    const { merged, added } = appendMissing(targetState.trainingState.todayTasks, mapped);
    if (added > 0) {
      statePayload.todayTasks = merged;
      statePayload.lastLoginDate = executionDate;
    }
  }

  if (hasOwn(legacyDoc, "weeklyTemplate")) {
    if (!isPlainObject(legacyDoc.weeklyTemplate)) stop("weeklyTemplate must be an object");
    const unknown = Object.keys(legacyDoc.weeklyTemplate).filter((key) => !WEEK_DAYS.some(([oldKey]) => oldKey === key));
    if (unknown.length > 0) stop(`Unknown weeklyTemplate keys: ${unknown.sort().join(", ")}`);
    const current = targetState.trainingState.weeklyTemplate;
    const next = {};
    let filled = false;
    for (const day of WEEK_DAY_ORDER) {
      const oldKey = WEEK_DAYS.find(([, name]) => name === day)[0];
      const existing = typeof current[day] === "string" ? current[day] : "";
      const incoming = hasOwn(legacyDoc.weeklyTemplate, oldKey) ? legacyDoc.weeklyTemplate[oldKey] : "";
      if (incoming !== "" && typeof incoming !== "string") stop(`weeklyTemplate ${oldKey} is not a string`);
      if (existing !== "") next[day] = existing;
      else {
        next[day] = typeof incoming === "string" ? incoming : "";
        if (existing === "" && next[day] !== "") filled = true;
      }
    }
    if (filled) statePayload.weeklyTemplate = next;
  }

  if (Object.keys(statePayload).length > 0) {
    writes.push({
      kind: "state",
      path: `${athletePath(uid, athleteId)}/training/state`,
      payload: statePayload,
    });
  }

  if (hasOwn(legacyDoc, "taskHistory")) {
    if (!isPlainObject(legacyDoc.taskHistory)) stop("taskHistory must be an object");
    for (const dateId of Object.keys(legacyDoc.taskHistory).sort()) {
      assertDate(dateId, `taskHistory key ${dateId}`);
      const dayTasks = legacyDoc.taskHistory[dateId];
      if (!Array.isArray(dayTasks)) stop(`taskHistory ${dateId} must be an array`);
      if (dayTasks.length === 0) continue;
      const mapped = mapTaskList(dayTasks, `${dateId}T00:00:00.000Z`);
      const existing = targetState.taskHistory[dateId];
      const existingTasks = Array.isArray(existing?.tasks) ? existing.tasks : [];
      const { merged, added } = appendMissing(existingTasks, mapped);
      if (added === 0) continue;
      const payload = existing
        ? { ...existing, dateId, tasks: merged }
        : { dateId, tasks: merged, archivedAt: `${dateId}T00:00:00.000Z` };
      writes.push({
        kind: "taskHistoryDay",
        path: `${athletePath(uid, athleteId)}/training/main/taskHistory/${dateId}`,
        payload,
      });
    }
  }

  return writes;
}

function buildGamification(legacyDoc, targetState, executionDate, uid, athleteId, skips) {
  const payload = {};
  const game = targetState.gamification;

  if (hasOwn(legacyDoc, "points")) {
    if (typeof legacyDoc.points !== "number" || !Number.isFinite(legacyDoc.points)) stop("points is not a number");
    if (legacyDoc.points > game.points) payload.points = legacyDoc.points;
    else skips.push({ field: "points", reason: "points-not-greater" });
  }

  const sourceDays = hasOwn(legacyDoc, "completedDays") ? legacyDoc.completedDays : [];
  if (!Array.isArray(sourceDays)) stop("completedDays must be an array");
  sourceDays.forEach((day, index) => assertDate(day, `completedDays ${index}`));
  game.completedDays.forEach((day, index) => assertDate(day, `target completedDays ${index}`));
  const union = [...new Set([...game.completedDays, ...sourceDays])].sort((a, b) => a.localeCompare(b));
  const streak = calculateStreakDays(union, executionDate);
  const sameDays = union.length === game.completedDays.length && union.every((day, index) => day === [...game.completedDays].sort((a, b) => a.localeCompare(b))[index]);
  if (!sameDays) payload.completedDays = union;
  if (streak !== game.streakDays) payload.streakDays = streak;

  if (hasOwn(legacyDoc, "pointsPerTask")) {
    if (typeof legacyDoc.pointsPerTask !== "number" || !Number.isFinite(legacyDoc.pointsPerTask)) stop("pointsPerTask is not a number");
    if (legacyDoc.pointsPerTask === 10) skips.push({ field: "pointsPerTask", reason: "old-default" });
    else payload.pointsPerTask = legacyDoc.pointsPerTask;
  }
  if (hasOwn(legacyDoc, "dailyBonusPoints")) {
    if (typeof legacyDoc.dailyBonusPoints !== "number" || !Number.isFinite(legacyDoc.dailyBonusPoints)) stop("dailyBonusPoints is not a number");
    if (legacyDoc.dailyBonusPoints === 20) skips.push({ field: "dailyBonusPoints", reason: "old-default" });
    else payload.dailyBonusPoints = legacyDoc.dailyBonusPoints;
  }

  if (Object.keys(payload).length === 0) return [];
  return [{
    kind: "gamification",
    path: `${athletePath(uid, athleteId)}/gamification/main`,
    payload,
  }];
}

function buildBackup(legacyDoc, uid) {
  const backup = {};
  for (const key of BACKUP_KEYS) {
    if (hasOwn(legacyDoc, key)) backup[key] = legacyDoc[key];
  }
  if (Object.keys(backup).length === 0) return { backup: null, writes: [] };
  const payload = JSON.parse(JSON.stringify(backup));
  forbiddenKey(payload, "backup");
  return {
    backup: payload,
    writes: [{
      kind: "backupDoc",
      path: `${userPath(uid)}/migrationBackups/training-unmapped`,
      payload,
    }],
  };
}

export function buildMigrationPlan(legacyDoc, targetState, executionDate) {
  if (!isPlainObject(legacyDoc)) stop("legacyDoc must be an object");
  assertTarget(targetState);
  assertDate(executionDate, "executionDate");

  const unknown = Object.keys(legacyDoc).filter((key) => !allowedKey(key)).sort();
  if (unknown.length > 0) stop(`Unknown top-level keys: ${unknown.join(", ")}`);

  const skips = [];
  for (const [field, reason] of SKIP_FIELDS) {
    if (hasOwn(legacyDoc, field)) skips.push({ field, reason });
  }

  const { uid, athleteId } = targetState;
  const taskWrites = buildTaskWrites(legacyDoc, targetState, executionDate, uid, athleteId);
  const gameWrites = buildGamification(legacyDoc, targetState, executionDate, uid, athleteId, skips);
  const recordWrites = buildRecordWrites(legacyDoc, targetState, uid, athleteId);
  const backedUp = buildBackup(legacyDoc, uid);
  skips.sort((a, b) => a.field.localeCompare(b.field));

  const writes = [...taskWrites, ...gameWrites, ...recordWrites, ...backedUp.writes];
  forbiddenKey({ writes, backup: backedUp.backup }, "plan");
  return { writes, skips, backup: backedUp.backup };
}
