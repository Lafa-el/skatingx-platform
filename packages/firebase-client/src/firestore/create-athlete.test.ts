import { DEFAULT_TRAINING_DISTANCES } from "@skatingx/schema";
import { beforeEach, describe, expect, it, vi } from "vitest";

const TIMESTAMP = { kind: "server-timestamp" };

const ids = vi.hoisted(() => ({
  n: 0,
  suffixes: ["aaa111", "bbb222", "ccc333", "ddd444"],
}));

const blocked = vi.hoisted(() => ({ paths: new Set<string>() }));

const firestore = vi.hoisted(() => {
  const pathOf = (ref: { parts?: unknown[] }) =>
    (ref.parts ?? []).filter((part) => typeof part === "string").join("/");
  return {
    pathOf,
    collection: vi.fn(),
    doc: vi.fn((...parts: unknown[]) => ({ parts })),
    getDoc: vi.fn(async (ref: { parts?: unknown[] }) => ({
      exists: () => blocked.paths.has(pathOf(ref)),
    })),
    getDocs: vi.fn(),
    setDoc: vi.fn(async (ref: { parts?: unknown[] }, data: Record<string, unknown>) => {
      void ref;
      void data;
    }),
    updateDoc: vi.fn(async (ref: { parts?: unknown[] }, data: Record<string, unknown>) => {
      void ref;
      void data;
    }),
    query: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(),
    runTransaction: vi.fn(),
    serverTimestamp: vi.fn(() => TIMESTAMP),
    deleteField: vi.fn(),
  };
});

vi.mock("firebase/firestore", () => firestore);

vi.mock("@skatingx/skating-domain", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@skatingx/skating-domain")>();
  return {
    ...actual,
    createIdSuffix: () => ids.suffixes[ids.n++] ?? "eee555",
  };
});

import { AthleteIdCollisionError, createAthlete } from "./create-athlete";

const patch = {
  displayName: " New Skater ",
  birthDate: "2016-03-04",
  skatingStartDate: "2020-06-01",
  sport: "short_track_speed_skating",
  country: " Canada ",
  bio: " hello ",
};

beforeEach(() => {
  ids.n = 0;
  blocked.paths.clear();
  firestore.setDoc.mockClear();
  firestore.updateDoc.mockClear();
  firestore.getDoc.mockClear();
});

function writtenPaths(): string[] {
  return firestore.setDoc.mock.calls.map((call) => firestore.pathOf(call[0]));
}

describe("createAthlete", () => {
  it("writes the form onto the profile, the companion documents, and the active athlete", async () => {
    const athleteId = await createAthlete({} as never, "user-1", patch);
    expect(athleteId).toBe("new-skater-aaa111");

    const profileCall = firestore.setDoc.mock.calls[0]!;
    expect(firestore.pathOf(profileCall[0])).toBe(
      "artifacts/skatingx-production/users/user-1/athletes/new-skater-aaa111/profile/main",
    );
    expect(profileCall[1]).toEqual({
      athleteId: "new-skater-aaa111",
      displayName: "New Skater",
      birthDate: "2016-03-04",
      skatingStartDate: "2020-06-01",
      sport: "short_track_speed_skating",
      country: "Canada",
      bio: "hello",
      createdAt: TIMESTAMP,
      updatedAt: TIMESTAMP,
    });
    expect(profileCall[1]).not.toHaveProperty("skatingDivision");

    const paths = writtenPaths();
    const root = "artifacts/skatingx-production/users/user-1/athletes/new-skater-aaa111";
    expect(paths).toContain(`${root}/gamification/main`);
    expect(paths).toContain(`${root}/training/state`);
    expect(paths).toContain(`${root}/training/main/rewards/catalog`);
    for (const distance of DEFAULT_TRAINING_DISTANCES) {
      expect(paths).toContain(`${root}/training/main/records/${distance.distanceId}`);
    }
    expect(firestore.updateDoc).toHaveBeenCalledTimes(1);
    expect(firestore.updateDoc.mock.calls[0]?.[1]).toMatchObject({
      activeAthleteId: "new-skater-aaa111",
    });
  });

  it("omits a blank start date and bio instead of storing an empty string", async () => {
    await createAthlete({} as never, "user-1", {
      ...patch,
      skatingStartDate: "  ",
      bio: " ",
    });
    const data = firestore.setDoc.mock.calls[0]?.[1];
    expect(data).not.toHaveProperty("skatingStartDate");
    expect(data).not.toHaveProperty("bio");
  });

  it("retries when the first id is already a profile, then uses the next one", async () => {
    blocked.paths.add(
      "artifacts/skatingx-production/users/user-1/athletes/new-skater-aaa111/profile/main",
    );
    const athleteId = await createAthlete({} as never, "user-1", patch);
    expect(athleteId).toBe("new-skater-bbb222");
    const profileWrite = firestore.setDoc.mock.calls[0];
    expect(profileWrite).toBeTruthy();
    if (!profileWrite) {
      return;
    }
    expect(firestore.pathOf(profileWrite[0])).toContain("new-skater-bbb222/profile/main");
    expect(firestore.getDoc).toHaveBeenCalledTimes(2 + 1 + 1 + DEFAULT_TRAINING_DISTANCES.length + 1);
  });

  it("writes nothing when three ids are already taken", async () => {
    blocked.paths.add(
      "artifacts/skatingx-production/users/user-1/athletes/new-skater-aaa111/profile/main",
    );
    blocked.paths.add(
      "artifacts/skatingx-production/users/user-1/athletes/new-skater-bbb222/profile/main",
    );
    blocked.paths.add(
      "artifacts/skatingx-production/users/user-1/athletes/new-skater-ccc333/profile/main",
    );
    await expect(createAthlete({} as never, "user-1", patch)).rejects.toBeInstanceOf(
      AthleteIdCollisionError,
    );
    expect(firestore.setDoc).not.toHaveBeenCalled();
    expect(firestore.updateDoc).not.toHaveBeenCalled();
    expect(firestore.getDoc).toHaveBeenCalledTimes(3);
  });
});
