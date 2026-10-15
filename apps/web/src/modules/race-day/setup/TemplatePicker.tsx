import { RACE_DAY_TEMPLATES, type RaceDayTemplate } from "@skatingx/skating-domain";

import { useLocale } from "@/hooks/useLocale";

import { FormMessage, PRIMARY_BUTTON } from "../components/fields";
import { t, type RaceDayMessageKey } from "../i18n/messages";

const TITLE_KEY: Record<string, RaceDayMessageKey> = {
  "buffalo-championships-2026": "raceDay.template.buffalo",
};

type TemplatePickerProps = {
  /** Event ids that already exist, so a template that was used is not offered again. */
  existingEventIds: ReadonlySet<string>;
  saving: boolean;
  submitErrorKey: RaceDayMessageKey | null;
  onApply: (template: RaceDayTemplate) => void;
};

export function TemplatePicker({ existingEventIds, saving, submitErrorKey, onApply }: TemplatePickerProps) {
  const locale = useLocale();

  return (
    <section aria-labelledby="race-day-templates" className="space-y-3">
      <h3 id="race-day-templates" className="text-lg font-semibold text-slate-900">
        {t(locale, "raceDay.template.title")}
      </h3>
      {submitErrorKey ? <FormMessage tone="error">{t(locale, submitErrorKey)}</FormMessage> : null}
      <ul className="space-y-3">
        {RACE_DAY_TEMPLATES.map((template) => {
          const titleKey = TITLE_KEY[template.eventId];
          const title = titleKey ? t(locale, titleKey) : template.event.name;
          const applied = existingEventIds.has(template.eventId);
          return (
            <li key={template.eventId} className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-base font-semibold text-slate-900">{title}</p>
              <p className="text-sm text-slate-600">{t(locale, "raceDay.template.description")}</p>
              {applied ? (
                <p className="text-sm font-medium text-slate-700">{t(locale, "raceDay.template.applied")}</p>
              ) : (
                <button
                  type="button"
                  disabled={saving}
                  className={PRIMARY_BUTTON}
                  onClick={() => {
                    onApply(template);
                  }}
                >
                  {t(locale, saving ? "raceDay.common.saving" : "raceDay.template.apply")}
                  <span className="sr-only"> {title}</span>
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
