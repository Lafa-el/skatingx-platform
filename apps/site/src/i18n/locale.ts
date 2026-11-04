import type { SiteLocale } from "./messages";

const STORAGE_KEY = "skatingx.site.locale";

export function localeFromBrowser(language: string): SiteLocale {
  return language.toLowerCase().startsWith("zh") ? "zh" : "en";
}

export function readSiteLocale(): SiteLocale {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === "zh" || saved === "en") {
      return saved;
    }
  } catch (error) {
    console.warn("site-locale-read", error);
  }
  return localeFromBrowser(window.navigator.language || "");
}

export function storeSiteLocale(locale: SiteLocale): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, locale);
  } catch (error) {
    console.warn("site-locale-write", error);
  }
}
