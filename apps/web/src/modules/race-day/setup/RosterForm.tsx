import { prepareRosterEntryInput, type RosterEntryInput } from "@skatingx/skating-domain";
import { useRef, useState, type FormEvent } from "react";

import { useLocale } from "@/hooks/useLocale";

import {
  CheckboxField,
  FormMessage,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  TextField,
} from "../components/fields";
import { t, type RaceDayMessageKey } from "../i18n/messages";
import { fieldErrorKeys } from "../lib/form-errors";

type RosterFormProps = {
  mode: "create" | "edit";
  initial?: RosterEntryInput;
  /** Links the entry to the user's own athlete when "this is my athlete" is checked. */
  selfAthleteId: string;
  saving: boolean;
  submitErrorKey: RaceDayMessageKey | null;
  onSubmit: (values: RosterEntryInput) => void;
  onCancel: () => void;
};

export function RosterForm({
  mode,
  initial,
  selfAthleteId,
  saving,
  submitErrorKey,
  onSubmit,
  onCancel,
}: RosterFormProps) {
  const locale = useLocale();
  const formRef = useRef<HTMLFormElement>(null);

  const [displayName, setDisplayName] = useState(initial?.displayName ?? "");
  const [bib, setBib] = useState(initial?.bib ?? "");
  const [division, setDivision] = useState(initial?.division ?? "");
  const [isSelf, setIsSelf] = useState(initial?.isSelf ?? false);
  const [isFollowed, setIsFollowed] = useState(initial?.isFollowed ?? true);
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
    const { value, errors: found } = prepareRosterEntryInput({
      displayName,
      bib,
      division,
      isSelf,
      isFollowed,
      athleteRefId: isSelf ? selfAthleteId : null,
      sourceNote,
    });
    if (found.length > 0) {
      setErrors(fieldErrorKeys(found));
      // Wait for the error attributes to render, then move focus to the first problem.
      queueMicrotask(() => {
        formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      });
      return;
    }
    setErrors(new Map());
    onSubmit(value);
  }

  const title = t(locale, mode === "create" ? "raceDay.setup.roster.add" : "raceDay.setup.roster.edit");

  return (
    <form
      ref={formRef}
      noValidate
      aria-label={title}
      onSubmit={handleSubmit}
      className="space-y-4 rounded-card border border-brand-navy/10 bg-white p-4 shadow-card"
    >
      <h3 className="text-lg font-semibold text-brand-navy">{title}</h3>

      {errors.size > 0 ? <FormMessage tone="error">{t(locale, "raceDay.form.summaryError")}</FormMessage> : null}
      {submitErrorKey ? <FormMessage tone="error">{t(locale, submitErrorKey)}</FormMessage> : null}

      <TextField
        label={t(locale, "raceDay.form.roster.displayName")}
        value={displayName}
        onChange={setDisplayName}
        error={errorText("displayName")}
        required
        disabled={saving}
      />
      <TextField
        label={t(locale, "raceDay.form.roster.bib")}
        value={bib}
        onChange={setBib}
        error={errorText("bib")}
        required
        disabled={saving}
        inputMode="text"
      />
      <TextField
        label={t(locale, "raceDay.form.roster.division")}
        value={division}
        onChange={setDivision}
        error={errorText("division")}
        required
        disabled={saving}
      />
      <CheckboxField
        label={t(locale, "raceDay.form.roster.isSelf")}
        checked={isSelf}
        onChange={setIsSelf}
        disabled={saving}
      />
      <CheckboxField
        label={t(locale, "raceDay.form.roster.isFollowed")}
        checked={isFollowed}
        onChange={setIsFollowed}
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
        <button type="button" onClick={onCancel} disabled={saving} className={SECONDARY_BUTTON}>
          {t(locale, "raceDay.common.cancel")}
        </button>
      </div>
    </form>
  );
}
