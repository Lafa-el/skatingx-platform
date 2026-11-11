import {
  COACH_NOTE_TAGS,
  getCamp,
  getFirestoreDb,
  subscribeToCoachNotes,
  subscribeToJournal,
  type CampRecord,
  type CoachNoteSnapshot,
  type JournalSnapshot,
} from "@skatingx/firebase-client";
import { DEFAULT_TRAINING_DISTANCES } from "@skatingx/schema";
import { deriveCampStats, formatResultTime } from "@skatingx/skating-domain";
import { Button, ErrorNotice } from "@skatingx/ui";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { useAuth } from "@/app/providers/AuthProvider";
import { useTrainingRecords } from "@/hooks/useTrainingRecords";
import { useLocale } from "@/hooks/useLocale";
import { tAnalysis, type AnalysisMessageKey } from "@/shared/i18n/analysis-messages";
import { formatCalendarDate } from "@/shared/i18n/format";
import { tJournal, type JournalMessageKey } from "@/shared/i18n/journal-messages";
import { logActionFailure } from "@/shared/utils/logActionFailure";

const LINK_CLASS =
  "inline-flex min-h-11 items-center text-sm font-semibold text-brand-navy underline underline-offset-2";

const ISSUE_LABEL: Record<string, JournalMessageKey> = {
  corner_entry: "journal.coachNotes.tag.cornerEntry",
  corner_drift: "journal.coachNotes.tag.cornerDrift",
  high_center_of_gravity: "journal.coachNotes.tag.highCenterOfGravity",
  right_leg_support: "journal.coachNotes.tag.rightLegSupport",
  exit_angle: "journal.coachNotes.tag.exitAngle",
  straightaway_bouncing: "journal.coachNotes.tag.straightawayBouncing",
  incomplete_push: "journal.coachNotes.tag.incompletePush",
  start_technique: "journal.coachNotes.tag.startTechnique",
  block_start: "journal.coachNotes.tag.blockStart",
  jump_takeoff: "journal.coachNotes.tag.jumpTakeoff",
  rotation: "journal.coachNotes.tag.rotation",
  spin_centering: "journal.coachNotes.tag.spinCentering",
  program_flow: "journal.coachNotes.tag.programFlow",
  transitions: "journal.coachNotes.tag.transitions",
  edges: "journal.coachNotes.tag.edges",
};

export function CampStatsPage() {
  const locale = useLocale();
  const t = (key: AnalysisMessageKey, params?: Record<string, string | number>) => tAnalysis(locale, key, params);
  const { campId } = useParams();
  const { uid } = useAuth();
  const db = getFirestoreDb();
  const records = useTrainingRecords();
  const [camp, setCamp] = useState<CampRecord | null | undefined>(undefined);
  const [journal, setJournal] = useState<JournalSnapshot | null>(null);
  const [notes, setNotes] = useState<CoachNoteSnapshot | null>(null);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!uid || !db || !campId) return;
    let cancelled = false;
    setFailed(false);
    setCamp(undefined);
    setJournal(null);
    setNotes(null);
    void getCamp(db, uid, campId).then(
      (record) => {
        if (!cancelled) setCamp(record);
      },
      (error: unknown) => {
        if (cancelled) return;
        logActionFailure("camp-stats", "read", error);
        setFailed(true);
      },
    );
    const fail = (error: unknown) => {
      logActionFailure("camp-stats", "read", error);
      setFailed(true);
    };
    const unsubJournal = subscribeToJournal(db, uid, setJournal, fail);
    const unsubNotes = subscribeToCoachNotes(db, uid, setNotes, fail);
    return () => {
      cancelled = true;
      unsubJournal();
      unsubNotes();
    };
  }, [uid, db, campId, retry]);

  const stats = useMemo(() => {
    if (!camp) return null;
    const distances = DEFAULT_TRAINING_DISTANCES.flatMap((distance) => {
      const document = records.recordsByDistance[distance.distanceId];
      if (!document) return [];
      return [{ distanceId: document.distanceId, label: document.label, entries: document.entries }];
    });
    return deriveCampStats({
      campStart: camp.startDate,
      campEnd: camp.endDate,
      days: journal?.days ?? [],
      sessions: journal?.sessions ?? [],
      notes: notes?.notes ?? [],
      distances,
      presetOrder: COACH_NOTE_TAGS,
    });
  }, [camp, journal, notes, records.recordsByDistance]);

  const ready = camp !== undefined && journal !== null && notes !== null && !records.loading;
  const loading = Boolean(uid && db && campId && !failed && !ready);
  const hasData =
    stats !== null &&
    (stats.trainingDays > 0 || stats.totalSessions > 0 || stats.pbChanges.length > 0 || stats.techIssuesTop.length > 0);

  function issueName(label: string): string {
    const key = ISSUE_LABEL[label];
    return key ? tJournal(locale, key) : label;
  }

  function timeText(value: number | undefined): string {
    return value === undefined ? t("analysis.camps.stats.blank") : formatResultTime(value);
  }

  return (
    <section>
      <h1 className="text-2xl font-bold text-brand-navy">{camp ? camp.name : t("analysis.camps.title")}</h1>
      {camp ? <p className="mt-1 text-brand-navy/80">{camp.type}</p> : null}
      {camp ? (
        <p className="mt-1 text-brand-navy">
          {t("analysis.camps.range", {
            start: formatCalendarDate(camp.startDate, locale),
            end: formatCalendarDate(camp.endDate, locale),
          })}
        </p>
      ) : null}
      {camp?.location ? <p className="mt-1 text-brand-navy">{camp.location}</p> : null}

      {!uid ? (
        <p className="mt-4">{t("analysis.camps.signedOut")}</p>
      ) : !db ? (
        <p className="mt-4">{t("analysis.camps.unavailable")}</p>
      ) : !campId || (ready && camp === null) ? (
        <div className="mt-4">
          <p>{t("analysis.camps.stats.missing")}</p>
          <Link className={`${LINK_CLASS} mt-2`} to="/analysis/camps">
            {t("analysis.camps.stats.back")}
          </Link>
        </div>
      ) : failed ? (
        <div className="mt-4">
          <p>{t("analysis.camps.stats.error")}</p>
          <Button className="mt-3" variant="outline" onClick={() => setRetry((count) => count + 1)}>
            {t("analysis.camps.stats.retry")}
          </Button>
        </div>
      ) : loading || !stats ? (
        <p className="mt-4" aria-busy="true">
          {t("analysis.camps.stats.loading")}
        </p>
      ) : hasData ? (
        <div className="mt-4 space-y-4">
          <dl className="grid gap-2 text-brand-navy sm:grid-cols-2">
            <Stat label={t("analysis.camps.stats.days")} value={String(stats.totalCampDays)} />
            <Stat label={t("analysis.camps.stats.trainingDays")} value={String(stats.trainingDays)} />
            <Stat label={t("analysis.camps.stats.ice")} value={String(stats.iceCount)} />
            <Stat label={t("analysis.camps.stats.dryland")} value={String(stats.drylandCount)} />
            <Stat label={t("analysis.camps.stats.privateLesson")} value={String(stats.privateLessonCount)} />
            <Stat
              label={t("analysis.camps.stats.minutes")}
              value={t("analysis.camps.stats.minutesValue", { count: stats.totalMinutes })}
            />
            <Stat label={t("analysis.camps.stats.sessions")} value={String(stats.totalSessions)} />
          </dl>
          {stats.pbChanges.length > 0 ? (
            <section aria-label={t("analysis.camps.stats.pb")}>
              <h2 className="text-lg font-semibold text-brand-navy">{t("analysis.camps.stats.pb")}</h2>
              <ul className="mt-2 space-y-1 text-brand-navy">
                {stats.pbChanges.map((row) => (
                  <li key={row.distanceId}>
                    {row.label}
                    {": "}
                    {timeText(row.before)}
                    {" → "}
                    {timeText(row.after)}
                    {row.changed ? ` ${t("analysis.camps.stats.pbChanged")}` : ""}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {stats.techIssuesTop.length > 0 ? (
            <section aria-label={t("analysis.camps.stats.issues")}>
              <h2 className="text-lg font-semibold text-brand-navy">{t("analysis.camps.stats.issues")}</h2>
              <ul className="mt-2 flex flex-wrap gap-1">
                {stats.techIssuesTop.map((item) => (
                  <li
                    key={item.label}
                    className="rounded-full border border-brand-navy/15 px-2 py-1 text-xs font-medium text-brand-navy"
                  >
                    {issueName(item.label)}
                    {": "}
                    {item.count}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {records.error ? <ErrorNotice>{records.error}</ErrorNotice> : null}
        </div>
      ) : (
        <p className="mt-4">{t("analysis.camps.stats.empty")}</p>
      )}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-sm font-medium">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
