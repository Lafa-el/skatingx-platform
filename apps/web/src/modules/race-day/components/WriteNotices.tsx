import { useLocale } from "@/hooks/useLocale";

import { t, type RaceDayMessageKey } from "../i18n/messages";

import { FormMessage, SECONDARY_BUTTON } from "./fields";

/**
 * The three things a write can tell the user outside its own form: a late server rejection,
 * "saved on this device only", and a failed one-click action (verify, delete).
 */
export function WriteNotices({
  syncFailed,
  onDismissSyncFailed,
  queued,
  actionErrorKey,
}: {
  syncFailed: boolean;
  onDismissSyncFailed: () => void;
  queued: boolean;
  actionErrorKey: RaceDayMessageKey | null;
}) {
  const locale = useLocale();
  return (
    <>
      {syncFailed ? (
        <div className="space-y-2">
          <FormMessage tone="error">{t(locale, "raceDay.state.syncFailed")}</FormMessage>
          <button type="button" className={SECONDARY_BUTTON} onClick={onDismissSyncFailed}>
            {t(locale, "raceDay.common.dismiss")}
          </button>
        </div>
      ) : null}
      {queued ? <FormMessage tone="info">{t(locale, "raceDay.state.queued")}</FormMessage> : null}
      {actionErrorKey ? <FormMessage tone="error">{t(locale, actionErrorKey)}</FormMessage> : null}
    </>
  );
}
