import {
  COACH_NOTE_TAGS,
  createCoachNote,
  deleteCoachNote,
  getFirestoreDb,
  subscribeToCoachNotes,
  updateCoachNote,
  type CoachNoteInput,
  type CoachNotePriority,
  type CoachNoteRecord,
  type CoachNoteTag,
  type CoachNoteWriteFailure,
} from "@skatingx/firebase-client";
import { todayDateString } from "@skatingx/schema";
import { Button, Card, ErrorNotice, StatusTag, type StatusTone } from "@skatingx/ui";
import { useEffect, useState, type FormEvent } from "react";

import { useAuth } from "@/app/providers/AuthProvider";
import { useLocale } from "@/hooks/useLocale";
import { formatCalendarDate } from "@/shared/i18n/format";
import { tJournal, type JournalMessageKey } from "@/shared/i18n/journal-messages";
import { logActionFailure } from "@/shared/utils/logActionFailure";

const CONTROL =
  "min-h-11 w-full rounded-control border border-brand-navy/50 bg-white px-3 text-brand-navy";

const PRIORITIES = ["high", "medium", "low"] as const;

/** Existing StatusTag tones. High needs attention, medium is in between, low is quiet. */
const PRIORITY_TONE: Record<CoachNotePriority, StatusTone> = {
  high: "danger",
  medium: "pending",
  low: "neutral",
};

const PRIORITY_LABEL: Record<CoachNotePriority, JournalMessageKey> = {
  high: "journal.coachNotes.priority.high",
  medium: "journal.coachNotes.priority.medium",
  low: "journal.coachNotes.priority.low",
};

const TAG_LABEL: Record<CoachNoteTag, JournalMessageKey> = {
  corner_entry: "journal.coachNotes.tag.cornerEntry",
  corner_drift: "journal.coachNotes.tag.cornerDrift",
  high_center_of_gravity: "journal.coachNotes.tag.highCenterOfGravity",
  right_leg_support: "journal.coachNotes.tag.rightLegSupport",
  exit_angle: "journal.coachNotes.tag.exitAngle",
  straightaway_bouncing: "journal.coachNotes.tag.straightawayBouncing",
  incomplete_push: "journal.coachNotes.tag.incompletePush",
  start_technique: "journal.coachNotes.tag.startTechnique",
  block_start: "journal.coachNotes.tag.blockStart",
  jump_takeoff: "journal.coachNotes.tag.jumpTakeoff",
  rotation: "journal.coachNotes.tag.rotation",
  spin_centering: "journal.coachNotes.tag.spinCentering",
  program_flow: "journal.coachNotes.tag.programFlow",
  transitions: "journal.coachNotes.tag.transitions",
  edges: "journal.coachNotes.tag.edges",
};

type PriorityFilter = "all" | CoachNotePriority;

type Editor = { mode: "create" } | { mode: "edit"; id: string };

function byDateDesc(a: CoachNoteRecord, b: CoachNoteRecord): number {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1;
  if (a.id === b.id) return 0;
  return a.id < b.id ? 1 : -1;
}

function isTag(value: string): value is CoachNoteTag {
  return (COACH_NOTE_TAGS as readonly string[]).includes(value);
}

export function CoachNotesPage() {
  const locale = useLocale();
  const t = (key: JournalMessageKey) => tJournal(locale, key);
  const { uid } = useAuth();
  const db = getFirestoreDb();
  const [notes, setNotes] = useState<readonly CoachNoteRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>("all");
  const [coachQuery, setCoachQuery] = useState("");
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
    return subscribeToCoachNotes(
      db,
      uid,
      (snapshot) => {
        setNotes(snapshot.notes);
        setLoading(false);
      },
      (error) => {
        logActionFailure("coach-notes", "read", error);
        setFailed(true);
        setLoading(false);
      },
    );
  }, [uid, db, retry]);

  const coachNameOf = (note: CoachNoteRecord) => note.coachName ?? t("journal.coachNotes.anonymous");
  const query = coachQuery.trim().toLowerCase();
  const visible = [...notes].sort(byDateDesc).filter((note) => {
    if (priorityFilter !== "all" && note.priority !== priorityFilter) return false;
    if (!query) return true;
    return coachNameOf(note).toLowerCase().includes(query);
  });
  const editing = editor?.mode === "edit" ? notes.find((note) => note.id === editor.id) : undefined;

  async function save(input: CoachNoteInput): Promise<{ ok: true } | { ok: false; field: CoachNoteWriteFailure }> {
    if (!db || !uid || !editor) return { ok: false, field: "date" };
    const now = new Date().toISOString();
    const result =
      editor.mode === "edit"
        ? await updateCoachNote(db, uid, editor.id, input, now)
        : await createCoachNote(db, uid, input, now);
    if (result.ok) setEditor(null);
    return result.ok ? { ok: true } : result;
  }

  async function confirmDelete() {
    if (!db || !uid || !pendingDelete) return;
    setDeleting(true);
    setDeleteFailed(false);
    try {
      await deleteCoachNote(db, uid, pendingDelete);
      if (editor?.mode === "edit" && editor.id === pendingDelete) setEditor(null);
      setPendingDelete(null);
    } catch (error) {
      logActionFailure("coach-notes", "delete", error);
      setDeleteFailed(true);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <section>
      <h1 className="text-2xl font-bold text-brand-navy">{t("journal.coachNotes.title")}</h1>
      <p className="mt-1 text-brand-navy/80">{t("journal.coachNotes.subtitle")}</p>

      {!uid ? (
        <p className="mt-4">{t("journal.coachNotes.signedOut")}</p>
      ) : !db ? (
        <p className="mt-4">{t("journal.coachNotes.unavailable")}</p>
      ) : failed ? (
        <div className="mt-4">
          <p>{t("journal.coachNotes.error")}</p>
          <Button className="mt-3" variant="outline" onClick={() => setRetry((count) => count + 1)}>
            {t("journal.coachNotes.retry")}
          </Button>
        </div>
      ) : loading ? (
        <p className="mt-4" aria-busy="true">
          {t("journal.coachNotes.loading")}
        </p>
      ) : (
        <div className="mt-4">
          <Button variant="outline" onClick={() => setEditor({ mode: "create" })}>
            {t("journal.coachNotes.action.add")}
          </Button>

          {editor ? (
            <CoachNoteForm
              key={editor.mode === "edit" ? editor.id : "create"}
              mode={editor.mode}
              note={editing}
              onCancel={() => setEditor(null)}
              onSubmit={save}
            />
          ) : null}

          {notes.length === 0 ? (
            <p className="mt-4">{t("journal.coachNotes.empty")}</p>
          ) : (
            <>
              <div className="mt-4">
                <div className="flex flex-wrap gap-2" role="group" aria-label={t("journal.coachNotes.filter.priority")}>
                  {(["all", ...PRIORITIES] as const).map((value) => (
                    <Button
                      key={value}
                      variant={priorityFilter === value ? "brand" : "outline"}
                      aria-pressed={priorityFilter === value}
                      onClick={() => setPriorityFilter(value)}
                    >
                      {t(value === "all" ? "journal.coachNotes.filter.all" : PRIORITY_LABEL[value])}
                    </Button>
                  ))}
                </div>
                <label className="mt-3 block text-sm font-medium text-brand-navy" htmlFor="coach-note-filter">
                  {t("journal.coachNotes.filter.coach")}
                  <input
                    id="coach-note-filter"
                    className={`${CONTROL} mt-1`}
                    value={coachQuery}
                    onChange={(event) => setCoachQuery(event.target.value)}
                  />
                </label>
              </div>

              {visible.length === 0 ? (
                <p className="mt-4">{t("journal.coachNotes.filterEmpty")}</p>
              ) : (
                <ul className="mt-4 space-y-3">
                  {visible.map((note) => (
                    <li key={note.id}>
                      <Card title={formatCalendarDate(note.date, locale)}>
                        <p>{coachNameOf(note)}</p>
                        <StatusTag tone={PRIORITY_TONE[note.priority]} className="mt-2">
                          {t(PRIORITY_LABEL[note.priority])}
                        </StatusTag>
                        {note.note ? <p className="mt-2 whitespace-pre-wrap">{note.note}</p> : null}
                        {note.technicalTags && note.technicalTags.length > 0 ? (
                          <ul className="mt-2 flex flex-wrap gap-1" aria-label={t("journal.coachNotes.field.tags")}>
                            {note.technicalTags.filter(isTag).map((tag) => (
                              <li
                                key={tag}
                                className="rounded-full border border-brand-navy/15 px-2 py-1 text-xs font-medium text-brand-navy"
                              >
                                {t(TAG_LABEL[tag])}
                              </li>
                            ))}
                          </ul>
                        ) : null}
                        {note.followUpTomorrow ? (
                          <p className="mt-2">
                            <span className="font-medium">{t("journal.coachNotes.field.followUp")}</span>
                            {": "}
                            {note.followUpTomorrow}
                          </p>
                        ) : null}
                        {note.linkedSessionId ? (
                          <p className="mt-2">
                            <span className="font-medium">{t("journal.coachNotes.field.linkedSession")}</span>
                            {": "}
                            {note.linkedSessionId}
                          </p>
                        ) : null}
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button variant="outline" onClick={() => setEditor({ mode: "edit", id: note.id })}>
                            {t("journal.coachNotes.action.edit")}
                          </Button>
                          <Button
                            variant="danger-outline"
                            onClick={() => {
                              setDeleteFailed(false);
                              setPendingDelete(note.id);
                            }}
                          >
                            {t("journal.coachNotes.action.delete")}
                          </Button>
                        </div>
                      </Card>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}

          {pendingDelete ? (
            <div
              role="alertdialog"
              aria-labelledby="coach-note-delete-title"
              className="mt-6 rounded-card border border-status-danger/40 p-4"
            >
              <h2 id="coach-note-delete-title" className="text-lg font-semibold text-status-danger">
                {t("journal.coachNotes.delete.title")}
              </h2>
              <p className="mt-2 text-sm text-brand-navy">{t("journal.coachNotes.delete.body")}</p>
              {deleteFailed ? (
                <ErrorNotice className="mt-3">{t("journal.coachNotes.delete.failed")}</ErrorNotice>
              ) : null}
              <div className="mt-4 flex flex-wrap gap-3">
                <Button variant="danger-outline" disabled={deleting} onClick={() => void confirmDelete()}>
                  {deleting ? t("journal.coachNotes.delete.busy") : t("journal.coachNotes.delete.confirm")}
                </Button>
                <Button
                  variant="outline"
                  disabled={deleting}
                  onClick={() => {
                    setPendingDelete(null);
                    setDeleteFailed(false);
                  }}
                >
                  {t("journal.coachNotes.delete.cancel")}
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}

function CoachNoteForm({
  mode,
  note,
  onCancel,
  onSubmit,
}: {
  mode: "create" | "edit";
  note?: CoachNoteRecord;
  onCancel: () => void;
  onSubmit: (input: CoachNoteInput) => Promise<{ ok: true } | { ok: false; field: CoachNoteWriteFailure }>;
}) {
  const locale = useLocale();
  const t = (key: JournalMessageKey) => tJournal(locale, key);
  const [date, setDate] = useState(note?.date ?? todayDateString());
  const [coachName, setCoachName] = useState(note?.coachName ?? "");
  const [priority, setPriority] = useState<CoachNotePriority>(note?.priority ?? "medium");
  const [body, setBody] = useState(note?.note ?? "");
  const [tags, setTags] = useState<readonly string[]>(note?.technicalTags ?? []);
  const [followUp, setFollowUp] = useState(note?.followUpTomorrow ?? "");
  const [linkedSessionId, setLinkedSessionId] = useState(note?.linkedSessionId ?? "");
  const [busy, setBusy] = useState(false);
  const [dateError, setDateError] = useState(false);
  const [failed, setFailed] = useState(false);
  const title = t(mode === "create" ? "journal.coachNotes.form.create" : "journal.coachNotes.form.edit");

  function toggleTag(tag: CoachNoteTag) {
    setTags((current) => (current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag]));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setDateError(false);
    setFailed(false);
    try {
      const result = await onSubmit({
        date,
        coachName,
        priority,
        note: body,
        technicalTags: COACH_NOTE_TAGS.filter((tag) => tags.includes(tag)),
        followUpTomorrow: followUp,
        linkedSessionId,
      });
      if (!result.ok) {
        setDateError(true);
        setBusy(false);
      }
    } catch (error) {
      logActionFailure("coach-notes", "save", error);
      setFailed(true);
      setBusy(false);
    }
  }

  return (
    <form aria-labelledby="coach-note-form-title" className="mt-4 space-y-3" onSubmit={(event) => void submit(event)}>
      <h2 id="coach-note-form-title" className="text-lg font-semibold text-brand-navy">
        {title}
      </h2>
      <label className="block text-sm font-medium text-brand-navy" htmlFor="coach-note-date">
        {t("journal.coachNotes.field.date")}
        <input
          id="coach-note-date"
          className={`${CONTROL} mt-1`}
          value={date}
          inputMode="numeric"
          autoComplete="off"
          onChange={(event) => setDate(event.target.value)}
        />
      </label>
      <label className="block text-sm font-medium text-brand-navy" htmlFor="coach-note-name">
        {t("journal.coachNotes.field.coachName")}
        <input
          id="coach-note-name"
          className={`${CONTROL} mt-1`}
          value={coachName}
          onChange={(event) => setCoachName(event.target.value)}
        />
      </label>
      <div role="group" aria-label={t("journal.coachNotes.field.priority")} className="flex flex-wrap gap-2">
        {PRIORITIES.map((value) => (
          <Button
            key={value}
            variant={priority === value ? "brand" : "outline"}
            aria-pressed={priority === value}
            onClick={() => setPriority(value)}
          >
            {t(PRIORITY_LABEL[value])}
          </Button>
        ))}
      </div>
      <label className="block text-sm font-medium text-brand-navy" htmlFor="coach-note-body">
        {t("journal.coachNotes.field.note")}
        <textarea
          id="coach-note-body"
          className={`${CONTROL} mt-1 min-h-24 py-2`}
          value={body}
          onChange={(event) => setBody(event.target.value)}
        />
      </label>
      <fieldset>
        <legend className="text-sm font-medium text-brand-navy">{t("journal.coachNotes.field.tags")}</legend>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
          {COACH_NOTE_TAGS.map((tag) => (
            <label key={tag} className="inline-flex min-h-11 items-center gap-2 text-sm text-brand-navy">
              <input
                type="checkbox"
                checked={tags.includes(tag)}
                onChange={() => toggleTag(tag)}
              />
              {t(TAG_LABEL[tag])}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="block text-sm font-medium text-brand-navy" htmlFor="coach-note-follow">
        {t("journal.coachNotes.field.followUp")}
        <textarea
          id="coach-note-follow"
          className={`${CONTROL} mt-1 min-h-20 py-2`}
          value={followUp}
          onChange={(event) => setFollowUp(event.target.value)}
        />
      </label>
      <label className="block text-sm font-medium text-brand-navy" htmlFor="coach-note-session">
        {t("journal.coachNotes.field.linkedSession")}
        <input
          id="coach-note-session"
          className={`${CONTROL} mt-1`}
          value={linkedSessionId}
          onChange={(event) => setLinkedSessionId(event.target.value)}
        />
      </label>
      {dateError ? <ErrorNotice>{t("journal.coachNotes.form.dateInvalid")}</ErrorNotice> : null}
      {failed ? <ErrorNotice>{t("journal.coachNotes.form.failed")}</ErrorNotice> : null}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={busy} aria-busy={busy}>
          {busy ? t("journal.coachNotes.form.saving") : t("journal.coachNotes.form.save")}
        </Button>
        <Button variant="outline" disabled={busy} onClick={onCancel}>
          {t("journal.coachNotes.form.cancel")}
        </Button>
      </div>
    </form>
  );
}
