/**
 * Minimal typed translator for modules that use the unified i18n layer (AGENTS.md:
 * zh/en text lives in resources keyed by domain, never inline in components).
 *
 * Keys are domain-named (`raceDay.tab.schedule`), not English sentences. The `en` resource
 * must have exactly the keys of `zh`; a missing key is a compile error, not a blank label.
 */

export type Locale = "zh" | "en";

export type TranslationParams = Record<string, string | number>;

export type Resources<K extends string> = {
  zh: Record<K, string>;
  en: Record<K, string>;
};

/** Settings store `language` as free data; anything other than "en" means Chinese (the app default). */
export function toLocale(value: unknown): Locale {
  return value === "en" ? "en" : "zh";
}

export function createTranslator<K extends string>(resources: Resources<K>) {
  return function translate(locale: Locale, key: K, params?: TranslationParams): string {
    const template = resources[locale][key];
    if (!params) {
      return template;
    }
    // An unknown placeholder is left visible ("{name}") so the mistake shows up in review
    // instead of silently rendering an empty string.
    return template.replace(/\{(\w+)\}/g, (match, name: string) => {
      const value = params[name];
      return value === undefined ? match : String(value);
    });
  };
}
