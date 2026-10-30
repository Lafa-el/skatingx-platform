// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";

import type { RaceVideoContext } from "@/hooks/useRaceVideoContext";
import { render, screen } from "@/test/dom";

import RaceVideoBanner from "./RaceVideoBanner";

const h = vi.hoisted(() => ({ locale: "zh" as "zh" | "en", context: null as unknown }));
vi.mock("@/hooks/useLocale", () => ({ useLocale: () => h.locale }));
vi.mock("@/hooks/useRaceVideoContext", () => ({ useRaceVideoContext: () => h.context }));

const context = (over: Partial<RaceVideoContext> = {}): RaceVideoContext => ({
  eventName: "2026 Buffalo Short Track Championships",
  eventPending: false,
  raceLabel: "1000m",
  racePending: false,
  videoLabel: "1000m Final A",
  storedWhere: null,
  externalUrl: "https://drive.google.com/file/d/abc?usp=sharing",
  ...over,
});

const show = (over: Partial<RaceVideoContext> = {}) => {
  h.context = context(over);
  render(<RaceVideoBanner link={{ eventId: "e", videoId: "v" }} />);
};

afterEach(() => {
  h.locale = "zh";
  h.context = null;
});

describe("RaceVideoBanner", () => {
  it("shows event, race, video name and an http(s) link with only the host as its text", () => {
    show();
    expect(screen.getByRole("heading", { name: "来自比赛日的视频记录" })).toBeTruthy();
    expect(screen.getByText("2026 Buffalo Short Track Championships")).toBeTruthy();
    expect(screen.getByText("1000m")).toBeTruthy();
    expect(screen.getByText("1000m Final A")).toBeTruthy();
    const link = screen.getByRole("link", { name: "打开链接（drive.google.com）" });
    expect(link.getAttribute("href")).toBe("https://drive.google.com/file/d/abc?usp=sharing");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    expect(document.body.textContent).not.toContain("usp=sharing");
  });

  it("shows where it is kept when there is a value, and leaves the row out when there is none", () => {
    show({ storedWhere: "手机相册" });
    expect(screen.getByText("存在哪")).toBeTruthy();
    expect(screen.getByText("手机相册")).toBeTruthy();
  });

  it("omits the kept-at row and the link row when the record has neither", () => {
    show({ storedWhere: null, externalUrl: null });
    expect(screen.queryByText("存在哪")).toBeNull();
    expect(screen.queryByText("外链")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("marks event and race as pending when they are not confirmed", () => {
    show({ eventPending: true, racePending: true });
    expect(screen.getAllByText("待确认")).toHaveLength(2);
  });

  it("marks nothing as pending when both are confirmed", () => {
    show();
    expect(screen.queryByText("待确认")).toBeNull();
  });

  it.each([
    ["javascript:alert(1)"],
    ["ftp://files.example.com/v.mp4"],
    ["not a link"],
    ["//example.com/v"],
  ])("a non-http(s) value (%s) is text only, never a link", (value) => {
    show({ externalUrl: value });
    expect(document.querySelector("a")).toBeNull();
    expect(document.body.textContent).toContain("只显示文字");
    expect(document.body.textContent).toContain(value);
  });

  it("a link with credentials is neither linked nor echoed", () => {
    show({ externalUrl: "https://user:secret@example.com/v" });
    expect(document.querySelector("a")).toBeNull();
    expect(document.body.textContent).toContain("含用户名或口令");
    expect(document.body.textContent).not.toContain("secret");
    expect(document.body.textContent).not.toContain("user:");
  });

  it("a non-web value with credentials is not echoed either", () => {
    show({ externalUrl: "ftp://user:secret@example.com/v" });
    expect(document.querySelector("a")).toBeNull();
    expect(document.body.textContent).not.toContain("secret");
  });

  it("is read-only: no input, button, form or media element", () => {
    show();
    expect(document.querySelector("input, button, form, textarea, select, video, audio, iframe")).toBeNull();
  });

  it("says the file is chosen by the user and nothing is uploaded", () => {
    show();
    expect(document.body.textContent).toContain("自己选择视频文件");
    expect(document.body.textContent).toContain("不会上传");
  });

  it("renders nothing while there is no complete record", () => {
    h.context = null;
    const { container } = render(<RaceVideoBanner link={{ eventId: "e", videoId: "v" }} />);
    expect(container.innerHTML).toBe("");
  });

  it("English locale", () => {
    h.locale = "en";
    show({ storedWhere: "Camera roll", eventPending: true });
    expect(screen.getByRole("heading", { name: "Video record from Race Day" })).toBeTruthy();
    expect(screen.getByText("Kept at")).toBeTruthy();
    expect(screen.getByText("Pending")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open link (drive.google.com)" })).toBeTruthy();
    expect(document.body.textContent).toContain("not uploaded");
  });
});
