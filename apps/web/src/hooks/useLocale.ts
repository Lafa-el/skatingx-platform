import { useIsPro } from "@/hooks/useIsPro";
import type { Locale } from "@/shared/i18n/translator";

/**
 * Current UI language from the user's settings (`settings/main.language`).
 * Defaults to Chinese while settings load, same as the rest of the app.
 */
export function useLocale(): Locale {
  return useIsPro().language;
}
