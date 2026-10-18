import type { RaceSummaryDoc } from "@skatingx/schema";
import { prepareRaceSummaryNoteInput } from "@skatingx/skating-domain";
import { useState, type FormEvent } from "react";

import { useLocale } from "@/hooks/useLocale";

import { DANGER_BUTTON, FormMessage, PRIMARY_BUTTON, SECONDARY_BUTTON, TextAreaField } from "../components/fields";
import { t, type RaceDayMessageKey } from "../i18n/messages";
import { fieldErrorKeys } from "../lib/form-errors";
import { formatSavedAt } from "../lib/summary";

type SummaryNoteProps = {
  /** The note as saved; null when there is none. */
  saved: RaceSummaryDoc | null;
  /** A document exists but could not be read: it is hidden, and only deleting is offered. */
  unreadable: boolean;
  timeZone: string | null;
  saving: boolean;
  deleting: boolean;
  submitErrorKey: RaceDayMessageKey | null;
  /** Resolves true when the write was saved or queued, so the draft can be dropped. */
  onSave: (note: string) => Promise<boolean>;
  onDelete: () => Promise<boolean>;
};

/** The only part of the summary that the user writes. Everything else on the card is computed. */
export function SummaryNote({
  saved,
  unreadable,
  timeZone,
  saving,
  deleting,
  submitErrorKey,
  onSave,
  onDelete,
}: SummaryNoteProps) {
  const locale = useLocale();
  // null means "not edited": the field then follows the saved note, including changes from
  // another device. Typing starts a draft that is only dropped by a successful save or delete.
  const [draft, setDraft] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [errors, setErrors] = useState<Map<string, RaceDayMessageKey>>(new Map());

  const savedNote = saved?.coachNote ?? null;
  const value = draft ?? savedNote ?? "";
  const unchanged = prepareRaceSummaryNoteInput(value).value.coachNote === savedNote;
  const busy = saving || deleting;

  async function handleSubmit(submitEvent: FormEvent<HTMLFormElement>) {
    submitEvent.preventDefault();
    if (busy || unchanged || unreadable) {
      return;
    }
    const { errors: found } = prepareRaceSummaryNoteInput(value);
    const next = fieldErrorKeys(found);
    if (next.size > 0) {
      setErrors(next);
      return;
    }
    setErrors(new Map());
    if (await onSave(value)) {
      setDraft(null);
    }
  }

  async function handleDelete() {
    setConfirmingDelete(false);
    if (await onDelete()) {
      setDraft(null);
      setErrors(new Map());
    }
  }

  const noteError = errors.get("coachNote");
  const hasDocument = saved !== null || unreadable;

  return (
    <section aria-labelledby="summary-note-heading" className="space-y-3">
      <h2 id="summary-note-heading" className="text-lg font-semibold text-brand-navy">
        {t(locale, "raceDay.summary.note.title")}
      </h2>

      {unreadable ? <FormMessage tone="error">{t(locale, "raceDay.summary.note.unreadable")}</FormMessage> : null}

      {!unreadable ? (
        <form
          noValidate
          aria-labelledby="summary-note-heading"
          onSubmit={(event) => {
            void handleSubmit(event);
          }}
          className="space-y-3"
        >
          {submitErrorKey ? <FormMessage tone="error">{t(locale, submitErrorKey)}</FormMessage> : null}
          <TextAreaField
            label={t(locale, "raceDay.summary.note.label")}
            value={value}
            disabled={saving}
            hint={t(locale, "raceDay.summary.note.hint")}
            error={noteError ? t(locale, noteError) : null}
            onChange={(next) => {
              setDraft(next);
              setErrors(new Map());
            }}
          />
          {saved?.generatedAt ? (
            <p className="text-sm text-brand-navy/70">
              {t(locale, "raceDay.summary.note.savedAt", {
                time: formatSavedAt(saved.generatedAt, locale, timeZone),
              })}
            </p>
          ) : (
            <p className="text-sm text-brand-navy/70">{t(locale, "raceDay.summary.note.none")}</p>
          )}
          <button type="submit" disabled={busy || unchanged} className={PRIMARY_BUTTON}>
            {saving ? t(locale, "raceDay.common.saving") : t(locale, "raceDay.summary.note.save")}
          </button>
        </form>
      ) : null}

      {hasDocument ? (
        confirmingDelete ? (
          <div className="space-y-2">
            <FormMessage tone="error">{t(locale, "raceDay.summary.note.deleteWarning")}</FormMessage>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                className={DANGER_BUTTON}
                onClick={() => {
                  void handleDelete();
                }}
              >
                {t(locale, "raceDay.common.confirmDelete")}
              </button>
              <button
                type="button"
                className={SECONDARY_BUTTON}
                onClick={() => {
                  setConfirmingDelete(false);
                }}
              >
                {t(locale, "raceDay.common.cancel")}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            disabled={busy}
            className={SECONDARY_BUTTON}
            onClick={() => {
              setConfirmingDelete(true);
            }}
          >
            {t(locale, "raceDay.summary.note.delete")}
          </button>
        )
      ) : null}
    </section>
  );
}
