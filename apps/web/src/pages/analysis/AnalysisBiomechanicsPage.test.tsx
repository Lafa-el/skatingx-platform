// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";

import { render, screen } from "@/test/dom";

import { AnalysisBiomechanicsPage } from "./AnalysisBiomechanicsPage";

const h = vi.hoisted(() => ({ gateRenders: 0 }));

vi.mock("@/modules/analysis/biomechanics/BiomechanicsPage", () => ({
  BiomechanicsPage: () => <p>biomechanics page</p>,
}));
vi.mock("@/modules/analysis/biomechanics/RaceVideoBannerGate", () => ({
  RaceVideoBannerGate: () => {
    h.gateRenders += 1;
    return <p>gate</p>;
  },
}));

afterEach(() => {
  vi.unstubAllEnvs();
  h.gateRenders = 0;
});

describe("AnalysisBiomechanicsPage", () => {
  it("with the Race Day flag off renders the analysis page alone: no gate, no read", () => {
    vi.stubEnv("VITE_FEATURE_RACE_DAY", "");
    render(<AnalysisBiomechanicsPage />);
    expect(screen.getByText("biomechanics page")).toBeTruthy();
    expect(screen.queryByText("gate")).toBeNull();
    expect(h.gateRenders).toBe(0);
  });

  it("with the flag on renders the gate above the analysis page", () => {
    vi.stubEnv("VITE_FEATURE_RACE_DAY", "true");
    render(<AnalysisBiomechanicsPage />);
    const gate = screen.getByText("gate");
    const page = screen.getByText("biomechanics page");
    expect(gate.compareDocumentPosition(page) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
