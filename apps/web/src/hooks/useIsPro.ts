import { useUserSettings } from "@/app/providers/FirestoreProvider";
import { toLocale } from "@/shared/i18n/translator";

/** Live PRO flag from Firestore `settings/main.isPro` (strict: must be `true`). */
export function useIsPro() {
  const { data: settings, loading, error } = useUserSettings();
  const isPro = settings?.isPro === true;
  const language = toLocale(settings?.language);

  return { isPro, loading, error, language, settings };
}
