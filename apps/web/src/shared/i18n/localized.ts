import type { Locale } from "./translator";

/**
 * Picks the value written for the active language, for data that already carries both versions
 * (the Academy content has `titleZh` / `titleEn`). This is not for interface text: that belongs in
 * a message resource, so every key is checked for both languages.
 */
export function localized<T>(locale: Locale, values: { zh: T; en: T }): T {
  return locale === "en" ? values.en : values.zh;
}
