import { FormEvent, useEffect, useId, useState } from "react";

import { Button } from "@skatingx/ui";

import { useLocale } from "@/hooks/useLocale";
import { tSettingsPage } from "@/shared/i18n/settings-page-messages";
import { PARENT_PIN_LENGTH } from "@/shared/parentPin";

type ParentPinDialogProps = {
  open: boolean;
  wrong: boolean;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (pin: string) => void;
};

export function ParentPinDialog({ open, wrong, busy, onCancel, onSubmit }: ParentPinDialogProps) {
  const locale = useLocale();
  const t = (key: Parameters<typeof tSettingsPage>[1]) => tSettingsPage(locale, key);
  const titleId = useId();
  const helpId = useId();
  const inputId = useId();
  const [pin, setPin] = useState("");

  useEffect(() => {
    if (!open) {
      setPin("");
    }
  }, [open]);

  if (!open) {
    return null;
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const entered = pin;
    setPin("");
    onSubmit(entered);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-brand-navy/40 p-4 sm:items-center"
      onClick={onCancel}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          onCancel();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={helpId}
        className="w-full max-w-sm rounded-card bg-white p-4 shadow-card"
        onClick={(event) => event.stopPropagation()}
      >
        <form className="grid gap-3" onSubmit={submit}>
          <h2 id={titleId} className="text-lg font-semibold text-brand-navy">
            {t("settings.pin.dialogTitle")}
          </h2>
          <p id={helpId} className="text-sm text-brand-navy/80">
            {t("settings.pin.dialogHelp")}
          </p>
          <label className="block text-sm" htmlFor={inputId}>
            <span className="font-medium text-brand-navy">{t("settings.pin.dialogLabel")}</span>
            <input
              id={inputId}
              type="password"
              inputMode="numeric"
              autoComplete="off"
              maxLength={PARENT_PIN_LENGTH}
              autoFocus
              value={pin}
              onChange={(event) => setPin(event.target.value)}
              className="mt-1 min-h-11 w-full rounded-control border border-brand-navy/50 px-3 py-2 text-brand-navy focus:border-brand-navy focus:outline-none focus:ring-2 focus:ring-brand-flame"
            />
          </label>
          {wrong ? (
            <p role="alert" className="text-sm font-medium text-status-danger">
              {t("settings.pin.wrong")}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="brand" disabled={busy || pin.length !== PARENT_PIN_LENGTH}>
              {t("settings.pin.verify")}
            </Button>
            <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>
              {t("settings.pin.cancel")}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
