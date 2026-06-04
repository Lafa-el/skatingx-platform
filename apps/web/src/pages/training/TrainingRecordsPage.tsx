import { DEFAULT_TRAINING_DISTANCES, todayDateString } from "@skatingx/schema";
import {
  formatSecondsToTime,
  parseTimeToSeconds,
} from "@skatingx/skating-domain";
import { Button, Card } from "@skatingx/ui";
import { FormEvent, useMemo, useState } from "react";

import { FirestoreStatusBanner } from "@/components/FirestoreStatusBanner";
import { useTrainingRecordActions } from "@/hooks/useTrainingRecordActions";
import { useTrainingRecords } from "@/hooks/useTrainingRecords";

const SOURCE_OPTIONS = [
  { value: "manual", label: "Manual" },
  { value: "training", label: "Training" },
  { value: "race", label: "Race" },
] as const;

export function TrainingRecordsPage() {
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
  const [formError, setFormError] = useState<string | null>(null);
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
      setFormError("Date is required.");
      return;
    }
    if (!timeInput.trim()) {
      setFormError("Time is required.");
      return;
    }

    const seconds = parseTimeToSeconds(timeInput);
    if (seconds === null) {
      setFormError("Enter a valid time (e.g. 49.8, 0:49.80, 1:44.23).");
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
    const confirmed = window.confirm(`Delete record ${timeLabel}?`);
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
      <h1 className="text-2xl font-bold text-slate-900">PB records</h1>
      <p className="mt-1 text-slate-600">
        Track personal bests by distance. Times support seconds or M:SS.xx.
      </p>

      <FirestoreStatusBanner className="mt-4" />

      {error ? (
        <p
          className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      {actionError ? (
        <p
          className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
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
                ? "shrink-0 rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white"
                : "shrink-0 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            }
          >
            {distance.label}
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Card title="Best time (PB)">
          <p className="text-2xl font-semibold text-slate-900">
            {loading ? "…" : best ? formatSecondsToTime(best.timeSeconds) : "—"}
          </p>
          {best ? (
            <p className="mt-1 text-xs text-slate-500">{best.date}</p>
          ) : (
            <p className="mt-1 text-xs text-slate-500">No entries yet</p>
          )}
        </Card>
        <Card title="Latest time">
          <p className="text-2xl font-semibold text-slate-900">
            {loading ? "…" : latest ? formatSecondsToTime(latest.timeSeconds) : "—"}
          </p>
          {latest ? (
            <p className="mt-1 text-xs text-slate-500">{latest.date}</p>
          ) : (
            <p className="mt-1 text-xs text-slate-500">No entries yet</p>
          )}
        </Card>
      </div>

      <Card
        title={editingEntryId ? "Edit record" : "Add PB / record"}
        className="mt-4"
      >
        <form className="grid gap-3" onSubmit={(e) => void handleSubmit(e)}>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Date</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Time</span>
            <input
              type="text"
              value={timeInput}
              onChange={(e) => setTimeInput(e.target.value)}
              placeholder="49.8 or 0:49.80 or 1:44.23"
              required
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Source</span>
            <select
              value={source}
              onChange={(e) =>
                setSource(e.target.value as "manual" | "race" | "training")
              }
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            >
              {SOURCE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Note (optional)</span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              placeholder="e.g. time trial"
            />
          </label>
          {formError ? (
            <p className="text-sm text-red-700" role="alert">
              {formError}
            </p>
          ) : null}
          <div className="flex gap-2">
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : editingEntryId ? "Save changes" : "Add record"}
            </Button>
            {editingEntryId ? (
              <Button type="button" variant="ghost" onClick={resetForm} disabled={busy}>
                Cancel
              </Button>
            ) : null}
          </div>
        </form>
      </Card>

      <Card title={`${activeDistance.label} — ${doc?.entries.length ?? 0} entries`} className="mt-4">
        {loading ? (
          <p className="text-sm text-slate-500">Loading records…</p>
        ) : entries.length === 0 ? (
          <p className="text-sm text-slate-500">
            No records for {activeDistance.label} yet. Add your first time above.
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
                          PB
                        </span>
                      ) : null}
                    </p>
                    <p className="text-xs text-slate-500">
                      {entry.date}
                      {entry.source ? ` · ${entry.source}` : ""}
                    </p>
                    {entry.note ? (
                      <p className="mt-0.5 text-xs text-slate-600">{entry.note}</p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => startEdit(entry.id)}
                      className="text-xs text-sky-700 hover:underline disabled:opacity-50"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleDelete(entry.id, timeLabel)}
                      className="text-xs text-red-600 hover:underline disabled:opacity-50"
                    >
                      Delete
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
