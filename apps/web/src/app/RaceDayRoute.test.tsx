// @vitest-environment happy-dom
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { render, screen } from "@/test/dom";

import { RaceDayRoute } from "./RaceDayRoute";

vi.mock("@/hooks/useLocale", () => ({ useLocale: () => "zh" }));

// The real module pulls in layout, Header and Firestore context; this test is only about
// the gate, so the module is replaced by a marker.
const moduleLoaded = vi.hoisted(() => vi.fn());
vi.mock("@/modules/race-day/RaceDayModule", () => {
  moduleLoaded();
  return { default: () => <p>race day module</p> };
});

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/dashboard" element={<p>dashboard page</p>} />
        <Route path="/race-day/*" element={<RaceDayRoute />} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("RaceDayRoute", () => {
  it("flag off: /race-day (and deep links) redirect to the dashboard and never load the module", () => {
    vi.stubEnv("VITE_FEATURE_RACE_DAY", "");
    moduleLoaded.mockClear();
    renderAt("/race-day/schedule");
    expect(screen.getByText("dashboard page")).toBeTruthy();
    expect(screen.queryByText("race day module")).toBeNull();
    expect(moduleLoaded).not.toHaveBeenCalled();
  });

  it("flag on: shows a loading state, then the module", async () => {
    vi.stubEnv("VITE_FEATURE_RACE_DAY", "true");
    renderAt("/race-day");
    expect(screen.getByRole("status").textContent).toBe("加载中…");
    expect(await screen.findByText("race day module")).toBeTruthy();
    expect(screen.queryByText("dashboard page")).toBeNull();
  });
});
