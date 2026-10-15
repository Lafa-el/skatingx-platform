import { useCallback, useState } from "react";

import type { RaceDayMessageKey } from "../i18n/messages";
import { logRaceDayError, saveErrorMessageKey } from "../lib/errors";
import type { WriteOutcome } from "../lib/write";

/**
 * Saving / error state for one form. `submit` returns the outcome on success and `null` on
 * failure (the message key is then in `errorKey`), so the caller decides what closes or stays.
 */
export function useSubmitState(operation: string) {
  const [saving, setSaving] = useState(false);
  const [errorKey, setErrorKey] = useState<RaceDayMessageKey | null>(null);

  const submit = useCallback(
    async (run: () => Promise<WriteOutcome>): Promise<WriteOutcome | null> => {
      setSaving(true);
      setErrorKey(null);
      try {
        return await run();
      } catch (error) {
        logRaceDayError(operation, error);
        setErrorKey(saveErrorMessageKey(error));
        return null;
      } finally {
        setSaving(false);
      }
    },
    [operation],
  );

  const reset = useCallback(() => {
    setErrorKey(null);
  }, []);

  return { saving, errorKey, submit, reset };
}
