import { createTranslator, type Resources } from "@/shared/i18n/translator";

/**
 * The few Race Day strings the app shell needs before the module loads (bottom-nav label,
 * loading state). Kept separate from the module's full resource so the lazy chunk's text
 * does not enter the main bundle.
 */
const resources = {
  zh: {
    "raceDay.nav.title": "比赛日",
    "raceDay.state.loading": "加载中…",
  },
  en: {
    "raceDay.nav.title": "Race Day",
    "raceDay.state.loading": "Loading…",
  },
} satisfies Resources<"raceDay.nav.title" | "raceDay.state.loading">;

export type RaceDayCoreKey = keyof typeof resources.zh;

export const coreResources: Resources<RaceDayCoreKey> = resources;
export const tCore = createTranslator(coreResources);
