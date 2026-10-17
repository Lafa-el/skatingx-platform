// @vitest-environment happy-dom
import type { RaceEntry, RaceRosterEntry, RaceVideoRef } from "@skatingx/schema";
import { describe, expect, it, vi } from "vitest";

import { render, screen, userEvent, within } from "@/test/dom";

import { buildVideoGroups } from "../lib/videos";
import { VideoList } from "./VideoList";

const locale = vi.hoisted(() => ({ current: "zh" as "zh" | "en" }));
vi.mock("@/hooks/useLocale", () => ({ useLocale: () => locale.current }));

const audit = {
  schemaVersion: 1 as const,
  createdAt: "2026-10-24T10:00:00.000Z",
  updatedAt: "2026-10-24T10:00:00.000Z",
};
const prov = { verification: "pending" as const, source: "manual" as const, sourceNote: "", verifiedAt: null, ...audit };

const race1: RaceEntry = {
  raceId: "r1",
  distanceId: "500m",
  label: "500m",
  sortOrder: 1,
  day: "2026-10-24",
  round: null,
  heat: null,
  scheduledAt: null,
  rosterIds: ["ann"],
  ...prov,
};
const ann: RaceRosterEntry = {
  rosterId: "ann",
  displayName: "Ann",
  bib: "7",
  division: "D",
  isSelf: true,
  isFollowed: false,
  athleteRefId: null,
  ...prov,
};
const video = (over: Partial<RaceVideoRef> = {}): RaceVideoRef => ({
  videoId: "v1",
  raceId: "r1",
  rosterId: "ann",
  label: "Start",
  externalUrl: null,
  storedWhere: null,
  note: null,
  ...audit,
  ...over,
});

function setup(videos: RaceVideoRef[], busy = false) {
  const onEdit = vi.fn();
  const onDelete = vi.fn();
  render(<VideoList groups={buildVideoGroups(videos, [race1], [ann])} busy={busy} onEdit={onEdit} onDelete={onDelete} />);
  return { user: userEvent.setup(), onEdit, onDelete };
}

describe("VideoList", () => {
  it("groups records under their race and shows label, athlete, location and note", () => {
    setup([video({ storedWhere: "手机相册", note: "第三圈" })]);
    expect(screen.getByRole("heading", { name: "#1 500m · 10月24日周六" })).toBeTruthy();
    expect(screen.getByText("Start")).toBeTruthy();
    expect(screen.getByText("Ann · #7")).toBeTruthy();
    expect(screen.getByText("存放位置：手机相册")).toBeTruthy();
    expect(screen.getByText("第三圈")).toBeTruthy();
  });

  it("opens a link in a new tab with noopener noreferrer, and shows only the host", () => {
    setup([video({ externalUrl: "https://videos.example.com/watch/abc?token=zzz" })]);
    const link = screen.getByRole("link", { name: "打开链接（videos.example.com）" });
    expect(link.getAttribute("href")).toBe("https://videos.example.com/watch/abc?token=zzz");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    expect(document.body.textContent).not.toContain("token=zzz");
  });

  it("renders no link for a record without one or with an unsafe one", () => {
    setup([
      video(),
      video({ videoId: "v2", label: "Bad", externalUrl: "javascript:alert(1)" }),
    ]);
    expect(screen.queryByRole("link")).toBeNull();
    expect(document.querySelector("a")).toBeNull();
  });

  it("never renders a video player or file input", () => {
    setup([video({ externalUrl: "https://example.com/v.mp4" })]);
    expect(document.querySelector("video, audio, iframe, embed, object")).toBeNull();
    expect(document.querySelector('input[type="file"]')).toBeNull();
  });

  it("shows an unknown athlete and an unknown race instead of hiding the record", () => {
    render(
      <VideoList
        groups={buildVideoGroups([video({ rosterId: "ghost" }), video({ videoId: "v2", raceId: "gone" })], [race1], [ann])}
        busy={false}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByText("未知运动员")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "未知比赛" })).toBeTruthy();
  });

  it("edit hands over the record", async () => {
    const { user, onEdit } = setup([video()]);
    await user.click(screen.getByRole("button", { name: /^编辑/ }));
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onEdit.mock.calls[0]?.[0].video.videoId).toBe("v1");
  });

  it("delete is two steps and the warning says only the record is deleted", async () => {
    const { user, onDelete } = setup([video()]);
    await user.click(screen.getByRole("button", { name: /^删除/ }));
    expect(onDelete).not.toHaveBeenCalled();
    const warning = screen.getByRole("alert");
    expect(warning.textContent).toContain("无法恢复");
    expect(warning.textContent).toContain("只删除记录");
    expect(warning.textContent).toContain("视频文件本身不受影响");
    await user.click(screen.getByRole("button", { name: /^确认删除/ }));
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onDelete.mock.calls[0]?.[0].video.videoId).toBe("v1");
  });

  it("cancelling the delete confirmation deletes nothing", async () => {
    const { user, onDelete } = setup([video()]);
    await user.click(screen.getByRole("button", { name: /^删除/ }));
    await user.click(screen.getByRole("button", { name: "取消" }));
    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("confirming one record leaves the others with their normal buttons", async () => {
    const { user } = setup([video(), video({ videoId: "v2", label: "Finish" })]);
    const items = screen.getAllByRole("listitem");
    await user.click(within(items[0] as HTMLElement).getByRole("button", { name: /^删除/ }));
    expect(within(items[1] as HTMLElement).queryByRole("button", { name: /^确认删除/ })).toBeNull();
    expect(within(items[1] as HTMLElement).getByRole("button", { name: /^删除/ })).toBeTruthy();
  });

  it("disables edit and delete while a row action is running", () => {
    setup([video()], true);
    expect((screen.getByRole("button", { name: /^编辑/ }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: /^删除/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("English locale: link, location and delete warning", async () => {
    locale.current = "en";
    const { user } = setup([video({ externalUrl: "https://example.com/x", storedWhere: "Camera roll" })]);
    expect(screen.getByRole("link", { name: "Open link (example.com)" })).toBeTruthy();
    expect(screen.getByText("Kept at: Camera roll")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /^Delete/ }));
    expect(screen.getByRole("alert").textContent).toContain("video file itself is not affected");
    locale.current = "zh";
  });
});
