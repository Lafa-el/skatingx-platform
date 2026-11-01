import { beforeEach, describe, expect, it, vi } from "vitest";

const firestore = vi.hoisted(() => ({
  collection: vi.fn((...parts: unknown[]) => ({ kind: "collection", parts })),
  doc: vi.fn((...parts: unknown[]) => ({ kind: "doc", parts })),
  query: vi.fn((ref: unknown, ...clauses: unknown[]) => ({ ref, clauses })),
  orderBy: vi.fn((field: unknown, dir: unknown) => ({ field, dir })),
  onSnapshot: vi.fn(),
}));

vi.mock("firebase/firestore", () => firestore);

import { subscribeToSavedAnalyses } from "./saved-analyses";

type Doc = { id: string; data: () => Record<string, unknown> };
const doc = (id: string, data: Record<string, unknown>): Doc => ({ id, data: () => data });
const AT = "2026-10-20T00:00:00.000Z";
const pace = (id: string, over: Record<string, unknown> = {}) =>
  doc(id, { id, createdAt: AT, findings: [], pace: { rating: "excellent" }, ...over });
const biomech = (id: string, over: Record<string, unknown> = {}) =>
  doc(id, { id, createdAt: AT, findings: [], poseFrames: [], ...over });

/** Delivers each snapshot in turn to the listener and returns what the caller was given. */
function run(...snapshots: Doc[][]) {
  firestore.onSnapshot.mockImplementation((_query, onNext: (snapshot: { docs: Doc[] }) => void) => {
    for (const docs of snapshots) onNext({ docs });
    return () => {};
  });
  const onData = vi.fn();
  subscribeToSavedAnalyses({} as never, "user-1", onData, vi.fn());
  return onData;
}

beforeEach(() => {
  firestore.onSnapshot.mockReset();
});

describe("subscribeToSavedAnalyses: documents left out whole are counted", () => {
  it("valid documents: dropped 0 and every one listed", () => {
    const onData = run([pace("p1"), biomech("b1")]);
    expect(onData).toHaveBeenCalledTimes(1);
    const [sources, dropped] = onData.mock.calls[0]!;
    expect(dropped).toBe(0);
    expect(sources.map((s: { id: string }) => s.id)).toEqual(["p1", "b1"]);
  });

  it.each([
    ["a createdAt that is not a string", doc("bad", { id: "bad", createdAt: 12, pace: { rating: "excellent" } })],
    ["no createdAt", doc("bad", { id: "bad", pace: { rating: "excellent" } })],
    ["both pace and poseFrames", doc("bad", { id: "bad", createdAt: AT, pace: {}, poseFrames: [] })],
    ["neither pace nor poseFrames", doc("bad", { id: "bad", createdAt: AT, findings: [] })],
  ])("%s: dropped 1, and it is not in the list", (_name, bad) => {
    const onData = run([pace("p1"), bad]);
    const [sources, dropped] = onData.mock.calls[0]!;
    expect(dropped).toBe(1);
    expect(sources.map((s: { id: string }) => s.id)).toEqual(["p1"]);
  });

  it("only documents that are left out whole count: a record kept after its fields were normalised does not", () => {
    const onData = run([
      pace("p1", { findings: "not a list", distance: "800" }),
      biomech("b1", { findings: [{ nope: 1 }, null], poseFrames: [null, 5, { readable: "yes" }] }),
    ]);
    const [sources, dropped] = onData.mock.calls[0]!;
    expect(dropped).toBe(0);
    expect(sources).toHaveLength(2);
  });

  it("an empty snapshot is dropped 0", () => {
    const [sources, dropped] = run([]).mock.calls[0]!;
    expect(sources).toEqual([]);
    expect(dropped).toBe(0);
  });

  it("every snapshot is counted afresh, not added to the last one", () => {
    const onData = run(
      [pace("p1"), doc("bad-1", { createdAt: 1 }), doc("bad-2", {})],
      [pace("p1"), doc("bad-1", { createdAt: 1 })],
      [pace("p1")],
    );
    expect(onData.mock.calls.map((call) => call[1])).toEqual([2, 1, 0]);
  });
});
