import { prepareRaceVideoInput, type RaceVideoInput } from "@skatingx/skating-domain";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { useLocale } from "@/hooks/useLocale";

import { FormMessage, PRIMARY_BUTTON, SECONDARY_BUTTON, TextField } from "../components/fields";
import { t, type RaceDayMessageKey } from "../i18n/messages";
import { fieldErrorKeys } from "../lib/form-errors";
import { formValuesToVideoInput, type VideoFormValues } from "../lib/videos";

type VideoFormProps = {
  /** True when editing a saved record: race and athlete are fixed and shown by the page. */
  editing: boolean;
  initial: VideoFormValues;
  /** Moves keyboard focus into the form, for when it opens because "Edit" was pressed. */
  focusOnMount: boolean;
  saving: boolean;
  submitErrorKey: RaceDayMessageKey | null;
  onSubmit: (input: RaceVideoInput) => void;
  onCancel: () => void;
};

/**
 * The fields of one video record. There is deliberately no file input: a record only says
 * where a video is kept (ADR-001 D4).
 */
export function VideoForm({
  editing,
  initial,
  focusOnMount,
  saving,
  submitErrorKey,
  onSubmit,
  onCancel,
}: VideoFormProps) {
  const locale = useLocale();
  const formRef = useRef<HTMLFormElement>(null);

  const [label, setLabel] = useState(initial.label);
  const [externalUrl, setExternalUrl] = useState(initial.externalUrl);
  const [storedWhere, setStoredWhere] = useState(initial.storedWhere);
  const [note, setNote] = useState(initial.note);
  const [errors, setErrors] = useState<Map<string, RaceDayMessageKey>>(new Map());

  useEffect(() => {
    if (focusOnMount) {
      formRef.current?.querySelector<HTMLElement>("input")?.focus();
    }
  }, [focusOnMount]);

  const errorText = (field: string) => {
    const key = errors.get(field);
    return key ? t(locale, key) : null;
  };

  function handleSubmit(submitEvent: FormEvent<HTMLFormElement>) {
    submitEvent.preventDefault();
    if (saving) {
      return;
    }
    const input = formValuesToVideoInput({ label, externalUrl, storedWhere, note });
    const { errors: found } = prepareRaceVideoInput(input);
    const next = fieldErrorKeys(found);
    if (next.size > 0) {
      setErrors(next);
      queueMicrotask(() => {
        formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      });
      return;
    }
    setErrors(new Map());
    onSubmit(input);
  }

  const title = t(locale, editing ? "raceDay.videos.entry.editTitle" : "raceDay.videos.entry.title");

  return (
    <form
      ref={formRef}
      noValidate
      aria-label={title}
      onSubmit={handleSubmit}
      className="space-y-4 rounded-xl border border-slate-200 bg-white p-4"
    >
      <h3 className="text-base font-semibold text-slate-900">{title}</h3>

      {editing ? <FormMessage tone="info">{t(locale, "raceDay.videos.form.lockedHint")}</FormMessage> : null}
      {errors.size > 0 ? <FormMessage tone="error">{t(locale, "raceDay.form.summaryError")}</FormMessage> : null}
      {submitErrorKey ? <FormMessage tone="error">{t(locale, submitErrorKey)}</FormMessage> : null}

      <TextField
        label={t(locale, "raceDay.videos.form.label")}
        value={label}
        required
        disabled={saving}
        onChange={setLabel}
        error={errorText("label")}
      />
      <TextField
        label={t(locale, "raceDay.videos.form.externalUrl")}
        value={externalUrl}
        disabled={saving}
        hint={t(locale, "raceDay.videos.form.externalUrlHint")}
        onChange={setExternalUrl}
        error={errorText("externalUrl")}
      />
      <TextField
        label={t(locale, "raceDay.videos.form.storedWhere")}
        value={storedWhere}
        disabled={saving}
        hint={t(locale, "raceDay.videos.form.storedWhereHint")}
        onChange={setStoredWhere}
        error={errorText("storedWhere")}
      />
      <TextField
        label={t(locale, "raceDay.videos.form.note")}
        value={note}
        disabled={saving}
        onChange={setNote}
        error={errorText("note")}
      />

      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={saving} className={PRIMARY_BUTTON}>
          {saving ? t(locale, "raceDay.common.saving") : t(locale, "raceDay.videos.form.save")}
        </button>
        <button type="button" disabled={saving} className={SECONDARY_BUTTON} onClick={onCancel}>
          {t(locale, "raceDay.common.cancel")}
        </button>
      </div>
    </form>
  );
}
