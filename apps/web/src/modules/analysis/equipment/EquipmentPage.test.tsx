// @vitest-environment happy-dom
import { buildEquipmentHistoryRecord } from "@skatingx/skating-domain";
import { MemoryRouter } from "react-router-dom";
import { fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AnalysisEquipmentPage } from "@/pages/analysis/AnalysisEquipmentPage";
import { render, screen, userEvent, waitFor } from "@/test/dom";
import { legacyColourClasses } from "@/test/legacyLook";

const state = vi.hoisted(() => ({
  locale: "zh" as "zh" | "en",
  uid: null as string | null,
  db: null as object | null,
  save: vi.fn((_db: unknown, _record: unknown) => Promise.resolve()),
  remove: vi.fn((_db: unknown, _uid: unknown, _athlete: unknown, _id: unknown) => Promise.resolve()),
  unsubscribe: vi.fn(),
  records: [] as unknown[],
  // Settings as the page reads them: empty names no athlete.
  settings: {} as { activeAthleteId?: string } | null,
  // The athlete id each history subscription was opened for.
  subscribed: [] as unknown[],
}));

vi.mock("@/hooks/useLocale", () => ({ useLocale: () => state.locale }));
vi.mock("@/app/providers/AuthProvider", () => ({
  useAuth: () => ({ uid: state.uid, loading: false, firebaseReady: Boolean(state.uid) }),
}));
vi.mock("@/app/providers/FirestoreProvider", () => ({
  useUserSettings: () => ({ data: state.settings, loading: false, error: null }),
}));
vi.mock("@skatingx/firebase-client", () => ({
  getFirestoreDb: () => state.db,
  saveEquipmentHistoryRecord: (db: unknown, record: unknown) => state.save(db, record),
  deleteEquipmentHistoryRecord: (db: unknown, uid: unknown, athlete: unknown, id: unknown) =>
    state.remove(db, uid, athlete, id),
  subscribeToEquipmentHistory: (
    _db: unknown,
    _uid: unknown,
    athlete: unknown,
    onRecords: (records: readonly unknown[]) => void,
  ) => {
    state.subscribed.push(athlete);
    onRecords(state.records);
    return state.unsubscribe;
  },
}));

function ensureLocalStorage(): void {
  const existing = window.localStorage;
  if (existing && typeof existing.clear === "function") {
    existing.clear();
    return;
  }
  const data = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => {
      data.delete(key);
    },
    setItem: (key, value) => {
      data.set(key, value);
    },
  };
  Object.defineProperty(window, "localStorage", { configurable: true, value: storage });
}

beforeEach(() => {
  state.locale = "zh";
  state.uid = null;
  state.db = null;
  state.records = [];
  state.settings = {};
  state.subscribed = [];
  state.save.mockReset();
  state.save.mockImplementation(() => Promise.resolve());
  state.remove.mockClear();
  state.unsubscribe.mockClear();
  ensureLocalStorage();
});

afterEach(() => {
  vi.restoreAllMocks();
});

const renderPage = () =>
  render(
    <MemoryRouter>
      <AnalysisEquipmentPage />
    </MemoryRouter>,
  );

describe("equipment page", () => {
  it("builds an incomplete checklist from an empty form, and a reviewable one once weight and a centre reading exist", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("button", { name: "生成清单" }));
    expect(screen.getByText("记录不完整")).toBeTruthy();
    expect(screen.getByRole("link", { name: "前往生物力学实验室复查姿态" }).getAttribute("href")).toBe(
      "/analysis/biomechanics",
    );

    await user.type(screen.getByLabelText("运动员体重 (kg)"), "40");
    await user.type(screen.getAllByLabelText("0")[0]!, "12");
    await user.click(screen.getByRole("button", { name: "生成清单" }));
    expect(screen.getByText("可提交教练复核")).toBeTruthy();
  });

  it("saves a lindsay record with an ISO time and provenance, and no video", async () => {
    state.uid = "user-1";
    state.db = {};
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("button", { name: "生成清单" }));
    await user.click(screen.getByRole("button", { name: "保存记录" }));

    await waitFor(() => expect(state.save).toHaveBeenCalledTimes(1));
    const record = state.save.mock.calls[0]![1] as {
      athleteId: string;
      createdAt: string;
      provenance: { schemaVersion: string; algorithmVersion: string };
      findings: { code: string }[];
    };
    expect(record.athleteId).toBe("lindsay");
    expect(record.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(record.provenance.schemaVersion).toBe("skatingx-analysis-contract-v1");
    expect(record.provenance.algorithmVersion).toBe("legacy-equipment-port-1");
    expect(record.findings[0]?.code).toBe("equipment.symptom.slide");
    expect(JSON.stringify(record)).not.toContain("video");
  });

  it("asks before deleting, leaves the record on cancel, and removes it after confirm", async () => {
    const confirmSpy = vi.fn(() => false);
    window.confirm = confirmSpy;
    state.uid = "user-1";
    state.db = {};
    state.records = [
      buildEquipmentHistoryRecord({
        id: "equip-1",
        ownerUserId: "user-1",
        createdAt: "2026-10-19T06:00:00.000Z",
        symptomKey: "slide",
        symptomText: "弯道咬冰不足，弯中有向外侧滑的感觉。",
        height: "",
        weight: "40",
        bladeLength: "",
        leftRocker: [],
        rightRocker: [],
        offsets: { leftFront: "", leftRear: "", rightFront: "", rightRear: "" },
        bend: { front: "", middle: "", rear: "" },
        adjustmentType: "unchanged",
        feedbackRating: "not-skated",
        adjustmentNotes: "",
        missingCore: false,
        ruleHints: [],
      }),
    ];
    const user = userEvent.setup();
    const view = renderPage();

    await user.click(screen.getByRole("button", { name: "删除记录" }));
    expect(confirmSpy).toHaveBeenCalledWith("确定删除这条器材历史记录吗？删除后无法在本页面恢复。");
    expect(state.remove).not.toHaveBeenCalled();
    expect(screen.getByText("弯道咬冰不足，弯中有向外侧滑的感觉。")).toBeTruthy();

    confirmSpy.mockReturnValue(true);
    await user.click(screen.getByRole("button", { name: "删除记录" }));
    await waitFor(() => expect(state.remove).toHaveBeenCalledWith({}, "user-1", "lindsay", "equip-1"));
    expect(screen.queryByText("弯道咬冰不足，弯中有向外侧滑的感觉。")).toBeNull();

    view.unmount();
    expect(state.unsubscribe).toHaveBeenCalledTimes(1);
  });

  describe("which athlete the history belongs to", () => {
    const oldRecord = () =>
      buildEquipmentHistoryRecord({
        id: "equip-1",
        ownerUserId: "user-1",
        createdAt: "2026-10-19T06:00:00.000Z",
        symptomKey: "slide",
        symptomText: "弯道咬冰不足，弯中有向外侧滑的感觉。",
        height: "",
        weight: "40",
        bladeLength: "",
        leftRocker: [],
        rightRocker: [],
        offsets: { leftFront: "", leftRear: "", rightFront: "", rightRear: "" },
        bend: { front: "", middle: "", rear: "" },
        adjustmentType: "unchanged",
        feedbackRating: "not-skated",
        adjustmentNotes: "",
        missingCore: false,
        ruleHints: [],
      });

    it("settings without an athlete id: read and delete go to lindsay, as before", async () => {
      window.confirm = () => true;
      state.uid = "user-1";
      state.db = {};
      state.records = [oldRecord()];
      const user = userEvent.setup();
      renderPage();
      expect(state.subscribed).toEqual(["lindsay"]);
      await user.click(screen.getByRole("button", { name: "删除记录" }));
      await waitFor(() => expect(state.remove).toHaveBeenCalledWith({}, "user-1", "lindsay", "equip-1"));
    });

    it("settings that are not available: lindsay", () => {
      state.uid = "user-1";
      state.db = {};
      state.settings = null;
      renderPage();
      expect(state.subscribed).toEqual(["lindsay"]);
    });

    it("settings name athlete-9: the subscription and the delete go to athlete-9", async () => {
      window.confirm = () => true;
      state.uid = "user-1";
      state.db = {};
      state.settings = { activeAthleteId: "athlete-9" };
      state.records = [oldRecord()];
      const user = userEvent.setup();
      renderPage();
      expect(state.subscribed).toEqual(["athlete-9"]);
      await user.click(screen.getByRole("button", { name: "删除记录" }));
      await waitFor(() => expect(state.remove).toHaveBeenCalledWith({}, "user-1", "athlete-9", "equip-1"));
    });

    it("a change of athlete releases the old subscription and opens one for the new athlete", () => {
      state.uid = "user-1";
      state.db = {};
      const view = renderPage();
      expect(state.subscribed).toEqual(["lindsay"]);
      state.settings = { activeAthleteId: "athlete-9" };
      view.rerender(
        <MemoryRouter>
          <AnalysisEquipmentPage />
        </MemoryRouter>,
      );
      expect(state.unsubscribe).toHaveBeenCalledTimes(1);
      expect(state.subscribed).toEqual(["lindsay", "athlete-9"]);
    });
  });

  it("formats float32 artifacts out of weight and height, and keeps both languages free of the banned lab wording", () => {
    const view = renderPage();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("分析 · 装备");
    expect(screen.getByRole("heading", { level: 1 }).className).toContain("text-brand-navy");
    expect(screen.getByRole("button", { name: "生成清单" }).className).toContain("min-h-11");
    const weight = screen.getByLabelText("运动员体重 (kg)") as HTMLInputElement;
    const height = screen.getByLabelText("运动员身高 (cm)") as HTMLInputElement;
    expect(weight.getAttribute("inputmode")).toBe("decimal");
    expect(height.getAttribute("inputmode")).toBe("decimal");
    expect(weight.getAttribute("type")).not.toBe("number");
    fireEvent.change(weight, { target: { value: "7.050000190734863" } });
    expect(weight.value).toBe("7.05");
    expect(view.container.textContent).not.toContain("生物力学");
    expect(view.container.textContent).not.toContain("实验室");
    expect(legacyColourClasses(view.container)).toEqual([]);

    view.unmount();
    state.locale = "en";
    const english = renderPage();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Analysis · Equipment");
    expect(english.container.textContent).not.toContain("生物力学");
    expect(english.container.textContent).not.toMatch(/\blab\b/i);
  });

  it("keeps a browser copy when the cloud write fails, and can compare those two records", async () => {
    state.uid = "user-1";
    state.db = {};
    state.save.mockRejectedValue(new Error("cloud down"));
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("button", { name: "生成清单" }));
    await user.click(screen.getByRole("button", { name: "保存记录" }));
    expect(await screen.findByText("云端保存失败，已先保存到本机浏览器档案。")).toBeTruthy();
    // The first record is on file, so the same draft cannot be saved again: a second record
    // needs a fresh checklist.
    await user.click(screen.getByRole("button", { name: "生成清单" }));
    await user.click(screen.getByRole("button", { name: "保存记录" }));

    expect(await screen.findByText("云端保存失败，已先保存到本机浏览器档案。")).toBeTruthy();
    expect(screen.getByText("本机浏览器档案")).toBeTruthy();
    expect(state.save).toHaveBeenCalledTimes(2);
    expect(window.localStorage.getItem("skatingx-equipment-history-v1:user-1")).toContain("legacy-equipment-port-1");

    await user.click(screen.getByRole("button", { name: "生成对比" }));
    expect(screen.getByText("调整前后对比摘要")).toBeTruthy();
  });

  describe("the save button after a save", () => {
    const saveButton = () => screen.getByRole("button", { name: "保存记录" }) as HTMLButtonElement;
    const generate = (user: ReturnType<typeof userEvent.setup>) =>
      user.click(screen.getByRole("button", { name: "生成清单" }));
    const signedIn = (db: object | null) => {
      state.uid = "user-1";
      state.db = db;
    };

    it("locks after a cloud save, does not write the same draft twice, and generating again frees it", async () => {
      signedIn({});
      const user = userEvent.setup();
      renderPage();
      await generate(user);
      await user.click(saveButton());
      await screen.findByText("已保存到云端器材档案。");
      expect(saveButton().disabled).toBe(true);

      await user.click(saveButton());
      expect(state.save).toHaveBeenCalledTimes(1);

      await generate(user);
      expect(saveButton().disabled).toBe(false);
      await user.click(saveButton());
      await waitFor(() => expect(state.save).toHaveBeenCalledTimes(2));
    });

    it("locks after a cloud failure that was kept in this browser (the record is on file)", async () => {
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      signedIn({});
      state.save.mockRejectedValue(new Error("cloud down"));
      const user = userEvent.setup();
      renderPage();
      await generate(user);
      await user.click(saveButton());
      await screen.findByText("云端保存失败，已先保存到本机浏览器档案。");
      expect(saveButton().disabled).toBe(true);

      await user.click(saveButton());
      expect(state.save).toHaveBeenCalledTimes(1);
      const archived = JSON.parse(window.localStorage.getItem("skatingx-equipment-history-v1:user-1") ?? "[]");
      expect(archived).toHaveLength(1);
    });

    it("locks after a save in this browser when Firebase is not connected", async () => {
      signedIn(null);
      const user = userEvent.setup();
      renderPage();
      await generate(user);
      await user.click(saveButton());
      await screen.findByText("Firebase 未连接，已保存到本机浏览器档案。");
      expect(saveButton().disabled).toBe(true);
    });

    it("stays clickable when nothing was written anywhere, and can be retried", async () => {
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      signedIn({});
      state.save.mockRejectedValue(new Error("cloud down"));
      const setItem = vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
        throw new Error("quota");
      });
      const user = userEvent.setup();
      renderPage();
      await generate(user);
      await user.click(saveButton());
      expect((await screen.findByRole("alert")).textContent).toBe("保存没有完成，请再试一次。");
      expect(saveButton().disabled).toBe(false);

      setItem.mockRestore();
      await user.click(saveButton());
      await screen.findByText("云端保存失败，已先保存到本机浏览器档案。");
      expect(state.save).toHaveBeenCalledTimes(2);
      expect(saveButton().disabled).toBe(true);
    });
  });

  describe("the save gate follows the draft, not the status line or the history", () => {
    const saveButton = () => screen.getByRole("button", { name: "保存记录" }) as HTMLButtonElement;
    const originalConfirm = window.confirm;
    const oldRecord = (id: string) =>
      buildEquipmentHistoryRecord({
        id,
        ownerUserId: "user-1",
        createdAt: "2026-10-19T06:00:00.000Z",
        symptomKey: "slide",
        symptomText: "old record",
        height: "",
        weight: "40",
        bladeLength: "",
        leftRocker: [],
        rightRocker: [],
        offsets: { leftFront: "", leftRear: "", rightFront: "", rightRear: "" },
        bend: { front: "", middle: "", rear: "" },
        adjustmentType: "unchanged",
        feedbackRating: "not-skated",
        adjustmentNotes: "",
        missingCore: false,
        ruleHints: [],
      });

    afterEach(() => {
      window.confirm = originalConfirm;
    });

    async function savedWithOneOldRecord(where: "cloud" | "local") {
      state.uid = "user-1";
      state.db = {};
      window.confirm = vi.fn(() => true);
      if (where === "cloud") {
        state.records = [oldRecord("old-cloud")];
      } else {
        window.localStorage.setItem("skatingx-equipment-history-v1:user-1", JSON.stringify([oldRecord("old-local")]));
      }
      const user = userEvent.setup();
      renderPage();
      await user.click(screen.getByRole("button", { name: "生成清单" }));
      await user.click(saveButton());
      await screen.findByText("已保存到云端器材档案。");
      expect(saveButton().disabled).toBe(true);
      return user;
    }

    it("a failed delete (the status line changes to the delete error) does not free the button", async () => {
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      state.remove.mockRejectedValueOnce(new Error("cloud delete down"));
      const user = await savedWithOneOldRecord("cloud");

      await user.click(screen.getByRole("button", { name: "删除记录" }));
      await screen.findByText("删除失败，请稍后再试。");
      expect(state.remove).toHaveBeenCalledTimes(1);
      expect(saveButton().disabled).toBe(true);

      await user.click(saveButton());
      expect(state.save).toHaveBeenCalledTimes(1);
    });

    it("a successful delete does not free it either; only generating again does, and that save is not a duplicate", async () => {
      const user = await savedWithOneOldRecord("cloud");

      await user.click(screen.getByRole("button", { name: "删除记录" }));
      await waitFor(() => expect(state.remove).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(screen.queryByRole("button", { name: "删除记录" })).toBeNull());
      expect(saveButton().disabled).toBe(true);

      await user.click(screen.getByRole("button", { name: "生成清单" }));
      expect(saveButton().disabled).toBe(false);
    });

    it("deleting an older record from this browser's archive leaves it locked too: the gate is per draft, not per history", async () => {
      const user = await savedWithOneOldRecord("local");

      await user.click(screen.getByRole("button", { name: "删除记录" }));
      await waitFor(() => expect(screen.queryByRole("button", { name: "删除记录" })).toBeNull());
      expect(window.localStorage.getItem("skatingx-equipment-history-v1:user-1")).not.toContain("old-local");
      expect(saveButton().disabled).toBe(true);
      expect(state.save).toHaveBeenCalledTimes(1);
    });
  });

  it("saves in this browser when Firebase is not connected", async () => {
    state.uid = "user-1";
    state.db = null;
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("button", { name: "生成清单" }));
    await user.click(screen.getByRole("button", { name: "保存记录" }));

    expect(await screen.findByText("Firebase 未连接，已保存到本机浏览器档案。")).toBeTruthy();
    expect(state.save).not.toHaveBeenCalled();
    expect(screen.getByText("本机浏览器档案")).toBeTruthy();
  });
});

describe("a form changed after the checklist was generated", () => {
  const STALE = "表单已改动，当前清单是生成时的快照，请重新生成后再保存。";
  const saveButton = () => screen.getByRole("button", { name: "保存记录" }) as HTMLButtonElement;
  const weight = () => screen.getByLabelText("运动员体重 (kg)") as HTMLInputElement;
  const generate = (user: ReturnType<typeof userEvent.setup>) =>
    user.click(screen.getByRole("button", { name: "生成清单" }));
  const rocker = (container: HTMLElement, side: "left" | "right", point: number) =>
    container.querySelector(`[id="equip-rocker-${side}-${point}"]`) as HTMLInputElement;
  const signedIn = () => {
    state.uid = "user-1";
    state.db = {};
  };

  it("no checklist yet: no stale notice", () => {
    renderPage();
    expect(screen.queryByText(STALE)).toBeNull();
  });

  it("changing the weight after generating disables saving, says why, and writes nothing", async () => {
    signedIn();
    const user = userEvent.setup();
    renderPage();
    await user.type(weight(), "40");
    await generate(user);
    expect(screen.queryByText(STALE)).toBeNull();
    expect(saveButton().disabled).toBe(false);

    await user.type(weight(), "5");
    expect(screen.getByText(STALE)).toBeTruthy();
    expect(saveButton().disabled).toBe(true);
    await user.click(saveButton());
    expect(state.save).not.toHaveBeenCalled();
  });

  it("every kind of field counts: the record type, the feedback rating, the notes", async () => {
    signedIn();
    const user = userEvent.setup();
    renderPage();
    await generate(user);
    expect(screen.queryByText(STALE)).toBeNull();

    await user.selectOptions(screen.getByLabelText("本次记录类型"), "offset");
    expect(screen.getByText(STALE)).toBeTruthy();
    await user.selectOptions(screen.getByLabelText("本次记录类型"), "unchanged");
    expect(screen.queryByText(STALE)).toBeNull();

    await user.selectOptions(screen.getByLabelText("上冰反馈评级"), "clear-improvement");
    expect(screen.getByText(STALE)).toBeTruthy();
    await user.selectOptions(screen.getByLabelText("上冰反馈评级"), "not-skated");
    expect(screen.queryByText(STALE)).toBeNull();

    await user.type(screen.getByPlaceholderText(/记录具体调整或教练反馈/), "x");
    expect(screen.getByText(STALE)).toBeTruthy();
  });

  it("changing it back clears the notice and frees saving, when nothing was saved yet", async () => {
    signedIn();
    const user = userEvent.setup();
    renderPage();
    await user.type(weight(), "40");
    await generate(user);
    await user.type(weight(), "5");
    expect(saveButton().disabled).toBe(true);

    await user.type(weight(), "{Backspace}");
    expect(screen.queryByText(STALE)).toBeNull();
    expect(saveButton().disabled).toBe(false);
    await user.click(saveButton());
    await waitFor(() => expect(state.save).toHaveBeenCalledTimes(1));
  });

  it("a trailing space is not a change: the comparison is made on trimmed text", async () => {
    signedIn();
    const user = userEvent.setup();
    renderPage();
    await user.type(weight(), "40");
    await generate(user);
    await user.type(weight(), " ");
    expect(weight().value).toBe("40 ");
    expect(screen.queryByText(STALE)).toBeNull();
    expect(saveButton().disabled).toBe(false);
  });

  it("a rocker reading counts, but touching an empty gauge point does not", async () => {
    signedIn();
    const user = userEvent.setup();
    const view = renderPage();
    await user.type(rocker(view.container, "left", 0), "12");
    await generate(user);

    await user.type(rocker(view.container, "left", -1), "   ");
    expect(screen.queryByText(STALE)).toBeNull();
    expect(saveButton().disabled).toBe(false);

    await user.type(rocker(view.container, "left", 0), "5");
    expect(screen.getByText(STALE)).toBeTruthy();
    expect(saveButton().disabled).toBe(true);

    await user.type(rocker(view.container, "left", 0), "{Backspace}");
    expect(screen.queryByText(STALE)).toBeNull();

    await user.type(rocker(view.container, "right", 3), "7");
    expect(screen.getByText(STALE)).toBeTruthy();
  });

  it("after a failed save the form still cannot be saved once it changes", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    signedIn();
    state.save.mockRejectedValue(new Error("cloud down"));
    vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    const user = userEvent.setup();
    renderPage();
    await user.type(weight(), "40");
    await generate(user);
    await user.click(saveButton());
    expect((await screen.findByRole("alert")).textContent).toBe("保存没有完成，请再试一次。");
    expect(saveButton().disabled).toBe(false);

    await user.type(weight(), "5");
    expect(screen.getByText(STALE)).toBeTruthy();
    expect(saveButton().disabled).toBe(true);
    await user.click(saveButton());
    expect(state.save).toHaveBeenCalledTimes(1);
  });

  it("generating again after a change saves the new values, not the old snapshot", async () => {
    signedIn();
    const user = userEvent.setup();
    renderPage();
    await user.type(weight(), "40");
    await generate(user);
    await user.type(weight(), "5");
    expect(saveButton().disabled).toBe(true);

    await generate(user);
    expect(screen.queryByText(STALE)).toBeNull();
    expect(saveButton().disabled).toBe(false);
    await user.click(saveButton());
    await waitFor(() => expect(state.save).toHaveBeenCalledTimes(1));
    expect((state.save.mock.calls[0]![1] as { weight: string }).weight).toBe("405");
  });

  it("a saved checklist stays locked after a change, and generating again is the way out", async () => {
    signedIn();
    const user = userEvent.setup();
    renderPage();
    await user.type(weight(), "40");
    await generate(user);
    await user.click(saveButton());
    await screen.findByText("已保存到云端器材档案。");
    expect(saveButton().disabled).toBe(true);

    await user.type(weight(), "5");
    expect(screen.getByText(STALE)).toBeTruthy();
    expect(saveButton().disabled).toBe(true);

    await generate(user);
    expect(saveButton().disabled).toBe(false);
    // Back to the saved content, still the new draft object: that is a new record, as before.
    await user.click(saveButton());
    await waitFor(() => expect(state.save).toHaveBeenCalledTimes(2));
  });

  it("the notice is in English when the locale is English", async () => {
    state.locale = "en";
    signedIn();
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("button", { name: "Build the checklist" }));
    await user.type(screen.getByLabelText(/weight/i), "4");
    expect(
      screen.getByText("The form changed since this checklist was generated. Generate it again before saving."),
    ).toBeTruthy();
  });
});

describe("numbers are checked before a checklist is generated", () => {
  const saveButton = () => screen.getByRole("button", { name: "保存记录" }) as HTMLButtonElement;
  const weight = () => screen.getByLabelText("运动员体重 (kg)") as HTMLInputElement;
  const generate = (user: ReturnType<typeof userEvent.setup>) =>
    user.click(screen.getByRole("button", { name: "生成清单" }));
  const rocker = (container: HTMLElement, side: "left" | "right", point: number) =>
    container.querySelector(`[id="equip-rocker-${side}-${point}"]`) as HTMLInputElement;

  it("a weight that is not a number refuses to generate, names the weight, and builds no report", async () => {
    state.uid = "user-1";
    state.db = {};
    const user = userEvent.setup();
    renderPage();
    await user.type(weight(), "abc");
    await generate(user);

    expect((await screen.findByRole("alert")).textContent).toBe("“运动员体重 (kg)”不是数字，请改成数字再生成。");
    expect(screen.queryByText("可提交教练复核")).toBeNull();
    expect(screen.queryByText("记录不完整")).toBeNull();
    expect(saveButton().disabled).toBe(true);

    await user.clear(weight());
    await user.type(weight(), "40");
    await user.type(screen.getAllByLabelText("0")[0]!, "12");
    await generate(user);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText("可提交教练复核")).toBeTruthy();
    expect(saveButton().disabled).toBe(false);
  });

  it("a refused generate leaves the checklist already on screen, and the save of it, alone", async () => {
    state.uid = "user-1";
    state.db = {};
    const user = userEvent.setup();
    renderPage();
    await user.type(weight(), "40");
    await user.type(screen.getAllByLabelText("0")[0]!, "12");
    await generate(user);
    expect(screen.getByText("可提交教练复核")).toBeTruthy();

    await user.type(weight(), "x");
    await generate(user);
    expect(screen.getByRole("alert")).toBeTruthy();
    // The old checklist is still shown; the stale-form rule keeps it from being saved as it is.
    expect(screen.getByText("可提交教练复核")).toBeTruthy();
    expect(saveButton().disabled).toBe(true);
    expect(state.save).not.toHaveBeenCalled();
  });

  it("an offset such as 约2mm names that offset field, and 内2mm is still accepted", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByLabelText("右脚 Front Offset"), "约2mm");
    await generate(user);
    expect((await screen.findByRole("alert")).textContent).toBe("“右脚 Front Offset”不是数字，请改成数字再生成。");

    await user.clear(screen.getByLabelText("右脚 Front Offset"));
    await user.type(screen.getByLabelText("右脚 Front Offset"), "内2mm");
    await generate(user);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("a rocker reading that is not a number names the foot and the point, with a sign", async () => {
    const user = userEvent.setup();
    const view = renderPage();
    await user.type(rocker(view.container, "left", 3), "x");
    await generate(user);
    expect((await screen.findByRole("alert")).textContent).toBe(
      "“左脚 Radius/Rocker 读数 +3”不是数字，请改成数字再生成。",
    );

    await user.clear(rocker(view.container, "left", 3));
    await user.type(rocker(view.container, "right", -4), "1-2");
    await generate(user);
    expect(screen.getByRole("alert").textContent).toBe("“右脚 Radius/Rocker 读数 -4”不是数字，请改成数字再生成。");
  });

  it("a bend value that is not a number names that bend field", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByLabelText("中段 Bend"), "22mm?");
    await generate(user);
    expect((await screen.findByRole("alert")).textContent).toBe("“中段 Bend”不是数字，请改成数字再生成。");
  });

  it("says it in English too", async () => {
    state.locale = "en";
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByLabelText("Athlete weight (kg)"), "abc");
    await user.click(screen.getByRole("button", { name: "Build the checklist" }));
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Athlete weight (kg) is not a number. Enter a number, then generate again.",
    );
  });
});

