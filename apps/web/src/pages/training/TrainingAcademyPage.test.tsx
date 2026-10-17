// @vitest-environment happy-dom
import { getAcademyStages } from "@skatingx/content";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { render, screen, userEvent, within } from "@/test/dom";
import { controlsBelowTapTarget } from "@/test/tapTarget";

import { TrainingAcademyPage } from "./TrainingAcademyPage";

type Hook = { data: unknown; loading: boolean; error: string | null };

const h = vi.hoisted(() => {
  const ready = (data: unknown): Hook => ({ data, loading: false, error: null });
  const base = () => ({
    settings: ready({ language: "zh", isPro: false }),
    training: ready({ todayTasks: [] as unknown[] }),
    academy: {
      busy: false,
      actionError: null as string | null,
      lastResult: null as { imported: number; skipped: number } | null,
      clearActionError: vi.fn(),
      clearLastResult: vi.fn(),
      importItem: vi.fn(async (_item: unknown) => undefined),
      importDayPlan: vi.fn(async (_stage: unknown, _planId: string) => undefined),
      importWeekdayRoutine: vi.fn(async (_stage: unknown, _weekday: string) => undefined),
    },
  });
  return { ready, base, state: base() };
});

vi.mock("@/app/providers/FirestoreProvider", () => ({
  useUserSettings: () => h.state.settings,
  useTrainingState: () => h.state.training,
}));
vi.mock("@/hooks/useAcademyImport", () => ({ useAcademyImport: () => h.state.academy }));
vi.mock("@/components/FirestoreStatusBanner", () => ({ FirestoreStatusBanner: () => null }));

afterEach(() => {
  h.state = h.base();
});

const setSettings = (language: "zh" | "en", isPro = false) => {
  h.state.settings = h.ready({ language, isPro });
};

const renderPage = () =>
  render(
    <MemoryRouter>
      <TrainingAcademyPage />
    </MemoryRouter>,
  );

// The content package carries its own Chinese and English, so the test reads it instead of copying.
const stages = getAcademyStages();
const stage = stages[0]!;
const module0 = stage.modules[0]!;
const item0 = module0.items[0]!;
const plan0 = stage.weeklyRoutine.dayPlans[0]!;

const itemBox = (title: string) => {
  const box = screen.getByText(title).closest("div.rounded-lg");
  if (!box) {
    throw new Error(`no drill titled ${title}`);
  }
  return within(box as HTMLElement);
};

const TEXT = {
  zh: {
    title: "BLAZE SKATE Academy",
    subtitle: "全周期速滑专业陆地训练 — 免费浏览；单项可随时导入今日任务。",
    free: "免费版",
    proOn: "PRO 已开启",
    dt: ["时长", "频率", "风格"],
    modules: "训练模块",
    add: "导入今日",
    added: "已添加",
    proTag: "（PRO）",
    intro: "参考周计划 — 可随时浏览；批量导入需要 PRO。",
    lock: "高阶计划导入需要 PRO。AI 训练计划尚未推出，推出后也将需要 PRO。",
    lockTitle: "需要 PRO",
    weekday: "导入指定星期",
    importDay: "导入该日",
    importing: "导入中…",
    importPlan: "导入本日到今日任务",
    weekdays: ["周一", "周二", "周三", "周四", "周五", "周六", "周日"],
    proCard: "PRO 功能",
    proItems: ["高阶计划导入（已开启）", "自定义训练方案（即将推出）", "AI 教练联动（即将推出）"],
    proNote: "支付尚未接入；PRO 目前只对试用账号开放。",
    result: (i: number, s: number) => `已导入 ${i} 项，跳过 ${s} 项（今日已存在）。`,
    viewTasks: "查看任务",
    category: "陆地训练",
  },
  en: {
    title: "BLAZE SKATE Academy",
    subtitle: "Professional dryland training — browse free; import single drills anytime.",
    free: "Free plan",
    proOn: "PRO active",
    dt: ["Duration", "Frequency", "Focus"],
    modules: "Training modules",
    add: "Add to today",
    added: "Added",
    proTag: "(PRO)",
    intro: "Reference weekly plans — browse anytime; bulk import requires PRO.",
    lock: "PRO required for advanced routine import. AI training plans are not available yet and will also need PRO.",
    lockTitle: "PRO required",
    weekday: "Import weekday routine",
    importDay: "Import day",
    importing: "Importing…",
    importPlan: "Import this plan to today",
    weekdays: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    proCard: "PRO features",
    proItems: [
      "Advanced routine import (enabled)",
      "Custom training plans (coming)",
      "AI Coach integration (coming)",
    ],
    proNote: "Payment is not integrated; PRO is only available to trial accounts for now.",
    result: (i: number, s: number) => `Imported ${i}, skipped ${s} (already on today’s list).`,
    viewTasks: "View tasks",
    category: "Dryland",
  },
} as const;

describe.each(["zh", "en"] as const)("TrainingAcademyPage (%s)", (locale) => {
  const t = TEXT[locale];
  const pick = <T,>(zh: T, en: T) => (locale === "zh" ? zh : en);
  const setLocale = (isPro = false) => setSettings(locale, isPro);

  it("title, intro and the free-plan banner", () => {
    setLocale();
    renderPage();
    expect(screen.getByRole("heading", { level: 1, name: t.title })).toBeTruthy();
    expect(screen.getByText(t.subtitle)).toBeTruthy();
    expect(screen.getByText(t.free)).toBeTruthy();
  });

  it("the PRO banner when PRO is on", () => {
    setLocale(true);
    renderPage();
    expect(screen.getByText(t.proOn)).toBeTruthy();
  });

  it("the stage card: the content's own name, overview and facts in this language", () => {
    setLocale();
    renderPage();
    const card = within(screen.getByRole("heading", { level: 3, name: pick(stage.labelZh, stage.labelEn) }).closest("article")!);
    expect(card.getByText(pick(stage.overviewZh, stage.overviewEn))).toBeTruthy();
    for (const label of t.dt) {
      expect(card.getByText(label), label).toBeTruthy();
    }
    expect(card.getByText(pick(stage.durationZh, stage.durationEn))).toBeTruthy();
    expect(card.getByText(pick(stage.frequencyZh, stage.frequencyEn))).toBeTruthy();
    expect(card.getByText(pick(stage.coreFocusZh, stage.coreFocusEn))).toBeTruthy();
  });

  it("one button per stage, named by its age range in the language", () => {
    setLocale();
    renderPage();
    for (const s of stages) {
      const own = pick(s.ageRangeZh, s.ageRangeEn);
      const other = pick(s.ageRangeEn, s.ageRangeZh);
      expect(screen.getByRole("button", { name: own }), own).toBeTruthy();
      // Not the other language's text next to it.
      expect(screen.queryByRole("button", { name: other }), other).toBeNull();
    }
  });

  it("the first module is open: each drill shows its content text, its category name and an add button", () => {
    setLocale();
    renderPage();
    expect(screen.getByRole("heading", { level: 2, name: t.modules })).toBeTruthy();
    const box = itemBox(pick(item0.titleZh, item0.titleEn));
    expect(box.getByText(pick(item0.descriptionZh, item0.descriptionEn))).toBeTruthy();
    expect(box.getByText(pick(item0.targetZh, item0.targetEn))).toBeTruthy();
    expect(box.getByText(t.category)).toBeTruthy();
    expect(box.queryByText(item0.category)).toBeNull();
    expect((box.getByRole("button", { name: t.add }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("a drill already on today's list says so, and cannot be added again", () => {
    setLocale();
    h.state.training = h.ready({ todayTasks: [{ source: "academy", academyItemId: item0.id }] });
    renderPage();
    const box = itemBox(pick(item0.titleZh, item0.titleEn));
    expect((box.getByRole("button", { name: t.added }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("while tasks load, the add buttons are off; while importing, they show an ellipsis", () => {
    setLocale();
    h.state.training = { data: null, loading: true, error: null };
    const loading = renderPage();
    expect((itemBox(pick(item0.titleZh, item0.titleEn)).getByRole("button", { name: t.add }) as HTMLButtonElement).disabled).toBe(true);
    loading.unmount();

    h.state.training = h.ready({ todayTasks: [] });
    h.state.academy.busy = true;
    renderPage();
    expect(within(screen.getByText(pick(item0.titleZh, item0.titleEn)).closest("div.rounded-lg") as HTMLElement).getByRole("button", { name: "…" })).toBeTruthy();
  });

  it("a drill shows its tags in the language, and not the other language's", () => {
    setLocale();
    renderPage();
    const box = itemBox(pick(item0.titleZh, item0.titleEn));
    const own = pick(item0.tagsZh, item0.tagsEn).join(" · ");
    const other = pick(item0.tagsEn, item0.tagsZh).join(" · ");
    expect(own).not.toBe(other);
    expect(box.getByText(own)).toBeTruthy();
    expect(box.queryByText(other)).toBeNull();
  });

  it("adding a drill imports exactly that drill", async () => {
    setLocale();
    const user = userEvent.setup();
    renderPage();
    await user.click(itemBox(pick(item0.titleZh, item0.titleEn)).getByRole("button", { name: t.add }));
    expect(h.state.academy.clearActionError).toHaveBeenCalled();
    expect(h.state.academy.clearLastResult).toHaveBeenCalled();
    expect(h.state.academy.importItem).toHaveBeenCalledExactlyOnceWith(item0);
  });

  it("the weekly routine: content title, PRO tag, intro, locked card and a disabled form when free", () => {
    setLocale(false);
    renderPage();
    const heading = screen.getByRole("heading", { level: 2, name: new RegExp(pick(stage.weeklyRoutine.titleZh, stage.weeklyRoutine.titleEn)) });
    expect(heading.textContent).toContain(t.proTag);
    expect(screen.getByText(t.intro)).toBeTruthy();
    const locked = screen.getByRole("status");
    expect(locked.textContent).toContain(t.lockTitle);
    expect(locked.textContent).toContain(t.lock);
    expect((screen.getByLabelText(t.weekday) as HTMLSelectElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: t.importDay }) as HTMLButtonElement).disabled).toBe(true);
    for (const b of screen.getAllByRole("button", { name: t.importPlan })) {
      expect((b as HTMLButtonElement).disabled).toBe(true);
    }
  });

  it("with PRO: no locked card, and the PRO features card is shown", () => {
    setLocale(true);
    renderPage();
    expect(screen.queryByRole("status")).toBeNull();
    const card = within(screen.getByRole("heading", { level: 3, name: t.proCard }).closest("article")!);
    for (const text of t.proItems) {
      expect(card.getByText(text), text).toBeTruthy();
    }
    expect(card.getByText(t.proNote)).toBeTruthy();
  });

  it("without PRO the PRO features card is not shown", () => {
    setLocale(false);
    renderPage();
    expect(screen.queryByRole("heading", { level: 3, name: t.proCard })).toBeNull();
  });

  it("the weekday list names the seven days in this language", () => {
    setLocale(true);
    renderPage();
    const options = within(screen.getByLabelText(t.weekday)).getAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual([...t.weekdays]);
    expect(options.map((o) => (o as HTMLOptionElement).value)).toEqual([
      "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
    ]);
  });

  it("importing a weekday uses the chosen day (Tuesday to start with)", async () => {
    setLocale(true);
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("button", { name: t.importDay }));
    expect(h.state.academy.importWeekdayRoutine).toHaveBeenLastCalledWith(stage, "tuesday");

    await user.selectOptions(screen.getByLabelText(t.weekday), "friday");
    await user.click(screen.getByRole("button", { name: t.importDay }));
    expect(h.state.academy.importWeekdayRoutine).toHaveBeenLastCalledWith(stage, "friday");
  });

  it("each day plan shows its content title, duration and task labels as stored, and imports that plan", async () => {
    setLocale(true);
    const user = userEvent.setup();
    renderPage();
    const heading = screen.getByRole("heading", {
      level: 3,
      name: `${pick(plan0.dayLabelZh, plan0.dayLabelEn)} · ${pick(plan0.titleZh, plan0.titleEn)}`,
    });
    const card = within(heading.closest("article")!);
    expect(card.getByText(pick(plan0.durationZh, plan0.durationEn))).toBeTruthy();
    const own = pick(plan0.taskLabelsZh, plan0.taskLabelsEn);
    const other = pick(plan0.taskLabelsEn, plan0.taskLabelsZh);
    expect(own.length).toBeGreaterThan(0);
    for (const label of own) {
      expect(card.getByText(label), label).toBeTruthy();
    }
    for (const label of other) {
      expect(card.queryByText(label), label).toBeNull();
    }
    await user.click(card.getByRole("button", { name: t.importPlan }));
    expect(h.state.academy.importDayPlan).toHaveBeenCalledExactlyOnceWith(stage, plan0.id);
  });

  it("importing the second plan imports that plan, not the first one", async () => {
    setLocale(true);
    const second = stage.weeklyRoutine.dayPlans[1];
    expect(second, "the content has at least two day plans").toBeTruthy();
    const user = userEvent.setup();
    renderPage();
    const heading = screen.getByRole("heading", {
      level: 3,
      name: `${pick(second!.dayLabelZh, second!.dayLabelEn)} · ${pick(second!.titleZh, second!.titleEn)}`,
    });
    await user.click(within(heading.closest("article")!).getByRole("button", { name: t.importPlan }));
    expect(h.state.academy.importDayPlan).toHaveBeenCalledExactlyOnceWith(stage, second!.id);
  });

  it("while importing, the two import buttons say so", () => {
    setLocale(true);
    h.state.academy.busy = true;
    renderPage();
    expect(screen.getAllByRole("button", { name: t.importing }).length).toBe(1 + stage.weeklyRoutine.dayPlans.length);
  });

  it("the result of an import: counts, and a link to the tasks", () => {
    setLocale();
    h.state.academy.lastResult = { imported: 3, skipped: 2 };
    renderPage();
    expect(screen.getByText(t.result(3, 2), { exact: false })).toBeTruthy();
    expect(screen.getByRole("link", { name: t.viewTasks }).getAttribute("href")).toBe("/training/tasks");
  });

  it("an import error is shown as an alert, as received", () => {
    setLocale();
    h.state.academy.actionError = "permission-denied";
    renderPage();
    expect(screen.getByRole("alert").textContent).toBe("permission-denied");
  });

  // happy-dom does not lay anything out, so the 44px minimum is pinned by its class (min-h-11 is
  // 2.75rem) and was measured in a real browser for the PR.
  const hasMinHeight44 = (element: HTMLElement) => element.className.split(/\s+/).includes("min-h-11");

  it("tap targets: the stage buttons and every drill's add button are at least 44px tall", () => {
    setLocale();
    renderPage();
    // The stage buttons share one row and come first on the page; their text is not needed here.
    const row = screen.getAllByRole("button")[0]!.parentElement!;
    const stageButtons = [...row.querySelectorAll<HTMLElement>("button")];
    expect(stageButtons).toHaveLength(stages.length);
    for (const button of stageButtons) {
      expect(hasMinHeight44(button), button.textContent ?? "").toBe(true);
    }
    const adds = screen.getAllByRole("button", { name: t.add });
    expect(adds.length).toBe(module0.items.length);
    for (const add of adds) {
      expect(hasMinHeight44(add)).toBe(true);
    }
  });

  it("tap targets: the link to the tasks after an import is at least 44px tall", () => {
    setLocale();
    h.state.academy.lastResult = { imported: 3, skipped: 2 };
    renderPage();
    expect(hasMinHeight44(screen.getByRole("link", { name: t.viewTasks }))).toBe(true);
  });

  it("tap targets: the weekday picker and the PRO import buttons are at least 44px tall", () => {
    setLocale(true);
    renderPage();
    expect(hasMinHeight44(screen.getByRole("combobox", { name: t.weekday }))).toBe(true);
    expect(hasMinHeight44(screen.getByRole("button", { name: t.importDay }))).toBe(true);
    const plans = screen.getAllByRole("button", { name: t.importPlan });
    expect(plans.length).toBe(stage.weeklyRoutine.dayPlans.length);
    for (const plan of plans) {
      expect(hasMinHeight44(plan)).toBe(true);
    }
  });
});

describe("TrainingAcademyPage (other)", () => {
  it("the language follows the settings, and Chinese is the default while they are not there", () => {
    h.state.settings = h.ready(null);
    renderPage();
    expect(screen.getByText("全周期速滑专业陆地训练 — 免费浏览；单项可随时导入今日任务。")).toBeTruthy();
  });

  it("choosing another stage shows that stage and opens its first module", async () => {
    const other = stages[1]!;
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("button", { name: other.ageRangeZh }));
    expect(screen.getByRole("heading", { level: 3, name: other.labelZh })).toBeTruthy();
    // The same text can also be a task label further down, so look for it inside an open drill.
    const first = other.modules[0]!.items[0]!;
    const inOpenDrill = screen
      .getAllByText(first.titleZh)
      .some((element) => element.closest("div.rounded-lg") !== null);
    expect(inOpenDrill).toBe(true);
    expect(screen.getByText(first.descriptionZh)).toBeTruthy();
  });

  it("a module can be folded and opened again", async () => {
    const user = userEvent.setup();
    renderPage();
    const moduleButton = screen.getByRole("button", { name: new RegExp(module0.titleZh) });
    await user.click(moduleButton);
    expect(screen.queryByText(item0.titleZh)).toBeNull();
    await user.click(moduleButton);
    expect(screen.getByText(item0.titleZh)).toBeTruthy();
  });

  it("a PRO user can import a plan; a free user cannot trigger it even by a click that gets through", async () => {
    const user = userEvent.setup();
    renderPage();
    // The buttons are disabled for a free user, so the page never calls the import.
    await user.click(screen.getAllByRole("button", { name: "导入本日到今日任务" })[0]!);
    expect(h.state.academy.importDayPlan).not.toHaveBeenCalled();
    expect(h.state.academy.importWeekdayRoutine).not.toHaveBeenCalled();
  });
});

describe("TrainingAcademyPage: tap targets (44px)", () => {
  it("stage buttons, module headers, add buttons and the form ask for 44px", () => {
    const { container } = renderPage();
    expect(container.querySelectorAll("button").length).toBeGreaterThan(5);
    expect(controlsBelowTapTarget(container)).toEqual([]);
  });
});
