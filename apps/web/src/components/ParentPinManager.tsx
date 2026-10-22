import { getFirestoreDb, updateUserSettings } from "@skatingx/firebase-client";
import { Button, ErrorNotice } from "@skatingx/ui";
import { FormEvent, useState } from "react";

import { useAuth } from "@/app/providers/AuthProvider";
import { useUserSettings } from "@/app/providers/FirestoreProvider";
import { useLocale } from "@/hooks/useLocale";
import { type SettingsPageMessageKey, tSettingsPage } from "@/shared/i18n/settings-page-messages";
import {
  PARENT_PIN_LENGTH,
  createParentPinSalt,
  hashParentPin,
  parentPinConfigured,
  parentPinMatches,
  parentPinShapeOk,
  writeParentPinUnlock,
} from "@/shared/parentPin";

function PinField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-sm" htmlFor={id}>
      <span className="font-medium text-brand-navy">{label}</span>
      <input
        id={id}
        type="password"
        inputMode="numeric"
        autoComplete="off"
        maxLength={PARENT_PIN_LENGTH}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 min-h-11 w-full rounded-control border border-brand-navy/50 px-3 py-2 text-brand-navy focus:border-brand-navy focus:outline-none focus:ring-2 focus:ring-brand-flame"
      />
    </label>
  );
}

export function ParentPinManager() {
  const locale = useLocale();
  const t = (key: SettingsPageMessageKey) => tSettingsPage(locale, key);
  const { uid } = useAuth();
  const { data: settings, loading, error } = useUserSettings();
  const configured = parentPinConfigured(settings?.parentPinHash, settings?.parentPinSalt);
  const [editing, setEditing] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [formError, setFormError] = useState<SettingsPageMessageKey | null>(null);

  if (loading || error) {
    return null;
  }

  function clearFields() {
    setCurrent("");
    setNext("");
    setAgain("");
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaved(false);
    setFormError(null);
    if (!uid) {
      setFormError("settings.pin.saveFailed");
      return;
    }
    const db = getFirestoreDb();
    if (!db) {
      setFormError("settings.pin.saveFailed");
      return;
    }
    if (!parentPinShapeOk(next) || !parentPinShapeOk(again)) {
      setFormError("settings.pin.invalid");
      return;
    }
    if (next !== again) {
      setFormError("settings.pin.mismatch");
      return;
    }
    const enteredNext = next;
    const enteredCurrent = current;
    if (configured) {
      const hash = settings?.parentPinHash;
      const salt = settings?.parentPinSalt;
      if (typeof hash !== "string" || typeof salt !== "string" || !(await parentPinMatches(enteredCurrent, hash, salt))) {
        setFormError("settings.pin.wrong");
        setCurrent("");
        return;
      }
    }
    const parentPinSalt = createParentPinSalt();
    const parentPinHash = await hashParentPin(parentPinSalt, enteredNext);
    clearFields();
    setBusy(true);
    try {
      await updateUserSettings(db, uid, { parentPinHash, parentPinSalt });
      writeParentPinUnlock(sessionStorage, uid);
      setEditing(false);
      setSaved(true);
    } catch (caught) {
      const code =
        typeof caught === "object" && caught !== null && "code" in caught
          ? String((caught as { code: unknown }).code)
          : "none";
      console.error("[settings] saving the parent PIN failed", { code });
      setFormError("settings.pin.saveFailed");
    } finally {
      setBusy(false);
    }
  }

  const bothFilled = next.length > 0 && again.length > 0;
  const canSave = parentPinShapeOk(next) && next === again && (!configured || parentPinShapeOk(current));

  return (
    <div className="mt-4 grid gap-2">
      {configured ? null : <p className="text-sm text-brand-navy/80">{t("settings.pin.suggest")}</p>}
      {saved ? <p className="text-sm font-medium text-brand-navy">{t("settings.pin.saved")}</p> : null}
      {editing ? (
        <form className="grid gap-3" onSubmit={(event) => void save(event)}>
          {configured ? (
            <PinField id="parent-pin-current" label={t("settings.pin.current")} value={current} onChange={setCurrent} />
          ) : null}
          <PinField id="parent-pin-next" label={t("settings.pin.next")} value={next} onChange={setNext} />
          <PinField id="parent-pin-again" label={t("settings.pin.again")} value={again} onChange={setAgain} />
          {bothFilled && next !== again ? <ErrorNotice>{t("settings.pin.mismatch")}</ErrorNotice> : null}
          {formError && formError !== "settings.pin.mismatch" ? <ErrorNotice>{t(formError)}</ErrorNotice> : null}
          <Button type="submit" variant="brand" disabled={busy || !canSave}>
            {busy ? t("settings.pin.saving") : t("settings.pin.save")}
          </Button>
        </form>
      ) : (
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setSaved(false);
            setFormError(null);
            clearFields();
            setEditing(true);
          }}
        >
          {t(configured ? "settings.pin.change" : "settings.pin.set")}
        </Button>
      )}
    </div>
  );
}
