import { describe, expect, it, vi } from "vitest";

import { buildCampWrite, campFromDocument, createCamp, getCamp, subscribeToCamps, updateCamp } from "./camps";

const NOW = "2026-06-08T12:00:00.000Z";
const LATER = "2026-06-09T12:00:00.000Z";

const valid = {
  name: "北京夏令营",
  type: "夏令营",
  startDate: "2026-07-01",
  endDate: "2026-07-14",
  location: "北京",
};

const firestore = vi.hoisted(() => ({
  collection: vi.fn((...parts: unknown[]) => ({ kind: "collection", parts })),
  doc: vi.fn((...parts: unknown[]) => ({ kind: "doc", parts })),
  query: vi.fn((ref: unknown) => ref),
  orderBy: vi.fn(() => ({})),
  onSnapshot: vi.fn((..._args: unknown[]) => () => undefined),
  addDoc: vi.fn(async (..._args: unknown[]) => ({ id: "auto-1" })),
  setDoc: vi.fn(async (..._args: unknown[]) => undefined),
  deleteDoc: vi.fn(async (..._args: unknown[]) => undefined),
  getDoc: vi.fn(
    async (..._args: unknown[]): Promise<{ exists: () => boolean; id: string; data: () => Record<string, unknown> | undefined }> => ({
      exists: () => false,
      id: "",
      data: () => undefined,
    }),
  ),
}));

vi.mock("firebase/firestore", () => firestore);

const db = {} as never;

describe("buildCampWrite", () => {
  it("refuses a blank name, a blank type, a reversed range, and a date that is not real", () => {
    expect(buildCampWrite({ ...valid, name: "  " }, { now: NOW, creating: true })).toEqual({ ok: false, field: "name" });
    expect(buildCampWrite({ ...valid, name: "名".repeat(81) }, { now: NOW, creating: true })).toEqual({
      ok: false,
      field: "name",
    });
    expect(buildCampWrite({ ...valid, type: "" }, { now: NOW, creating: true })).toEqual({ ok: false, field: "type" });
    expect(buildCampWrite({ ...valid, type: "类".repeat(41) }, { now: NOW, creating: true })).toEqual({
      ok: false,
      field: "type",
    });
    expect(buildCampWrite({ ...valid, startDate: "2026-07-20", endDate: "2026-07-01" }, { now: NOW, creating: true })).toEqual({
      ok: false,
      field: "dates",
    });
    expect(buildCampWrite({ ...valid, startDate: "2026-02-30" }, { now: NOW, creating: true })).toEqual({
      ok: false,
      field: "dates",
    });
    expect(buildCampWrite({ ...valid, location: "地".repeat(201) }, { now: NOW, creating: true })).toEqual({
      ok: false,
      field: "location",
    });
  });

  it("keeps a free-text type and omits a blank location", () => {
    const built = buildCampWrite({ ...valid, type: " 自己起的名字 ", location: "  " }, { now: NOW, creating: true });
    expect(built).toEqual({
      ok: true,
      data: {
        name: "北京夏令营",
        type: "自己起的名字",
        startDate: "2026-07-01",
        endDate: "2026-07-14",
        createdAt: NOW,
        updatedAt: NOW,
      },
    });
  });
});

describe("createCamp and updateCamp", () => {
  it("creates with createdAt and edits only updatedAt", async () => {
    const created = await createCamp(db, "alice", valid, NOW);
    expect(created).toEqual({ ok: true, id: "auto-1" });
    const written = firestore.addDoc.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(written.createdAt).toBe(NOW);
    expect(written.updatedAt).toBe(NOW);
    expect(written.location).toBe("北京");

    const edited = await updateCamp(db, "alice", "auto-1", { ...valid, name: "改过" }, LATER);
    expect(edited).toEqual({ ok: true });
    const patch = firestore.setDoc.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(patch.name).toBe("改过");
    expect(patch.updatedAt).toBe(LATER);
    expect(patch).not.toHaveProperty("createdAt");
  });
});

describe("campFromDocument and subscribeToCamps", () => {
  it("drops a document that is missing a required field or has a date that is not real", () => {
    expect(campFromDocument("bad-date", { ...valid, startDate: "2026-02-30", createdAt: NOW })).toBeNull();
    expect(campFromDocument("no-name", { ...valid, name: " ", createdAt: NOW })).toBeNull();
    expect(
      campFromDocument("ok", { ...valid, createdAt: NOW, type: "赛前集训" }),
    ).toMatchObject({ id: "ok", type: "赛前集训", createdAt: NOW, updatedAt: NOW });
  });

  it("counts dropped documents and orders the rest by start date, then id", () => {
    let delivered: { camps: { id: string }[]; dropped: number } | null = null;
    firestore.onSnapshot.mockImplementation((...args: unknown[]) => {
      const onData = args[1] as (snapshot: { docs: { id: string; data: () => unknown }[] }) => void;
      onData({
        docs: [
          { id: "early", data: () => ({ ...valid, startDate: "2026-06-01", endDate: "2026-06-02", createdAt: NOW }) },
          { id: "b", data: () => ({ ...valid, createdAt: NOW }) },
          { id: "a", data: () => ({ ...valid, createdAt: NOW }) },
          { id: "bad", data: () => ({ name: "缺日期" }) },
        ],
      });
      return () => undefined;
    });
    subscribeToCamps(db, "alice", (snapshot) => {
      delivered = { camps: snapshot.camps.map((camp) => ({ id: camp.id })), dropped: snapshot.dropped };
    }, () => undefined);
    expect(delivered).toEqual({ camps: [{ id: "b" }, { id: "a" }, { id: "early" }], dropped: 1 });
  });
});

describe("getCamp", () => {
  it("returns the camp, and null when the document is missing", async () => {
    firestore.getDoc.mockResolvedValueOnce({
      exists: () => true,
      id: "auto-1",
      data: () => ({ ...valid, createdAt: NOW, updatedAt: LATER }),
    });
    expect(await getCamp(db, "alice", "auto-1")).toMatchObject({
      id: "auto-1",
      name: "北京夏令营",
      location: "北京",
      createdAt: NOW,
      updatedAt: LATER,
    });
    firestore.getDoc.mockResolvedValueOnce({ exists: () => false, id: "gone", data: () => undefined });
    expect(await getCamp(db, "alice", "gone")).toBeNull();
  });
});
