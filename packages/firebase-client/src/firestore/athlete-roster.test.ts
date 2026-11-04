import { beforeEach, describe, expect, it, vi } from "vitest";

const firestore = vi.hoisted(() => ({
  collectionGroup: vi.fn((db: unknown, name: string) => ({ kind: "group", db, name })),
  documentId: vi.fn(() => "document-id"),
  query: vi.fn((...parts: unknown[]) => ({ kind: "query", parts })),
  where: vi.fn((field: unknown, op: string, value: string) => ({ field, op, value })),
  onSnapshot: vi.fn(),
}));

vi.mock("firebase/firestore", () => firestore);

import { athleteIdFromProfilePath, subscribeToAthleteProfiles } from "./athlete-roster";

beforeEach(() => {
  firestore.onSnapshot.mockReset();
  firestore.collectionGroup.mockClear();
});

describe("athleteIdFromProfilePath", () => {
  it("reads the athlete id from the profile document path", () => {
    expect(
      athleteIdFromProfilePath(
        "artifacts/skatingx-production/users/user-1/athletes/lindsay/profile/main",
      ),
    ).toBe("lindsay");
    expect(athleteIdFromProfilePath("athletes/lindsay")).toBeNull();
  });
});

describe("subscribeToAthleteProfiles", () => {
  it("listens to the profile collection group under this user", () => {
    firestore.onSnapshot.mockReturnValue(() => undefined);
    subscribeToAthleteProfiles({} as never, "user-1", () => undefined, () => undefined);
    expect(firestore.collectionGroup).toHaveBeenCalledWith({}, "profile");
    const [group, low, high] = firestore.query.mock.calls[0] as [
      { name: string },
      { value: string },
      { value: string },
    ];
    expect(group.name).toBe("profile");
    expect(low.value).toBe("artifacts/skatingx-production/users/user-1/athletes/\u0000/profile/main");
    expect(high.value).toBe("artifacts/skatingx-production/users/user-1/athletes/\uf8ff/profile/main");
  });

  it("maps each profile to its parent athlete id", () => {
    let deliver: (snap: unknown) => void = () => undefined;
    firestore.onSnapshot.mockImplementation((_query, onData: (snap: unknown) => void) => {
      deliver = onData;
      return () => undefined;
    });
    const seen: { athleteId: string; displayName: string }[] = [];
    subscribeToAthleteProfiles({} as never, "user-1", (rows) => seen.push(...rows), () => undefined);
    deliver({
      docs: [
        {
          id: "main",
          ref: { path: "artifacts/skatingx-production/users/user-1/athletes/alex/profile/main" },
          data: () => ({ displayName: "Alex" }),
        },
        {
          id: "main",
          ref: { path: "artifacts/skatingx-production/users/user-1/athletes/lindsay/profile/main" },
          data: () => ({ displayName: "Lindsay" }),
        },
        {
          id: "other",
          ref: { path: "artifacts/skatingx-production/users/user-1/athletes/skip/notes/other" },
          data: () => ({ displayName: "Skip" }),
        },
      ],
    });
    expect(seen).toEqual([
      { athleteId: "alex", displayName: "Alex" },
      { athleteId: "lindsay", displayName: "Lindsay" },
    ]);
  });
});
