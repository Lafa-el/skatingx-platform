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
  buildBodyStatusWrite,
  createBodyStatus,
  subscribeToBodyStatus,
  updateBodyStatus,
} from "./journal-body-status";

const NOW = "2026-11-02T12:00:00.000Z";

describe("buildBodyStatusWrite", () => {
  it("refuses a date that is not a real day and writes nothing", async () => {
    expect(buildBodyStatusWrite({ date: "2026-02-31", sleepHours: 8 }, { now: NOW, creating: true })).toEqual({
      ok: false,
      field: "date",
    });
    const created = await createBodyStatus({} as never, "user-1", { date: "11/02/2026", sleepHours: 8 }, NOW);
    expect(created).toEqual({ ok: false, field: "date" });
    expect(firestore.addDoc).not.toHaveBeenCalled();
  });

  it("leaves empty and illegal numbers off the document, including 0 and NaN", () => {
    const built = buildBodyStatusWrite(
      {
        date: "2026-06-10",
        sleepHours: "",
        bodyWeightLb: Number.NaN,
        heightCm: "0",
        injuryNote: "  ",
      },
      { now: NOW, creating: false },
    );
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.data).toEqual({ date: "2026-06-10", updatedAt: NOW });
    expect(built.data).not.toHaveProperty("sleepHours");
    expect(built.data).not.toHaveProperty("bodyWeightLb");
    expect(built.data).not.toHaveProperty("heightCm");
    expect(JSON.stringify(built.data)).not.toContain("NaN");

    const kept = buildBodyStatusWrite(
      { date: "2026-06-10", sleepHours: "7.5", bodyWeightLb: 0, heightCm: -1 },
      { now: NOW, creating: false },
    );
    expect(kept.ok).toBe(true);
    if (!kept.ok) return;
    expect(kept.data.sleepHours).toBe(7.5);
    expect(kept.data).not.toHaveProperty("bodyWeightLb");
    expect(kept.data).not.toHaveProperty("heightCm");
    expect(kept.data).not.toHaveProperty("createdAt");
  });

  it("drops fatigue and mood outside their ranges and keeps the integers inside", () => {
    const built = buildBodyStatusWrite(
      { date: "2026-06-10", fatigueLevel: 6, mood: 0 },
      { now: NOW, creating: false },
    );
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.data).not.toHaveProperty("fatigueLevel");
    expect(built.data).not.toHaveProperty("mood");

    const kept = buildBodyStatusWrite(
      { date: "2026-06-10", fatigueLevel: "5", mood: 6 },
      { now: NOW, creating: false },
    );
    expect(kept.ok).toBe(true);
    if (!kept.ok) return;
    expect(kept.data.fatigueLevel).toBe(5);
    expect(kept.data.mood).toBe(6);

    const fraction = buildBodyStatusWrite(
      { date: "2026-06-10", fatigueLevel: 1.5, mood: 7 },
      { now: NOW, creating: false },
    );
    expect(fraction.ok).toBe(true);
    if (!fraction.ok) return;
    expect(fraction.data).not.toHaveProperty("fatigueLevel");
    expect(fraction.data).not.toHaveProperty("mood");
  });

  it("drops soreness areas outside the preset", () => {
    const built = buildBodyStatusWrite(
      { date: "2026-06-10", sorenessAreas: ["knees", "elbow", "quadriceps", "knees"] },
      { now: NOW, creating: false },
    );
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.data.sorenessAreas).toEqual(["quadriceps", "knees"]);
  });
});

describe("body status writes", () => {
  beforeEach(() => {
    firestore.addDoc.mockClear();
    firestore.setDoc.mockClear();
  });

  it("creates with an automatic id and both timestamps", async () => {
    const created = await createBodyStatus(
      {} as never,
      "user-1",
      { date: "2026-06-10", fatigueLevel: 3, mood: 3, sleepHours: 8 },
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
      "bodyStatus",
    ]);
    expect(data).toEqual({
      date: "2026-06-10",
      fatigueLevel: 3,
      mood: 3,
      sleepHours: 8,
      updatedAt: NOW,
      createdAt: NOW,
    });
  });

  it("updates with updatedAt only and does not send createdAt", async () => {
    const updated = await updateBodyStatus(
      {} as never,
      "user-1",
      "status-1",
      { date: "2026-06-10", fatigueLevel: 2, injuryNote: "膝盖" },
      NOW,
    );
    expect(updated).toEqual({ ok: true });
    expect(firestore.setDoc).toHaveBeenCalledTimes(1);
    const [ref, data, options] = firestore.setDoc.mock.calls[0]!;
    expect(ref.parts.at(-1)).toBe("status-1");
    expect(ref.parts).toContain("bodyStatus");
    expect(data).toEqual({
      date: "2026-06-10",
      fatigueLevel: 2,
      injuryNote: "膝盖",
      updatedAt: NOW,
    });
    expect(data).not.toHaveProperty("createdAt");
    expect(options).toEqual({ merge: true });
  });
});

describe("subscribeToBodyStatus", () => {
  beforeEach(() => {
    firestore.onSnapshot.mockReset();
  });

  it("drops a document whose date is not a real day and counts it", () => {
    firestore.onSnapshot.mockImplementation(
      (ref: { parts: unknown[] }, onNext: (snapshot: { docs: { id: string; data: () => unknown }[] }) => void) => {
        expect(ref.parts).toContain("bodyStatus");
        onNext({
          docs: [
            { id: "bad", data: () => ({ date: "2026-02-31", sleepHours: 8 }) },
            {
              id: "ok",
              data: () => ({
                date: "2026-06-10",
                sleepHours: 0,
                fatigueLevel: 9,
                mood: 6,
                sorenessAreas: ["knees", "toe"],
                injuryNote: "  ",
              }),
            },
          ],
        });
        return () => {};
      },
    );
    const onData = vi.fn();
    subscribeToBodyStatus({} as never, "user-1", onData, vi.fn());
    expect(onData).toHaveBeenCalledTimes(1);
    expect(onData.mock.calls[0]?.[0]).toEqual({
      entries: [
        {
          id: "ok",
          date: "2026-06-10",
          mood: 6,
          sorenessAreas: ["knees"],
        },
      ],
      dropped: 1,
    });
  });
});
