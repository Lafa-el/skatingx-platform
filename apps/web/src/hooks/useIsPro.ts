import { useUserSettings } from "@/app/providers/FirestoreProvider";

/** Live PRO flag from Firestore `settings/main.isPro` (strict: must be `true`). */
export function useIsPro() {
  const { data: settings, loading, error } = useUserSettings();
  const isPro = settings?.isPro === true;
  const language: "zh" | "en" = settings?.language === "en" ? "en" : "zh";

  return { isPro, loading, error, language, settings };
}
