// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";

import { legacyColourClasses } from "@/test/legacyLook";
import { render, screen, userEvent, within } from "@/test/dom";
import { controlsBelowTapTarget } from "@/test/tapTarget";
import { denied, watchUnhandledRejections } from "@/test/unhandledRejections";

import { TrainingRecordsPage } from "./TrainingRecordsPage";

type Entry = {
  id: string;
  date: string;
  timeSeconds: number;
  source?: string;
  note?: string;
  createdAt: string;
};

const entry = (id: string, date: string, timeSeconds: number, extra: Partial<Entry> = {}): Entry => ({
  id,
  date,
  timeSeconds,
  createdAt: `${date}T00:00:00.000Z`,
  ...extra,
});

const h = vi.hoisted(() => {
  const base = () => ({
    settings: { data: { language: "zh" } as unknown, loading: false, error: null },
    records: {
      loading: false,
      error: null as string | null,
      byDistance: {} as Record<string, unknown[]>,
    },
    actions: {
      busy: false,
      actionError: null as string | null,
      clearActionError: vi.fn(),
      addEntry: vi.fn(async (..._args: unknown[]) => undefined),
      editEntry: vi.fn(async (..._args: unknown[]) => undefined),
      removeEntry: vi.fn(async (..._args: unknown[]) => undefined),
    },
  });
  return { base, state: base() };
});

vi.mock("@/app/providers/FirestoreProvider", () => ({ useUserSettings: () => h.state.settings }));
vi.mock("@/components/FirestoreStatusBanner", () => ({ FirestoreStatusBanner: () => null }));
vi.mock("@/hooks/useTrainingRecordActions", () => ({ useTrainingRecordActions: () => h.state.actions }));
vi.mock("@/hooks/useTrainingRecords", () => ({
  useTrainingRecords: () => {
    const entriesOf = (id: string) => (h.state.records.byDistance[id] ?? []) as Entry[];
    const sorted = (id: string) => [...entriesOf(id)].sort((a, b) => b.date.localeCompare(a.date));
    const best = (id: string) =>
      entriesOf(id).reduce<Entry | null>((b, e) => (b === null || e.timeSeconds < b.timeSeconds ? e : b), null);
    return {
      loading: h.state.records.loading,
      error: h.state.records.error,
      getSortedEntries: sorted,
      getBestForDistance: best,
      getLatestForDistance: (id: string) => sorted(id)[0] ?? null,
      getDocument: (id: string) => ({ entries: entriesOf(id) }),
    };
  },
}));

const original = window.confirm;
afterEach(() => {
  h.state = h.base();
  window.confirm = original;
});

const setLanguage = (language: "zh" | "en") => {
  h.state.settings = { data: { language }, loading: false, error: null };
};

// This page was English only before it was translated: the English column is what it showed (except
// "1 entries", now "1 entry", and dates, now written as "Oct 12, 2026").
const TEXT = {
  zh: {
    title: "个人最好纪录",
    subtitle: "按距离记录个人最好成绩。时间可输入秒数，或 M:SS.xx 格式。",
    best: "个人最好时间",
    latest: "最近时间",
    none: "还没有纪录",
    addCard: "添加个人最好 / 纪录",
    editCard: "编辑纪录",
    date: "日期",
    time: "时间",
    timePlaceholder: "49.8 或 0:49.80 或 1:44.23",
    source: "来源",
    sources: { manual: "手动", training: "训练", race: "比赛" },
    note: "备注（可选）",
    notePlaceholder: "例如：计时赛",
    add: "添加纪录",
    save: "保存修改",
    saving: "保存中…",
    cancel: "取消",
    edit: "编辑",
    del: "删除",
    pb: "个人最好",
    loading: "正在加载纪录…",
    listTitle: (label: string, n: number) => `${label} — ${n} 条纪录`,
    empty: (label: string) => `${label} 还没有纪录。请先在上方添加第一个成绩。`,
    errDate: "请填写日期。",
    errTime: "请填写时间。",
    errInvalid: "请输入有效的时间（例如 49.8、0:49.80、1:44.23）。",
    confirm: (time: string) => `删除纪录 ${time}？`,
    distances: { start_half_lap: "起跑半圈", start_lap: "起跑一圈", fastest_lap: "最快单圈" },
    days: { "2026-10-12": "2026年10月12日", "2026-09-01": "2026年9月1日" },
  },
  en: {
    title: "PB records",
    subtitle: "Track personal bests by distance. Times support seconds or M:SS.xx.",
    best: "Best time (PB)",
    latest: "Latest time",
    none: "No entries yet",
    addCard: "Add PB / record",
    editCard: "Edit record",
    date: "Date",
    time: "Time",
    timePlaceholder: "49.8 or 0:49.80 or 1:44.23",
    source: "Source",
    sources: { manual: "Manual", training: "Training", race: "Race" },
    note: "Note (optional)",
    notePlaceholder: "e.g. time trial",
    add: "Add record",
    save: "Save changes",
    saving: "Saving…",
    cancel: "Cancel",
    edit: "Edit",
    del: "Delete",
    pb: "PB",
    loading: "Loading records…",
    listTitle: (label: string, n: number) => `${label} — ${n} entries`,
    empty: (label: string) => `No records for ${label} yet. Add your first time above.`,
    errDate: "Date is required.",
    errTime: "Time is required.",
    errInvalid: "Enter a valid time (e.g. 49.8, 0:49.80, 1:44.23).",
    confirm: (time: string) => `Delete record ${time}?`,
    distances: { start_half_lap: "Start Half Lap", start_lap: "Start Lap", fastest_lap: "Fastest Lap" },
    days: { "2026-10-12": "Oct 12, 2026", "2026-09-01": "Sep 1, 2026" },
  },
} as const;

const renderPage = () => render(<TrainingRecordsPage />);

describe.each(["zh", "en"] as const)("TrainingRecordsPage (%s)", (locale) => {
  const t = TEXT[locale];
  const setup = () => {
    setLanguage(locale);
    h.state.records.byDistance["500m"] = [
      entry("e1", "2026-09-01", 51.2, { source: "training", note: "after school" }),
      entry("e2", "2026-10-12", 49.8, { source: "race" }),
    ];
  };

  it("title, subtitle and the distance buttons", () => {
    setup();
    renderPage();
    expect(screen.getByRole("heading", { level: 1, name: t.title })).toBeTruthy();
    expect(screen.getByText(t.subtitle)).toBeTruthy();
    const labels = [
      "333m",
      "500m",
      "777m",
      "1000m",
      "1500m",
      t.distances.start_half_lap,
      t.distances.start_lap,
      t.distances.fastest_lap,
    ];
    for (const label of labels) {
      expect(screen.getByRole("button", { name: label }), label).toBeTruthy();
    }
  });

  it("the best and latest cards show the times and their dates, or say there is nothing", () => {
    setup();
    const view = renderPage();
    const best = within(screen.getByRole("heading", { name: t.best }).closest("article")!);
    expect(best.getByText("49.80")).toBeTruthy();
    expect(best.getByText(t.days["2026-10-12"])).toBeTruthy();
    const latest = within(screen.getByRole("heading", { name: t.latest }).closest("article")!);
    expect(latest.getByText("49.80")).toBeTruthy();
    expect(latest.getByText(t.days["2026-10-12"])).toBeTruthy();
    view.unmount();

    setLanguage(locale);
    h.state.records.byDistance = {};
    renderPage();
    const empty = within(screen.getByRole("heading", { name: t.best }).closest("article")!);
    expect(empty.getByText("—")).toBeTruthy();
    expect(empty.getByText(t.none)).toBeTruthy();
  });

  it("while loading the cards show an ellipsis and the list says so", () => {
    setup();
    h.state.records.loading = true;
    renderPage();
    expect(within(screen.getByRole("heading", { name: t.best }).closest("article")!).getByText("…")).toBeTruthy();
    expect(screen.getByText(t.loading)).toBeTruthy();
  });

  it("the list: title with the count, the entries newest first with PB, source and note", () => {
    setup();
    renderPage();
    expect(screen.getByRole("heading", { name: t.listTitle("500m", 2) })).toBeTruthy();
    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(rows[0]!.textContent).toContain("49.80");
    expect(rows[0]!.textContent).toContain(t.pb);
    expect(rows[0]!.textContent).toContain(`${t.days["2026-10-12"]} · ${t.sources.race}`);
    expect(rows[1]!.textContent).toContain("51.20");
    expect(rows[1]!.textContent).not.toContain(t.pb);
    expect(rows[1]!.textContent).toContain(`${t.days["2026-09-01"]} · ${t.sources.training}`);
    expect(rows[1]!.textContent).toContain("after school");
  });

  it("an empty distance says so with its label", () => {
    setup();
    renderPage();
    return userEvent.setup().click(screen.getByRole("button", { name: t.distances.start_lap })).then(() => {
      expect(screen.getByText(t.empty(t.distances.start_lap))).toBeTruthy();
      expect(screen.getByRole("heading", { name: t.listTitle(t.distances.start_lap, 0) })).toBeTruthy();
    });
  });

  it("the form: labels, placeholders, source choices and the button", () => {
    setup();
    renderPage();
    expect(screen.getByRole("heading", { name: t.addCard })).toBeTruthy();
    expect(screen.getByLabelText(t.date)).toBeTruthy();
    expect((screen.getByLabelText(t.time) as HTMLInputElement).placeholder).toBe(t.timePlaceholder);
    const source = screen.getByLabelText(t.source) as HTMLSelectElement;
    expect([...source.options].map((o) => [o.value, o.textContent])).toEqual([
      ["manual", t.sources.manual],
      ["training", t.sources.training],
      ["race", t.sources.race],
    ]);
    expect((screen.getByLabelText(t.note) as HTMLInputElement).placeholder).toBe(t.notePlaceholder);
    expect(screen.getByRole("button", { name: t.add })).toBeTruthy();
    expect(screen.queryByRole("button", { name: t.cancel })).toBeNull();
  });

  it("adding a record sends the distance, its label and the entry, then clears the form", async () => {
    setup();
    const user = userEvent.setup();
    renderPage();
    await user.clear(screen.getByLabelText(t.date));
    await user.type(screen.getByLabelText(t.date), "2026-10-15");
    await user.type(screen.getByLabelText(t.time), "0:49.80");
    await user.selectOptions(screen.getByLabelText(t.source), "race");
    await user.type(screen.getByLabelText(t.note), "  final  ");
    await user.click(screen.getByRole("button", { name: t.add }));
    expect(h.state.actions.addEntry).toHaveBeenCalledExactlyOnceWith("500m", "500m", {
      date: "2026-10-15",
      timeSeconds: 49.8,
      source: "race",
      note: "final",
    });
    expect((screen.getByLabelText(t.time) as HTMLInputElement).value).toBe("");
  });

  it("a time that cannot be read is refused with a hint and nothing is sent", async () => {
    setup();
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByLabelText(t.time), "fast");
    await user.click(screen.getByRole("button", { name: t.add }));
    expect(screen.getByRole("alert").textContent).toBe(t.errInvalid);
    expect(h.state.actions.addEntry).not.toHaveBeenCalled();
  });

  it("editing fills the form, saves under the same entry and can be cancelled", async () => {
    setup();
    const user = userEvent.setup();
    renderPage();
    const row = within(screen.getAllByRole("listitem")[1]!);
    await user.click(row.getByRole("button", { name: t.edit }));
    expect(screen.getByRole("heading", { name: t.editCard })).toBeTruthy();
    expect((screen.getByLabelText(t.time) as HTMLInputElement).value).toBe("51.20");
    expect((screen.getByLabelText(t.date) as HTMLInputElement).value).toBe("2026-09-01");
    expect((screen.getByLabelText(t.source) as HTMLSelectElement).value).toBe("training");
    expect((screen.getByLabelText(t.note) as HTMLInputElement).value).toBe("after school");

    await user.clear(screen.getByLabelText(t.time));
    await user.type(screen.getByLabelText(t.time), "50.5");
    await user.click(screen.getByRole("button", { name: t.save }));
    expect(h.state.actions.editEntry).toHaveBeenCalledExactlyOnceWith("500m", "500m", "e1", {
      date: "2026-09-01",
      timeSeconds: 50.5,
      source: "training",
      note: "after school",
    });
  });

  it("cancel leaves edit mode without saving", async () => {
    setup();
    const user = userEvent.setup();
    renderPage();
    await user.click(within(screen.getAllByRole("listitem")[0]!).getByRole("button", { name: t.edit }));
    await user.click(screen.getByRole("button", { name: t.cancel }));
    expect(screen.getByRole("heading", { name: t.addCard })).toBeTruthy();
    expect(h.state.actions.editEntry).not.toHaveBeenCalled();
  });

  it("deleting asks first with the time, and deletes only when confirmed", async () => {
    setup();
    const user = userEvent.setup();
    const confirm = vi.fn(() => false);
    window.confirm = confirm;
    renderPage();
    const del = () => within(screen.getAllByRole("listitem")[0]!).getByRole("button", { name: t.del });
    await user.click(del());
    expect(confirm).toHaveBeenCalledExactlyOnceWith(t.confirm("49.80"));
    expect(h.state.actions.removeEntry).not.toHaveBeenCalled();

    confirm.mockReturnValue(true);
    await user.click(del());
    expect(h.state.actions.removeEntry).toHaveBeenCalledExactlyOnceWith("500m", "500m", "e2");
  });

  it("while saving the button says so and is disabled", () => {
    setup();
    h.state.actions.busy = true;
    renderPage();
    expect((screen.getByRole("button", { name: t.saving }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("a load error and an action error are shown as alerts, as received", () => {
    setup();
    h.state.records.error = "load-denied";
    h.state.actions.actionError = "save-denied";
    renderPage();
    expect(screen.getAllByRole("alert").map((a) => a.textContent)).toEqual(["load-denied", "save-denied"]);
  });

  it("one entry is counted in the singular", () => {
    setLanguage(locale);
    h.state.records.byDistance["500m"] = [entry("e1", "2026-09-01", 51.2)];
    renderPage();
    const one = locale === "en" ? "500m — 1 entry" : "500m — 1 条纪录";
    expect(screen.getByRole("heading", { name: one })).toBeTruthy();
  });

  it("a blank time is refused with its own message and nothing is sent", async () => {
    setup();
    const user = userEvent.setup();
    renderPage();
    // A truly empty required field is stopped by the browser before the page sees it, so only a
    // blank one (spaces) gets through. The date field cannot be blank, so its own message is not
    // reachable from here.
    await user.type(screen.getByLabelText(t.time), "   ");
    await user.click(screen.getByRole("button", { name: t.add }));
    expect(screen.getByRole("alert").textContent).toBe(t.errTime);
    expect(h.state.actions.addEntry).not.toHaveBeenCalled();
  });

  it("a stored source without a name is shown as stored", () => {
    setLanguage(locale);
    h.state.records.byDistance["500m"] = [entry("e1", "2026-09-01", 51.2, { source: "coach-import" })];
    renderPage();
    expect(screen.getByRole("listitem").textContent).toContain(`${t.days["2026-09-01"]} · coach-import`);
  });
});

describe("TrainingRecordsPage: a message shown stays right when the language changes", () => {
  it("the form error is written again in the new language", async () => {
    setLanguage("zh");
    const user = userEvent.setup();
    const view = renderPage();
    await user.type(screen.getByLabelText(TEXT.zh.time), "   ");
    await user.click(screen.getByRole("button", { name: TEXT.zh.add }));
    expect(screen.getByRole("alert").textContent).toBe(TEXT.zh.errTime);

    setLanguage("en");
    view.rerender(<TrainingRecordsPage />);
    expect(screen.getByRole("alert").textContent).toBe(TEXT.en.errTime);
  });
});

describe("TrainingRecordsPage: tap targets (44px)", () => {
  it("every button, input and select asks for 44px, and Edit / Delete also for the width", () => {
    setLanguage("zh");
    h.state.records.byDistance["500m"] = [entry("e1", "2026-09-01", 51.2), entry("e2", "2026-10-12", 49.8)];
    const { container } = renderPage();
    expect(container.querySelectorAll("button").length).toBeGreaterThan(8);
    const entryButton = (el: Element) => el.closest("li") !== null;
    expect(controlsBelowTapTarget(container, { wide: entryButton })).toEqual([]);
  });

  it("the Cancel button of the edit form is one too", async () => {
    setLanguage("zh");
    h.state.records.byDistance["500m"] = [entry("e1", "2026-09-01", 51.2)];
    const user = userEvent.setup();
    const { container } = renderPage();
    await user.click(screen.getByRole("button", { name: TEXT.zh.edit }));
    expect(screen.getByRole("button", { name: TEXT.zh.cancel })).toBeTruthy();
    expect(controlsBelowTapTarget(container)).toEqual([]);
  });
});

// The hook shows the failure on the page and then rethrows ("the page relies on that to keep the
// form as it was"). The click handler must catch it, or it becomes "Uncaught (in promise)".
describe("TrainingRecordsPage: a failed action", () => {
  const t = TEXT.zh;
  const seed = () => {
    setLanguage("zh");
    h.state.records.byDistance["500m"] = [
      entry("e1", "2026-09-01", 51.2, { source: "training", note: "after school" }),
      entry("e2", "2026-10-12", 49.8, { source: "race" }),
    ];
  };

  it("adding: no unhandled rejection, the form keeps what was typed, the code is logged", async () => {
    seed();
    const watcher = watchUnhandledRejections();
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    h.state.actions.addEntry = vi.fn(async () => {
      throw denied();
    });
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByLabelText(t.time), "0:49.80");
    await user.click(screen.getByRole("button", { name: t.add }));
    expect(await watcher.settled()).toEqual([]);
    watcher.stop();
    expect((screen.getByLabelText(t.time) as HTMLInputElement).value).toBe("0:49.80");
    expect(log).toHaveBeenCalledExactlyOnceWith("[training-records] addEntry failed", { code: "permission-denied" });
    log.mockRestore();
  });

  it("editing: no unhandled rejection, the form stays in edit mode", async () => {
    seed();
    const watcher = watchUnhandledRejections();
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    h.state.actions.editEntry = vi.fn(async () => {
      throw denied();
    });
    const user = userEvent.setup();
    renderPage();
    await user.click(within(screen.getAllByRole("listitem")[1]!).getByRole("button", { name: t.edit }));
    await user.click(screen.getByRole("button", { name: t.save }));
    expect(await watcher.settled()).toEqual([]);
    watcher.stop();
    expect(screen.getByRole("heading", { name: t.editCard })).toBeTruthy();
    expect(log).toHaveBeenCalledExactlyOnceWith("[training-records] editEntry failed", { code: "permission-denied" });
    log.mockRestore();
  });

  it("deleting: no unhandled rejection", async () => {
    seed();
    const watcher = watchUnhandledRejections();
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    window.confirm = vi.fn(() => true);
    h.state.actions.removeEntry = vi.fn(async () => {
      throw denied();
    });
    const user = userEvent.setup();
    renderPage();
    await user.click(within(screen.getAllByRole("listitem")[0]!).getByRole("button", { name: t.del }));
    expect(await watcher.settled()).toEqual([]);
    watcher.stop();
    expect(log).toHaveBeenCalledExactlyOnceWith("[training-records] removeEntry failed", { code: "permission-denied" });
    log.mockRestore();
  });
});

describe("TrainingRecordsPage: UI v1 look", () => {
  const seed = (language: "zh" | "en") => {
    setLanguage(language);
    h.state.records.byDistance["500m"] = [
      entry("e1", "2026-09-01", 51.2, { source: "training", note: "after school" }),
      entry("e2", "2026-10-12", 49.8, { source: "race" }),
    ];
  };

  it.each(["zh", "en"] as const)("%s: no old colour class is left, with entries, the PB tag and errors showing", (language) => {
    seed(language);
    h.state.records.error = "Some technical reason";
    h.state.actions.actionError = "Some action failure";
    const { container } = renderPage();
    expect(legacyColourClasses(container)).toEqual([]);
    expect(container.querySelector('[data-tone="brand"]')).not.toBeNull();
  });

  it("the empty list and the loading state are free of old colour classes too", () => {
    setLanguage("zh");
    const empty = renderPage();
    expect(legacyColourClasses(empty.container)).toEqual([]);
    empty.unmount();
    h.state.records.loading = true;
    expect(legacyColourClasses(renderPage().container)).toEqual([]);
  });

  it("form errors have an icon as well as words", async () => {
    setLanguage("en");
    const user = userEvent.setup();
    renderPage();
    // Spaces get past the browser's own required-field check, so the page's message is shown.
    await user.type(screen.getByLabelText("Time"), "   ");
    await user.click(screen.getByRole("button", { name: "Add record" }));
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toBe("Time is required.");
    expect(alert.querySelector("svg")).not.toBeNull();
  });

  it("exactly one distance button is selected", () => {
    setLanguage("en");
    renderPage();
    const pressed = screen.getAllByRole("button").filter((button) => button.getAttribute("aria-pressed") === "true");
    expect(pressed).toHaveLength(1);
  });
});
