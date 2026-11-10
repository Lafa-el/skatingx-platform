import { describe, expect, it, vi } from "vitest";

import { buildVideoWrite, createVideo, getVideoEntry, updateVideo, videoEntryFromDocument } from "./videos";

const NOW = "2026-06-08T12:00:00.000Z";
const LATER = "2026-06-09T12:00:00.000Z";

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

describe("buildVideoWrite", () => {
  it("refuses a blank title and a link that is not http(s), and drops tags outside the preset", () => {
    expect(buildVideoWrite({ title: "  " }, { now: NOW, creating: true })).toEqual({ ok: false, field: "title" });
    expect(buildVideoWrite({ title: "冰上", externalUrl: "ftp://files" }, { now: NOW, creating: true })).toEqual({
      ok: false,
      field: "externalUrl",
    });
    const built = buildVideoWrite(
      { title: "冰上", technicalTags: ["spin", "not-a-tag", "edge"], fileName: "  ", notes: "" },
      { now: NOW, creating: true },
    );
    expect(built).toEqual({
      ok: true,
      data: { title: "冰上", technicalTags: ["edge", "spin"], createdAt: NOW, updatedAt: NOW },
    });
  });
});

describe("createVideo and updateVideo", () => {
  it("creates with createdAt and edits only updatedAt", async () => {
    const created = await createVideo(db, "alice", { title: "冰上", externalUrl: "https://example.com/a" }, NOW);
    expect(created).toEqual({ ok: true, id: "auto-1" });
    const written = firestore.addDoc.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(written.createdAt).toBe(NOW);
    expect(written.updatedAt).toBe(NOW);
    expect(written.externalUrl).toBe("https://example.com/a");

    const edited = await updateVideo(db, "alice", "auto-1", { title: "改过" }, LATER);
    expect(edited).toEqual({ ok: true });
    const patch = firestore.setDoc.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(patch).toEqual({ title: "改过", updatedAt: LATER });
    expect(patch).not.toHaveProperty("createdAt");
  });

  it("does not write when the title or the link is refused", async () => {
    firestore.addDoc.mockClear();
    expect(await createVideo(db, "alice", { title: "" }, NOW)).toEqual({ ok: false, field: "title" });
    expect(await createVideo(db, "alice", { title: "冰上", externalUrl: "not a url" }, NOW)).toEqual({
      ok: false,
      field: "externalUrl",
    });
    expect(firestore.addDoc).not.toHaveBeenCalled();
  });
});

describe("getVideoEntry", () => {
  it("returns every stored field, and null when the document is missing", async () => {
    firestore.getDoc.mockResolvedValueOnce({
      exists: () => true,
      id: "auto-1",
      data: () => ({
        title: "冰上",
        fileName: "clip.mp4",
        externalUrl: "https://example.com/a",
        technicalTags: ["edge", "spin"],
        linkedSessionId: "sess-1",
        notes: "备注",
        createdAt: NOW,
        updatedAt: LATER,
      }),
    });
    expect(await getVideoEntry(db, "alice", "auto-1")).toEqual({
      id: "auto-1",
      title: "冰上",
      fileName: "clip.mp4",
      externalUrl: "https://example.com/a",
      technicalTags: ["edge", "spin"],
      linkedSessionId: "sess-1",
      notes: "备注",
      createdAt: NOW,
      updatedAt: LATER,
    });

    firestore.getDoc.mockResolvedValueOnce({ exists: () => false, id: "gone", data: () => undefined });
    expect(await getVideoEntry(db, "alice", "gone")).toBeNull();
  });

  it("reads a document back through the same field rules", () => {
    expect(
      videoEntryFromDocument("auto-1", {
        title: "冰上",
        createdAt: NOW,
        technicalTags: ["other", "nope"],
        externalUrl: "  ",
      }),
    ).toEqual({
      id: "auto-1",
      title: "冰上",
      createdAt: NOW,
      updatedAt: NOW,
      technicalTags: ["other"],
    });
  });
});
