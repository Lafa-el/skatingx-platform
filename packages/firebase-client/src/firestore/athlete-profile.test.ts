import { beforeEach, describe, expect, it, vi } from "vitest";

const DELETE = { kind: "delete-field" };
const TIMESTAMP = { kind: "server-timestamp" };

const firestore = vi.hoisted(() => ({
  collection: vi.fn(),
  doc: vi.fn((...parts: unknown[]) => ({ parts })),
  setDoc: vi.fn(),
  deleteField: vi.fn(() => DELETE),
  serverTimestamp: vi.fn(() => TIMESTAMP),
}));

vi.mock("firebase/firestore", () => firestore);

import { updateAthleteProfile } from "./athlete-profile";

const filled = {
  displayName: " Lindsay ",
  birthDate: "2015-01-14",
  skatingStartDate: "2021-05-12",
  sport: "short_track_speed_skating",
  country: " USA ",
  bio: " note ",
};

beforeEach(() => {
  firestore.setDoc.mockReset();
  firestore.deleteField.mockClear();
  firestore.serverTimestamp.mockClear();
});

describe("updateAthleteProfile", () => {
  it("merges only the form fields and stamps updatedAt", async () => {
    await updateAthleteProfile({} as never, "user-1", "lindsay", filled);
    expect(firestore.setDoc).toHaveBeenCalledTimes(1);
    const [ref, data, options] = firestore.setDoc.mock.calls[0]!;
    expect(ref.parts.slice(1).join("/")).toBe(
      "artifacts/skatingx-production/users/user-1/athletes/lindsay/profile/main",
    );
    expect(data).toEqual({
      displayName: "Lindsay",
      birthDate: "2015-01-14",
      skatingStartDate: "2021-05-12",
      sport: "short_track_speed_skating",
      country: "USA",
      bio: "note",
      updatedAt: TIMESTAMP,
    });
    expect(data).not.toHaveProperty("skatingDivision");
    expect(options).toEqual({ merge: true });
  });

  it("removes a blank start date and bio instead of storing an empty string", async () => {
    await updateAthleteProfile({} as never, "user-1", "lindsay", {
      ...filled,
      skatingStartDate: "  ",
      bio: " ",
    });
    const data = firestore.setDoc.mock.calls[0]?.[1];
    expect(data.skatingStartDate).toBe(DELETE);
    expect(data.bio).toBe(DELETE);
    expect(data).not.toHaveProperty("skatingDivision");
  });
});
