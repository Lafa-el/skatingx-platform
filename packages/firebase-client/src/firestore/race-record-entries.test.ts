import { describe, expect, it, vi } from "vitest";

const snap = vi.hoisted(() => ({
  onNext: null as null | ((s: unknown) => void),
  onError: null as null | ((e: { code?: unknown }) => void),
  unsubscribed: 0,
  paths: [] as string[],
  // Anything beyond reading would be missing here and throw, so a write could not slip in.
}));

vi.mock("firebase/firestore", () => ({
  collection: (...parts: unknown[]) => ({ path: parts.filter((p) => typeof p === "string").join("/") }),
  doc: (...parts: unknown[]) => ({ path: parts.filter((p) => typeof p === "string").join("/") }),
  onSnapshot: (
    target: { path: string },
    next: (s: unknown) => void,
    error: (e: { code?: unknown }) => void,
  ) => {
    snap.paths.push(target.path);
    snap.onNext = next;
    snap.onError = error;
    return () => {
      snap.unsubscribed += 1;
    };
  },
}));

import { subscribeToRaceRecordEntries } from "./race-record-sync";

const docOf = (id: string, entries: unknown) => ({ id, data: () => ({ entries }) });

describe("subscribeToRaceRecordEntries", () => {
  it("reads the athlete's records collection and passes on only race_ entries", () => {
    const seen: unknown[] = [];
    subscribeToRaceRecordEntries({ db: {} as never, userId: "u1", athleteId: "lindsay" }, (e) => seen.push(e), () => undefined);
    expect(snap.paths[0]).toContain("u1");
    expect(snap.paths[0]).toContain("lindsay");

    snap.onNext?.({
      docs: [
        docOf("500m", [
          { id: "race_buffalo-1_500m-1", date: "2026-10-24", timeSeconds: 48.1, note: "n", source: "race" },
          { id: "time_abc", date: "2026-10-01", timeSeconds: 50, source: "manual" },
          { id: "legacy-time-1", timeSeconds: 51 },
          "junk",
          null,
          [],
          { id: 5 },
        ]),
        docOf("1000m", "not an array"),
        docOf("1500m", [{ id: "race_buffalo-1_super-1", timeSeconds: 150 }]),
      ],
    });

    expect(seen).toHaveLength(1);
    expect((seen[0] as { id: string }[]).map((e) => e.id)).toEqual(["race_buffalo-1_500m-1", "race_buffalo-1_super-1"]);
  });

  it("reports an error as its code only", () => {
    const errors: unknown[] = [];
    subscribeToRaceRecordEntries({ db: {} as never, userId: "u1", athleteId: "a" }, () => undefined, (e) => errors.push(e));
    snap.onError?.({ code: "permission-denied", message: "users/u1/secret path" } as never);
    snap.onError?.({} as never);
    expect(errors).toEqual([{ code: "permission-denied" }, { code: "unknown" }]);
  });

  it("returns the unsubscribe function", () => {
    const before = snap.unsubscribed;
    const stop = subscribeToRaceRecordEntries({ db: {} as never, userId: "u1", athleteId: "a" }, () => undefined, () => undefined);
    stop();
    expect(snap.unsubscribed).toBe(before + 1);
  });
});
