import { Link } from "react-router-dom";
import { getAcademyStages, localizeStageLabel } from "@skatingx/content";
import { normalizeTrainingState } from "@skatingx/firebase-client";
import { formatSecondsToTime } from "@skatingx/skating-domain";
import { Card, ErrorNotice, ProgressBar } from "@skatingx/ui";

import { FirestoreStatusBanner } from "@/components/FirestoreStatusBanner";
import {
  useAthleteProfile,
  useGamification,
  useTrainingState,
} from "@/app/providers/FirestoreProvider";
import { useIsPro } from "@/hooks/useIsPro";
import { useLocale } from "@/hooks/useLocale";
import { useTrainingRecords } from "@/hooks/useTrainingRecords";
import { localized } from "@/shared/i18n/localized";
import { tSettingsPage } from "@/shared/i18n/settings-page-messages";
import {
  type TrainingHomeMessageKey,
  tTrainingHome,
} from "@/shared/i18n/training-home-messages";

/** A count with its unit: the language's singular or plural form, chosen by the number. */
function countKey(
  count: number,
  one: TrainingHomeMessageKey,
  other: TrainingHomeMessageKey,
): TrainingHomeMessageKey {
  return count === 1 ? one : other;
}

export function TrainingHomePage() {
  const locale = useLocale();
  const t = (key: TrainingHomeMessageKey, params?: Record<string, string | number>) =>
    tTrainingHome(locale, key, params);
  const { data: profile, loading: profileLoading } = useAthleteProfile();
  const { data: gamification, loading: gamificationLoading } = useGamification();
  const { data: rawState, loading: stateLoading, error } = useTrainingState();
  const {
    loading: recordsLoading,
    error: recordsError,
    totalEntryCount,
    getBestForDistance,
  } = useTrainingRecords();
  const { isPro, loading: proLoading } = useIsPro();

  const loading =
    profileLoading || gamificationLoading || stateLoading || recordsLoading || proLoading;
  const recordsErr = recordsError;
  const state = rawState ? normalizeTrainingState(rawState) : null;
  const tasks = state?.todayTasks ?? [];
  const completed = tasks.filter((task) => task.completed).length;
  const pb500 = getBestForDistance("500m");
  const points = gamification?.points ?? 0;
  const streakDays = gamification?.streakDays ?? 0;
  const defaultStage = getAcademyStages()[1] ?? getAcademyStages()[0];
  // The stage label and age range are content data, shown as stored; only the labels around them
  // are translated.
  const academyLabel = defaultStage ? localizeStageLabel(defaultStage, locale) : "";

  return (
    <section>
      <h1 className="text-2xl font-bold text-brand-navy">{t("trainingHome.title")}</h1>
      <p className="mt-1 text-brand-navy/80">{t("trainingHome.subtitle")}</p>

      <FirestoreStatusBanner className="mt-4" />

      {error || recordsErr ? (
        <ErrorNotice className="mt-4">{error ?? recordsErr}</ErrorNotice>
      ) : null}

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Card variant="raised" title={t("trainingHome.card.athlete")} className="min-w-0">
          <p className="break-words text-lg font-semibold text-brand-navy">
            {loading ? "…" : (profile?.displayName ?? "—")}
          </p>
        </Card>
        <Card variant="raised" title={t("trainingHome.card.points")}>
          <p className="sx-numeric text-3xl text-brand-navy">
            {loading ? "…" : points}
          </p>
        </Card>
        <Card variant="raised" title={t("trainingHome.card.streak")}>
          <p className="text-lg font-semibold text-brand-navy">
            {loading
              ? "…"
              : t(countKey(streakDays, "trainingHome.streak.one", "trainingHome.streak.other"), {
                  count: streakDays,
                })}
          </p>
        </Card>
        <Card variant="hero" title={t("trainingHome.card.tasks")}>
          <p className="sx-numeric text-4xl text-brand-navy">
            {loading ? "…" : `${completed} / ${tasks.length}`}
          </p>
          {!loading && tasks.length > 0 ? (
            <ProgressBar
              className="mt-3"
              label={t("trainingHome.card.tasks")}
              value={completed}
              max={tasks.length}
            />
          ) : null}
          <Link
            to="/training/tasks"
            className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-brand-navy underline underline-offset-2"
          >
            {t("trainingHome.tasks.open")}
          </Link>
        </Card>
        <Card variant="raised" title={t("trainingHome.card.records")}>
          <p className="text-lg font-semibold text-brand-navy">
            {loading
              ? "…"
              : t(
                  countKey(
                    totalEntryCount,
                    "trainingHome.records.entries.one",
                    "trainingHome.records.entries.other",
                  ),
                  { count: totalEntryCount },
                )}
          </p>
          <p className="mt-1 text-sm text-brand-navy/80">
            {loading
              ? "…"
              : pb500
                ? t("trainingHome.records.pb", { time: formatSecondsToTime(pb500.timeSeconds) })
                : t("trainingHome.records.noPb")}
          </p>
          <Link
            to="/training/records"
            className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-brand-navy underline underline-offset-2"
          >
            {t("trainingHome.records.open")}
          </Link>
        </Card>
      </div>

      <Card variant="raised" title={t("trainingHome.card.shop")} className="mt-4">
        <p className="text-lg font-semibold text-brand-navy">
          {loading
            ? "…"
            : t(countKey(points, "trainingHome.shop.points.one", "trainingHome.shop.points.other"), {
                count: points,
              })}
        </p>
        <p className="mt-1 text-sm text-brand-navy/80">
          {loading
            ? "…"
            : `${tSettingsPage(locale, isPro ? "settings.plan.proTitle" : "settings.plan.freeTag")} · ${t(
                isPro ? "trainingHome.shop.proDetail" : "trainingHome.shop.freeDetail",
              )}`}
        </p>
        <Link
          to="/training/shop"
          className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-brand-navy underline underline-offset-2"
        >
          {t("trainingHome.shop.open")}
        </Link>
      </Card>

      <Card variant="raised" title={t("trainingHome.card.academy")} className="mt-4">
        <p className="text-sm text-brand-navy/80">
          {defaultStage
            ? t("trainingHome.academy.reference", {
                stage: academyLabel,
                ageRange: localized(locale, { zh: defaultStage.ageRangeZh, en: defaultStage.ageRangeEn }),
              })
            : t("trainingHome.academy.import")}
        </p>
        <Link
          to="/training/academy"
          className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-brand-navy underline underline-offset-2"
        >
          {t("trainingHome.academy.open")}
        </Link>
      </Card>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <Link to="/training/tasks" className="rounded-card border border-brand-navy/10 bg-white p-4 shadow-card hover:bg-brand-ice focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-navy">
          <span className="font-semibold text-brand-navy">{t("trainingHome.shortcut.tasks.title")}</span>
          <p className="mt-1 text-sm text-brand-navy/80">{t("trainingHome.shortcut.tasks.body")}</p>
        </Link>
        <Link to="/training/academy" className="rounded-card border border-brand-navy/10 bg-white p-4 shadow-card hover:bg-brand-ice focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-navy">
          <span className="font-semibold text-brand-navy">{t("trainingHome.shortcut.academy.title")}</span>
          <p className="mt-1 text-sm text-brand-navy/80">
            {defaultStage
              ? t("trainingHome.shortcut.academy.body", { stage: academyLabel })
              : t("trainingHome.shortcut.academy.fallback")}
          </p>
        </Link>
        <Link to="/training/records" className="rounded-card border border-brand-navy/10 bg-white p-4 shadow-card hover:bg-brand-ice focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-navy">
          <span className="font-semibold text-brand-navy">{t("trainingHome.shortcut.records.title")}</span>
          <p className="mt-1 text-sm text-brand-navy/80">{t("trainingHome.shortcut.records.body")}</p>
        </Link>
        <Link to="/training/shop" className="rounded-card border border-brand-navy/10 bg-white p-4 shadow-card hover:bg-brand-ice focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-navy">
          <span className="font-semibold text-brand-navy">{t("trainingHome.shortcut.shop.title")}</span>
          <p className="mt-1 text-sm text-brand-navy/80">
            {loading
              ? "…"
              : t(
                  countKey(
                    points,
                    "trainingHome.shortcut.shop.body.one",
                    "trainingHome.shortcut.shop.body.other",
                  ),
                  { count: points },
                )}
          </p>
        </Link>
      </div>
    </section>
  );
}
