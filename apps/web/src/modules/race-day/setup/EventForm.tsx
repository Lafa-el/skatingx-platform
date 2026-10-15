import { prepareRaceEventInput, RACE_DAY_LIMITS, type RaceEventInput } from "@skatingx/skating-domain";
import { useRef, useState, type FormEvent } from "react";

import { useLocale } from "@/hooks/useLocale";

import {
  FormMessage,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  TextField,
} from "../components/fields";
import { t, type RaceDayMessageKey } from "../i18n/messages";
import { fieldErrorKeys } from "../lib/form-errors";

type EventFormProps = {
  mode: "create" | "edit";
  initial?: RaceEventInput;
  saving: boolean;
  submitErrorKey: RaceDayMessageKey | null;
  onSubmit: (values: RaceEventInput) => void;
  /** Omitted when the form is the only thing on screen (first event). */
  onCancel?: () => void;
};

const TIME_ZONE_SUGGESTIONS = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Toronto",
  "Asia/Shanghai",
];

export function EventForm({ mode, initial, saving, submitErrorKey, onSubmit, onCancel }: EventFormProps) {
  const locale = useLocale();
  const formRef = useRef<HTMLFormElement>(null);

  const [name, setName] = useState(initial?.name ?? "");
  const [dates, setDates] = useState<string[]>(initial?.dates.length ? [...initial.dates] : [""]);
  const [timeZone, setTimeZone] = useState(initial?.timeZone ?? "");
  const [venue, setVenue] = useState(initial?.venue ?? "");
  const [sourceNote, setSourceNote] = useState(initial?.sourceNote ?? "");
  const [errors, setErrors] = useState<Map<string, RaceDayMessageKey>>(new Map());

  const errorText = (field: string) => {
    const key = errors.get(field);
    return key ? t(locale, key) : null;
  };

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) {
      return;
    }
    const { value, errors: found } = prepareRaceEventInput({
      name,
      dates,
      // Blank optional fields become null in the domain layer, the single place that normalizes.
      timeZone,
      venue,
      sourceNote,
    });
    if (found.length > 0) {
      setErrors(fieldErrorKeys(found));
      queueMicrotask(() => {
        formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      });
      return;
    }
    setErrors(new Map());
    onSubmit(value);
  }

  const title = t(locale, mode === "create" ? "raceDay.setup.event.create" : "raceDay.setup.event.edit");
  const datesError = errorText("dates");

  return (
    <form
      ref={formRef}
      noValidate
      aria-label={title}
      onSubmit={handleSubmit}
      className="space-y-4 rounded-xl border border-slate-200 bg-white p-4"
    >
      <h3 className="text-lg font-semibold text-slate-900">{title}</h3>

      {errors.size > 0 ? <FormMessage tone="error">{t(locale, "raceDay.form.summaryError")}</FormMessage> : null}
      {submitErrorKey ? <FormMessage tone="error">{t(locale, submitErrorKey)}</FormMessage> : null}

      <TextField
        label={t(locale, "raceDay.form.event.name")}
        value={name}
        onChange={setName}
        error={errorText("name")}
        required
        disabled={saving}
      />

      <fieldset className="space-y-2" disabled={saving}>
        <legend className="text-sm font-medium text-slate-800">
          {t(locale, "raceDay.form.event.dates")}
          <span aria-hidden="true"> *</span>
        </legend>
        {dates.map((date, index) => (
          <div key={index} className="flex items-end gap-2">
            <div className="flex-1">
              <TextField
                label={t(locale, "raceDay.form.event.day", { n: index + 1 })}
                type="date"
                value={date}
                onChange={(next) => {
                  setDates((prev) => prev.map((d, i) => (i === index ? next : d)));
                }}
                invalid={datesError !== null}
                required
                disabled={saving}
              />
            </div>
            {dates.length > 1 ? (
              <button
                type="button"
                onClick={() => {
                  setDates((prev) => prev.filter((_, i) => i !== index));
                }}
                disabled={saving}
                className={SECONDARY_BUTTON}
              >
                {t(locale, "raceDay.form.event.removeDay", { n: index + 1 })}
              </button>
            ) : null}
          </div>
        ))}
        {datesError ? (
          <p role="alert" className="text-sm font-medium text-red-700">
            {datesError}
          </p>
        ) : null}
        {dates.length < RACE_DAY_LIMITS.eventDatesMax ? (
          <button
            type="button"
            onClick={() => {
              setDates((prev) => [...prev, ""]);
            }}
            disabled={saving}
            className={SECONDARY_BUTTON}
          >
            {t(locale, "raceDay.form.event.addDay")}
          </button>
        ) : null}
      </fieldset>

      <datalist id="race-day-time-zones">
        {TIME_ZONE_SUGGESTIONS.map((zone) => (
          <option key={zone} value={zone} />
        ))}
      </datalist>
      <TextField
        label={t(locale, "raceDay.form.event.timeZone")}
        hint={t(locale, "raceDay.form.event.timeZoneHint")}
        value={timeZone}
        onChange={setTimeZone}
        error={errorText("timeZone")}
        list="race-day-time-zones"
        disabled={saving}
      />
      <TextField
        label={t(locale, "raceDay.form.event.venue")}
        value={venue}
        onChange={setVenue}
        error={errorText("venue")}
        disabled={saving}
      />
      <TextField
        label={t(locale, "raceDay.form.sourceNote")}
        hint={t(locale, "raceDay.form.sourceNoteHint")}
        value={sourceNote}
        onChange={setSourceNote}
        error={errorText("sourceNote")}
        disabled={saving}
      />

      <div className="flex gap-3">
        <button type="submit" disabled={saving} className={PRIMARY_BUTTON}>
          {t(locale, saving ? "raceDay.common.saving" : "raceDay.common.save")}
        </button>
        {onCancel ? (
          <button type="button" onClick={onCancel} disabled={saving} className={SECONDARY_BUTTON}>
            {t(locale, "raceDay.common.cancel")}
          </button>
        ) : null}
      </div>
    </form>
  );
}
