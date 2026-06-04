import { normalizeTrainingState } from "@skatingx/firebase-client";
import { Button, Card } from "@skatingx/ui";
import { FormEvent, useState } from "react";

import { FirestoreStatusBanner } from "@/components/FirestoreStatusBanner";
import {
  useGamification,
  useTrainingState,
} from "@/app/providers/FirestoreProvider";
import { useTrainingActions } from "@/hooks/useTrainingActions";

export function TrainingTasksPage() {
  const { data: rawState, loading, error } = useTrainingState();
  const { data: gamification } = useGamification();
  const { addTask, removeTask, toggleTask, busy, actionError, clearActionError } =
    useTrainingActions();

  const [text, setText] = useState("");
  const [target, setTarget] = useState("");
  const [bonusMessage, setBonusMessage] = useState<string | null>(null);

  const state = rawState ? normalizeTrainingState(rawState) : null;
  const tasks = state?.todayTasks ?? [];
  const completedCount = tasks.filter((t) => t.completed).length;
  const pointsPerTask = state?.pointsPerTask ?? 20;
  const dailyBonus = state?.dailyBonusPoints ?? 50;
  const points = gamification?.points ?? 0;

  async function handleAdd(event: FormEvent) {
    event.preventDefault();
    if (!text.trim()) {
      return;
    }
    clearActionError();
    await addTask(text, target);
    setText("");
    setTarget("");
  }

  async function handleToggle(taskId: string) {
    clearActionError();
    setBonusMessage(null);
    const result = await toggleTask(taskId);
    if (result.bonusApplied) {
      setBonusMessage(`Daily bonus +${dailyBonus} points!`);
    }
    if (result.bonusRemoved) {
      setBonusMessage("Daily bonus removed.");
    }
  }

  async function handleDelete(taskId: string, label: string) {
    const confirmed = window.confirm(`Delete task "${label}"?`);
    if (!confirmed) {
      return;
    }
    clearActionError();
    await removeTask(taskId);
  }

  return (
    <section className="max-w-lg">
      <h1 className="text-2xl font-bold text-slate-900">Today&apos;s tasks</h1>
      <p className="mt-1 text-slate-600">
        {loading
          ? "Loading tasks…"
          : `${completedCount} of ${tasks.length} completed`}
      </p>

      <FirestoreStatusBanner className="mt-4" />

      {error ? (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
          {error}
        </p>
      ) : null}

      {actionError ? (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
          {actionError}
        </p>
      ) : null}

      {bonusMessage ? (
        <p className="mt-4 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">
          {bonusMessage}
        </p>
      ) : null}

      <Card title="Points rules" className="mt-4">
        <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600">
          <li>+{pointsPerTask} points per completed task</li>
          <li>+{dailyBonus} daily bonus when all tasks are done</li>
          <li>Current balance: {loading ? "…" : points} points</li>
        </ul>
      </Card>

      <Card title="Add task" className="mt-4">
        <form className="grid gap-3" onSubmit={handleAdd}>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Task</span>
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              placeholder="e.g. 500m intervals"
              required
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Target (optional)</span>
            <input
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              placeholder="e.g. 3 sets"
            />
          </label>
          <Button type="submit" disabled={busy || !text.trim()}>
            {busy ? "Saving…" : "Add task"}
          </Button>
        </form>
      </Card>

      <Card title="Task list" className="mt-4">
        {loading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : tasks.length === 0 ? (
          <p className="text-sm text-slate-500">No tasks for today. Add one above.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {tasks.map((task) => (
              <li key={task.id} className="flex items-start gap-3 py-3">
                <input
                  type="checkbox"
                  checked={task.completed}
                  disabled={busy}
                  onChange={() => void handleToggle(task.id)}
                  className="mt-1 h-4 w-4 rounded border-slate-300"
                  aria-label={`Complete ${task.text}`}
                />
                <div className="min-w-0 flex-1">
                  <p
                    className={
                      task.completed
                        ? "text-sm text-slate-500 line-through"
                        : "text-sm font-medium text-slate-900"
                    }
                  >
                    {task.text}
                  </p>
                  {task.source === "academy" ? (
                    <span className="mt-0.5 inline-block rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-medium text-violet-800">
                      Academy
                    </span>
                  ) : null}
                  {task.description ? (
                    <p className="mt-1 text-xs text-slate-600">{task.description}</p>
                  ) : null}
                  {task.target ? (
                    <p className="text-xs text-slate-500">{task.target}</p>
                  ) : null}
                  {task.tags && task.tags.length > 0 ? (
                    <p className="text-[10px] text-slate-400">{task.tags.join(" · ")}</p>
                  ) : null}
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleDelete(task.id, task.text)}
                  className="text-xs text-red-600 hover:underline disabled:opacity-50"
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </section>
  );
}
