import { DEFAULT_TRAINING_DISTANCES } from "@skatingx/schema";
import { formatResultTime, type ResultSyncInfo, type ResultSyncStatus } from "@skatingx/skating-domain";
import { Notice } from "@skatingx/ui";
import { useState, type ReactNode } from "react";

import { useLocale } from "@/hooks/useLocale";

import { VerificationBadge } from "../components/VerificationBadge";
import { DANGER_BUTTON, FormMessage, SECONDARY_BUTTON } from "../components/fields";
import { t, type RaceDayMessageKey } from "../i18n/messages";
import type { ResultView } from "../lib/results";

type ResultListProps = {
  views: readonly ResultView[];
  busy: boolean;
  onEdit: (view: ResultView) => void;
  onSetVerified: (view: ResultView, verified: boolean) => void;
  onDelete: (view: ResultView) => void;
  /**
   * What each row can say about the records sync, by result id (design 2.a). Optional: without it
   * the list is exactly what it was before.
   */
  sync?: ReadonlyMap<string, ResultSyncInfo>;
  /** The sync's last run failed (in memory only). A row that is waiting then offers a retry. */
  syncFailed?: boolean;
  onRetrySync?: () => void;
};

const NO_SYNC: ReadonlyMap<string, ResultSyncInfo> = new Map();

const NOT_RECORDED_KEY: Record<"unmapped-distance" | "no-date" | "no-athlete", RaceDayMessageKey> = {
  "unmapped-distance": "raceDay.results.sync.unmappedDistance",
  "no-date": "raceDay.results.sync.noDate",
  "no-athlete": "raceDay.results.sync.noAthlete",
};

/** The record's own name for a distance ("500m", "1500m"); an unknown id is shown as it is. */
function recordDistanceName(distanceId: string): string {
  return DEFAULT_TRAINING_DISTANCES.find((distance) => distance.distanceId === distanceId)?.label ?? distanceId;
}

/** The results feed: newest change first. Every row carries its own verification marker. */
export function ResultList({
  views,
  busy,
  onEdit,
  onSetVerified,
  onDelete,
  sync = NO_SYNC,
  syncFailed = false,
  onRetrySync,
}: ResultListProps) {
  const locale = useLocale();
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  return (
    // Polite live region: a result entered on another device is announced without stealing focus.
    <ul aria-live="polite" aria-relevant="additions" className="space-y-3">
      {views.map((view) => {
        const { result, race, raceNumber, athlete } = view;
        const confirming = confirmingId === result.resultId;
        const verified = result.verification === "verified";
        const raceName = race
          ? `${raceNumber === null ? "" : `#${String(raceNumber)} `}${race.label}`
          : t(locale, "raceDay.results.item.unknownRace");
        const athleteName = athlete?.displayName ?? t(locale, "raceDay.results.item.unknownAthlete");
        const suffix = <span className="sr-only"> {`${raceName} ${athleteName}`}</span>;
        const info = sync.get(result.resultId);
        const hintId = `result-sync-hint-${result.resultId}`;
        const showConfirmHint = !verified && !confirming && info?.confirmHint === true;

        return (
          <li key={result.resultId} className="rounded-card border border-brand-navy/10 bg-white p-4 shadow-card">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-base font-semibold text-brand-navy min-w-0 break-words">{athleteName}</span>
              {athlete ? <span className="text-sm text-brand-navy/70">#{athlete.bib}</span> : null}
              <VerificationBadge verification={result.verification} />
            </div>
            <p className="mt-1 text-sm text-brand-navy/70">{raceName}</p>

            <p className="mt-2 flex flex-wrap items-baseline gap-x-3 text-brand-navy">
              {result.status === "finished" && result.timeSeconds !== null ? (
                <span className="sx-numeric text-xl">{formatResultTime(result.timeSeconds)}</span>
              ) : (
                <span className="text-base font-semibold">{t(locale, `raceDay.results.status.${result.status}`)}</span>
              )}
              {result.place !== null ? (
                <span className="text-sm">{t(locale, "raceDay.results.item.place", { place: result.place })}</span>
              ) : null}
              {result.advanced === true ? (
                <span className="text-sm">{t(locale, "raceDay.results.advanced.yes")}</span>
              ) : null}
              {result.advanced === false ? (
                <span className="text-sm">{t(locale, "raceDay.results.advanced.no")}</span>
              ) : null}
            </p>

            {race && !view.athleteInRace ? (
              <Notice tone="pending" className="mt-2">
                {t(locale, "raceDay.results.item.removedFromRace")}
              </Notice>
            ) : null}
            {result.sourceNote ? <p className="mt-1 text-sm text-brand-navy/70">{result.sourceNote}</p> : null}
            {verified && info?.status ? (
              <SyncLine status={info.status} failed={syncFailed} busy={busy} onRetry={onRetrySync} suffix={suffix} />
            ) : null}

            <div className="mt-3 flex flex-wrap gap-2">
              {confirming ? (
                <>
                  <div className="w-full">
                    <FormMessage tone="error">{t(locale, "raceDay.results.item.deleteWarning")}</FormMessage>
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    className={DANGER_BUTTON}
                    onClick={() => {
                      setConfirmingId(null);
                      onDelete(view);
                    }}
                  >
                    {t(locale, "raceDay.common.confirmDelete")}
                    {suffix}
                  </button>
                  <button
                    type="button"
                    className={SECONDARY_BUTTON}
                    onClick={() => {
                      setConfirmingId(null);
                    }}
                  >
                    {t(locale, "raceDay.common.cancel")}
                  </button>
                </>
              ) : (
                <>
                  {race ? (
                    <button
                      type="button"
                      disabled={busy}
                      className={SECONDARY_BUTTON}
                      onClick={() => {
                        onEdit(view);
                      }}
                    >
                      {t(locale, "raceDay.common.edit")}
                      {suffix}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    disabled={busy}
                    className={SECONDARY_BUTTON}
                    aria-describedby={showConfirmHint ? hintId : undefined}
                    onClick={() => {
                      onSetVerified(view, !verified);
                    }}
                  >
                    {t(
                      locale,
                      verified ? "raceDay.verification.markPending" : "raceDay.verification.markVerified",
                    )}
                    {suffix}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    className={SECONDARY_BUTTON}
                    onClick={() => {
                      setConfirmingId(result.resultId);
                    }}
                  >
                    {t(locale, "raceDay.common.delete")}
                    {suffix}
                  </button>
                </>
              )}
            </div>
            {showConfirmHint ? (
              <p id={hintId} className="mt-2 text-sm text-brand-navy/70">
                {t(locale, "raceDay.results.sync.confirmHint")}
              </p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * One small line on a confirmed row. "Waiting" turns into a retry prompt only when the sync
 * actually failed; offline or just-confirmed rows stay "waiting" so they are not mistaken for a fault.
 */
function SyncLine({
  status,
  failed,
  busy,
  onRetry,
  suffix,
}: {
  status: ResultSyncStatus;
  failed: boolean;
  busy: boolean;
  onRetry: (() => void) | undefined;
  suffix: ReactNode;
}) {
  const locale = useLocale();
  const quiet = "mt-1 text-sm text-brand-navy/70";

  if (status.kind === "recorded") {
    return (
      <p className={quiet} data-sync="recorded">
        {t(locale, "raceDay.results.sync.recorded", { distance: recordDistanceName(status.recordDistanceId) })}
      </p>
    );
  }
  if (status.kind === "waiting") {
    if (failed && onRetry) {
      return (
        <div role="status" data-sync="failed" className="mt-2 flex flex-wrap items-center gap-2 text-sm text-brand-navy">
          <span>{t(locale, "raceDay.results.sync.failed")}</span>
          <button type="button" disabled={busy} className={SECONDARY_BUTTON} onClick={onRetry}>
            {t(locale, "raceDay.results.sync.retry")}
            {suffix}
          </button>
        </div>
      );
    }
    return (
      <p className={quiet} data-sync="waiting">
        {t(locale, "raceDay.results.sync.waiting")}
      </p>
    );
  }
  return (
    <p className={quiet} data-sync={status.kind}>
      {t(locale, NOT_RECORDED_KEY[status.kind])}
    </p>
  );
}
