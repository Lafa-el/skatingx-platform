import { DEFAULT_TRAINING_DISTANCES, todayDateString } from "@skatingx/schema";
import {
  formatSecondsToTime,
  parseTimeToSeconds,
} from "@skatingx/skating-domain";
import { Button, Card } from "@skatingx/ui";
import { FormEvent, useMemo, useState } from "react";

import { FirestoreStatusBanner } from "@/components/FirestoreStatusBanner";
import { useLocale } from "@/hooks/useLocale";
import { useTrainingRecordActions } from "@/hooks/useTrainingRecordActions";
import { useTrainingRecords } from "@/hooks/useTrainingRecords";
import { formatCalendarDate } from "@/shared/i18n/format";
import {
  formatDistanceLabel,
  formatRecordSource,
  type RecordsMessageKey,
  tRecords,
} from "@/shared/i18n/records-messages";

const SOURCES = ["manual", "training", "race"] as const;

export function TrainingRecordsPage() {
  const locale = useLocale();
  const t = (key: RecordsMessageKey, params?: Parameters<typeof tRecords>[2]) =>
    tRecords(locale, key, params);
  const {
    loading,
    error,
    getSortedEntries,
    getBestForDistance,
    getLatestForDistance,
    getDocument,
  } = useTrainingRecords();
  const { addEntry, editEntry, removeEntry, busy, actionError, clearActionError } =
    useTrainingRecordActions();

  const [activeDistanceId, setActiveDistanceId] = useState(
    DEFAULT_TRAINING_DISTANCES[1]?.distanceId ?? "500m",
  );
  const [date, setDate] = useState(todayDateString());
  const [timeInput, setTimeInput] = useState("");
  const [source, setSource] = useState<"manual" | "race" | "training">("manual");
  const [note, setNote] = useState("");
  // The key, not the sentence, so the message follows the language if it changes while shown.
  const [formError, setFormError] = useState<RecordsMessageKey | null>(null);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);

  const activeDistance = useMemo(
    () =>
      DEFAULT_TRAINING_DISTANCES.find((d) => d.distanceId === activeDistanceId) ??
      DEFAULT_TRAINING_DISTANCES[0],
    [activeDistanceId],
  );

  const entries = getSortedEntries(activeDistanceId);
  const best = getBestForDistance(activeDistanceId);
  const latest = getLatestForDistance(activeDistanceId);
  const doc = getDocument(activeDistanceId);
  const entryCount = doc?.entries.length ?? 0;
  const activeLabel = formatDistanceLabel(activeDistance.distanceId, activeDistance.label, locale);

  function resetForm() {
    setDate(todayDateString());
    setTimeInput("");
    setSource("manual");
    setNote("");
    setFormError(null);
    setEditingEntryId(null);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    clearActionError();
    setFormError(null);

    if (!date.trim()) {
      setFormError("records.error.dateRequired");
      return;
    }
    if (!timeInput.trim()) {
      setFormError("records.error.timeRequired");
      return;
    }

    const seconds = parseTimeToSeconds(timeInput);
    if (seconds === null) {
      setFormError("records.error.timeInvalid");
      return;
    }

    const payload = {
      date: date.trim(),
      timeSeconds: seconds,
      source,
      note: note.trim() || undefined,
    };

    if (editingEntryId) {
      await editEntry(
        activeDistanceId,
        activeDistance.label,
        editingEntryId,
        payload,
      );
    } else {
      await addEntry(activeDistanceId, activeDistance.label, payload);
    }
    resetForm();
  }

  function startEdit(entryId: string) {
    const entry = entries.find((e) => e.id === entryId);
    if (!entry) {
      return;
    }
    setEditingEntryId(entry.id);
    setDate(entry.date);
    setTimeInput(formatSecondsToTime(entry.timeSeconds));
    setSource(entry.source ?? "manual");
    setNote(entry.note ?? "");
    setFormError(null);
  }

  async function handleDelete(entryId: string, timeLabel: string) {
    const confirmed = window.confirm(t("records.confirm.delete", { time: timeLabel }));
    if (!confirmed) {
      return;
    }
    clearActionError();
    if (editingEntryId === entryId) {
      resetForm();
    }
    await removeEntry(activeDistanceId, activeDistance.label, entryId);
  }

  return (
    <section className="max-w-lg">
      <h1 className="text-2xl font-bold text-slate-900">{t("records.page.title")}</h1>
      <p className="mt-1 text-slate-600">
        {t("records.page.subtitle")}
      </p>

      <FirestoreStatusBanner className="mt-4" />

      {error ? (
        <p
          className="mt-4 break-words rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      {actionError ? (
        <p
          className="mt-4 break-words rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
          role="alert"
        >
          {actionError}
        </p>
      ) : null}

      <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
        {DEFAULT_TRAINING_DISTANCES.map((distance) => (
          <button
            key={distance.distanceId}
            type="button"
            onClick={() => {
              setActiveDistanceId(distance.distanceId);
              resetForm();
            }}
            className={
              activeDistanceId === distance.distanceId
                ? "min-h-11 shrink-0 rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white"
                : "min-h-11 shrink-0 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            }
          >
            {formatDistanceLabel(distance.distanceId, distance.label, locale)}
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Card title={t("records.card.best")}>
          <p className="text-2xl font-semibold text-slate-900">
            {loading ? "…" : best ? formatSecondsToTime(best.timeSeconds) : "—"}
          </p>
          {best ? (
            <p className="mt-1 text-xs text-slate-500">{formatCalendarDate(best.date, locale)}</p>
          ) : (
            <p className="mt-1 text-xs text-slate-500">{t("records.card.none")}</p>
          )}
        </Card>
        <Card title={t("records.card.latest")}>
          <p className="text-2xl font-semibold text-slate-900">
            {loading ? "…" : latest ? formatSecondsToTime(latest.timeSeconds) : "—"}
          </p>
          {latest ? (
            <p className="mt-1 text-xs text-slate-500">{formatCalendarDate(latest.date, locale)}</p>
          ) : (
            <p className="mt-1 text-xs text-slate-500">{t("records.card.none")}</p>
          )}
        </Card>
      </div>

      <Card
        title={editingEntryId ? t("records.form.editTitle") : t("records.form.addTitle")}
        className="mt-4"
      >
        <form className="grid gap-3" onSubmit={(e) => void handleSubmit(e)}>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">{t("records.form.date")}</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
              className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">{t("records.form.time")}</span>
            <input
              type="text"
              value={timeInput}
              onChange={(e) => setTimeInput(e.target.value)}
              placeholder={t("records.form.timePlaceholder")}
              required
              className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">{t("records.form.source")}</span>
            <select
              value={source}
              onChange={(e) =>
                setSource(e.target.value as "manual" | "race" | "training")
              }
              className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 py-2"
            >
              {SOURCES.map((value) => (
                <option key={value} value={value}>
                  {formatRecordSource(value, locale)}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">{t("records.form.note")}</span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 py-2"
              placeholder={t("records.form.notePlaceholder")}
            />
          </label>
          {formError ? (
            <p className="text-sm text-red-700" role="alert">
              {t(formError)}
            </p>
          ) : null}
          <div className="flex gap-2">
            <Button type="submit" disabled={busy}>
              {busy
                ? t("records.form.saving")
                : editingEntryId
                  ? t("records.form.save")
                  : t("records.form.add")}
            </Button>
            {editingEntryId ? (
              <Button type="button" variant="ghost" onClick={resetForm} disabled={busy}>
                {t("records.form.cancel")}
              </Button>
            ) : null}
          </div>
        </form>
      </Card>

      <Card
        title={t(entryCount === 1 ? "records.list.title.one" : "records.list.title.other", {
          label: activeLabel,
          count: entryCount,
        })}
        className="mt-4"
      >
        {loading ? (
          <p className="text-sm text-slate-500">{t("records.list.loading")}</p>
        ) : entries.length === 0 ? (
          <p className="text-sm text-slate-500">
            {t("records.list.empty", { label: activeLabel })}
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {entries.map((entry) => {
              const timeLabel = formatSecondsToTime(entry.timeSeconds);
              const isBest = best?.id === entry.id;
              return (
                <li
                  key={entry.id}
                  className="flex items-start justify-between gap-3 py-3"
                >
                  <div>
                    <p className="font-mono text-lg font-semibold text-slate-900">
                      {timeLabel}
                      {isBest ? (
                        <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800">
                          {t("records.entry.pb")}
                        </span>
                      ) : null}
                    </p>
                    <p className="text-xs text-slate-500">
                      {formatCalendarDate(entry.date, locale)}
                      {entry.source ? ` · ${formatRecordSource(entry.source, locale)}` : ""}
                    </p>
                    {entry.note ? (
                      <p className="mt-0.5 text-xs text-slate-600">{entry.note}</p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => startEdit(entry.id)}
                      className="-my-3 inline-flex min-h-11 min-w-11 items-center justify-center px-2 text-xs text-sky-700 hover:underline disabled:opacity-50"
                    >
                      {t("records.entry.edit")}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleDelete(entry.id, timeLabel)}
                      className="-my-3 inline-flex min-h-11 min-w-11 items-center justify-center px-2 text-xs text-red-600 hover:underline disabled:opacity-50"
                    >
                      {t("records.entry.delete")}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </section>
  );
}
