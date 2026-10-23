import { beforeEach, describe, expect, it, vi } from "vitest";

const firestore = vi.hoisted(() => ({
  collection: vi.fn((...parts: unknown[]) => ({ kind: "collection", parts })),
  doc: vi.fn((...parts: unknown[]) => ({ kind: "doc", parts })),
  query: vi.fn((ref: unknown, ...clauses: unknown[]) => ({ ref, clauses })),
  where: vi.fn((field: unknown, op: unknown, value: unknown) => ({ field, op, value })),
  sum: vi.fn((field: string) => ({ kind: "sum", field })),
  getAggregateFromServer: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  runTransaction: vi.fn(),
}));

vi.mock("firebase/firestore", () => firestore);

import { readPointsLedgerMonth, readPointsLedgerOpening, readPointsLedgerTotal } from "./points-ledger-read";

const db = {} as never;
const userId = "user-1";
const athleteId = "lindsay";

beforeEach(() => {
  firestore.getAggregateFromServer.mockReset();
  firestore.getDoc.mockReset();
  firestore.getDocs.mockReset();
  firestore.query.mockClear();
  firestore.where.mockClear();
  firestore.sum.mockClear();
  firestore.setDoc.mockClear();
  firestore.runTransaction.mockClear();
});

describe("points ledger reads", () => {
  it("sums every delta with one aggregate and does not load the events", async () => {
    firestore.getAggregateFromServer.mockResolvedValue({ data: () => ({ net: 120 }) });
    await expect(readPointsLedgerTotal(db, userId, athleteId)).resolves.toBe(120);
    expect(firestore.sum).toHaveBeenCalledWith("delta");
    expect(firestore.getAggregateFromServer.mock.calls[0]?.[0]).toMatchObject({ clauses: [] });
    expect(firestore.getDocs).not.toHaveBeenCalled();
    expect(firestore.setDoc).not.toHaveBeenCalled();
    expect(firestore.runTransaction).not.toHaveBeenCalled();
  });

  it("treats an empty aggregate as zero", async () => {
    firestore.getAggregateFromServer.mockResolvedValue({ data: () => ({ net: null }) });
    await expect(readPointsLedgerTotal(db, userId, athleteId)).resolves.toBe(0);
  });

  it("reads the opening document by its fixed id", async () => {
    firestore.getDoc.mockResolvedValue({ exists: () => true, data: () => ({ delta: 80 }) });
    await expect(readPointsLedgerOpening(db, userId, athleteId)).resolves.toBe(80);
    const ref = firestore.getDoc.mock.calls[0]?.[0] as { parts: unknown[] };
    expect(ref.parts).toContain("opening");
    expect(ref.parts).toContain("pointsLedger");
  });

  it("returns zero when the opening document is absent", async () => {
    firestore.getDoc.mockResolvedValue({ exists: () => false, data: () => undefined });
    await expect(readPointsLedgerOpening(db, userId, athleteId)).resolves.toBe(0);
  });

  it("reads one month by dateId and drops a document that is not an event", async () => {
    firestore.getDocs.mockResolvedValue({
      docs: [
        {
          id: "task",
          data: () => ({
            dateId: "2026-10-19",
            delta: 20,
            reason: "task-complete",
            refId: "a",
            createdAt: "2026-10-19T01:00:00.000Z",
          }),
        },
        { id: "broken", data: () => ({ dateId: "2026-10-19", delta: 5, reason: "not-a-reason" }) },
        { id: "nan", data: () => ({ dateId: "2026-10-19", delta: Number.NaN, reason: "task-complete" }) },
      ],
    });
    const rows = await readPointsLedgerMonth(db, userId, athleteId, "2026-10-01", "2026-10-31");
    expect(rows).toEqual([
      {
        id: "task",
        dateId: "2026-10-19",
        delta: 20,
        reason: "task-complete",
        refId: "a",
        createdAt: "2026-10-19T01:00:00.000Z",
      },
    ]);
    expect(firestore.where).toHaveBeenCalledWith("dateId", ">=", "2026-10-01");
    expect(firestore.where).toHaveBeenCalledWith("dateId", "<=", "2026-10-31");
    expect(firestore.sum).not.toHaveBeenCalled();
    expect(firestore.setDoc).not.toHaveBeenCalled();
  });

  it("rejects a range that is not a month of real dates before querying", async () => {
    await expect(readPointsLedgerMonth(db, userId, athleteId, "2026-10-31", "2026-10-01")).rejects.toMatchObject({
      code: "invalid-bounds",
    });
    expect(firestore.getDocs).not.toHaveBeenCalled();
  });
});
