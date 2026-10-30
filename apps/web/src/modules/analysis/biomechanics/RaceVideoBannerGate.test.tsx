// @vitest-environment happy-dom
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { render, screen, waitFor } from "@/test/dom";

import { RaceVideoBannerGate } from "./RaceVideoBannerGate";

const h = vi.hoisted(() => ({
  pro: { isPro: true, loading: false, error: null as unknown },
  mounted: [] as { eventId: string; videoId: string }[],
}));

vi.mock("@/hooks/useIsPro", () => ({ useIsPro: () => h.pro }));
// Stands for "the banner was downloaded and mounted": if a gate failed, this must never run.
vi.mock("./RaceVideoBanner", () => ({
  default: ({ link }: { link: { eventId: string; videoId: string } }) => {
    h.mounted.push(link);
    return <p>banner {link.eventId} {link.videoId}</p>;
  },
}));

const renderAt = (search: string) =>
  render(
    <MemoryRouter initialEntries={[`/analysis/biomechanics${search}`]}>
      <RaceVideoBannerGate />
    </MemoryRouter>,
  );

beforeEach(() => {
  h.pro = { isPro: true, loading: false, error: null };
  h.mounted = [];
});
describe("RaceVideoBannerGate", () => {
  it("mounts the banner for a PRO user with a well-formed link", async () => {
    renderAt("?raceVideo=buffalo-1.v1");
    await waitFor(() => expect(screen.getByText("banner buffalo-1 v1")).toBeTruthy());
  });

  it("ignores other parameters", async () => {
    renderAt("?foo=bar&raceVideo=buffalo-1.v1&x=1");
    await waitFor(() => expect(h.mounted).toEqual([{ eventId: "buffalo-1", videoId: "v1" }]));
  });

  it.each([
    ["no parameter", ""],
    ["empty", "?raceVideo="],
    ["no dot", "?raceVideo=buffalo-1"],
    ["two dots", "?raceVideo=a.b.c"],
    ["uppercase", "?raceVideo=Buffalo.v1"],
    ["a path", "?raceVideo=..%2F..%2Fx.v1"],
  ])("does not mount the banner for %s", async (_name, search) => {
    const { container } = renderAt(search);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(h.mounted).toEqual([]);
    expect(container.innerHTML).toBe("");
  });

  it.each([
    ["not PRO", { isPro: false, loading: false, error: null }],
    ["the plan is loading", { isPro: false, loading: true, error: null }],
    ["loading with a stale PRO value", { isPro: true, loading: true, error: null }],
    ["the plan could not be read", { isPro: false, loading: false, error: new Error("x") }],
    ["a read error with a stale PRO value", { isPro: true, loading: false, error: new Error("x") }],
  ])("does not mount the banner (and so reads nothing) when %s", async (_name, pro) => {
    h.pro = pro;
    const { container } = renderAt("?raceVideo=buffalo-1.v1");
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(h.mounted).toEqual([]);
    expect(container.innerHTML).toBe("");
  });
});
