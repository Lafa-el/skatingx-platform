import { beforeEach, describe, expect, it, vi } from "vitest";

const DELETE = { kind: "delete-field" };
const TIMESTAMP = { kind: "server-timestamp" };

const h = vi.hoisted(() => ({
  uploaded: null as null | { path: string; type: string },
  deleted: [] as string[],
  writes: [] as Array<Record<string, unknown>>,
  missing: false,
  deny: false,
}));

vi.mock("firebase/storage", () => ({
  ref: (_storage: unknown, path: string) => ({ path }),
  uploadBytes: vi.fn(async (target: { path: string }, _file: Blob, meta: { contentType: string }) => {
    h.uploaded = { path: target.path, type: meta.contentType };
  }),
  deleteObject: vi.fn(async (target: { path: string }) => {
    if (h.deny) {
      throw new Error("denied");
    }
    if (h.missing) {
      throw { code: "storage/object-not-found" };
    }
    h.deleted.push(target.path);
  }),
}));

vi.mock("firebase/firestore", () => ({
  deleteField: () => DELETE,
  serverTimestamp: () => TIMESTAMP,
  setDoc: vi.fn(async (_ref: unknown, data: Record<string, unknown>) => {
    h.writes.push(data);
  }),
}));

vi.mock("../firestore/refs", () => ({
  athleteProfileRef: () => ({ path: "profile" }),
}));

import {
  AVATAR_MAX_BYTES,
  athleteAvatarPath,
  avatarFileProblem,
  deleteAthleteAvatar,
  uploadAthleteAvatar,
} from "./avatar";

const storage = {} as never;
const db = {} as never;

function file(type: string, size: number) {
  return { type, size } as Blob & { type: string; size: number };
}

beforeEach(() => {
  h.uploaded = null;
  h.deleted.length = 0;
  h.writes.length = 0;
  h.missing = false;
  h.deny = false;
});

describe("athlete avatars", () => {
  it("uses one fixed object path", () => {
    expect(athleteAvatarPath("user-1", "lindsay")).toBe("avatars/user-1/lindsay/avatar");
  });

  it("rejects a file that is not an image or is 5MB or larger before any upload", async () => {
    expect(avatarFileProblem(file("text/plain", 10))).toBe("type");
    expect(avatarFileProblem(file("image/png", AVATAR_MAX_BYTES))).toBe("size");
    expect(avatarFileProblem(file("image/jpeg", AVATAR_MAX_BYTES + 1))).toBe("size");
    expect(avatarFileProblem(file("image/png", AVATAR_MAX_BYTES - 1))).toBeNull();
    await expect(uploadAthleteAvatar(db, storage, "user-1", "lindsay", file("text/plain", 10))).rejects.toThrow(
      "avatar-type",
    );
    expect(h.uploaded).toBeNull();
    expect(h.writes).toEqual([]);
  });

  it("writes the storage path after a successful upload and does not store a download URL", async () => {
    const path = await uploadAthleteAvatar(db, storage, "user-1", "lindsay", file("image/png", 20));
    expect(path).toBe("avatars/user-1/lindsay/avatar");
    expect(h.uploaded).toEqual({ path: "avatars/user-1/lindsay/avatar", type: "image/png" });
    expect(h.writes).toEqual([{ avatarStoragePath: path, updatedAt: TIMESTAMP }]);
  });

  it("deletes the object and then clears the field", async () => {
    await deleteAthleteAvatar(db, storage, "user-1", "lindsay");
    expect(h.deleted).toEqual(["avatars/user-1/lindsay/avatar"]);
    expect(h.writes).toEqual([{ avatarStoragePath: DELETE, updatedAt: TIMESTAMP }]);
  });

  it("clears the field when the object is already gone", async () => {
    h.missing = true;
    await deleteAthleteAvatar(db, storage, "user-1", "lindsay");
    expect(h.writes).toEqual([{ avatarStoragePath: DELETE, updatedAt: TIMESTAMP }]);
  });

  it("does not clear the field when deleting the object fails", async () => {
    h.deny = true;
    await expect(deleteAthleteAvatar(db, storage, "user-1", "lindsay")).rejects.toThrow("denied");
    expect(h.writes).toEqual([]);
  });
});
