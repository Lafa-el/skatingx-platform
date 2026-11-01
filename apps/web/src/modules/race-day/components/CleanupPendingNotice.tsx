import { useLocale } from "@/hooks/useLocale";

import { useRaceRecordSyncState } from "../hooks/raceRecordSyncState";
import { t } from "../i18n/messages";

import { FormMessage, SECONDARY_BUTTON } from "./fields";

/**
 * After a delete that succeeded, the records sync is what removes the deleted race's results from
 * the records. If that sync has failed, the deleted race's results may still be there, so say so and
 * offer the same retry the Results page has. It shows only after a delete in this visit
 * (`deleteDone`) and only while the sync reports a failure; a clean run clears it.
 */
export function CleanupPendingNotice({ deleteDone }: { deleteDone: boolean }) {
  const locale = useLocale();
  const { failed, retry } = useRaceRecordSyncState();
  if (!deleteDone || !failed) {
    return null;
  }
  return (
    <div className="space-y-2" data-testid="records-cleanup-pending">
      <FormMessage tone="info">{t(locale, "raceDay.records.cleanupPending")}</FormMessage>
      <button type="button" className={SECONDARY_BUTTON} onClick={retry}>
        {t(locale, "raceDay.results.sync.retry")}
      </button>
    </div>
  );
}
