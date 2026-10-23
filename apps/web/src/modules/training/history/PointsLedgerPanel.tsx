import type { PointsLedgerRow } from "@skatingx/firebase-client";
import { readPointsLedgerMonth, readPointsLedgerOpening, readPointsLedgerTotal } from "@skatingx/firebase-client";
import type { PointsLedgerReason } from "@skatingx/schema";
import type { PlanFocus } from "@skatingx/skating-domain";
import { Button, Card } from "@skatingx/ui";
import type { Firestore } from "firebase/firestore";
import { useEffect, useState } from "react";

import { formatCalendarDate } from "@/shared/i18n/format";
import { tTrainingHistory, type HistoryMessageKey } from "@/shared/i18n/training-history-messages";
import type { Locale } from "@/shared/i18n/translator";
import { logActionFailure } from "@/shared/utils/logActionFailure";

import { monthDateBounds, type HistoryMonth } from "./history-model";
import { groupLedgerMonth, planLedgerNote, reconcilePoints, type LedgerWeekday } from "./ledger-model";

const TAG: Record<Locale, string> = { zh: "zh-CN", en: "en-US" };

const REASON_KEY: Record<PointsLedgerReason, HistoryMessageKey> = {
  "task-complete": "training.history.ledger.reason.taskComplete",
  "task-uncomplete": "training.history.ledger.reason.taskUncomplete",
  "task-delete": "training.history.ledger.reason.taskDelete",
  "daily-bonus-add": "training.history.ledger.reason.dailyBonusAdd",
  "daily-bonus-remove": "training.history.ledger.reason.dailyBonusRemove",
  "plan-checkin": "training.history.ledger.reason.planCheckin",
  "plan-uncheckin": "training.history.ledger.reason.planUncheckin",
  "reward-redeem": "training.history.ledger.reason.rewardRedeem",
  "history-delete": "training.history.ledger.reason.historyDelete",
  "opening-balance": "training.history.ledger.reason.openingBalance",
};

const FOCUS_KEY: Record<PlanFocus, HistoryMessageKey> = {
  lean: "training.history.ledger.focus.lean",
  bounce: "training.history.ledger.focus.bounce",
  endurance: "training.history.ledger.focus.endurance",
};

const WEEKDAY_KEY: Record<LedgerWeekday, HistoryMessageKey> = {
  mon: "training.history.ledger.weekday.mon",
  tue: "training.history.ledger.weekday.tue",
  wed: "training.history.ledger.weekday.wed",
  thu: "training.history.ledger.weekday.thu",
  fri: "training.history.ledger.weekday.fri",
  sat: "training.history.ledger.weekday.sat",
  sun: "training.history.ledger.weekday.sun",
};

type LedgerLane =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; total: number; opening: number; events: readonly PointsLedgerRow[] };

type PointsLedgerPanelProps = {
  db: Firestore;
  userId: string;
  athleteId: string;
  month: HistoryMonth;
  locale: Locale;
  /** Null while the page's existing points subscription is still loading. */
  points: number | null;
  gamificationFailed: boolean;
};

function formatPlain(value: number, locale: Locale): string {
  return new Intl.NumberFormat(TAG[locale], { maximumFractionDigits: 2 }).format(value);
}

function formatSigned(value: number, locale: Locale): string {
  return new Intl.NumberFormat(TAG[locale], { maximumFractionDigits: 2, signDisplay: "exceptZero" }).format(value);
}

/**
 * All-time reconciliation plus the selected month of the ledger. Reads only.
 * Points come from the subscription the history page already holds.
 */
export function PointsLedgerPanel({
  db,
  userId,
  athleteId,
  month,
  locale,
  points,
  gamificationFailed,
}: PointsLedgerPanelProps) {
  const t = (key: HistoryMessageKey, params?: Record<string, string | number>) => tTrainingHistory(locale, key, params);
  const [lane, setLane] = useState<LedgerLane>({ status: "loading" });
  const [retry, setRetry] = useState(0);
  const bounds = monthDateBounds(month);

  useEffect(() => {
    let active = true;
    setLane({ status: "loading" });
    void Promise.all([
      readPointsLedgerTotal(db, userId, athleteId),
      readPointsLedgerOpening(db, userId, athleteId),
      readPointsLedgerMonth(db, userId, athleteId, bounds.start, bounds.end),
    ])
      .then(([total, opening, events]) => {
        if (active) setLane({ status: "ready", total, opening, events });
      })
      .catch((error: unknown) => {
        logActionFailure("training-history", "read-ledger", error);
        if (active) setLane({ status: "error" });
      });
    return () => {
      active = false;
    };
  }, [db, userId, athleteId, bounds.start, bounds.end, retry]);

  const failed = gamificationFailed || lane.status === "error";

  if (failed) {
    return (
      <Card title={t("training.history.ledger.reconcile")} className="mt-4">
        <p>{t("training.history.ledger.error")}</p>
        <Button className="mt-3" variant="outline" onClick={() => setRetry((count) => count + 1)}>
          {t("training.history.ledger.retry")}
        </Button>
      </Card>
    );
  }

  if (points === null || lane.status !== "ready") {
    return (
      <Card title={t("training.history.ledger.reconcile")} className="mt-4">
        <div aria-busy="true">
          <p>{t("training.history.ledger.loading")}</p>
          <div className="mt-3 h-16 animate-pulse rounded-control bg-brand-ice" />
        </div>
      </Card>
    );
  }

  const reconciliation = reconcilePoints(points, lane.total, lane.opening);
  const days = groupLedgerMonth(lane.events, month);

  return (
    <>
      <Card title={t("training.history.ledger.reconcile")} className="mt-4">
        <dl className="grid gap-2">
          <div className="flex items-baseline justify-between gap-3">
            <dt>{t("training.history.ledger.points")}</dt>
            <dd className="sx-numeric text-brand-navy">{formatPlain(reconciliation.points, locale)}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <dt>{t("training.history.ledger.opening")}</dt>
            <dd className="sx-numeric text-brand-navy">{formatSigned(reconciliation.opening, locale)}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <dt>{t("training.history.ledger.net")}</dt>
            <dd className="sx-numeric text-brand-navy">{formatSigned(reconciliation.net, locale)}</dd>
          </div>
        </dl>
        <p className="mt-3">{t("training.history.ledger.formula")}</p>
        {reconciliation.gap !== 0 ? (
          <p className="mt-2 font-semibold text-brand-navy">
            {t("training.history.ledger.gap", { amount: formatSigned(reconciliation.gap, locale) })}
          </p>
        ) : null}
      </Card>
      <Card title={t("training.history.ledger.month")} className="mt-4">
        {days.length === 0 ? (
          <p>{t("training.history.ledger.empty")}</p>
        ) : (
          <div className="grid gap-4">
            {days.map((day) => (
              <section key={day.dateId}>
                <div className="flex items-baseline justify-between gap-3">
                  <h4 className="font-semibold text-brand-navy">{formatCalendarDate(day.dateId, locale)}</h4>
                  <p className="sx-numeric">{t("training.history.ledger.subtotal", { amount: formatSigned(day.subtotal, locale) })}</p>
                </div>
                <ul className="mt-2 grid gap-1">
                  {day.events.map((event) => (
                    <li key={event.id} className="flex items-baseline justify-between gap-3">
                      <span className="break-words text-brand-navy">{eventLabel(event, t)}</span>
                      <span className="sx-numeric shrink-0">{formatSigned(event.delta, locale)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}

function eventLabel(
  event: PointsLedgerRow,
  t: (key: HistoryMessageKey, params?: Record<string, string | number>) => string,
): string {
  const reason = t(REASON_KEY[event.reason]);
  const note = planLedgerNote(event.reason, event.refId);
  if (!note) return reason;
  return t("training.history.ledger.planLine", {
    reason,
    note: t("training.history.ledger.planNote", {
      focus: t(FOCUS_KEY[note.focus]),
      weekday: t(WEEKDAY_KEY[note.weekday]),
    }),
  });
}
