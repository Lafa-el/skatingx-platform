import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ANCHOR_PREFIX,
  SOURCE_APP,
  TARGET_UID,
  MigrationStop,
  buildJournalPlan,
} from "./journal-map.mjs";

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), "journal-map.mjs");
const OWNER = `${ANCHOR_PREFIX}fixtureOwner00000001`;
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
    sourceApp: SOURCE_APP,
    createdAt: ISO,
    updatedAt: ISO,
    ...extra,
  };
}

function mainSource() {
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
          location: "rink-placeholder",
          coachName: "coach-placeholder",
          notes: "notes-placeholder",
          technicalFocus: "technical-placeholder",
          mainSet: "set-placeholder",
          lapTimesNote: "laps-placeholder",
          equipmentNote: "equipment-placeholder",
          recoveryNote: "recovery-placeholder",
          durationMinutes: 30,
          iceTimeMinutes: 20,
          drylandMinutes: 10,
          intensity: 1,
          focusTags: ["tag-placeholder"],
          startsPractice: true,
          cornerFocus: false,
          straightawayFocus: true,
          relayPractice: false,
          raceSimulation: true,
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

function withCollection(name, docs) {
  return { ...mainSource(), [name]: docs };
}

function expectStop(source, target = {}, options = OPTIONS) {
  let plan = "not-returned";
  let error = null;
  try {
    plan = buildJournalPlan(source, target, options);
  } catch (caught) {
    error = caught;
  }
  assert(error instanceof MigrationStop, error instanceof Error ? error.message : "did not throw");
  assert(plan === "not-returned", "a failed plan was returned");
  if (error) assert(!String(error.message).includes(OWNER), "stop message included the athlete id");
}

function testMainFixture() {
  const plan = buildJournalPlan(mainSource(), {}, OPTIONS);
  assert(plan.writes.length === 7, `writes=${plan.writes.length}`);
  assert(plan.skips.length === 0, "main fixture skipped a document");
  const byPath = Object.fromEntries(plan.writes.map((write) => [write.path, write.data]));
  const athlete = byPath["journal/athlete/main"];
  assert(athlete.displayName === "skater-placeholder", "displayName");
  assert(athlete.skatingFrom === "2018", "skatingFrom stays a string");
  assert(!Object.prototype.hasOwnProperty.call(athlete, "schemaVersion"), "athlete schemaVersion was invented");
  assert(!Object.prototype.hasOwnProperty.call(athlete, "bio"), "bio was copied");
  assert(!Object.prototype.hasOwnProperty.call(athlete.legacy, "documentId"), "athlete legacy kept the source id");
  assert(athlete.legacy.appId === SOURCE_APP && athlete.legacy.collection === "athletes", "athlete legacy");
  assert(athlete.sourceApp === SOURCE_APP, "sourceApp copied");
  assert(athlete.createdAt === ISO && athlete.updatedAt === ISO, "timestamps copied");

  const day1 = byPath["journal/days/day-1"];
  const day2 = byPath["journal/days/day-2"];
  assert(day1.schemaVersion === "skatingx-journal-v1", "day schemaVersion");
  assert(day1.energy === 4 && day1.overallFeeling === 3, "day numbers");
  assert(day1.isCompleted === true, "day boolean");
  assert(day1.lindsayReflection.tomorrowFocus === "tomorrow-placeholder", "reflection");
  assert(day1.legacy.documentId === "day-1" && day1.legacy.collection === "journal_days", "day legacy");
  assert(!Object.prototype.hasOwnProperty.call(day2, "schemaVersion"), "sparse day gained schemaVersion");
  assert(!Object.prototype.hasOwnProperty.call(day2, "energy"), "sparse day gained energy");
  assert(!Object.prototype.hasOwnProperty.call(day2, "soreness"), "sparse day gained soreness");
  assert(!Object.prototype.hasOwnProperty.call(day2, "trainingFocus"), "sparse day gained trainingFocus");
  assert(!Object.prototype.hasOwnProperty.call(day2, "coachFeedback"), "sparse day gained coachFeedback");
  assert(day2.date === "2026-07-01" && day2.isCompleted === false, "sparse day kept its own fields");

  const session1 = byPath["journal/sessions/session-1"];
  const session2 = byPath["journal/sessions/session-2"];
  const session3 = byPath["journal/sessions/session-3"];
  assert(session1.schemaVersion === "skatingx-journal-v1", "one session keeps schemaVersion");
  assert(!Object.prototype.hasOwnProperty.call(session2, "schemaVersion"), "other sessions stay without schemaVersion");
  assert(session2.iceTimeMinutes === 20 && session2.startsPractice === true, "optional session fields");
  assert(!Object.prototype.hasOwnProperty.call(session3, "iceTimeMinutes"), "minimal session gained minutes");
  assert(session3.durationMinutes === 0 && session3.focusTags.length === 0, "zero and empty array stay");
  assert(byPath["journal/bodyStatus/body-1"].fatigueLevel === 2, "body fatigue");
  assert(!Object.prototype.hasOwnProperty.call(byPath["journal/bodyStatus/body-1"], "schemaVersion"), "body schemaVersion was invented");
  assert(byPath["journal/bodyStatus/body-1"].legacy.documentId === "body-1", "body legacy id");
}

function testEmptyCollections() {
  const coach = buildJournalPlan(
    withCollection("coach_notes", [
      {
        id: "note-1",
        data: meta({
          schemaVersion: "skatingx-journal-v1",
          date: "2026-06-08",
          coachName: "coach-placeholder",
          note: "note-placeholder",
          priority: "medium",
          followUpTomorrow: false,
          linkedSessionId: "session-1",
          technicalTags: ["tag-placeholder"],
        }),
      },
    ]),
    {},
    OPTIONS,
  );
  const note = coach.writes.find((write) => write.path === "journal/coachNotes/note-1");
  assert(note.data.note === "note-placeholder" && note.data.followUpTomorrow === false, "coach note");
  assert(note.data.legacy.collection === "coach_notes", "coach legacy");

  const performance = buildJournalPlan(
    withCollection("performance_records", [
      {
        id: "perf-1",
        data: meta({
          date: "2026-06-08",
          event: "event-placeholder",
          metric: "metric-placeholder",
          timeSeconds: 40.5,
          value: 0,
          isPB: true,
          context: "context-placeholder",
          notes: "notes-placeholder",
        }),
      },
    ]),
    {},
    OPTIONS,
  );
  const record = performance.writes.find((write) => write.path === "journal/performance/perf-1");
  assert(record.data.timeSeconds === 40.5 && record.data.value === 0 && record.data.isPB === true, "performance");

  const videos = buildJournalPlan(
    withCollection("video_refs", [
      {
        id: "video-1",
        data: meta({
          title: "title-placeholder",
          fileName: "file-placeholder",
          externalUrl: "https://example.test/clip",
          sessionId: "session-1",
          analysisStatus: "pending",
          notes: "notes-placeholder",
          technicalTags: ["tag-placeholder"],
        }),
      },
    ]),
    {},
    OPTIONS,
  );
  const video = videos.writes.find((write) => write.path === "journal/videos/video-1");
  assert(video.data.externalUrl === "https://example.test/clip", "video url is copied as a string");

  const reviews = buildJournalPlan(
    withCollection("weekly_reviews", [
      {
        id: "week-1",
        data: meta({
          weekStart: "2026-06-08",
          iceSessions: 2,
          drylandSessions: 0,
          privateLessons: 1,
          totalTrainingMinutes: 90,
          bestMoment: "moment-placeholder",
          nextWeekFocus: "next-placeholder",
          parentSummary: "summary-placeholder",
          weekSessions: ["session-placeholder"],
          topTechnicalIssues: ["issue-placeholder"],
          topCoachNotes: ["note-placeholder"],
          bestPerformances: ["performance-placeholder"],
        }),
      },
    ]),
    {},
    OPTIONS,
  );
  const review = reviews.writes.find((write) => write.path === "journal/weeklyReviews/week-1");
  assert(review.data.weekStart === "2026-06-08", "weekStart");
  assert(review.data.weekSessions[0] === "session-placeholder", "weekSessions");
  assert(review.data.bestPerformances.length === 1, "bestPerformances");
}

function testStops() {
  const unknown = mainSource();
  unknown.journal_days[0].data.extraNote = "extra-placeholder";
  expectStop(unknown);

  const wrongType = mainSource();
  wrongType.journal_days[0].data.overallFeeling = "3";
  expectStop(wrongType);

  const outOfRange = mainSource();
  outOfRange.journal_days[0].data.overallFeeling = 6;
  expectStop(outOfRange);

  const badDate = mainSource();
  badDate.journal_days[0].data.date = "2026-02-31";
  expectStop(badDate);

  const bareTimestamp = mainSource();
  bareTimestamp.journal_days[0].data.createdAt = "2026-06-08";
  expectStop(bareTimestamp);

  const mixedArray = mainSource();
  mixedArray.training_sessions[0].data.focusTags = ["tag-placeholder", 1];
  expectStop(mixedArray);

  const extraReflection = mainSource();
  extraReflection.journal_days[0].data.lindsayReflection = {
    bestThing: "best-placeholder",
    needsWork: "work-placeholder",
    tomorrowFocus: "tomorrow-placeholder",
    mood: "extra-placeholder",
  };
  expectStop(extraReflection);

  const badVersion = mainSource();
  badVersion.journal_days[0].data.schemaVersion = "skatingx-journal-v2";
  expectStop(badVersion);

  const badApp = mainSource();
  badApp.journal_days[1].data.sourceApp = "other-app";
  expectStop(badApp);

  expectStop(
    withCollection("milestones", [
      { id: "milestone-1", data: meta({ date: "2026-06-08" }) },
    ]),
  );

  const withBio = mainSource();
  withBio.athletes[0].data.bio = "bio-placeholder";
  expectStop(withBio);

  expectStop(withCollection("athletes", []));
  const secondAthlete = mainSource();
  secondAthlete.athletes.push({
    id: `${ANCHOR_PREFIX}otherOwner0000000002`,
    data: meta({ athleteId: `${ANCHOR_PREFIX}otherOwner0000000002`, displayName: "other-placeholder" }),
  });
  expectStop(secondAthlete);

  const idIsAthlete = mainSource();
  idIsAthlete.journal_days[0].id = OWNER;
  expectStop(idIsAthlete);

  const secondId = mainSource();
  secondId.journal_days[1].data.athleteId = `${ANCHOR_PREFIX}otherOwner0000000002`;
  expectStop(secondId);

  const wrongPrefix = mainSource();
  const otherOwner = "zzzzzzzzfixtureOwner00000001";
  wrongPrefix.athletes[0].id = otherOwner;
  wrongPrefix.athletes[0].data.athleteId = otherOwner;
  for (const name of ["journal_days", "training_sessions", "body_status"]) {
    for (const doc of wrongPrefix[name]) doc.data.athleteId = otherOwner;
  }
  expectStop(wrongPrefix);
}

function testIdempotency() {
  const source = mainSource();
  const first = buildJournalPlan(source, {}, OPTIONS);
  const target = Object.fromEntries(first.writes.map((write) => [write.path, write.data]));
  const second = buildJournalPlan(source, target, OPTIONS);
  assert(second.writes.length === 0, "identical target still wrote");
  assert(second.skips.length === 7, `skips=${second.skips.length}`);
  assert(second.skips.every((skip) => skip.reason === "already-identical"), "skip reason");

  const changed = structuredClone(target);
  changed["journal/days/day-2"].parentNote = "changed-placeholder";
  expectStop(source, changed);
}

function testRedLines() {
  const plan = buildJournalPlan(mainSource(), {}, OPTIONS);
  const serialized = JSON.stringify(plan);
  assert(!serialized.includes(OWNER), "plan leaked the athlete id");
  assert(!serialized.includes("athleteId"), "plan leaked the athleteId field name");
  assert(serialized.includes("legacy"), "legacy marker missing");
  assert(serialized.includes("\"collection\":\"journal_days\""), "collection name missing");

  const file = readFileSync(script, "utf8");
  assert(!/^\s*import\s/m.test(file), "module imports something");
  assert(!file.includes("Date.now") && !file.includes("new Date("), "module reads the clock");
  assert(!file.includes("firebase"), "module touches firebase");
}

testMainFixture();
testEmptyCollections();
testStops();
testIdempotency();
testRedLines();
console.log(`journal-map.test.mjs ok assertions=${assertions}`);
