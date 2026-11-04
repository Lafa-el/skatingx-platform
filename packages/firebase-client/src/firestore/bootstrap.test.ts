import { beforeEach, describe, expect, it, vi } from "vitest";

const TIMESTAMP = { kind: "server-timestamp" };

const memory = vi.hoisted(() => ({
  present: new Set<string>(),
  reads: [] as string[],
  writes: [] as Array<{ path: string; data: Record<string, unknown> }>,
}));

function pathOf(parts: unknown[]): string {
  return parts.filter((part) => typeof part === "string").join("/");
}

vi.mock("firebase/firestore", () => ({
  collection: (...parts: unknown[]) => ({ path: pathOf(parts) }),
  doc: (...parts: unknown[]) => ({ path: pathOf(parts) }),
  getDoc: vi.fn(async (ref: { path: string }) => {
    memory.reads.push(ref.path);
    const exists = memory.present.has(ref.path);
    return { exists: () => exists };
  }),
  setDoc: vi.fn(async (ref: { path: string }, data: Record<string, unknown>) => {
    memory.writes.push({ path: ref.path, data });
    memory.present.add(ref.path);
  }),
  serverTimestamp: () => TIMESTAMP,
}));

import { bootstrapUserDocuments } from "./bootstrap";

beforeEach(() => {
  memory.present.clear();
  memory.reads.length = 0;
  memory.writes.length = 0;
});

describe("bootstrapUserDocuments", () => {
  it("creates settings without an athlete, a profile, or companion documents", async () => {
    const result = await bootstrapUserDocuments({} as never, "user-1");
    expect(result).toEqual({ created: ["settings/main"], existing: [] });
    expect(memory.writes).toHaveLength(1);
    expect(memory.writes[0]?.path.endsWith("/settings/main")).toBe(true);
    expect(memory.writes[0]?.data).toEqual({
      language: "zh",
      theme: "system",
      isPro: false,
      parentPinEnabled: false,
      createdAt: TIMESTAMP,
      updatedAt: TIMESTAMP,
    });
    expect(memory.writes[0]?.data).not.toHaveProperty("activeAthleteId");
    expect(memory.reads.some((path) => path.includes("/athletes/"))).toBe(false);
    expect(memory.writes.some((write) => write.path.includes("/athletes/"))).toBe(false);
  });

  it("leaves an existing account unchanged", async () => {
    await bootstrapUserDocuments({} as never, "user-1");
    memory.reads.length = 0;
    memory.writes.length = 0;
    const result = await bootstrapUserDocuments({} as never, "user-1");
    expect(result).toEqual({ created: [], existing: ["settings/main"] });
    expect(memory.writes).toEqual([]);
    expect(memory.reads).toHaveLength(1);
    expect(memory.reads[0]?.endsWith("/settings/main")).toBe(true);
  });
});
