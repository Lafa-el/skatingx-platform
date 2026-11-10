import { beforeEach, describe, expect, it, vi } from "vitest";

const firestore = vi.hoisted(() => ({
  collection: vi.fn((...parts: string[]) => ({ kind: "collection", parts })),
  doc: vi.fn((...parts: string[]) => ({ kind: "doc", parts })),
  onSnapshot: vi.fn(),
  setDoc: vi.fn(),
  addDoc: vi.fn(async (ref: { parts: string[] }, _data: unknown) => ({ ...ref, id: "auto-1" })),
  deleteDoc: vi.fn(),
}));

vi.mock("firebase/firestore", () => firestore);

import {
  buildJournalDayWrite,
  buildJournalSessionWrite,
  createJournalSession,
  journalDayFromDocument,
  journalSessionFromDocument,
  saveJournalDay,
  setJournalDayCompleted,
  subscribeToJournal,
  updateJournalSession,
} from "./journal";

const NOW = "2026-11-02T12:00:00.000Z";

describe("journal documents", () => {
  it("keeps present fields and leaves missing ones off the record", () => {
    const day = journalDayFromDocument("src-1", {
      date: "2026-06-08",
      location: "Buffalo",
      overallFeeling: 4,
      lindsayReflection: { bestThing: "starts", ignored: 1, needsWork: "  " },
    });
    expect(day).toEqual({
      id: "src-1",
      date: "2026-06-08",
      location: "Buffalo",
      overallFeeling: 4,
      lindsayReflection: { bestThing: "starts" },
    });
    expect(day).not.toHaveProperty("energy");
    expect(day).not.toHaveProperty("parentNote");
    expect(day).not.toHaveProperty("isCompleted");
  });

  it("records isCompleted only when the stored value is true", () => {
    expect(journalDayFromDocument("done", { date: "2026-06-08", isCompleted: true })?.isCompleted).toBe(true);
    const open = journalDayFromDocument("open", { date: "2026-06-08", isCompleted: false });
    const missing = journalDayFromDocument("missing", { date: "2026-06-08" });
    expect(open).not.toHaveProperty("isCompleted");
    expect(missing).not.toHaveProperty("isCompleted");
  });

  it("drops a day or session that has no real date, and keeps a session with no label", () => {
    expect(journalDayFromDocument("bad", { date: "2026-02-31", location: "x" })).toBeNull();
    expect(journalDayFromDocument("bad", null)).toBeNull();
    expect(journalSessionFromDocument("s1", { date: "2026-07-01" })).toEqual({ id: "s1", date: "2026-07-01" });
    expect(journalSessionFromDocument("s2", { date: "not-a-day", sessionLabel: "ice" })).toBeNull();
  });
});

describe("buildJournalDayWrite", () => {
  const base = { date: "2026-11-02", overallFeeling: 3 };

  it("rejects a date that is not a calendar day, and a feeling outside 1-5", () => {
    expect(buildJournalDayWrite({ ...base, date: "2026-02-31" }, { now: NOW, creating: true }).ok).toBe(false);
    expect(buildJournalDayWrite({ ...base, date: "11/02/2026" }, { now: NOW, creating: true })).toEqual({
      ok: false,
      field: "date",
    });
    expect(buildJournalDayWrite({ ...base, overallFeeling: 0 }, { now: NOW, creating: true })).toEqual({
      ok: false,
      field: "overallFeeling",
    });
    expect(buildJournalDayWrite({ ...base, energy: 6 }, { now: NOW, creating: true })).toEqual({
      ok: false,
      field: "energy",
    });
  });

  it("leaves unfilled fields off the document, and stamps a new day", () => {
    const built = buildJournalDayWrite(
      {
        ...base,
        trainingFocus: "  ",
        parentNote: "ice",
        lindsayReflection: { bestThing: "corner", needsWork: "", tomorrowFocus: "  " },
      },
      { now: NOW, creating: true },
    );
    expect(built).toEqual({
      ok: true,
      data: {
        date: "2026-11-02",
        overallFeeling: 3,
        parentNote: "ice",
        lindsayReflection: { bestThing: "corner" },
        updatedAt: NOW,
        createdAt: NOW,
        isCompleted: false,
      },
    });
    if (built.ok) {
      expect(built.data).not.toHaveProperty("energy");
      expect(built.data).not.toHaveProperty("trainingFocus");
    }
  });

  it("writes soreness and coach feedback when they have text, and leaves blanks off the document", () => {
    const filled = buildJournalDayWrite(
      { ...base, soreness: " 小腿 ", coachFeedback: "弯道再收" },
      { now: NOW, creating: false },
    );
    expect(filled).toEqual({
      ok: true,
      data: {
        date: "2026-11-02",
        overallFeeling: 3,
        soreness: "小腿",
        coachFeedback: "弯道再收",
        updatedAt: NOW,
      },
    });
    const blank = buildJournalDayWrite(
      { ...base, soreness: "  ", coachFeedback: "" },
      { now: NOW, creating: false },
    );
    if (!blank.ok) throw new Error("expected a valid write");
    expect(blank.data).not.toHaveProperty("soreness");
    expect(blank.data).not.toHaveProperty("coachFeedback");
  });

  it("an edit writes updatedAt only, and does not reopen the day", () => {
    const built = buildJournalDayWrite({ ...base, energy: 2 }, { now: NOW, creating: false });
    expect(built).toEqual({
      ok: true,
      data: { date: "2026-11-02", overallFeeling: 3, energy: 2, updatedAt: NOW },
    });
    if (built.ok) {
      expect(built.data).not.toHaveProperty("createdAt");
      expect(built.data).not.toHaveProperty("isCompleted");
    }
  });
});

describe("subscribeToJournal", () => {
  beforeEach(() => {
    firestore.onSnapshot.mockReset();
    firestore.setDoc.mockReset();
  });

  it("normalizes both collections and counts documents that cannot be placed", () => {
    firestore.onSnapshot.mockImplementation((ref: { parts: string[] }, onNext: (snapshot: { docs: { id: string; data: () => unknown }[] }) => void) => {
      const kind = ref.parts.at(-1);
      if (kind === "days") {
        onNext({
          docs: [
            { id: "src-1", data: () => ({ date: "2026-06-08", location: "Buffalo" }) },
            { id: "bad", data: () => ({ date: "nope" }) },
          ],
        });
      } else {
        onNext({
          docs: [
            { id: "s1", data: () => ({ date: "2026-07-01", sessionLabel: "ice" }) },
            { id: "s2", data: () => ({ sessionLabel: "no date" }) },
          ],
        });
      }
      return () => {};
    });
    const onData = vi.fn();
    subscribeToJournal({} as never, "user-1", onData, vi.fn());
    expect(onData).toHaveBeenCalledTimes(1);
    expect(onData.mock.calls[0]?.[0]).toEqual({
      days: [{ id: "src-1", date: "2026-06-08", location: "Buffalo" }],
      sessions: [{ id: "s1", date: "2026-07-01", sessionLabel: "ice" }],
      droppedDays: 1,
      droppedSessions: 1,
    });
  });

  it("merges onto the given document id and does not add fields the payload omitted", async () => {
    const built = buildJournalDayWrite(
      { date: "2026-11-02", overallFeeling: 5 },
      { now: NOW, creating: true },
    );
    if (!built.ok) throw new Error("expected a valid write");
    await saveJournalDay({} as never, "user-1", "2026-11-02", built.data);
    expect(firestore.setDoc).toHaveBeenCalledTimes(1);
    const [ref, data, options] = firestore.setDoc.mock.calls[0]!;
    expect(ref.parts.at(-1)).toBe("2026-11-02");
    expect(ref.parts).toContain("journal");
    expect(ref.parts).not.toContain("athletes");
    expect(data).toEqual(built.data);
    expect(data).not.toHaveProperty("energy");
    expect(options).toEqual({ merge: true });
  });

  it("merges only isCompleted and updatedAt when the completion flag changes", async () => {
    await setJournalDayCompleted({} as never, "user-1", "src-1", true, NOW);
    expect(firestore.setDoc).toHaveBeenCalledTimes(1);
    const [ref, data, options] = firestore.setDoc.mock.calls[0]!;
    expect(ref.parts.at(-1)).toBe("src-1");
    expect(data).toEqual({ isCompleted: true, updatedAt: NOW });
    expect(options).toEqual({ merge: true });
    expect(data).not.toHaveProperty("createdAt");
    expect(data).not.toHaveProperty("overallFeeling");
  });
});

describe("journal sessions", () => {
  beforeEach(() => {
    firestore.addDoc.mockClear();
    firestore.setDoc.mockClear();
  });

  it("refuses a date that is not a real day and writes nothing", async () => {
    expect(buildJournalSessionWrite({ date: "2026-02-31", sessionLabel: "冰" }, { now: NOW, creating: true })).toEqual({
      ok: false,
      field: "date",
    });
    const created = await createJournalSession({} as never, "user-1", { date: "11/02/2026" }, NOW);
    expect(created).toEqual({ ok: false, field: "date" });
    expect(firestore.addDoc).not.toHaveBeenCalled();
  });

  it("leaves empty and illegal numbers off the document, including 0 and NaN", () => {
    const built = buildJournalSessionWrite(
      {
        date: "2026-06-10",
        durationMinutes: "",
        iceTimeMinutes: Number.NaN,
        drylandMinutes: "0",
      },
      { now: NOW, creating: false },
    );
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.data).not.toHaveProperty("durationMinutes");
    expect(built.data).not.toHaveProperty("iceTimeMinutes");
    expect(built.data).not.toHaveProperty("drylandMinutes");
    expect(JSON.stringify(built.data)).not.toContain("NaN");
    expect(built.data.sessionType).toBe("ice");

    const kept = buildJournalSessionWrite(
      { date: "2026-06-10", durationMinutes: "60", iceTimeMinutes: -5, drylandMinutes: "nope" },
      { now: NOW, creating: false },
    );
    expect(kept.ok).toBe(true);
    if (!kept.ok) return;
    expect(kept.data.durationMinutes).toBe(60);
    expect(kept.data).not.toHaveProperty("iceTimeMinutes");
    expect(kept.data).not.toHaveProperty("drylandMinutes");
  });

  it("drops intensity outside 1-5 and keeps an integer inside", () => {
    const dropped = buildJournalSessionWrite({ date: "2026-06-10", intensity: 6 }, { now: NOW, creating: false });
    expect(dropped.ok).toBe(true);
    if (!dropped.ok) return;
    expect(dropped.data).not.toHaveProperty("intensity");

    const kept = buildJournalSessionWrite({ date: "2026-06-10", intensity: "4" }, { now: NOW, creating: false });
    expect(kept.ok).toBe(true);
    if (!kept.ok) return;
    expect(kept.data.intensity).toBe(4);

    const fraction = buildJournalSessionWrite({ date: "2026-06-10", intensity: 1.5 }, { now: NOW, creating: false });
    expect(fraction.ok).toBe(true);
    if (!fraction.ok) return;
    expect(fraction.data).not.toHaveProperty("intensity");
  });

  it("drops focus tags outside the preset", () => {
    const built = buildJournalSessionWrite(
      { date: "2026-06-10", focusTags: ["start", "not_a_tag", "500m", "start"] },
      { now: NOW, creating: false },
    );
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.data.focusTags).toEqual(["start", "500m"]);
  });

  it("records a flag only when it is true", () => {
    const built = buildJournalSessionWrite(
      { date: "2026-06-10", startsPractice: true, cornerFocus: false, relayPractice: true },
      { now: NOW, creating: false },
    );
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.data.startsPractice).toBe(true);
    expect(built.data.relayPractice).toBe(true);
    expect(built.data).not.toHaveProperty("cornerFocus");

    const read = journalSessionFromDocument("s1", {
      date: "2026-06-10",
      startsPractice: true,
      cornerFocus: false,
      straightawayFocus: "yes",
    });
    expect(read?.startsPractice).toBe(true);
    expect(read).not.toHaveProperty("cornerFocus");
    expect(read).not.toHaveProperty("straightawayFocus");
  });

  it("creates with an automatic id and both timestamps", async () => {
    const created = await createJournalSession(
      {} as never,
      "user-1",
      { date: "2026-06-10", sessionType: "dryland", sessionLabel: "早课", intensity: 3 },
      NOW,
    );
    expect(created).toEqual({ ok: true, id: "auto-1" });
    const [ref, data] = firestore.addDoc.mock.calls[0]!;
    expect(ref.parts.slice(1)).toEqual([
      "artifacts",
      "skatingx-production",
      "users",
      "user-1",
      "journal",
      "main",
      "sessions",
    ]);
    expect(data).toEqual({
      date: "2026-06-10",
      sessionType: "dryland",
      sessionLabel: "早课",
      intensity: 3,
      updatedAt: NOW,
      createdAt: NOW,
    });
  });

  it("updates with updatedAt only and does not send createdAt", async () => {
    const updated = await updateJournalSession(
      {} as never,
      "user-1",
      "sess-1",
      { date: "2026-06-10", notes: "改过" },
      NOW,
    );
    expect(updated).toEqual({ ok: true });
    const [ref, data, options] = firestore.setDoc.mock.calls[0]!;
    expect(ref.parts.at(-1)).toBe("sess-1");
    expect(data).toEqual({
      date: "2026-06-10",
      sessionType: "ice",
      notes: "改过",
      updatedAt: NOW,
    });
    expect(data).not.toHaveProperty("createdAt");
    expect(options).toEqual({ merge: true });
  });

  it("reads every stored session field", () => {
    expect(
      journalSessionFromDocument("full", {
        date: "2026-06-10",
        sessionType: "private_lesson",
        sessionLabel: "标题",
        location: "Buffalo",
        durationMinutes: 90,
        iceTimeMinutes: 60,
        drylandMinutes: 20,
        intensity: 5,
        technicalFocus: "入弯",
        mainSet: "8圈",
        startsPractice: true,
        cornerFocus: true,
        straightawayFocus: true,
        relayPractice: true,
        raceSimulation: true,
        lapTimesNote: "32.1",
        equipmentNote: "新刀",
        recoveryNote: "拉伸",
        focusTags: ["edges", "made_up"],
        coachName: "李",
        notes: "收着",
        ignored: 1,
      }),
    ).toEqual({
      id: "full",
      date: "2026-06-10",
      sessionType: "private_lesson",
      sessionLabel: "标题",
      location: "Buffalo",
      durationMinutes: 90,
      iceTimeMinutes: 60,
      drylandMinutes: 20,
      intensity: 5,
      technicalFocus: "入弯",
      mainSet: "8圈",
      startsPractice: true,
      cornerFocus: true,
      straightawayFocus: true,
      relayPractice: true,
      raceSimulation: true,
      lapTimesNote: "32.1",
      equipmentNote: "新刀",
      recoveryNote: "拉伸",
      focusTags: ["edges"],
      coachName: "李",
      notes: "收着",
    });
  });
});
