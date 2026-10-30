// @vitest-environment happy-dom
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { render, screen, within } from "@/test/dom";

import { DashboardPage } from "./DashboardPage";

// The Race Day card is its own chunk. Here the chunk is held back, so the page's stand-in shows.
const chunk = vi.hoisted(() => {
  let release: () => void = () => undefined;
  const loaded = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { loaded, release: () => release() };
});

vi.mock("@/components/RaceOverviewCard", async () => {
  await chunk.loaded;
  return { RaceOverviewCard: () => <p>card chunk loaded</p> };
});
vi.mock("@/app/providers/FirestoreProvider", () => ({
  useUserSettings: () => ({ data: { language: "en", isPro: false }, loading: false, error: null }),
  useAthleteProfile: () => ({ data: { displayName: "Sample Skater" }, loading: false, error: null }),
  useGamification: () => ({ data: { points: 0, streakDays: 0 }, loading: false, error: null }),
  useTrainingState: () => ({ data: { todayTasks: [] }, loading: false, error: null }),
}));
vi.mock("@/hooks/useRewardsShop", () => ({
  useRewardsShop: () => ({ loading: false, error: null, catalog: null, latestRedemption: null }),
}));
vi.mock("@/hooks/useTrainingRecords", () => ({
  useTrainingRecords: () => ({ loading: false, error: null, getBestForDistance: () => null, latestEntryOverall: null }),
}));
vi.mock("@/components/FirestoreStatusBanner", () => ({ FirestoreStatusBanner: () => null }));
vi.mock("@skatingx/firebase-client", () => ({ normalizeTrainingState: (state: unknown) => state }));

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("DashboardPage: Race Day card chunk", () => {
  it("shows a loading card in its place until the chunk arrives, then the card", async () => {
    vi.stubEnv("VITE_FEATURE_RACE_DAY", "true");
    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    );
    const article = screen.getByRole("heading", { level: 3, name: "Race Day" }).closest("article");
    expect(within(article as HTMLElement).getByRole("status").textContent).toBe("Loading Race Day…");
    expect(screen.queryByText("card chunk loaded")).toBeNull();

    chunk.release();
    expect(await screen.findByText("card chunk loaded")).toBeTruthy();
    expect(screen.queryByText("Loading Race Day…")).toBeNull();
  });

  it("flag off: no stand-in card either (the card is not mounted at all)", () => {
    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    );
    expect(screen.queryByRole("heading", { level: 3, name: "Race Day" })).toBeNull();
  });
});
