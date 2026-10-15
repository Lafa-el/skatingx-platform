import { getFirestoreDb, updateUserSettings } from "@skatingx/firebase-client";
import { useCallback, useState } from "react";

import { useAuth } from "@/app/providers/AuthProvider";
import { useIsPro } from "@/hooks/useIsPro";
import type { Locale } from "@/shared/i18n/translator";

/**
 * Reads and writes `settings/main.language`.
 *
 * The write is deliberately not awaited: with offline persistence Firestore answers only after the
 * server does, and a settings control that freezes on a weak connection is worse than none. The
 * live settings listener already reflects the local write, so the screen changes language at once;
 * if the server later refuses it the listener reverts and `failed` tells the user.
 */
export function useLanguageSetting(): {
  language: Locale;
  disabled: boolean;
  failed: boolean;
  setLanguage: (next: Locale) => void;
} {
  const { uid } = useAuth();
  const { language, loading } = useIsPro();
  const [failed, setFailed] = useState(false);

  const setLanguage = useCallback(
    (next: Locale) => {
      if (!uid || next === language) {
        return;
      }
      const db = getFirestoreDb();
      if (!db) {
        setFailed(true);
        return;
      }
      setFailed(false);
      updateUserSettings(db, uid, { language: next }).catch((error: unknown) => {
        // Code only: an error message can carry document paths.
        const code =
          typeof error === "object" && error !== null && "code" in error
            ? String((error as { code: unknown }).code)
            : "none";
        console.error("[settings] saving the language failed", { code });
        setFailed(true);
      });
    },
    [uid, language],
  );

  return { language, disabled: !uid || loading, failed, setLanguage };
}
