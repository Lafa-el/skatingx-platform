import {
  BODY_SORENESS_AREAS,
  createBodyStatus,
  deleteBodyStatus,
  getFirestoreDb,
  subscribeToBodyStatus,
  updateBodyStatus,
  type BodyStatusInput,
  type BodyStatusRecord,
  type BodyStatusSorenessArea,
  type BodyStatusWriteFailure,
} from "@skatingx/firebase-client";
import { todayDateString } from "@skatingx/schema";
import { Button, Card, ErrorNotice } from "@skatingx/ui";
import { useEffect, useState, type FormEvent } from "react";

import { useAuth } from "@/app/providers/AuthProvider";
import { useLocale } from "@/hooks/useLocale";
import { formatCalendarDate } from "@/shared/i18n/format";
import { tJournal, type JournalMessageKey } from "@/shared/i18n/journal-messages";
import type { TranslationParams } from "@/shared/i18n/translator";
import { logActionFailure } from "@/shared/utils/logActionFailure";

const CONTROL =
  "min-h-11 w-full rounded-control border border-brand-navy/50 bg-white px-3 text-brand-navy";

const LIST_LIMIT = 7;

const FATIGUE_LEVELS = [1, 2, 3, 4, 5] as const;

const MOODS = [
  { value: 1, emoji: "😫", labelKey: "journal.bodyStatus.mood.1" },
  { value: 2, emoji: "😕", labelKey: "journal.bodyStatus.mood.2" },
  { value: 3, emoji: "😐", labelKey: "journal.bodyStatus.mood.3" },
  { value: 4, emoji: "😊", labelKey: "journal.bodyStatus.mood.4" },
  { value: 5, emoji: "😄", labelKey: "journal.bodyStatus.mood.5" },
  { value: 6, emoji: "🔥", labelKey: "journal.bodyStatus.mood.6" },
] as const satisfies readonly { value: number; emoji: string; labelKey: JournalMessageKey }[];

const AREA_LABEL: Record<BodyStatusSorenessArea, JournalMessageKey> = {
  quadriceps: "journal.bodyStatus.area.quadriceps",
  hamstrings: "journal.bodyStatus.area.hamstrings",
  calves: "journal.bodyStatus.area.calves",
  lower_back: "journal.bodyStatus.area.lowerBack",
  shoulders: "journal.bodyStatus.area.shoulders",
  knees: "journal.bodyStatus.area.knees",
  ankles: "journal.bodyStatus.area.ankles",
  hips: "journal.bodyStatus.area.hips",
  glutes: "journal.bodyStatus.area.glutes",
  core: "journal.bodyStatus.area.core",
};

type Editor = { mode: "create" } | { mode: "edit"; id: string };

function byDateDesc(a: BodyStatusRecord, b: BodyStatusRecord): number {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1;
  if (a.id === b.id) return 0;
  return a.id < b.id ? 1 : -1;
}

function isArea(value: string): value is BodyStatusSorenessArea {
  return (BODY_SORENESS_AREAS as readonly string[]).includes(value);
}

function moodOf(value: number | undefined) {
  return MOODS.find((mood) => mood.value === value);
}

export function BodyStatusPage() {
  const locale = useLocale();
  const t = (key: JournalMessageKey, params?: TranslationParams) => tJournal(locale, key, params);
  const { uid } = useAuth();
  const db = getFirestoreDb();
  const [entries, setEntries] = useState<readonly BodyStatusRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteFailed, setDeleteFailed] = useState(false);

  useEffect(() => {
    if (!uid || !db) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setFailed(false);
    return subscribeToBodyStatus(
      db,
      uid,
      (snapshot) => {
        setEntries(snapshot.entries);
        setLoading(false);
      },
      (error) => {
        logActionFailure("body-status", "read", error);
        setFailed(true);
        setLoading(false);
      },
    );
  }, [uid, db, retry]);

  const sorted = [...entries].sort(byDateDesc);
  const visible = sorted.slice(0, LIST_LIMIT);
  const editing = editor?.mode === "edit" ? entries.find((entry) => entry.id === editor.id) : undefined;

  async function save(input: BodyStatusInput): Promise<{ ok: true } | { ok: false; field: BodyStatusWriteFailure }> {
    if (!db || !uid || !editor) return { ok: false, field: "date" };
    const now = new Date().toISOString();
    const result =
      editor.mode === "edit"
        ? await updateBodyStatus(db, uid, editor.id, input, now)
        : await createBodyStatus(db, uid, input, now);
    if (result.ok) setEditor(null);
    return result.ok ? { ok: true } : result;
  }

  async function confirmDelete() {
    if (!db || !uid || !pendingDelete) return;
    setDeleting(true);
    setDeleteFailed(false);
    try {
      await deleteBodyStatus(db, uid, pendingDelete);
      if (editor?.mode === "edit" && editor.id === pendingDelete) setEditor(null);
      setPendingDelete(null);
    } catch (error) {
      logActionFailure("body-status", "delete", error);
      setDeleteFailed(true);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <section>
      <h1 className="text-2xl font-bold text-brand-navy">{t("journal.bodyStatus.title")}</h1>
      <p className="mt-1 text-brand-navy/80">{t("journal.bodyStatus.subtitle")}</p>

      {!uid ? (
        <p className="mt-4">{t("journal.bodyStatus.signedOut")}</p>
      ) : !db ? (
        <p className="mt-4">{t("journal.bodyStatus.unavailable")}</p>
      ) : failed ? (
        <div className="mt-4">
          <p>{t("journal.bodyStatus.error")}</p>
          <Button className="mt-3" variant="outline" onClick={() => setRetry((count) => count + 1)}>
            {t("journal.bodyStatus.retry")}
          </Button>
        </div>
      ) : loading ? (
        <p className="mt-4" aria-busy="true">
          {t("journal.bodyStatus.loading")}
        </p>
      ) : (
        <div className="mt-4">
          <Button variant="outline" onClick={() => setEditor({ mode: "create" })}>
            {t("journal.bodyStatus.action.add")}
          </Button>

          {editor ? (
            <BodyStatusForm
              key={editor.mode === "edit" ? editor.id : "create"}
              mode={editor.mode}
              entry={editing}
              onCancel={() => setEditor(null)}
              onSubmit={save}
            />
          ) : null}

          {entries.length === 0 ? (
            <p className="mt-4">{t("journal.bodyStatus.empty")}</p>
          ) : (
            <>
              {sorted.length > LIST_LIMIT ? <p className="mt-4">{t("journal.bodyStatus.recentOnly")}</p> : null}
              <ul className="mt-4 space-y-3">
                {visible.map((entry) => {
                  const mood = moodOf(entry.mood);
                  return (
                    <li key={entry.id}>
                      <Card title={formatCalendarDate(entry.date, locale)}>
                        {mood ? (
                          <p>
                            <span aria-hidden="true">{mood.emoji}</span> {t(mood.labelKey)}
                          </p>
                        ) : null}
                        {entry.sleepHours !== undefined ? (
                          <p className="mt-2">
                            {t("journal.bodyStatus.sleepValue", { hours: entry.sleepHours })}
                          </p>
                        ) : null}
                        {entry.fatigueLevel !== undefined ? (
                          <p className="mt-2">
                            <span className="font-medium">{t("journal.bodyStatus.field.fatigue")}</span>
                            {": "}
                            {t("journal.bodyStatus.fatigueValue", { level: entry.fatigueLevel })}
                          </p>
                        ) : null}
                        {entry.bodyWeightLb !== undefined ? (
                          <p className="mt-2">
                            {t("journal.bodyStatus.weightValue", { weight: entry.bodyWeightLb })}
                            {entry.heightCm !== undefined
                              ? ` · ${t("journal.bodyStatus.heightValue", { height: entry.heightCm })}`
                              : ""}
                          </p>
                        ) : null}
                        {entry.sorenessAreas && entry.sorenessAreas.length > 0 ? (
                          <ul className="mt-2 flex flex-wrap gap-1" aria-label={t("journal.bodyStatus.field.areas")}>
                            {entry.sorenessAreas.filter(isArea).map((area) => (
                              <li
                                key={area}
                                className="rounded-full border border-brand-navy/15 px-2 py-1 text-xs font-medium text-brand-navy"
                              >
                                {t(AREA_LABEL[area])}
                              </li>
                            ))}
                          </ul>
                        ) : null}
                        {entry.injuryNote ? (
                          <div className="mt-3 rounded-control border border-brand-navy/15 p-3">
                            <p className="font-medium">{t("journal.bodyStatus.field.injury")}</p>
                            <p className="mt-1 whitespace-pre-wrap">{entry.injuryNote}</p>
                          </div>
                        ) : null}
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button variant="outline" onClick={() => setEditor({ mode: "edit", id: entry.id })}>
                            {t("journal.bodyStatus.action.edit")}
                          </Button>
                          <Button
                            variant="danger-outline"
                            onClick={() => {
                              setDeleteFailed(false);
                              setPendingDelete(entry.id);
                            }}
                          >
                            {t("journal.bodyStatus.action.delete")}
                          </Button>
                        </div>
                      </Card>
                    </li>
                  );
                })}
              </ul>
            </>
          )}

          {pendingDelete ? (
            <div
              role="alertdialog"
              aria-labelledby="body-status-delete-title"
              className="mt-6 rounded-card border border-status-danger/40 p-4"
            >
              <h2 id="body-status-delete-title" className="text-lg font-semibold text-status-danger">
                {t("journal.bodyStatus.delete.title")}
              </h2>
              <p className="mt-2 text-sm text-brand-navy">{t("journal.bodyStatus.delete.body")}</p>
              {deleteFailed ? (
                <ErrorNotice className="mt-3">{t("journal.bodyStatus.delete.failed")}</ErrorNotice>
              ) : null}
              <div className="mt-4 flex flex-wrap gap-3">
                <Button variant="danger-outline" disabled={deleting} onClick={() => void confirmDelete()}>
                  {deleting ? t("journal.bodyStatus.delete.busy") : t("journal.bodyStatus.delete.confirm")}
                </Button>
                <Button
                  variant="outline"
                  disabled={deleting}
                  onClick={() => {
                    setPendingDelete(null);
                    setDeleteFailed(false);
                  }}
                >
                  {t("journal.bodyStatus.delete.cancel")}
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}

function BodyStatusForm({
  mode,
  entry,
  onCancel,
  onSubmit,
}: {
  mode: "create" | "edit";
  entry?: BodyStatusRecord;
  onCancel: () => void;
  onSubmit: (input: BodyStatusInput) => Promise<{ ok: true } | { ok: false; field: BodyStatusWriteFailure }>;
}) {
  const locale = useLocale();
  const t = (key: JournalMessageKey) => tJournal(locale, key);
  const [date, setDate] = useState(entry?.date ?? todayDateString());
  const [sleepHours, setSleepHours] = useState(entry?.sleepHours === undefined ? "" : String(entry.sleepHours));
  const [fatigueLevel, setFatigueLevel] = useState(entry?.fatigueLevel ?? 3);
  const [mood, setMood] = useState(entry?.mood ?? 3);
  const [areas, setAreas] = useState<readonly string[]>(entry?.sorenessAreas ?? []);
  const [bodyWeightLb, setBodyWeightLb] = useState(entry?.bodyWeightLb === undefined ? "" : String(entry.bodyWeightLb));
  const [heightCm, setHeightCm] = useState(entry?.heightCm === undefined ? "" : String(entry.heightCm));
  const [injuryNote, setInjuryNote] = useState(entry?.injuryNote ?? "");
  const [busy, setBusy] = useState(false);
  const [dateError, setDateError] = useState(false);
  const [failed, setFailed] = useState(false);
  const title = t(mode === "create" ? "journal.bodyStatus.form.create" : "journal.bodyStatus.form.edit");

  function toggleArea(area: BodyStatusSorenessArea) {
    setAreas((current) => (current.includes(area) ? current.filter((item) => item !== area) : [...current, area]));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setDateError(false);
    setFailed(false);
    try {
      const result = await onSubmit({
        date,
        sleepHours,
        fatigueLevel,
        mood,
        sorenessAreas: BODY_SORENESS_AREAS.filter((area) => areas.includes(area)),
        bodyWeightLb,
        heightCm,
        injuryNote,
      });
      if (!result.ok) {
        setDateError(true);
        setBusy(false);
      }
    } catch (error) {
      logActionFailure("body-status", "save", error);
      setFailed(true);
      setBusy(false);
    }
  }

  return (
    <form aria-labelledby="body-status-form-title" className="mt-4 space-y-3" onSubmit={(event) => void submit(event)}>
      <h2 id="body-status-form-title" className="text-lg font-semibold text-brand-navy">
        {title}
      </h2>
      <label className="block text-sm font-medium text-brand-navy" htmlFor="body-status-date">
        {t("journal.bodyStatus.field.date")}
        <input
          id="body-status-date"
          className={`${CONTROL} mt-1`}
          value={date}
          inputMode="numeric"
          autoComplete="off"
          onChange={(event) => setDate(event.target.value)}
        />
      </label>
      <label className="block text-sm font-medium text-brand-navy" htmlFor="body-status-sleep">
        {t("journal.bodyStatus.field.sleep")}
        <input
          id="body-status-sleep"
          className={`${CONTROL} mt-1`}
          type="number"
          step="0.5"
          min="0"
          inputMode="decimal"
          value={sleepHours}
          onChange={(event) => setSleepHours(event.target.value)}
        />
      </label>
      <div role="group" aria-label={t("journal.bodyStatus.field.fatigue")} className="flex flex-wrap gap-2">
        {FATIGUE_LEVELS.map((level) => (
          <Button
            key={level}
            variant={fatigueLevel === level ? "brand" : "outline"}
            aria-pressed={fatigueLevel === level}
            onClick={() => setFatigueLevel(level)}
          >
            {level}
          </Button>
        ))}
      </div>
      <div role="group" aria-label={t("journal.bodyStatus.field.mood")} className="flex flex-wrap gap-2">
        {MOODS.map((item) => (
          <Button
            key={item.value}
            variant={mood === item.value ? "brand" : "outline"}
            aria-pressed={mood === item.value}
            onClick={() => setMood(item.value)}
          >
            <span aria-hidden="true">{item.emoji}</span>
            {t(item.labelKey)}
          </Button>
        ))}
      </div>
      <fieldset>
        <legend className="text-sm font-medium text-brand-navy">{t("journal.bodyStatus.field.areas")}</legend>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
          {BODY_SORENESS_AREAS.map((area) => (
            <label key={area} className="inline-flex min-h-11 items-center gap-2 text-sm text-brand-navy">
              <input type="checkbox" checked={areas.includes(area)} onChange={() => toggleArea(area)} />
              {t(AREA_LABEL[area])}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="block text-sm font-medium text-brand-navy" htmlFor="body-status-weight">
        {t("journal.bodyStatus.field.weight")}
        <input
          id="body-status-weight"
          className={`${CONTROL} mt-1`}
          type="number"
          step="0.1"
          min="0"
          inputMode="decimal"
          value={bodyWeightLb}
          onChange={(event) => setBodyWeightLb(event.target.value)}
        />
      </label>
      <label className="block text-sm font-medium text-brand-navy" htmlFor="body-status-height">
        {t("journal.bodyStatus.field.height")}
        <input
          id="body-status-height"
          className={`${CONTROL} mt-1`}
          type="number"
          step="0.1"
          min="0"
          inputMode="decimal"
          value={heightCm}
          onChange={(event) => setHeightCm(event.target.value)}
        />
      </label>
      <label className="block text-sm font-medium text-brand-navy" htmlFor="body-status-injury">
        {t("journal.bodyStatus.field.injury")}
        <textarea
          id="body-status-injury"
          className={`${CONTROL} mt-1 min-h-24 py-2`}
          value={injuryNote}
          onChange={(event) => setInjuryNote(event.target.value)}
        />
      </label>
      {dateError ? <ErrorNotice>{t("journal.bodyStatus.form.dateInvalid")}</ErrorNotice> : null}
      {failed ? <ErrorNotice>{t("journal.bodyStatus.form.failed")}</ErrorNotice> : null}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={busy} aria-busy={busy}>
          {busy ? t("journal.bodyStatus.form.saving") : t("journal.bodyStatus.form.save")}
        </Button>
        <Button variant="outline" disabled={busy} onClick={onCancel}>
          {t("journal.bodyStatus.form.cancel")}
        </Button>
      </div>
    </form>
  );
}
