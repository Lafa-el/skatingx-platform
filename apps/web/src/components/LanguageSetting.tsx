import { Card } from "@skatingx/ui";
import { useId } from "react";

import { tSettings, type SettingsMessageKey } from "@/shared/i18n/settings-messages";
import type { Locale } from "@/shared/i18n/translator";

const OPTIONS: Locale[] = ["zh", "en"];

/** Each option names its own language, so the label is looked up by option, never chosen by a comparison. */
const OPTION_LABEL: Record<Locale, SettingsMessageKey> = {
  zh: "settings.language.option.zh",
  en: "settings.language.option.en",
};

type LanguageSettingProps = {
  language: Locale;
  disabled: boolean;
  failed: boolean;
  onChange: (next: Locale) => void;
};

/** Chinese / English choice as native radio buttons, so arrow keys and screen readers just work. */
export function LanguageSetting({ language, disabled, failed, onChange }: LanguageSettingProps) {
  const name = useId();
  const descriptionId = `${name}-description`;

  return (
    <Card title={tSettings(language, "settings.language.title")} className="mt-6">
      <fieldset disabled={disabled} aria-describedby={descriptionId}>
        <legend className="sr-only">{tSettings(language, "settings.language.title")}</legend>
        <p id={descriptionId} className="text-sm text-slate-600">
          {tSettings(language, "settings.language.description")}
        </p>
        <div className="mt-3 flex gap-6">
          {OPTIONS.map((option) => {
            const id = `${name}-${option}`;
            return (
              <div key={option} className="flex items-center gap-2">
                <input
                  id={id}
                  type="radio"
                  name={name}
                  value={option}
                  checked={language === option}
                  onChange={() => {
                    onChange(option);
                  }}
                  className="h-5 w-5 border-slate-300 text-sky-700 focus:ring-sky-300"
                />
                <label htmlFor={id} className="text-sm font-medium text-slate-900">
                  {tSettings(language, OPTION_LABEL[option])}
                </label>
              </div>
            );
          })}
        </div>
      </fieldset>
      {failed ? (
        <p
          role="alert"
          className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          {tSettings(language, "settings.language.error")}
        </p>
      ) : null}
    </Card>
  );
}
