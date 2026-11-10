import { describe, expect, it } from "vitest";

import { buildCollectionCsv, buildExportJson, filterExportByScope, prepareExportScope } from "./export-format";

const bundle = {
  days: [
    { id: "d-before", date: "2026-06-07" },
    { id: "d-from", date: "2026-06-08" },
    { id: "d-to", date: "2026-06-10" },
    { id: "d-after", date: "2026-06-11" },
    { id: "d-sunday", date: "2026-06-14" },
    { id: "d-next", date: "2026-06-15" },
  ],
  sessions: [{ id: "s1", date: "2026-06-08" }],
  coachNotes: [{ id: "n1", date: "2026-06-09", note: "保持" }],
  bodyStatus: [{ id: "b1", date: "2026-06-10" }],
  weeklyReviews: [
    { id: "2026-06-01", weekStart: "2026-06-01" },
    { id: "2026-06-08", weekStart: "2026-06-08" },
    { id: "2026-06-10", weekStart: "2026-06-10" },
  ],
  videos: [
    { id: "v-from", title: "起", createdAt: "2026-06-08T23:00:00.000Z" },
    { id: "v-sunday", title: "日", createdAt: "2026-06-14T01:00:00.000Z" },
    { id: "v-next", title: "后", createdAt: "2026-06-15T00:00:00.000Z" },
  ],
};

describe("buildExportJson", () => {
  it("keeps all six collections and the records as they were parsed", () => {
    const text = buildExportJson(bundle, "2026-06-16T00:00:00.000Z");
    expect(text).toContain('\n  "days"');
    expect(JSON.parse(text)).toEqual({
      exportedAt: "2026-06-16T00:00:00.000Z",
      days: bundle.days,
      sessions: bundle.sessions,
      coachNotes: bundle.coachNotes,
      bodyStatus: bundle.bodyStatus,
      weeklyReviews: bundle.weeklyReviews,
      videos: bundle.videos,
    });
  });
});

describe("buildCollectionCsv", () => {
  it("uses the union of keys, so a key that appears only on the second row stays in the header", () => {
    const csv = buildCollectionCsv([
      { id: "1", title: "第一" },
      { id: "2", extra: "第二" },
    ]);
    expect(csv.split("\r\n")[0]).toBe("id,title,extra");
    expect(csv.split("\r\n")[2]).toBe("2,,第二");
  });

  it("quotes commas, quotes, and line breaks, and stores an array as JSON", () => {
    const csv = buildCollectionCsv([
      { title: "a,b", note: 'say "hi"', lines: "one\ntwo", tags: ["edge", "spin"], empty: null, ready: true, count: 2 },
    ]);
    expect(csv).toBe('title,note,lines,tags,empty,ready,count\r\n"a,b","say ""hi""","one\ntwo","[""edge"",""spin""]",,true,2');
  });

  it("returns an empty string for an empty collection", () => {
    expect(buildCollectionCsv([])).toBe("");
  });
});

describe("filterExportByScope", () => {
  it("keeps both ends of a range and drops the days outside it", () => {
    const filtered = filterExportByScope(bundle, { kind: "range", from: "2026-06-08", to: "2026-06-10" });
    expect(filtered.days.map((row) => row.id)).toEqual(["d-from", "d-to"]);
    expect(filtered.weeklyReviews.map((row) => row.weekStart)).toEqual(["2026-06-08", "2026-06-10"]);
    expect(filtered.videos.map((row) => row.id)).toEqual(["v-from"]);
  });

  it("treats one week as Monday through Sunday, and a review only when its week starts that Monday", () => {
    const prepared = prepareExportScope({ kind: "week", day: "2026-06-10" });
    expect(prepared).toEqual({ ok: true, scope: { kind: "week", weekStart: "2026-06-08" } });
    if (!prepared.ok) return;
    const filtered = filterExportByScope(bundle, prepared.scope);
    expect(filtered.days.map((row) => row.id)).toEqual(["d-from", "d-to", "d-after", "d-sunday"]);
    expect(filtered.weeklyReviews.map((row) => row.id)).toEqual(["2026-06-08"]);
    expect(filtered.videos.map((row) => row.id)).toEqual(["v-from", "v-sunday"]);
  });

  it("refuses a range that is reversed or not a real date", () => {
    expect(prepareExportScope({ kind: "range", from: "2026-06-10", to: "2026-06-08" })).toEqual({ ok: false });
    expect(prepareExportScope({ kind: "range", from: "2026-02-30", to: "2026-03-01" })).toEqual({ ok: false });
    expect(prepareExportScope({ kind: "week", day: "2026-02-30" })).toEqual({ ok: false });
  });
});
