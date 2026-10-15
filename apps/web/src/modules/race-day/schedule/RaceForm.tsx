import type { RaceRosterEntry } from "@skatingx/schema";
import {
  instantToZonedDateTime,
  normalizeDistanceId,
  prepareRaceInput,
  RACE_DAY_LIMITS,
  zonedDateTimeToInstant,
  type RaceInput,
} from "@skatingx/skating-domain";
import { useRef, useState, type FormEvent } from "react";

import { useLocale } from "@/hooks/useLocale";

import {
  CheckboxField,
  FormMessage,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  SelectField,
  TextField,
} from "../components/fields";
import { t, type RaceDayMessageKey } from "../i18n/messages";
import { fieldErrorKeys } from "../lib/form-errors";
import { sortRosterEntries } from "../lib/roster";

type RaceFormProps = {
  mode: "create" | "edit";
  initial?: RaceInput;
  /** Days the event runs on, and its zone (null = unknown, so no specific time can be entered). */
  event: { dates: readonly string[]; timeZone: string | null };
  roster: readonly RaceRosterEntry[];
  defaultSortOrder: number;
  saving: boolean;
  submitErrorKey: RaceDayMessageKey | null;
  onSubmit: (values: RaceInput) => void;
  onCancel: () => void;
};

export function RaceForm({
  mode,
  initial,
  event,
  roster,
  defaultSortOrder,
  saving,
  submitErrorKey,
  onSubmit,
  onCancel,
}: RaceFormProps) {
  const locale = useLocale();
  const formRef = useRef<HTMLFormElement>(null);
  const { timeZone } = event;

  const [label, setLabel] = useState(initial?.label ?? "");
  const [day, setDay] = useState(initial?.day ?? "");
  const [time, setTime] = useState(() => {
    if (!initial?.scheduledAt || !timeZone) {
      return "";
    }
    return instantToZonedDateTime(initial.scheduledAt, timeZone)?.time ?? "";
  });
  const [round, setRound] = useState(initial?.round ?? "");
  const [heat, setHeat] = useState(initial?.heat ?? "");
  const [sortOrder, setSortOrder] = useState(String(initial?.sortOrder ?? defaultSortOrder));
  const [rosterIds, setRosterIds] = useState<string[]>(initial?.rosterIds ?? []);
  const [sourceNote, setSourceNote] = useState(initial?.sourceNote ?? "");
  const [errors, setErrors] = useState<Map<string, RaceDayMessageKey>>(new Map());

  const errorText = (field: string) => {
    const key = errors.get(field);
    return key ? t(locale, key) : null;
  };

  // Keep a day that is no longer one of the event's days selectable, so editing never drops it silently.
  const dayOptions = [
    { value: "", label: t(locale, "raceDay.form.race.dayUnknown") },
    ...[...new Set([...event.dates, ...(initial?.day ? [initial.day] : [])])].map((d) => ({
      value: d,
      label: d,
    })),
  ];

  function resolveScheduledAt(): { value: string | null; error: RaceDayMessageKey | null } {
    if (!timeZone) {
      // No zone: the time cannot be edited, so whatever was saved before is kept as is.
      return { value: initial?.scheduledAt ?? null, error: null };
    }
    if (time.trim() === "") {
      return { value: null, error: null };
    }
    if (day === "") {
      return { value: null, error: "raceDay.form.error.timeNeedsDay" };
    }
    const instant = zonedDateTimeToInstant(day, time.trim(), timeZone);
    return instant
      ? { value: instant, error: null }
      : { value: null, error: "raceDay.form.error.timeInvalid" };
  }

  function handleSubmit(submitEvent: FormEvent<HTMLFormElement>) {
    submitEvent.preventDefault();
    if (saving) {
      return;
    }
    const scheduled = resolveScheduledAt();
    const trimmedOrder = sortOrder.trim();
    const { value, errors: found } = prepareRaceInput({
      distanceId: normalizeDistanceId(label).slice(0, RACE_DAY_LIMITS.distanceId),
      label,
      sortOrder: trimmedOrder === "" ? defaultSortOrder : Number(trimmedOrder),
      day: day === "" ? null : day,
      round,
      heat,
      scheduledAt: scheduled.value,
      rosterIds,
      sourceNote,
    });

    const next = fieldErrorKeys(found);
    if (scheduled.error) {
      next.set("time", scheduled.error);
    }
    if (next.size > 0) {
      setErrors(next);
      queueMicrotask(() => {
        formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      });
      return;
    }
    setErrors(new Map());
    onSubmit(value);
  }

  function toggleAthlete(rosterId: string, checked: boolean) {
    setRosterIds((prev) =>
      checked ? [...prev.filter((id) => id !== rosterId), rosterId] : prev.filter((id) => id !== rosterId),
    );
  }

  const title = t(locale, mode === "create" ? "raceDay.schedule.add" : "raceDay.schedule.edit");
  const sortedRoster = sortRosterEntries(roster, locale);

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
        label={t(locale, "raceDay.form.race.label")}
        value={label}
        onChange={setLabel}
        error={errorText("label") ?? errorText("distanceId")}
        required
        disabled={saving}
      />

      <SelectField
        label={t(locale, "raceDay.form.race.day")}
        value={day}
        options={dayOptions}
        onChange={setDay}
        disabled={saving}
        error={errorText("day")}
      />

      <TextField
        label={t(locale, "raceDay.form.race.time")}
        type="time"
        value={time}
        onChange={setTime}
        error={errorText("time") ?? errorText("scheduledAt")}
        hint={
          timeZone
            ? t(locale, "raceDay.form.race.timeZoneIs", { zone: timeZone })
            : t(locale, "raceDay.form.race.timeNeedsZone")
        }
        disabled={saving || !timeZone}
      />

      <TextField
        label={t(locale, "raceDay.form.race.round")}
        value={round}
        onChange={setRound}
        error={errorText("round")}
        disabled={saving}
      />
      <TextField
        label={t(locale, "raceDay.form.race.heat")}
        value={heat}
        onChange={setHeat}
        error={errorText("heat")}
        disabled={saving}
      />
      <TextField
        label={t(locale, "raceDay.form.race.sortOrder")}
        value={sortOrder}
        onChange={setSortOrder}
        error={errorText("sortOrder")}
        inputMode="numeric"
        disabled={saving}
      />

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-slate-800">
          {t(locale, "raceDay.form.race.athletes")}
        </legend>
        {sortedRoster.length === 0 ? (
          <p className="text-sm text-slate-600">{t(locale, "raceDay.form.race.noRoster")}</p>
        ) : (
          sortedRoster.map((entry) => (
            <CheckboxField
              key={entry.rosterId}
              label={`${entry.displayName} (#${entry.bib})`}
              checked={rosterIds.includes(entry.rosterId)}
              onChange={(checked) => {
                toggleAthlete(entry.rosterId, checked);
              }}
              disabled={saving}
            />
          ))
        )}
        {errorText("rosterIds") ? (
          <p role="alert" className="text-sm font-medium text-red-700">
            {errorText("rosterIds")}
          </p>
        ) : null}
      </fieldset>

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
        <button type="button" onClick={onCancel} disabled={saving} className={SECONDARY_BUTTON}>
          {t(locale, "raceDay.common.cancel")}
        </button>
      </div>
    </form>
  );
}
