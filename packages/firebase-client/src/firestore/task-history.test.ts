import { beforeEach, describe, expect, it, vi } from "vitest";

const firestore = vi.hoisted(() => ({
  deleteDoc: vi.fn(async () => undefined),
  documentId: vi.fn(() => "documentId"),
  query: vi.fn((ref: unknown, ...clauses: unknown[]) => ({ ref, clauses })),
  where: vi.fn((field: unknown, op: unknown, value: unknown) => ({ field, op, value })),
  onSnapshot: vi.fn(),
  collection: vi.fn((...parts: unknown[]) => ({ kind: "collection", parts })),
  doc: vi.fn((...parts: unknown[]) => ({ kind: "doc", parts })),
}));

vi.mock("firebase/firestore", () => firestore);

import { deleteTaskHistoryDay, subscribeToTaskHistoryMonth } from "./task-history";

const db = { kind: "db" };

beforeEach(() => {
  firestore.deleteDoc.mockClear();
  firestore.documentId.mockClear();
  firestore.query.mockClear();
  firestore.where.mockClear();
  firestore.onSnapshot.mockReset();
  firestore.collection.mockClear();
  firestore.doc.mockClear();
});

describe("subscribeToTaskHistoryMonth", () => {
  it("reads the displayed month by document id and does not scan the collection", () => {
    firestore.onSnapshot.mockImplementation((_query, onNext) => {
      onNext({
        docs: [
          {
            id: "2026-10-19",
            data: () => ({
              tasks: [
                { id: "a", text: "400m", completed: true },
                { id: "", text: "dropped", completed: true },
                { text: "no id", completed: false },
              ],
            }),
          },
          { id: "not-a-day", data: () => ({ tasks: [{ id: "z", text: "nope", completed: true }] }) },
        ],
      });
      return () => {};
    });

    const onDays = vi.fn();
    const stop = subscribeToTaskHistoryMonth(db as never, "user-1", "lindsay", "2026-10-01", "2026-10-31", onDays, vi.fn());

    expect(firestore.where).toHaveBeenCalledWith("documentId", ">=", "2026-10-01");
    expect(firestore.where).toHaveBeenCalledWith("documentId", "<=", "2026-10-31");
    const queried = firestore.query.mock.calls[0] as unknown as [unknown, { field: string; op: string; value: string }, { field: string; op: string; value: string }];
    expect(queried?.[1]).toEqual({ field: "documentId", op: ">=", value: "2026-10-01" });
    expect(queried?.[2]).toEqual({ field: "documentId", op: "<=", value: "2026-10-31" });
    const collection = queried?.[0] as { parts: unknown[] };
    expect(collection.parts).toContain("taskHistory");
    expect(collection.parts).not.toContain("gamification");
    expect(onDays).toHaveBeenCalledWith([{ dateId: "2026-10-19", tasks: [{ id: "a", text: "400m", completed: true }] }]);
    expect(typeof stop).toBe("function");
  });

  it("refuses a range that is not a month of document ids", () => {
    const onError = vi.fn();
    subscribeToTaskHistoryMonth(db as never, "user-1", "lindsay", "", "2026-10-31", vi.fn(), onError);
    expect(onError).toHaveBeenCalledOnce();
    expect(firestore.query).not.toHaveBeenCalled();
  });
});

describe("deleteTaskHistoryDay", () => {
  it("deletes that day's archive document and does not touch gamification", async () => {
    await deleteTaskHistoryDay(db as never, "user-1", "lindsay", "2026-10-19");
    expect(firestore.deleteDoc).toHaveBeenCalledOnce();
    const [ref] = firestore.deleteDoc.mock.calls[0] as unknown as [{ parts: unknown[] }];
    expect(ref.parts).toContain("taskHistory");
    expect(ref.parts).toContain("2026-10-19");
    expect(ref.parts).not.toContain("gamification");
  });
});
