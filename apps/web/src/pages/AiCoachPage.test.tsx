// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";

import { render, screen } from "@/test/dom";

import { AiCoachPage } from "./AiCoachPage";

const state = vi.hoisted(() => ({ locale: "zh" as "zh" | "en" }));
vi.mock("@/hooks/useLocale", () => ({ useLocale: () => state.locale }));

afterEach(() => {
  state.locale = "zh";
});

describe("AiCoachPage", () => {
  it("Chinese: title and a note that says the feature comes later", () => {
    render(<AiCoachPage />);
    expect(screen.getByRole("heading", { level: 1, name: "AI 教练" })).toBeTruthy();
    expect(screen.getByText("教练建议及一键应用到任务的流程——第 5 阶段及之后提供。")).toBeTruthy();
  });

  it("English: the previous wording", () => {
    state.locale = "en";
    render(<AiCoachPage />);
    expect(screen.getByRole("heading", { level: 1, name: "AI Coach" })).toBeTruthy();
    expect(screen.getByText("Coach recommendations and apply-to-tasks flow — Phase 5+.")).toBeTruthy();
  });
});
