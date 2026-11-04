// @vitest-environment happy-dom
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { render, screen, userEvent } from "@/test/dom";
import { controlsBelowTapTarget } from "@/test/tapTarget";

import { AthleteSelector } from "./AthleteSelector";

const state = vi.hoisted(() => ({
  locale: "zh" as "zh" | "en",
  athleteId: "athlete-1",
  displayName: "Sample Skater",
  roster: [] as { athleteId: string; displayName: string }[],
  listFailed: false,
  updateUserSettings: vi.fn(
    async (_db: unknown, _userId: string, _patch: { activeAthleteId: string }) => undefined,
  ),
}));
vi.mock("@/hooks/useLocale", () => ({ useLocale: () => state.locale }));
vi.mock("@/app/providers/AuthProvider", () => ({ useAuth: () => ({ uid: "uid-123" }) }));
vi.mock("@/hooks/firestore", () => ({
  useActiveAthlete: () => ({ athleteId: state.athleteId, loading: false }),
  useAthleteProfile: () => ({ data: { displayName: state.displayName } }),
}));
vi.mock("@skatingx/firebase-client", () => ({
  getFirestoreDb: () => ({}),
  subscribeToAthleteProfiles: (
    _db: unknown,
    _userId: string,
    onData: (rows: { athleteId: string; displayName: string }[]) => void,
    onError: () => void,
  ) => {
    if (state.listFailed) {
      onError();
    } else {
      onData(state.roster);
    }
    return { unsubscribe: () => undefined };
  },
  updateUserSettings: (db: unknown, userId: string, patch: { activeAthleteId: string }) =>
    state.updateUserSettings(db, userId, patch),
}));

afterEach(() => {
  state.locale = "zh";
  state.athleteId = "athlete-1";
  state.displayName = "Sample Skater";
  state.roster = [];
  state.listFailed = false;
  state.updateUserSettings.mockReset();
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
    expect(screen.queryByText("多运动员切换：后续阶段提供。")).toBeNull();
    const link = screen.getByRole("link", { name: "运动员档案 →" });
    expect(link.getAttribute("href")).toBe("/athlete");
  });

  it("English: the menu keeps its previous wording", async () => {
    state.locale = "en";
    await openMenu();
    expect(screen.getByRole("listbox", { name: "Select athlete" })).toBeTruthy();
    expect(screen.getByText("Active")).toBeTruthy();
    expect(screen.queryByText("Multi-athlete switching — coming in a later phase.")).toBeNull();
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

  it("lists every athlete and switches the active one", async () => {
    state.athleteId = "lindsay";
    state.displayName = "Lindsay";
    state.roster = [
      { athleteId: "alex", displayName: "Alex" },
      { athleteId: "lindsay", displayName: "Lindsay" },
    ];
    const user = await openMenu();
    expect(screen.getByRole("option", { name: /Lindsay/ })).toBeTruthy();
    expect(screen.getByRole("option", { name: /Alex/ })).toBeTruthy();
    expect(screen.getByText("当前")).toBeTruthy();
    await user.click(screen.getByRole("option", { name: /Alex/ }));
    expect(state.updateUserSettings).toHaveBeenCalledWith({}, "uid-123", { activeAthleteId: "alex" });
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("a failed roster read keeps only the current athlete", async () => {
    state.listFailed = true;
    state.roster = [
      { athleteId: "alex", displayName: "Alex" },
      { athleteId: "athlete-1", displayName: "Sample Skater" },
    ];
    await openMenu();
    expect(screen.getAllByText("Sample Skater").length).toBeGreaterThan(0);
    expect(screen.queryByText("Alex")).toBeNull();
    expect(screen.getByText("当前")).toBeTruthy();
  });

  it("keeps the menu open when switching fails", async () => {
    state.athleteId = "lindsay";
    state.displayName = "Lindsay";
    state.roster = [
      { athleteId: "alex", displayName: "Alex" },
      { athleteId: "lindsay", displayName: "Lindsay" },
    ];
    state.updateUserSettings.mockRejectedValueOnce(new Error("unavailable"));
    const user = await openMenu();
    await user.click(screen.getByRole("option", { name: /Alex/ }));
    expect(screen.getByRole("listbox")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("没能切换，请再试一次。");
  });

  it("is closed until opened, and Escape closes it", async () => {
    const user = await openMenu();
    expect(screen.getByRole("listbox")).toBeTruthy();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).toBeNull();
  });
});

describe("AthleteSelector: tap targets (44px)", () => {
  it("the button and the profile link in the menu ask for 44px", async () => {
    await openMenu();
    expect(controlsBelowTapTarget(document.body)).toEqual([]);
  });
});
