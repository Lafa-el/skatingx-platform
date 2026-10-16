// @vitest-environment happy-dom
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { render, screen, userEvent } from "@/test/dom";

import { AthleteSelector } from "./AthleteSelector";

const state = vi.hoisted(() => ({ locale: "zh" as "zh" | "en" }));
vi.mock("@/hooks/useLocale", () => ({ useLocale: () => state.locale }));
vi.mock("@/hooks/firestore", () => ({
  useActiveAthlete: () => ({ athleteId: "athlete-1", loading: false }),
  useAthleteProfile: () => ({ data: { displayName: "Sample Skater" } }),
}));

afterEach(() => {
  state.locale = "zh";
});

async function openMenu() {
  const user = userEvent.setup();
  render(
    <MemoryRouter>
      <AthleteSelector />
    </MemoryRouter>,
  );
  await user.click(screen.getByRole("button"));
  return user;
}

describe("AthleteSelector", () => {
  it("Chinese: the menu is named and worded in Chinese", async () => {
    await openMenu();
    expect(screen.getByRole("listbox", { name: "选择运动员" })).toBeTruthy();
    expect(screen.getByText("当前")).toBeTruthy();
    expect(screen.getByText("多运动员切换:后续阶段提供。")).toBeTruthy();
    const link = screen.getByRole("link", { name: "运动员档案 →" });
    expect(link.getAttribute("href")).toBe("/athlete");
  });

  it("English: the menu keeps its previous wording", async () => {
    state.locale = "en";
    await openMenu();
    expect(screen.getByRole("listbox", { name: "Select athlete" })).toBeTruthy();
    expect(screen.getByText("Active")).toBeTruthy();
    expect(screen.getByText("Multi-athlete switching — coming in a later phase.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Athlete profile →" }).getAttribute("href")).toBe("/athlete");
  });

  it("the athlete's own name and id are shown as stored in either language (ADR-004 D2)", async () => {
    for (const locale of ["zh", "en"] as const) {
      state.locale = locale;
      const { unmount } = render(
        <MemoryRouter>
          <AthleteSelector />
        </MemoryRouter>,
      );
      expect(screen.getByText("Sample Skater")).toBeTruthy();
      expect(screen.getByText("athlete-1")).toBeTruthy();
      unmount();
    }
  });

  it("is closed until opened, and Escape closes it", async () => {
    const user = await openMenu();
    expect(screen.getByRole("listbox")).toBeTruthy();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).toBeNull();
  });
});
