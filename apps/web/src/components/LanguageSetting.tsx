import { Card, ErrorNotice } from "@skatingx/ui";
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
  /**
   * The settings page draws this inside the preferences card. Standalone use keeps its own card.
   * The radios and the save callback do not change.
   */
  embedded?: boolean;
};

/** Chinese / English choice as native radio buttons, so arrow keys and screen readers just work. */
export function LanguageSetting({ language, disabled, failed, onChange, embedded = false }: LanguageSettingProps) {
  const name = useId();
  const descriptionId = `${name}-description`;
  const title = tSettings(language, "settings.language.title");

  const controls = (
    <>
      <fieldset disabled={disabled} aria-describedby={descriptionId}>
        <legend className="sr-only">{tSettings(language, "settings.language.title")}</legend>
        <p id={descriptionId} className="text-sm text-brand-navy/80">
          {tSettings(language, "settings.language.description")}
        </p>
        <div className="mt-3 flex gap-6">
          {OPTIONS.map((option) => {
            const id = `${name}-${option}`;
            return (
              <label
                key={option}
                htmlFor={id}
                className="flex min-h-11 cursor-pointer items-center gap-2 pr-2 text-sm font-medium text-brand-navy has-disabled:cursor-not-allowed"
              >
                <input
                  id={id}
                  type="radio"
                  name={name}
                  value={option}
                  checked={language === option}
                  onChange={() => {
                    onChange(option);
                  }}
                  className="h-5 w-5 border-brand-navy/50 accent-brand-flame focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-navy"
                />
                {tSettings(language, OPTION_LABEL[option])}
              </label>
            );
          })}
        </div>
      </fieldset>
      {failed ? (
        <ErrorNotice className="mt-3">{tSettings(language, "settings.language.error")}</ErrorNotice>
      ) : null}
    </>
  );

  if (embedded) {
    return (
      <div>
        <h4 className="text-sm font-semibold text-brand-navy">{title}</h4>
        {controls}
      </div>
    );
  }

  return (
    <Card variant="raised" title={title} className="mt-6">
      {controls}
    </Card>
  );
}
