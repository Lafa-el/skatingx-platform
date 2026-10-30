// @vitest-environment happy-dom
import type { RaceEntry, RaceEvent, RaceVideoRef } from "@skatingx/schema";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { act, render, screen, waitFor } from "@/test/dom";

import { AnalysisBiomechanicsPage } from "./AnalysisBiomechanicsPage";

/**
 * The whole chain from the URL to the banner (gate, lazy banner, hook), with only the data
 * source, the PRO flag and the analysis page body replaced. Covers ADR-010 acceptance end to end.
 */

type Listener = {
  kind: "events" | "races" | "videos";
  onData: (list: { items: unknown[]; invalid: unknown[] }) => void;
  released: boolean;
};

const h = vi.hoisted(() => ({
  pro: { isPro: true, loading: false, error: null as unknown },
  listeners: [] as Listener[],
}));

vi.mock("@/hooks/useLocale", () => ({ useLocale: () => "zh" }));
vi.mock("@/hooks/useIsPro", () => ({ useIsPro: () => h.pro }));
vi.mock("@/app/providers/AuthProvider", () => ({ useAuth: () => ({ uid: "uid-1" }) }));
vi.mock("@/modules/analysis/biomechanics/BiomechanicsPage", () => ({
  BiomechanicsPage: () => (
    <div>
      <h1>analysis page</h1>
      <input type="file" aria-label="choose a file" />
    </div>
  ),
}));
// Reads only. Any write function is missing here, so calling one would fail the test.
vi.mock("@skatingx/firebase-client", () => {
  const make =
    (kind: Listener["kind"]) =>
    (_ctx: unknown, ...rest: unknown[]) => {
      const onData = (kind === "events" ? rest[0] : rest[1]) as Listener["onData"];
      const listener: Listener = { kind, onData, released: false };
      h.listeners.push(listener);
      return () => {
        listener.released = true;
      };
    };
  return {
    getFirestoreDb: () => ({}),
    subscribeToRaceEvents: make("events"),
    subscribeToRaces: make("races"),
    subscribeToRaceVideos: make("videos"),
  };
});

const prov = { verification: "pending" as const, source: "manual" as const, sourceNote: "", verifiedAt: null, schemaVersion: 1 as const };
const audit = { schemaVersion: 1 as const, createdAt: "2026-10-24T10:00:00.000Z", updatedAt: "2026-10-24T10:00:00.000Z" };
const EVENT = { eventId: "buffalo-1", name: "Buffalo Championships", dates: ["2026-10-24"], timeZone: null, venue: null, ...prov } as RaceEvent;
const RACE = { raceId: "r1", distanceId: "1000m", label: "1000m", sortOrder: 1, day: null, round: null, heat: null, scheduledAt: null, rosterIds: [], ...prov } as RaceEntry;
const VIDEO: RaceVideoRef = {
  videoId: "v1",
  raceId: "r1",
  rosterId: "ann",
  label: "1000m Final A",
  externalUrl: "https://drive.example.com/x",
  storedWhere: null,
  note: null,
  ...audit,
};

const active = () => h.listeners.filter((l) => !l.released);
function deliver(kind: Listener["kind"], items: unknown[]) {
  act(() => {
    for (const l of h.listeners.filter((x) => x.kind === kind)) l.onData({ items, invalid: [] });
  });
}
const renderAt = (search: string) =>
  render(
    <MemoryRouter initialEntries={[`/analysis/biomechanics${search}`]}>
      <AnalysisBiomechanicsPage />
    </MemoryRouter>,
  );
const settle = () => new Promise((resolve) => setTimeout(resolve, 30));

beforeEach(() => {
  vi.stubEnv("VITE_FEATURE_RACE_DAY", "true");
  h.pro = { isPro: true, loading: false, error: null };
  h.listeners = [];
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("analysis page with a Race Day video link", () => {
  it("shows the banner above a usable analysis page, and releases the listeners on unmount", async () => {
    const { unmount } = renderAt("?raceVideo=buffalo-1.v1");
    await waitFor(() => expect(active()).toHaveLength(3));
    deliver("events", [EVENT]);
    deliver("races", [RACE]);
    deliver("videos", [VIDEO]);
    expect(screen.getByRole("heading", { name: "来自比赛日的视频记录" })).toBeTruthy();
    expect(screen.getByText("Buffalo Championships")).toBeTruthy();
    expect(screen.getByText("1000m Final A")).toBeTruthy();
    expect(screen.getByLabelText("choose a file")).toBeTruthy();
    unmount();
    expect(active()).toHaveLength(0);
  });

  it("a video that cannot be found leaves no banner and the page works", async () => {
    renderAt("?raceVideo=buffalo-1.v1");
    await waitFor(() => expect(active()).toHaveLength(3));
    deliver("events", [EVENT]);
    deliver("races", [RACE]);
    deliver("videos", []);
    expect(screen.queryByRole("heading", { name: "来自比赛日的视频记录" })).toBeNull();
    expect(screen.getByLabelText("choose a file")).toBeTruthy();
  });

  it.each([["no parameter", ""], ["bad ids", "?raceVideo=Bad.Id"], ["one id", "?raceVideo=buffalo-1"]])(
    "%s: no read, no banner, page works",
    async (_name, search) => {
      renderAt(search);
      await settle();
      expect(h.listeners).toHaveLength(0);
      expect(screen.queryByRole("heading", { name: "来自比赛日的视频记录" })).toBeNull();
      expect(screen.getByLabelText("choose a file")).toBeTruthy();
    },
  );

  it("a non-PRO user who types the link: no read, no banner, page works", async () => {
    h.pro = { isPro: false, loading: false, error: null };
    renderAt("?raceVideo=buffalo-1.v1");
    await settle();
    expect(h.listeners).toHaveLength(0);
    expect(screen.queryByRole("heading", { name: "来自比赛日的视频记录" })).toBeNull();
    expect(screen.getByLabelText("choose a file")).toBeTruthy();
  });

  it("with the Race Day flag off: no read, no banner, page works", async () => {
    vi.stubEnv("VITE_FEATURE_RACE_DAY", "");
    renderAt("?raceVideo=buffalo-1.v1");
    await settle();
    expect(h.listeners).toHaveLength(0);
    expect(screen.queryByRole("heading", { name: "来自比赛日的视频记录" })).toBeNull();
    expect(screen.getByLabelText("choose a file")).toBeTruthy();
  });
});
