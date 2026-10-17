import { normalizeTrainingState } from "@skatingx/firebase-client";
import { Button, Card } from "@skatingx/ui";
import { FormEvent, useState } from "react";

import { FirestoreStatusBanner } from "@/components/FirestoreStatusBanner";
import {
  useGamification,
  useTrainingState,
} from "@/app/providers/FirestoreProvider";
import { useLocale } from "@/hooks/useLocale";
import { useTrainingActions } from "@/hooks/useTrainingActions";
import {
  type TrainingTasksMessageKey,
  tTrainingTasks,
} from "@/shared/i18n/training-tasks-messages";

/**
 * The note after a toggle. It keeps what happened, not the sentence, so it follows the language
 * if the user changes it afterwards.
 */
type BonusNote = { kind: "applied"; points: number } | { kind: "removed" };

export function TrainingTasksPage() {
  const locale = useLocale();
  const t = (key: TrainingTasksMessageKey, params?: Record<string, string | number>) =>
    tTrainingTasks(locale, key, params);
  const { data: rawState, loading, error } = useTrainingState();
  const { data: gamification } = useGamification();
  const { addTask, removeTask, toggleTask, busy, actionError, clearActionError } =
    useTrainingActions();

  const [text, setText] = useState("");
  const [target, setTarget] = useState("");
  const [bonusNote, setBonusNote] = useState<BonusNote | null>(null);

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
    setBonusNote(null);
    const result = await toggleTask(taskId);
    if (result.bonusApplied) {
      setBonusNote({ kind: "applied", points: dailyBonus });
    }
    if (result.bonusRemoved) {
      setBonusNote({ kind: "removed" });
    }
  }

  async function handleDelete(taskId: string, label: string) {
    const confirmed = window.confirm(t("trainingTasks.list.deleteConfirm", { task: label }));
    if (!confirmed) {
      return;
    }
    clearActionError();
    await removeTask(taskId);
  }

  return (
    <section className="max-w-lg">
      <h1 className="text-2xl font-bold text-slate-900">{t("trainingTasks.title")}</h1>
      <p className="mt-1 text-slate-600">
        {loading
          ? t("trainingTasks.loading")
          : t("trainingTasks.summary", { done: completedCount, total: tasks.length })}
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

      {bonusNote ? (
        <p className="mt-4 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">
          {bonusNote.kind === "applied"
            ? t("trainingTasks.bonus.applied", { points: bonusNote.points })
            : t("trainingTasks.bonus.removed")}
        </p>
      ) : null}

      <Card title={t("trainingTasks.rules.title")} className="mt-4">
        <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600">
          <li>{t("trainingTasks.rules.perTask", { points: pointsPerTask })}</li>
          <li>{t("trainingTasks.rules.dailyBonus", { points: dailyBonus })}</li>
          <li>{t("trainingTasks.rules.balance", { balance: loading ? "…" : points })}</li>
        </ul>
      </Card>

      <Card title={t("trainingTasks.add.title")} className="mt-4">
        <form className="grid gap-3" onSubmit={handleAdd}>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">{t("trainingTasks.add.task")}</span>
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              placeholder={t("trainingTasks.add.taskPlaceholder")}
              required
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">{t("trainingTasks.add.target")}</span>
            <input
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              placeholder={t("trainingTasks.add.targetPlaceholder")}
            />
          </label>
          <Button type="submit" disabled={busy || !text.trim()}>
            {busy ? t("trainingTasks.add.saving") : t("trainingTasks.add.submit")}
          </Button>
        </form>
      </Card>

      <Card title={t("trainingTasks.list.title")} className="mt-4">
        {loading ? (
          <p className="text-sm text-slate-500">{t("trainingTasks.list.loading")}</p>
        ) : tasks.length === 0 ? (
          <p className="text-sm text-slate-500">{t("trainingTasks.list.empty")}</p>
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
                  aria-label={t("trainingTasks.list.complete", { task: task.text })}
                />
                <div className="min-w-0 flex-1">
                  <p
                    className={
                      task.completed
                        ? "break-words text-sm text-slate-500 line-through"
                        : "break-words text-sm font-medium text-slate-900"
                    }
                  >
                    {task.text}
                  </p>
                  {task.source === "academy" ? (
                    <span className="mt-0.5 inline-block rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-medium text-violet-800">
                      {t("trainingTasks.list.academyBadge")}
                    </span>
                  ) : null}
                  {task.description ? (
                    <p className="mt-1 break-words text-xs text-slate-600">{task.description}</p>
                  ) : null}
                  {task.target ? (
                    <p className="break-words text-xs text-slate-500">{task.target}</p>
                  ) : null}
                  {task.tags && task.tags.length > 0 ? (
                    <p className="break-words text-[10px] text-slate-400">{task.tags.join(" · ")}</p>
                  ) : null}
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleDelete(task.id, task.text)}
                  className="text-xs text-red-600 hover:underline disabled:opacity-50"
                >
                  {t("trainingTasks.list.delete")}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </section>
  );
}
