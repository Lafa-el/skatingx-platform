import { describe, expect, it } from "vitest";

import {
  checkExternalUrl,
  externalUrlHost,
  prepareRaceVideoInput,
  RACE_DAY_LIMITS,
  type RaceVideoInput,
} from "./race-day-input";

const video = (over: Partial<RaceVideoInput> = {}): RaceVideoInput => ({
  label: "  500m final  ",
  externalUrl: " https://example.com/watch?v=abc ",
  storedWhere: "  Phone camera roll ",
  note: " second corner ",
  ...over,
});

const codes = (r: { errors: { field: string; code: string }[] }) => r.errors.map((e) => `${e.field}:${e.code}`);

describe("checkExternalUrl", () => {
  it.each([
    "https://example.com",
    "http://example.com/path?x=1#frag",
    "https://drive.example.com/folder/abc",
    "https://example.com:8443/a",
    "https://192.168.0.1/clip",
    "https://a.b",
  ])("accepts %s", (url) => {
    expect(checkExternalUrl(url)).toBe("ok");
  });

  it.each([
    "javascript:alert(1)",
    "data:text/html,<b>x</b>",
    "file:///Users/x/clip.mp4",
    "ftp://example.com/clip",
    "example.com/clip",
    "//example.com/clip",
    "https://",
    "https:// example.com",
    "https://exa mple.com",
    "https://example.com/a b",
    "HTTPS://example.com",
    "https:/example.com",
    "https://[bad",
  ])("rejects %s as not a plain http(s) link", (url) => {
    expect(checkExternalUrl(url)).toBe("urlInvalid");
  });

  it.each(["https://user:secret@example.com/clip", "https://user@example.com", "http://:pw@example.com"])(
    "rejects %s because it carries credentials",
    (url) => {
      expect(checkExternalUrl(url)).toBe("urlHasCredentials");
    },
  );
});

describe("externalUrlHost", () => {
  it("shows only the host, not the path or query", () => {
    expect(externalUrlHost("https://www.example.com/watch?v=secret-token#t=1")).toBe("www.example.com");
    expect(externalUrlHost("http://example.com:8080/x")).toBe("example.com");
  });

  it("returns null for anything that is not an acceptable link", () => {
    expect(externalUrlHost("javascript:alert(1)")).toBeNull();
    expect(externalUrlHost("https://user:pw@example.com")).toBeNull();
    expect(externalUrlHost("")).toBeNull();
  });
});

describe("prepareRaceVideoInput", () => {
  it("trims every field", () => {
    const r = prepareRaceVideoInput(video());
    expect(r.errors).toEqual([]);
    expect(r.value).toEqual({
      label: "500m final",
      externalUrl: "https://example.com/watch?v=abc",
      storedWhere: "Phone camera roll",
      note: "second corner",
    });
  });

  it("turns blank optional fields into null, never empty strings", () => {
    const r = prepareRaceVideoInput(video({ externalUrl: "  ", storedWhere: "", note: null }));
    expect(r.errors).toEqual([]);
    expect(r.value).toMatchObject({ externalUrl: null, storedWhere: null, note: null });
  });

  it("needs only a label: the link, location and note are all optional", () => {
    const r = prepareRaceVideoInput({ label: "Clip", externalUrl: null, storedWhere: null, note: null });
    expect(r.errors).toEqual([]);
  });

  it("requires a label", () => {
    expect(codes(prepareRaceVideoInput(video({ label: "   " })))).toEqual(["label:required"]);
  });

  // Found on staging: a name made only of invisible characters looked empty but was saved,
  // because `trim()` does not remove zero-width characters.
  it.each([
    ["zero-width space", "\u200b"],
    ["zero-width joiner and non-joiner", "\u200c\u200d"],
    ["word joiner", "\u2060"],
    ["soft hyphen", "\u00ad"],
    ["Hangul filler", "\u3164"],
    ["invisible characters around spaces", " \u200b \u3000 "],
  ])("treats a label of only %s as empty", (_name, label) => {
    expect(codes(prepareRaceVideoInput(video({ label })))).toEqual(["label:required"]);
  });

  it("keeps a label that has a visible character next to invisible ones", () => {
    expect(codes(prepareRaceVideoInput(video({ label: "\u200bFinal" })))).toEqual([]);
  });

  it.each(["\u200b", " \u200b "])("stores an optional field of only invisible characters as null", (blank) => {
    const r = prepareRaceVideoInput(video({ storedWhere: blank, note: blank, externalUrl: blank }));
    expect(r.errors).toEqual([]);
    expect(r.value).toMatchObject({ storedWhere: null, note: null, externalUrl: null });
  });

  it.each([
    ["label", "videoLabel", (n: number) => video({ label: "l".repeat(n) })],
    ["storedWhere", "videoStoredWhere", (n: number) => video({ storedWhere: "s".repeat(n) })],
    ["note", "videoNote", (n: number) => video({ note: "n".repeat(n) })],
  ] as const)("limits %s exactly at the rules limit", (field, limit, make) => {
    const max = RACE_DAY_LIMITS[limit];
    expect(prepareRaceVideoInput(make(max)).errors).toEqual([]);
    expect(codes(prepareRaceVideoInput(make(max + 1)))).toEqual([`${field}:tooLong`]);
  });

  it("limits the link length exactly at the rules limit, and reports length before format", () => {
    const max = RACE_DAY_LIMITS.videoExternalUrl;
    const prefix = "https://example.com/";
    expect(prepareRaceVideoInput(video({ externalUrl: prefix + "a".repeat(max - prefix.length) })).errors).toEqual([]);
    expect(codes(prepareRaceVideoInput(video({ externalUrl: prefix + "a".repeat(max - prefix.length + 1) })))).toEqual([
      "externalUrl:tooLong",
    ]);
  });

  it("a link that is too long is reported as too long only, not also as malformed", () => {
    expect(codes(prepareRaceVideoInput(video({ externalUrl: "x".repeat(RACE_DAY_LIMITS.videoExternalUrl + 1) })))).toEqual([
      "externalUrl:tooLong",
    ]);
  });

  it("reports a bad link and a link with credentials separately", () => {
    expect(codes(prepareRaceVideoInput(video({ externalUrl: "javascript:alert(1)" })))).toEqual([
      "externalUrl:urlInvalid",
    ]);
    expect(codes(prepareRaceVideoInput(video({ externalUrl: "https://me:pw@example.com" })))).toEqual([
      "externalUrl:urlHasCredentials",
    ]);
  });

  it("collects every field error at once", () => {
    expect(
      codes(prepareRaceVideoInput({ label: "", externalUrl: "nope", storedWhere: "s".repeat(201), note: null })).sort(),
    ).toEqual(["externalUrl:urlInvalid", "label:required", "storedWhere:tooLong"]);
  });
});
