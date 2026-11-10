import { describe, expect, it, vi } from "vitest";

import { readJournalExport } from "./journal-export";

const state = vi.hoisted(() => ({
  fail: new Set<string>(),
  docs: {} as Record<string, { id: string; data: Record<string, unknown> }[]>,
}));

vi.mock("firebase/firestore", () => ({
  collection: (...parts: unknown[]) => ({ path: parts.slice(1).join("/") }),
  doc: (...parts: unknown[]) => ({ path: parts.slice(1).join("/") }),
  getDocs: async (ref: { path: string }) => {
    const name = ref.path.split("/").at(-1) ?? "";
    if (state.fail.has(name)) throw new Error("denied");
    const docs = state.docs[name] ?? [];
    return { docs: docs.map((entry) => ({ id: entry.id, data: () => entry.data })) };
  },
}));

const db = {} as never;

describe("readJournalExport", () => {
  it("keeps the other collections when one read fails, and counts a document that cannot be parsed", async () => {
    state.fail = new Set(["coachNotes"]);
    state.docs = {
      days: [
        { id: "d1", data: { date: "2026-06-08" } },
        { id: "bad", data: { date: "not-a-date" } },
      ],
      sessions: [{ id: "s1", data: { date: "2026-06-08" } }],
      videos: [{ id: "blank", data: { createdAt: "2026-06-08T00:00:00.000Z" } }],
    };
    const result = await readJournalExport(db, "alice");
    expect(result.days.map((day) => day.id)).toEqual(["d1"]);
    expect(result.sessions.map((session) => session.id)).toEqual(["s1"]);
    expect(result.coachNotes).toEqual([]);
    expect(result.bodyStatus).toEqual([]);
    expect(result.weeklyReviews).toEqual([]);
    expect(result.videos).toEqual([]);
    expect(result.failedCollections).toEqual(["coachNotes"]);
    expect(result.dropped).toBe(2);
  });
});
