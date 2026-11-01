import { beforeEach, describe, expect, it, vi } from "vitest";

const firestore = vi.hoisted(() => ({
  collection: vi.fn((...parts: unknown[]) => ({ kind: "collection", parts })),
  doc: vi.fn((...parts: unknown[]) => ({ kind: "doc", parts })),
  query: vi.fn((ref: unknown, ...clauses: unknown[]) => ({ ref, clauses })),
  orderBy: vi.fn((field: unknown, dir: unknown) => ({ field, dir })),
  limit: vi.fn((n: number) => ({ kind: "limit", n })),
  onSnapshot: vi.fn(),
  setDoc: vi.fn(),
  deleteDoc: vi.fn(),
}));

vi.mock("firebase/firestore", () => firestore);

import { subscribeToEquipmentHistory } from "./equipment-history";

type Doc = { id: string; data: () => unknown };
const doc = (id: string, data: unknown): Doc => ({ id, data: () => data });
const stored = (id: string, over: Record<string, unknown> = {}) =>
  doc(id, { id, createdAt: "2026-10-19T06:00:00.000Z", symptomKey: "slide", findings: [], ...over });

function run(...snapshots: Doc[][]) {
  firestore.onSnapshot.mockImplementation((_query, onNext: (snapshot: { docs: Doc[] }) => void) => {
    for (const docs of snapshots) onNext({ docs });
    return () => {};
  });
  const onRecords = vi.fn();
  subscribeToEquipmentHistory({} as never, "user-1", "lindsay", onRecords, vi.fn());
  return onRecords;
}

beforeEach(() => {
  firestore.onSnapshot.mockReset();
});

describe("subscribeToEquipmentHistory: documents left out whole are counted", () => {
  it("valid documents: dropped 0 and every one listed", () => {
    const [records, dropped] = run([stored("e1"), stored("e2")]).mock.calls[0]!;
    expect(dropped).toBe(0);
    expect(records.map((r: { id: string }) => r.id)).toEqual(["e1", "e2"]);
  });

  it.each([
    ["not an object", doc("bad", "just a string")],
    ["null", doc("bad", null)],
    ["an id that is not a string", doc("bad", { id: 4, createdAt: "2026-10-19T06:00:00.000Z" })],
    ["no id", doc("bad", { createdAt: "2026-10-19T06:00:00.000Z" })],
    ["a createdAt that is not a string", doc("bad", { id: "bad", createdAt: 1_760_000_000_000 })],
  ])("a document that is %s: dropped 1, and it is not in the list", (_name, bad) => {
    const [records, dropped] = run([stored("e1"), bad]).mock.calls[0]!;
    expect(dropped).toBe(1);
    expect(records.map((r: { id: string }) => r.id)).toEqual(["e1"]);
  });

  it("a record kept after its findings were normalised is not counted", () => {
    const [records, dropped] = run([stored("e1", { findings: "garbage" }), stored("e2", { findings: [null, { code: 5 }] })]).mock.calls[0]!;
    expect(dropped).toBe(0);
    expect(records).toHaveLength(2);
    expect(records[0].findings).toEqual([]);
  });

  it("every snapshot is counted afresh, not added to the last one", () => {
    const onRecords = run(
      [stored("e1"), doc("b1", null), doc("b2", 7)],
      [stored("e1"), doc("b1", null)],
      [stored("e1")],
    );
    expect(onRecords.mock.calls.map((call) => call[1])).toEqual([2, 1, 0]);
  });
});
