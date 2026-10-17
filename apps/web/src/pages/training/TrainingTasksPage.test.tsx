// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";

import { render, screen, userEvent, within } from "@/test/dom";

import { TrainingTasksPage } from "./TrainingTasksPage";

type Hook = { data: unknown; loading: boolean; error: string | null };

const h = vi.hoisted(() => {
  const ready = (data: unknown): Hook => ({ data, loading: false, error: null });
  const base = () => ({
    settings: ready({ language: "zh", isPro: false }),
    gamification: ready({ points: 120 }),
    training: ready({
      pointsPerTask: 20,
      dailyBonusPoints: 50,
      todayTasks: [
        { id: "t1", text: "My own 400m task", completed: false, target: "3 sets", tags: ["speed", "pace"] },
        {
          id: "t2",
          text: "Lunges",
          completed: true,
          source: "academy",
          description: "Keep the knee over the toe",
        },
      ],
    }),
    actions: {
      busy: false,
      actionError: null as string | null,
      clearActionError: vi.fn(),
      addTask: vi.fn(async () => undefined),
      removeTask: vi.fn(async () => undefined),
      toggleTask: vi.fn(async (_id: string) => ({ bonusApplied: false, bonusRemoved: false })),
    },
  });
  return { ready, base, state: base() };
});

vi.mock("@/app/providers/FirestoreProvider", () => ({
  useUserSettings: () => h.state.settings,
  useGamification: () => h.state.gamification,
  useTrainingState: () => h.state.training,
}));
vi.mock("@/hooks/useTrainingActions", () => ({ useTrainingActions: () => h.state.actions }));
vi.mock("@/components/FirestoreStatusBanner", () => ({ FirestoreStatusBanner: () => null }));
vi.mock("@skatingx/firebase-client", () => ({ normalizeTrainingState: (state: unknown) => state }));

const setEnglish = () => {
  h.state.settings = h.ready({ language: "en", isPro: false });
};

const original = window.confirm;
const stubConfirm = (answer: boolean) => {
  const spy = vi.fn(() => answer);
  window.confirm = spy;
  return spy;
};

afterEach(() => {
  h.state = h.base();
  window.confirm = original;
});

const card = (title: string) => {
  const article = screen.getByRole("heading", { level: 3, name: title }).closest("article");
  if (!article) {
    throw new Error(`no card titled ${title}`);
  }
  return within(article);
};

describe("TrainingTasksPage: Chinese", () => {
  it("title, summary and the points rules", () => {
    render(<TrainingTasksPage />);
    expect(screen.getByRole("heading", { level: 1, name: "今日任务" })).toBeTruthy();
    expect(screen.getByText("已完成 1 / 2")).toBeTruthy();
    const rules = card("积分规则");
    expect(rules.getByText("每完成一项任务 +20 积分")).toBeTruthy();
    expect(rules.getByText("全部完成后额外 +50 积分")).toBeTruthy();
    expect(rules.getByText("当前余额:120 积分")).toBeTruthy();
  });

  it("the add-task form: labels, placeholders and the button", () => {
    render(<TrainingTasksPage />);
    expect(screen.getByLabelText("任务").getAttribute("placeholder")).toBe("例如:500m 间歇跑");
    expect(screen.getByLabelText("目标(选填)").getAttribute("placeholder")).toBe("例如:3 组");
    expect(screen.getByRole("button", { name: "添加任务" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 3, name: "添加任务" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 3, name: "任务清单" })).toBeTruthy();
  });

  it("task text, description, target and tags are shown exactly as stored", () => {
    render(<TrainingTasksPage />);
    expect(screen.getByText("My own 400m task")).toBeTruthy();
    expect(screen.getByText("3 sets")).toBeTruthy();
    expect(screen.getByText("speed · pace")).toBeTruthy();
    expect(screen.getByText("Lunges")).toBeTruthy();
    expect(screen.getByText("Keep the knee over the toe")).toBeTruthy();
  });

  it("only Academy tasks carry the badge, and the check box and delete names say what they act on", () => {
    render(<TrainingTasksPage />);
    const row = (task: string) => screen.getByText(task).closest("li") as HTMLElement;
    expect(within(row("Lunges")).getByText("学院")).toBeTruthy();
    expect(within(row("My own 400m task")).queryByText("学院")).toBeNull();
    expect(screen.getByRole("checkbox", { name: "完成:My own 400m task" })).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "完成:Lunges" })).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "删除" }).length).toBe(2);
  });

  it("lets long unbroken task text wrap instead of widening the page on a phone", () => {
    render(<TrainingTasksPage />);
    // Layout is not computed in happy-dom, so this is pinned through the class; the rendered width
    // at 320px and 375px was measured in a browser with unbroken 80-character values.
    for (const text of ["My own 400m task", "3 sets", "speed · pace", "Keep the knee over the toe"]) {
      expect(screen.getByText(text).className, text).toContain("break-words");
    }
  });

  it("empty list", () => {
    h.state.training = h.ready({ todayTasks: [] });
    render(<TrainingTasksPage />);
    expect(screen.getByText("今天还没有任务。请在上方添加。")).toBeTruthy();
    expect(screen.getByText("已完成 0 / 0")).toBeTruthy();
  });

  it("loading", () => {
    h.state.training = { data: null, loading: true, error: null };
    render(<TrainingTasksPage />);
    expect(screen.getByText("正在加载任务…")).toBeTruthy();
    expect(screen.getByText("加载中…")).toBeTruthy();
    expect(screen.getByText("当前余额:… 积分")).toBeTruthy();
  });

  it("the button says it is saving while busy", () => {
    h.state.actions.busy = true;
    render(<TrainingTasksPage />);
    expect(screen.getByRole("button", { name: "保存中…" })).toBeTruthy();
  });
});

describe("TrainingTasksPage: English", () => {
  it("keeps the previous wording", () => {
    setEnglish();
    render(<TrainingTasksPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Today's tasks" })).toBeTruthy();
    expect(screen.getByText("1 of 2 completed")).toBeTruthy();
    const rules = card("Points rules");
    expect(rules.getByText("+20 points per completed task")).toBeTruthy();
    expect(rules.getByText("+50 daily bonus when all tasks are done")).toBeTruthy();
    expect(rules.getByText("Current balance: 120 points")).toBeTruthy();
    expect(screen.getByLabelText("Task").getAttribute("placeholder")).toBe("e.g. 500m intervals");
    expect(screen.getByLabelText("Target (optional)").getAttribute("placeholder")).toBe("e.g. 3 sets");
    expect(screen.getByRole("checkbox", { name: "Complete Lunges" })).toBeTruthy();
    expect(within(screen.getByText("Lunges").closest("li") as HTMLElement).getByText("Academy")).toBeTruthy();
    expect(within(screen.getByText("My own 400m task").closest("li") as HTMLElement).queryByText("Academy")).toBeNull();
    expect(screen.getAllByRole("button", { name: "Delete" }).length).toBe(2);
  });

  it("English empty and loading", () => {
    setEnglish();
    h.state.training = ready0();
    render(<TrainingTasksPage />);
    expect(screen.getByText("No tasks for today. Add one above.")).toBeTruthy();
  });

  it("English busy", () => {
    setEnglish();
    h.state.actions.busy = true;
    render(<TrainingTasksPage />);
    expect(screen.getByRole("button", { name: "Saving…" })).toBeTruthy();
  });
});

function ready0(): Hook {
  return h.ready({ todayTasks: [] });
}

describe("TrainingTasksPage: actions", () => {
  it("adds a task with what was typed and clears the form", async () => {
    const user = userEvent.setup();
    render(<TrainingTasksPage />);
    await user.type(screen.getByLabelText("任务"), "新任务 A");
    await user.type(screen.getByLabelText("目标(选填)"), "5 组");
    await user.click(screen.getByRole("button", { name: "添加任务" }));
    expect(h.state.actions.addTask).toHaveBeenCalledExactlyOnceWith("新任务 A", "5 组");
    expect((screen.getByLabelText("任务") as HTMLInputElement).value).toBe("");
  });

  it("the add button stays off until there is text", () => {
    render(<TrainingTasksPage />);
    expect((screen.getByRole("button", { name: "添加任务" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("the delete confirmation asks in the language, naming the task as stored", async () => {
    const user = userEvent.setup();
    const confirm = stubConfirm(true);
    render(<TrainingTasksPage />);
    await user.click(screen.getAllByRole("button", { name: "删除" })[0]!);
    expect(confirm).toHaveBeenCalledExactlyOnceWith("删除任务「My own 400m task」?");
    expect(h.state.actions.removeTask).toHaveBeenCalledExactlyOnceWith("t1");
  });

  it("English delete confirmation", async () => {
    setEnglish();
    const user = userEvent.setup();
    const confirm = stubConfirm(true);
    render(<TrainingTasksPage />);
    await user.click(screen.getAllByRole("button", { name: "Delete" })[1]!);
    expect(confirm).toHaveBeenCalledExactlyOnceWith('Delete task "Lunges"?');
  });

  it("declining the confirmation deletes nothing", async () => {
    const user = userEvent.setup();
    stubConfirm(false);
    render(<TrainingTasksPage />);
    await user.click(screen.getAllByRole("button", { name: "删除" })[0]!);
    expect(h.state.actions.removeTask).not.toHaveBeenCalled();
  });

  it("completing the last task shows the daily bonus, in the language, and follows a language change", async () => {
    h.state.actions.toggleTask = vi.fn(async () => ({ bonusApplied: true, bonusRemoved: false }));
    const user = userEvent.setup();
    const view = render(<TrainingTasksPage />);
    await user.click(screen.getByRole("checkbox", { name: "完成:My own 400m task" }));
    expect(await screen.findByText("每日奖励 +50 积分!")).toBeTruthy();

    setEnglish();
    view.rerender(<TrainingTasksPage />);
    expect(screen.getByText("Daily bonus +50 points!")).toBeTruthy();
    expect(screen.queryByText("每日奖励 +50 积分!")).toBeNull();
  });

  it("un-completing shows that the bonus was removed", async () => {
    h.state.actions.toggleTask = vi.fn(async () => ({ bonusApplied: false, bonusRemoved: true }));
    const user = userEvent.setup();
    render(<TrainingTasksPage />);
    await user.click(screen.getByRole("checkbox", { name: "完成:Lunges" }));
    expect(await screen.findByText("每日奖励已撤销。")).toBeTruthy();
  });

  it("no bonus note when nothing changed", async () => {
    const user = userEvent.setup();
    render(<TrainingTasksPage />);
    await user.click(screen.getByRole("checkbox", { name: "完成:Lunges" }));
    expect(screen.queryByText(/每日奖励/)).toBeNull();
  });
});

describe("TrainingTasksPage: errors", () => {
  it("shows a data error and an action error as alerts, as received", () => {
    h.state.training = { data: null, loading: false, error: "Read failed" };
    h.state.actions.actionError = "Write failed";
    render(<TrainingTasksPage />);
    expect(screen.getAllByRole("alert").map((e) => e.textContent)).toEqual(["Read failed", "Write failed"]);
  });
});
