/**
 * Pure mapping from legacy journal documents to a SkatingX write plan.
 * No imports, no clock, no I/O. M4 owns the writes.
 * createdAt and updatedAt are copied from the source. This function does not mint timestamps.
 */

export const ANCHOR_PREFIX = "pH6yf0RX";
export const TARGET_UID = "baWEw6SZKcQItvcDdpF64ZNe5W12";
export const SOURCE_APP = "blaze-skate-journal";
export const JOURNAL_VERSION = "skatingx-journal-v1";
export const ATHLETE_VERSION = "skatingx-athlete-v1";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_LENGTHS = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const REFLECTION_KEYS = ["bestThing", "needsWork", "tomorrowFocus"];
const META_KEYS = ["athleteId", "sourceApp", "schemaVersion", "createdAt", "updatedAt"];

const STRING = { kind: "string" };
const BOOL = { kind: "boolean" };
const DATE = { kind: "date" };
const STRING_ARRAY = { kind: "string-array" };
const REFLECTION = { kind: "reflection" };

function numberField(min, max) {
  return { kind: "number", min, max };
}

const ONE_TO_FIVE = numberField(1, 5);
const ONE_TO_SIX = numberField(1, 6);
const ZERO_UP = numberField(0, null);

const COLLECTIONS = [
  {
    name: "athletes",
    version: ATHLETE_VERSION,
    path: () => "journal/athlete/main",
    fields: {
      displayName: STRING,
      avatarUrl: STRING,
      birthday: STRING,
      skatingFrom: STRING,
    },
  },
  {
    name: "journal_days",
    version: JOURNAL_VERSION,
    path: (id) => `journal/days/${id}`,
    fields: {
      date: DATE,
      location: STRING,
      dayType: STRING,
      overallFeeling: ONE_TO_FIVE,
      energy: ONE_TO_FIVE,
      soreness: STRING,
      trainingFocus: STRING,
      coachFeedback: STRING,
      parentNote: STRING,
      isCompleted: BOOL,
      lindsayReflection: REFLECTION,
    },
  },
  {
    name: "training_sessions",
    version: JOURNAL_VERSION,
    path: (id) => `journal/sessions/${id}`,
    fields: {
      date: DATE,
      sessionLabel: STRING,
      sessionType: STRING,
      location: STRING,
      coachName: STRING,
      notes: STRING,
      technicalFocus: STRING,
      mainSet: STRING,
      lapTimesNote: STRING,
      equipmentNote: STRING,
      recoveryNote: STRING,
      durationMinutes: ZERO_UP,
      iceTimeMinutes: ZERO_UP,
      drylandMinutes: ZERO_UP,
      intensity: ONE_TO_FIVE,
      focusTags: STRING_ARRAY,
      startsPractice: BOOL,
      cornerFocus: BOOL,
      straightawayFocus: BOOL,
      relayPractice: BOOL,
      raceSimulation: BOOL,
    },
  },
  {
    name: "coach_notes",
    version: JOURNAL_VERSION,
    path: (id) => `journal/coachNotes/${id}`,
    fields: {
      date: DATE,
      coachName: STRING,
      note: STRING,
      priority: STRING,
      followUpTomorrow: BOOL,
      linkedSessionId: STRING,
      technicalTags: STRING_ARRAY,
    },
  },
  {
    name: "body_status",
    version: JOURNAL_VERSION,
    path: (id) => `journal/bodyStatus/${id}`,
    fields: {
      date: DATE,
      sleepHours: ZERO_UP,
      fatigueLevel: ONE_TO_SIX,
      mood: ONE_TO_SIX,
      bodyWeightLb: ZERO_UP,
      heightCm: ZERO_UP,
      sorenessAreas: STRING_ARRAY,
      injuryNote: STRING,
    },
  },
  {
    name: "performance_records",
    version: JOURNAL_VERSION,
    path: (id) => `journal/performance/${id}`,
    fields: {
      date: DATE,
      event: STRING,
      metric: STRING,
      timeSeconds: ZERO_UP,
      value: ZERO_UP,
      isPB: BOOL,
      context: STRING,
      notes: STRING,
    },
  },
  {
    name: "video_refs",
    version: JOURNAL_VERSION,
    path: (id) => `journal/videos/${id}`,
    fields: {
      title: STRING,
      fileName: STRING,
      externalUrl: STRING,
      sessionId: STRING,
      analysisStatus: STRING,
      notes: STRING,
      technicalTags: STRING_ARRAY,
    },
  },
  {
    name: "weekly_reviews",
    version: JOURNAL_VERSION,
    path: (id) => `journal/weeklyReviews/${id}`,
    fields: {
      weekStart: DATE,
      iceSessions: ZERO_UP,
      drylandSessions: ZERO_UP,
      privateLessons: ZERO_UP,
      totalTrainingMinutes: ZERO_UP,
      bestMoment: STRING,
      nextWeekFocus: STRING,
      parentSummary: STRING,
      weekSessions: STRING_ARRAY,
      topTechnicalIssues: STRING_ARRAY,
      topCoachNotes: STRING_ARRAY,
      bestPerformances: STRING_ARRAY,
    },
  },
  {
    name: "milestones",
    version: JOURNAL_VERSION,
    path: (id) => `journal/milestones/${id}`,
    fields: {},
  },
];

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

function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function isRealDate(value) {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) return false;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  if (month < 1 || month > 12) return false;
  const length = month === 2 && isLeapYear(year) ? 29 : MONTH_LENGTHS[month];
  return day >= 1 && day <= length;
}

function isIsoTimestamp(value) {
  return typeof value === "string" && value.includes("T") && Number.isFinite(Date.parse(value));
}

function isSafeId(value) {
  return typeof value === "string" && value.length > 0 && !value.includes("/");
}

function copyValue(spec, value, label) {
  if (spec.kind === "string") {
    if (typeof value !== "string") stop(`${label} must be a string`);
    return value;
  }
  if (spec.kind === "boolean") {
    if (typeof value !== "boolean") stop(`${label} must be a boolean`);
    return value;
  }
  if (spec.kind === "date") {
    if (!isRealDate(value)) stop(`${label} must be a real YYYY-MM-DD date`);
    return value;
  }
  if (spec.kind === "number") {
    if (typeof value !== "number" || !Number.isFinite(value)) stop(`${label} must be a finite number`);
    if (value < spec.min || (spec.max !== null && value > spec.max)) stop(`${label} is outside its range`);
    return value;
  }
  if (spec.kind === "string-array") {
    if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
      stop(`${label} must be an array of strings`);
    }
    return value.slice();
  }
  if (spec.kind === "reflection") {
    if (!isPlainObject(value)) stop(`${label} must be an object`);
    const copy = {};
    for (const key of Object.keys(value)) {
      if (!REFLECTION_KEYS.includes(key)) stop(`${label} has an unknown key`);
      if (typeof value[key] !== "string") stop(`${label}.${key} must be a string`);
      copy[key] = value[key];
    }
    return copy;
  }
  stop(`${label} has no rule`);
}

function mappedDocument(spec, doc) {
  if (!isPlainObject(doc) || !isPlainObject(doc.data)) stop(`${spec.name} document is not an object`);
  if (!isSafeId(doc.id)) stop(`${spec.name} document id is missing`);
  const data = doc.data;
  const allowed = new Set([...META_KEYS, ...Object.keys(spec.fields)]);
  for (const key of Object.keys(data)) {
    if (!allowed.has(key)) stop(`${spec.name} has an unknown field`);
  }
  if (data.sourceApp !== SOURCE_APP) stop("sourceApp is not blaze-skate-journal");
  if (Object.prototype.hasOwnProperty.call(data, "schemaVersion") && data.schemaVersion !== spec.version) {
    stop("schemaVersion is not an allowed value");
  }
  for (const key of ["createdAt", "updatedAt"]) {
    if (Object.prototype.hasOwnProperty.call(data, key) && !isIsoTimestamp(data[key])) {
      stop(`${key} must be an ISO string containing T`);
    }
  }

  const output = {};
  for (const [key, fieldSpec] of Object.entries(spec.fields)) {
    if (!Object.prototype.hasOwnProperty.call(data, key)) continue;
    output[key] = copyValue(fieldSpec, data[key], `${spec.name}.${key}`);
  }
  output.sourceApp = data.sourceApp;
  if (Object.prototype.hasOwnProperty.call(data, "schemaVersion")) output.schemaVersion = data.schemaVersion;
  if (Object.prototype.hasOwnProperty.call(data, "createdAt")) output.createdAt = data.createdAt;
  if (Object.prototype.hasOwnProperty.call(data, "updatedAt")) output.updatedAt = data.updatedAt;
  output.legacy = { appId: SOURCE_APP, collection: spec.name };
  if (spec.name !== "athletes") output.legacy.documentId = doc.id;
  return output;
}

function athleteIdOf(data) {
  const value = data?.athleteId;
  return typeof value === "string" && value.length >= 8 ? value : null;
}

function assertIdentity(source, anchorPrefix) {
  let seen = null;
  for (const spec of COLLECTIONS) {
    for (const doc of source[spec.name]) {
      const athleteId = athleteIdOf(doc?.data);
      if (!athleteId) stop("athleteId is missing");
      if (seen === null) seen = athleteId;
      else if (seen !== athleteId) stop("more than one athleteId");
    }
  }
  if (seen === null) stop("athleteId is missing");
  if (seen.slice(0, 8) !== anchorPrefix) stop("anchor prefix mismatch");
  return seen;
}

function deepEqual(left, right) {
  if (left === right) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    return left.every((item, index) => deepEqual(item, right[index]));
  }
  if (isPlainObject(left) || isPlainObject(right)) {
    if (!isPlainObject(left) || !isPlainObject(right)) return false;
    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();
    if (leftKeys.length !== rightKeys.length) return false;
    return leftKeys.every((key, index) => key === rightKeys[index] && deepEqual(left[key], right[key]));
  }
  return false;
}

function assertOutputHasNoAthleteId(value, athleteId) {
  if (typeof value === "string") {
    if (value.includes(athleteId)) stop("output contains the source athlete id");
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) assertOutputHasNoAthleteId(item, athleteId);
    return;
  }
  if (!isPlainObject(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (key === "athleteId") stop("output contains an athleteId field");
    assertOutputHasNoAthleteId(child, athleteId);
  }
}

function readSource(source) {
  if (!isPlainObject(source)) stop("source is missing");
  const names = COLLECTIONS.map((spec) => spec.name);
  for (const name of names) {
    if (!Array.isArray(source[name])) stop(`source is missing ${name}`);
  }
  for (const key of Object.keys(source)) {
    if (!names.includes(key)) stop("source has an unknown collection");
  }
}

export function buildJournalPlan(source, targetJournalDocs, options) {
  readSource(source);
  if (!isPlainObject(targetJournalDocs)) stop("target journal docs are missing");
  if (!isPlainObject(options)) stop("options are missing");
  if (options.anchorPrefix !== ANCHOR_PREFIX) stop("anchor prefix mismatch");
  if (options.targetUid !== TARGET_UID) stop("target uid mismatch");
  if (source.athletes.length !== 1) stop("athletes count is not 1");
  if (source.milestones.length !== 0) stop("milestones are not migrated");

  const athleteId = assertIdentity(source, options.anchorPrefix);
  const athlete = source.athletes[0];
  if (athlete.id !== athleteId) stop("athletes document id does not match athleteId");

  const writes = [];
  const skips = [];
  const seenPaths = new Set();
  for (const spec of COLLECTIONS) {
    if (spec.name === "milestones") continue;
    for (const doc of source[spec.name]) {
      if (spec.name !== "athletes" && doc.id === athleteId) stop("document id equals athleteId");
      const path = spec.path(doc.id);
      if (seenPaths.has(path)) stop("duplicate target path");
      seenPaths.add(path);
      const data = mappedDocument(spec, doc);
      if (Object.prototype.hasOwnProperty.call(targetJournalDocs, path)) {
        const current = targetJournalDocs[path];
        if (!isPlainObject(current)) stop("target document is not an object");
        if (!deepEqual(current, data)) stop("target document differs");
        skips.push({ path, reason: "already-identical" });
      } else {
        writes.push({ path, data });
      }
    }
  }

  const plan = { writes, skips };
  assertOutputHasNoAthleteId(plan, athleteId);
  return plan;
}
