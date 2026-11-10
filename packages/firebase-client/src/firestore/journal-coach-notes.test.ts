import { beforeEach, describe, expect, it, vi } from "vitest";

const firestore = vi.hoisted(() => ({
  collection: vi.fn((...parts: unknown[]) => ({ kind: "collection", parts })),
  doc: vi.fn((...parts: unknown[]) => ({ kind: "doc", parts })),
  onSnapshot: vi.fn(),
  setDoc: vi.fn(),
  addDoc: vi.fn(async (ref: { parts: unknown[] }, _data: unknown) => ({ ...ref, id: "auto-1" })),
  deleteDoc: vi.fn(),
}));

vi.mock("firebase/firestore", () => firestore);

import {
  buildCoachNoteWrite,
  createCoachNote,
  subscribeToCoachNotes,
  updateCoachNote,
} from "./journal-coach-notes";

const NOW = "2026-11-02T12:00:00.000Z";

describe("buildCoachNoteWrite", () => {
  it("refuses a date that is not a real day and writes nothing", async () => {
    expect(buildCoachNoteWrite({ date: "2026-02-31", note: "弯" }, { now: NOW, creating: true })).toEqual({
      ok: false,
      field: "date",
    });
    const created = await createCoachNote({} as never, "user-1", { date: "11/02/2026", note: "弯" }, NOW);
    expect(created).toEqual({ ok: false, field: "date" });
    expect(firestore.addDoc).not.toHaveBeenCalled();
  });

  it("defaults an unknown priority to medium and drops tags outside the preset", () => {
    const built = buildCoachNoteWrite(
      {
        date: "2026-11-02",
        priority: "urgent",
        note: "  弯道再收  ",
        technicalTags: ["corner_entry", "not_a_tag", "edges", "corner_entry"],
        coachName: "  ",
      },
      { now: NOW, creating: false },
    );
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.data.priority).toBe("medium");
    expect(built.data.note).toBe("弯道再收");
    expect(built.data.technicalTags).toEqual(["corner_entry", "edges"]);
    expect(built.data).not.toHaveProperty("coachName");
    expect(built.data).not.toHaveProperty("createdAt");
    expect(built.data.updatedAt).toBe(NOW);
  });

  it("leaves a blank note off the document", () => {
    const built = buildCoachNoteWrite({ date: "2026-11-02", note: "  " }, { now: NOW, creating: true });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.data.priority).toBe("medium");
    expect(built.data).not.toHaveProperty("note");
  });
});

describe("coach note writes", () => {
  beforeEach(() => {
    firestore.addDoc.mockClear();
    firestore.setDoc.mockClear();
  });

  it("creates with an automatic id and both timestamps", async () => {
    const created = await createCoachNote(
      {} as never,
      "user-1",
      { date: "2026-11-02", priority: "high", note: "入弯" },
      NOW,
    );
    expect(created).toEqual({ ok: true, id: "auto-1" });
    expect(firestore.addDoc).toHaveBeenCalledTimes(1);
    const [ref, data] = firestore.addDoc.mock.calls[0]!;
    expect(ref.parts.slice(1)).toEqual([
      "artifacts",
      "skatingx-production",
      "users",
      "user-1",
      "journal",
      "main",
      "coachNotes",
    ]);
    expect(data).toEqual({
      date: "2026-11-02",
      priority: "high",
      note: "入弯",
      updatedAt: NOW,
      createdAt: NOW,
    });
  });

  it("updates with updatedAt only and does not send createdAt", async () => {
    const updated = await updateCoachNote(
      {} as never,
      "user-1",
      "note-1",
      { date: "2026-11-02", priority: "low", note: "改过" },
      NOW,
    );
    expect(updated).toEqual({ ok: true });
    expect(firestore.setDoc).toHaveBeenCalledTimes(1);
    const [ref, data, options] = firestore.setDoc.mock.calls[0]!;
    expect(ref.parts.at(-1)).toBe("note-1");
    expect(ref.parts).toContain("coachNotes");
    expect(data).toEqual({
      date: "2026-11-02",
      priority: "low",
      note: "改过",
      updatedAt: NOW,
    });
    expect(data).not.toHaveProperty("createdAt");
    expect(options).toEqual({ merge: true });
  });
});

describe("subscribeToCoachNotes", () => {
  beforeEach(() => {
    firestore.onSnapshot.mockReset();
  });

  it("drops a document whose date is not a real day and counts it", () => {
    firestore.onSnapshot.mockImplementation(
      (ref: { parts: unknown[] }, onNext: (snapshot: { docs: { id: string; data: () => unknown }[] }) => void) => {
        expect(ref.parts).toContain("coachNotes");
        onNext({
          docs: [
            { id: "bad", data: () => ({ date: "2026-02-31", note: "不算" }) },
            {
              id: "ok",
              data: () => ({
                date: "2026-06-08",
                priority: "nope",
                note: "收",
                technicalTags: ["edges", "made_up"],
                linkedSessionId: "自由文本",
              }),
            },
          ],
        });
        return () => {};
      },
    );
    const onData = vi.fn();
    subscribeToCoachNotes({} as never, "user-1", onData, vi.fn());
    expect(onData).toHaveBeenCalledTimes(1);
    expect(onData.mock.calls[0]?.[0]).toEqual({
      notes: [
        {
          id: "ok",
          date: "2026-06-08",
          priority: "medium",
          note: "收",
          technicalTags: ["edges"],
          linkedSessionId: "自由文本",
        },
      ],
      dropped: 1,
    });
  });
});
