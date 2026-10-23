import type { ArchivedTaskDay } from "@skatingx/firebase-client";
import {
  deleteTaskHistoryDay,
  getFirestoreDb,
  subscribeToTaskHistoryMonth,
} from "@skatingx/firebase-client";
import { todayDateString } from "@skatingx/schema";
import { Button, Card } from "@skatingx/ui";
import { useEffect, useState } from "react";

import { useAuth } from "@/app/providers/AuthProvider";
import { useActiveAthlete, useGamification } from "@/app/providers/FirestoreProvider";
import { useLocale } from "@/hooks/useLocale";
import { useParentPinGuard } from "@/hooks/useParentPinGuard";
import {
  calendarCells,
  canShowNextMonth,
  completionCount,
  dayMark,
  monthDateBounds,
  monthFromDateId,
  resolveSelectedDate,
  shiftMonth,
  type HistoryMonth,
} from "@/modules/training/history/history-model";
import { PointsLedgerPanel } from "@/modules/training/history/PointsLedgerPanel";
import { formatCalendarDate } from "@/shared/i18n/format";
import type { Locale } from "@/shared/i18n/translator";
import {
  tTrainingHistory,
  type HistoryMessageKey,
} from "@/shared/i18n/training-history-messages";
import { logActionFailure } from "@/shared/utils/logActionFailure";

const WEEKDAYS: readonly HistoryMessageKey[] = [
  "training.history.weekday.mon",
  "training.history.weekday.tue",
  "training.history.weekday.wed",
  "training.history.weekday.thu",
  "training.history.weekday.fri",
  "training.history.weekday.sat",
  "training.history.weekday.sun",
];

const MONTH_TAG: Record<Locale, string> = { zh: "zh-CN", en: "en-US" };

type HistoryLane =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; days: readonly ArchivedTaskDay[] };

function monthTitle(month: HistoryMonth, locale: Locale): string {
  return new Intl.DateTimeFormat(MONTH_TAG[locale], { year: "numeric", month: "long" }).format(
    new Date(month.year, month.month - 1, 1),
  );
}

export function TrainingHistoryPage() {
  const locale = useLocale();
  const t = (key: HistoryMessageKey, params?: Record<string, string | number>) =>
    tTrainingHistory(locale, key, params);
  const { user, loading: authLoading } = useAuth();
  const { athleteId, loading: athleteLoading } = useActiveAthlete();
  const gamification = useGamification();
  const { guard, dialog } = useParentPinGuard();
  const db = getFirestoreDb();
  const today = todayDateString();
  const [visible, setVisible] = useState<HistoryMonth>(() => monthFromDateId(today) ?? { year: 2026, month: 10 });
  const [view, setView] = useState<"calendar" | "ledger">("calendar");
  const [picked, setPicked] = useState<string | null>(null);
  const [lane, setLane] = useState<HistoryLane>({ status: "loading" });
  const [retry, setRetry] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const [deleteFailed, setDeleteFailed] = useState(false);

  const bounds = monthDateBounds(visible);
  const uid = user?.uid ?? null;

  useEffect(() => {
    if (!uid || !db || athleteLoading) return;
    let active = true;
    setLane({ status: "loading" });
    const stop = subscribeToTaskHistoryMonth(
      db,
      uid,
      athleteId,
      bounds.start,
      bounds.end,
      (days) => {
        if (active) setLane({ status: "ready", days });
      },
      (error) => {
        logActionFailure("training-history", "read-month", error);
        if (active) setLane({ status: "error" });
      },
    );
    return () => {
      active = false;
      stop();
    };
  }, [uid, db, athleteId, athleteLoading, bounds.start, bounds.end, retry]);

  const ready = lane.status === "ready" && !gamification.loading && !gamification.error && !athleteLoading;
  const days = lane.status === "ready" ? lane.days : [];
  const archivedIds = days.map((day) => day.dateId);
  const selected = resolveSelectedDate(picked, visible, archivedIds, today);
  const selectedDay = days.find((day) => day.dateId === selected) ?? null;
  const completedDays = new Set(gamification.data?.completedDays ?? []);
  const archived = new Set(archivedIds);
  const showFailure = Boolean(gamification.error) || lane.status === "error";
  const showSkeleton =
    authLoading ||
    (Boolean(uid) && db !== null && (athleteLoading || gamification.loading || lane.status === "loading") && !showFailure);

  const removeDay = () => {
    if (!uid || !db || !selectedDay || deleting) return;
    guard("deleteTaskHistory", () => {
      if (!window.confirm(t("training.history.delete.confirm"))) return;
      setDeleting(true);
      setDeleteFailed(false);
      void deleteTaskHistoryDay(db, uid, athleteId, selectedDay.dateId)
        .catch((error: unknown) => {
          logActionFailure("training-history", "delete-day", error);
          setDeleteFailed(true);
        })
        .finally(() => {
          setDeleting(false);
        });
    });
  };

  const counts = completionCount(selectedDay?.tasks ?? []);

  return (
    <section>
      <h1 className="text-2xl font-bold text-brand-navy">{t("training.history.title")}</h1>
      <div className="mt-4 flex gap-2" role="group" aria-label={t("training.history.ledger.switch")}>
        <Button
          variant={view === "calendar" ? "brand" : "outline"}
          aria-pressed={view === "calendar"}
          onClick={() => setView("calendar")}
        >
          {t("training.history.ledger.calendar")}
        </Button>
        <Button
          variant={view === "ledger" ? "brand" : "outline"}
          aria-pressed={view === "ledger"}
          onClick={() => setView("ledger")}
        >
          {t("training.history.ledger.detail")}
        </Button>
      </div>
      <Card title={monthTitle(visible, locale)} className="mt-4">
        {uid && db ? (
          <div className="mb-3 flex items-center justify-between gap-2">
            <Button variant="outline" onClick={() => setVisible((month) => shiftMonth(month, -1))}>
              {t("training.history.month.previous")}
            </Button>
            <Button
              variant="outline"
              disabled={!canShowNextMonth(visible, today)}
              onClick={() => {
                if (!canShowNextMonth(visible, todayDateString())) return;
                setVisible((month) => shiftMonth(month, 1));
              }}
            >
              {t("training.history.month.next")}
            </Button>
          </div>
        ) : null}

        {view === "calendar" ? (
          showSkeleton ? (
            <div aria-busy="true">
              <p>{t("training.history.loading")}</p>
              <div className="mt-3 grid grid-cols-7 gap-1">
                {Array.from({ length: 35 }, (_, index) => (
                  <div key={index} className="h-11 animate-pulse rounded-control bg-brand-ice" />
                ))}
              </div>
            </div>
          ) : !uid ? (
            <p>{t("training.history.signedOut")}</p>
          ) : !db ? (
            <p>{t("training.history.unavailable")}</p>
          ) : showFailure ? (
            <div>
              <p>{t("training.history.error")}</p>
              <Button className="mt-3" variant="outline" onClick={() => setRetry((count) => count + 1)}>
                {t("training.history.retry")}
              </Button>
            </div>
          ) : (
            <div>
              <div className="grid grid-cols-7 gap-1 text-center text-xs text-brand-navy/70">
                {WEEKDAYS.map((key) => (
                  <div key={key} className="py-1">
                    {t(key)}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {calendarCells(visible).map((dateId, index) =>
                  dateId ? (
                    <button
                      key={dateId}
                      type="button"
                      aria-pressed={dateId === selected}
                      aria-label={t("training.history.day.button", {
                        date: formatCalendarDate(dateId, locale),
                        marks: dayButtonMarks(dateId, archived, completedDays, today, t),
                      })}
                      className={[
                        "flex min-h-11 flex-col items-center justify-center rounded-control text-brand-navy",
                        dayMark(dateId, archived, completedDays, today).fullAttendance
                          ? "bg-brand-flame font-semibold"
                          : dateId === selected
                            ? "bg-brand-ice"
                            : "",
                        dayMark(dateId, archived, completedDays, today).today ? "ring-2 ring-brand-navy" : "",
                      ].join(" ")}
                      onClick={() => {
                        setPicked(dateId);
                        setDeleteFailed(false);
                      }}
                    >
                      <span className="sx-numeric">{Number(dateId.slice(-2))}</span>
                      {dayMark(dateId, archived, completedDays, today).archived ? (
                        <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-brand-navy" />
                      ) : (
                        <span className="mt-0.5 h-1.5 w-1.5" />
                      )}
                    </button>
                  ) : (
                    <div key={`blank-${String(index)}`} className="min-h-11" />
                  ),
                )}
              </div>
              <p className="mt-3 flex items-center gap-2">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-brand-navy" />
                <span className="inline-block h-3 w-3 rounded-sm bg-brand-flame" />
                {t("training.history.legend")}
              </p>
            </div>
          )
        ) : !uid ? (
          <p>{t("training.history.signedOut")}</p>
        ) : !db ? (
          <p>{t("training.history.unavailable")}</p>
        ) : null}
      </Card>

      {view === "ledger" && uid && db ? (
        <PointsLedgerPanel
          db={db}
          userId={uid}
          athleteId={athleteId}
          month={visible}
          locale={locale}
          points={gamification.loading || gamification.error ? null : (gamification.data?.points ?? 0)}
          gamificationFailed={Boolean(gamification.error)}
        />
      ) : null}

      {view === "calendar" && ready && uid && db ? (
        <Card title={formatCalendarDate(selected, locale)} className="mt-4">
          {selectedDay ? (
            <div>
              <p className="font-semibold text-brand-navy">
                {t("training.history.summary", counts)}
              </p>
              <ul className="mt-3 space-y-2">
                {selectedDay.tasks.map((task) => (
                  <li key={task.id} className="flex items-start justify-between gap-3">
                    <span className="break-words text-brand-navy">{task.text}</span>
                    <span className="shrink-0 text-brand-navy/70">
                      {t(task.completed ? "training.history.task.done" : "training.history.task.open")}
                    </span>
                  </li>
                ))}
              </ul>
              {deleteFailed ? <p className="mt-3 text-status-danger">{t("training.history.delete.failed")}</p> : null}
              <Button className="mt-4" variant="danger-outline" disabled={deleting} onClick={removeDay}>
                {deleting ? t("training.history.delete.busy") : t("training.history.delete")}
              </Button>
            </div>
          ) : (
            <p>{t("training.history.empty")}</p>
          )}
        </Card>
      ) : null}
      {dialog}
    </section>
  );
}

function dayButtonMarks(
  dateId: string,
  archived: ReadonlySet<string>,
  completedDays: ReadonlySet<string>,
  today: string,
  t: (key: HistoryMessageKey) => string,
): string {
  const mark = dayMark(dateId, archived, completedDays, today);
  return [
    mark.today ? t("training.history.mark.today") : "",
    mark.archived ? t("training.history.mark.archived") : "",
    mark.fullAttendance ? t("training.history.mark.full") : "",
  ].join("");
}
