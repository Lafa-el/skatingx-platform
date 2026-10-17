// @vitest-environment happy-dom
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { render, screen, userEvent } from "@/test/dom";

import { TrainingAcademyPage } from "./TrainingAcademyPage";

// Real page and real useAcademyImport: this is the user's click, from the button to the screen.
const h = vi.hoisted(() => ({
  uid: null as string | null,
  language: "zh",
  db: {} as object | null,
  importAcademyTasks: vi.fn(async () => ({ imported: 1, skipped: 0 })),
}));

vi.mock("@/app/providers/AuthProvider", () => ({ useAuth: () => ({ uid: h.uid }) }));
vi.mock("@/app/providers/FirestoreProvider", () => ({
  useUserSettings: () => ({ data: { language: h.language, isPro: true }, loading: false, error: null }),
  useTrainingState: () => ({ data: { todayTasks: [] }, loading: false, error: null }),
}));
vi.mock("@/components/FirestoreStatusBanner", () => ({ FirestoreStatusBanner: () => null }));
vi.mock("@skatingx/firebase-client", () => ({
  getFirestoreDb: () => h.db,
  importAcademyTasks: h.importAcademyTasks,
}));

vi.spyOn(console, "error").mockImplementation(() => undefined);

afterEach(() => {
  h.uid = null;
  h.language = "zh";
  h.db = {};
  h.importAcademyTasks.mockClear();
});

const renderPage = () =>
  render(
    <MemoryRouter>
      <TrainingAcademyPage />
    </MemoryRouter>,
  );

describe("Academy: a failed import is never silent", () => {
  it("not signed in: clicking 'add to today' shows why nothing happened", async () => {
    const user = userEvent.setup();
    renderPage();
    expect(screen.queryByRole("alert")).toBeNull();
    await user.click(screen.getAllByRole("button", { name: "导入今日" })[0]!);
    expect((await screen.findByRole("alert")).textContent).toBe("登录状态还没准备好，请稍后再试。");
    expect(h.importAcademyTasks).not.toHaveBeenCalled();
  });

  it("the same in English", async () => {
    h.language = "en";
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getAllByRole("button", { name: "Add to today" })[0]!);
    expect((await screen.findByRole("alert")).textContent).toBe("Sign-in is not ready yet. Try again in a moment.");
  });

  it("database not available: importing a whole day shows the reason too", async () => {
    h.uid = "uid-1";
    h.db = null;
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("button", { name: "导入该日" }));
    expect((await screen.findByRole("alert")).textContent).toBe("数据服务暂时不可用，请稍后再试。");
  });

  it("a write that fails shows the data layer's message", async () => {
    h.uid = "uid-1";
    h.importAcademyTasks.mockRejectedValueOnce(new Error("permission-denied"));
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getAllByRole("button", { name: "导入今日" })[0]!);
    expect((await screen.findByRole("alert")).textContent).toBe("permission-denied");
  });

  it("when it works there is no alert, and the result is shown", async () => {
    h.uid = "uid-1";
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getAllByRole("button", { name: "导入今日" })[0]!);
    expect(await screen.findByText(/已导入 1 项/)).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
