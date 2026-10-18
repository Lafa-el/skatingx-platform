import { prepareRaceResultInput, type RaceResultFormInput } from "@skatingx/skating-domain";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { useLocale } from "@/hooks/useLocale";

import {
  FormMessage,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  SelectField,
  TextField,
} from "../components/fields";
import { t, type RaceDayMessageKey } from "../i18n/messages";
import { fieldErrorKeys } from "../lib/form-errors";
import { formValuesToInput, type AdvancedChoice, type ResultFormValues } from "../lib/results";

const STATUSES = ["finished", "DNS", "DNF", "DQ"] as const;

type ResultFormProps = {
  /** True when this race and athlete already have a result: saving updates it. */
  updatesExisting: boolean;
  initial: ResultFormValues;
  /** Moves keyboard focus into the form, for when it opens because "Edit" was pressed. */
  focusOnMount: boolean;
  saving: boolean;
  submitErrorKey: RaceDayMessageKey | null;
  onSubmit: (input: RaceResultFormInput) => void;
  onCancel: () => void;
};

/** The fields of one result. Race and athlete are chosen outside, so changing them keeps focus. */
export function ResultForm({
  updatesExisting,
  initial,
  focusOnMount,
  saving,
  submitErrorKey,
  onSubmit,
  onCancel,
}: ResultFormProps) {
  const locale = useLocale();
  const formRef = useRef<HTMLFormElement>(null);

  const [status, setStatus] = useState(initial.status);
  const [time, setTime] = useState(initial.time);
  const [place, setPlace] = useState(initial.place);
  const [advanced, setAdvanced] = useState<AdvancedChoice>(initial.advanced);
  const [sourceNote, setSourceNote] = useState(initial.sourceNote);
  const [errors, setErrors] = useState<Map<string, RaceDayMessageKey>>(new Map());

  useEffect(() => {
    if (focusOnMount) {
      formRef.current?.querySelector<HTMLElement>("select, input")?.focus();
    }
  }, [focusOnMount]);

  const errorText = (field: string) => {
    const key = errors.get(field);
    return key ? t(locale, key) : null;
  };
  const finished = status === "finished";

  function handleSubmit(submitEvent: FormEvent<HTMLFormElement>) {
    submitEvent.preventDefault();
    if (saving) {
      return;
    }
    const input = formValuesToInput({ status, time, place, advanced, sourceNote });
    const { errors: found } = prepareRaceResultInput(input);
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

  const title = t(locale, updatesExisting ? "raceDay.results.entry.editTitle" : "raceDay.results.entry.title");

  return (
    <form
      ref={formRef}
      noValidate
      aria-label={title}
      onSubmit={handleSubmit}
      className="space-y-4 rounded-card border border-brand-navy/10 bg-white p-4 shadow-card"
    >
      <h3 className="text-base font-semibold text-brand-navy">{title}</h3>

      {updatesExisting ? <FormMessage tone="info">{t(locale, "raceDay.results.form.updatesExisting")}</FormMessage> : null}
      {errors.size > 0 ? <FormMessage tone="error">{t(locale, "raceDay.form.summaryError")}</FormMessage> : null}
      {submitErrorKey ? <FormMessage tone="error">{t(locale, submitErrorKey)}</FormMessage> : null}

      <SelectField
        label={t(locale, "raceDay.results.form.status")}
        value={status}
        disabled={saving}
        options={STATUSES.map((value) => ({ value, label: t(locale, `raceDay.results.status.${value}`) }))}
        onChange={setStatus}
        error={errorText("status")}
      />

      {finished ? (
        <>
          <TextField
            label={t(locale, "raceDay.results.form.time")}
            value={time}
            required
            disabled={saving}
            hint={t(locale, "raceDay.results.form.timeHint")}
            onChange={setTime}
            error={errorText("time")}
          />
          <TextField
            label={t(locale, "raceDay.results.form.place")}
            value={place}
            inputMode="numeric"
            disabled={saving}
            onChange={setPlace}
            error={errorText("place")}
          />
          <SelectField
            label={t(locale, "raceDay.results.form.advanced")}
            value={advanced}
            disabled={saving}
            options={[
              { value: "", label: t(locale, "raceDay.results.advanced.unknown") },
              { value: "yes", label: t(locale, "raceDay.results.advanced.yes") },
              { value: "no", label: t(locale, "raceDay.results.advanced.no") },
            ]}
            onChange={(value) => {
              setAdvanced(value === "yes" || value === "no" ? value : "");
            }}
            error={errorText("advanced")}
          />
        </>
      ) : null}

      <TextField
        label={t(locale, "raceDay.form.sourceNote")}
        value={sourceNote}
        hint={t(locale, "raceDay.form.sourceNoteHint")}
        disabled={saving}
        onChange={setSourceNote}
        error={errorText("sourceNote")}
      />

      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={saving} className={PRIMARY_BUTTON}>
          {saving ? t(locale, "raceDay.common.saving") : t(locale, "raceDay.results.form.save")}
        </button>
        <button type="button" disabled={saving} className={SECONDARY_BUTTON} onClick={onCancel}>
          {t(locale, "raceDay.common.cancel")}
        </button>
      </div>
    </form>
  );
}
