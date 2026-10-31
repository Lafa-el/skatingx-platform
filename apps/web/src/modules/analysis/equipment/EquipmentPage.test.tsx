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
}));

vi.mock("@/hooks/useLocale", () => ({ useLocale: () => state.locale }));
vi.mock("@/app/providers/AuthProvider", () => ({
  useAuth: () => ({ uid: state.uid, loading: false, firebaseReady: Boolean(state.uid) }),
}));
vi.mock("@skatingx/firebase-client", () => ({
  getFirestoreDb: () => state.db,
  saveEquipmentHistoryRecord: (db: unknown, record: unknown) => state.save(db, record),
  deleteEquipmentHistoryRecord: (db: unknown, uid: unknown, athlete: unknown, id: unknown) =>
    state.remove(db, uid, athlete, id),
  subscribeToEquipmentHistory: (
    _db: unknown,
    _uid: unknown,
    _athlete: unknown,
    onRecords: (records: readonly unknown[]) => void,
  ) => {
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
