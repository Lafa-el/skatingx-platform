import { Link } from "react-router-dom";
import { getAcademyStages, localizeStageLabel } from "@skatingx/content";
import { normalizeTrainingState } from "@skatingx/firebase-client";
import { formatSecondsToTime } from "@skatingx/skating-domain";
import { Card } from "@skatingx/ui";

import { FirestoreStatusBanner } from "@/components/FirestoreStatusBanner";
import {
  useAthleteProfile,
  useGamification,
  useTrainingState,
} from "@/app/providers/FirestoreProvider";
import { useIsPro } from "@/hooks/useIsPro";
import { useLocale } from "@/hooks/useLocale";
import { useTrainingRecords } from "@/hooks/useTrainingRecords";
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
      <h1 className="text-2xl font-bold text-slate-900">{t("trainingHome.title")}</h1>
      <p className="mt-1 text-slate-600">{t("trainingHome.subtitle")}</p>

      <FirestoreStatusBanner className="mt-4" />

      {error || recordsErr ? (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
          {error ?? recordsErr}
        </p>
      ) : null}

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Card title={t("trainingHome.card.athlete")} className="min-w-0">
          <p className="break-words text-lg font-semibold text-slate-900">
            {loading ? "…" : (profile?.displayName ?? "—")}
          </p>
        </Card>
        <Card title={t("trainingHome.card.points")}>
          <p className="text-lg font-semibold text-slate-900">
            {loading ? "…" : points}
          </p>
        </Card>
        <Card title={t("trainingHome.card.streak")}>
          <p className="text-lg font-semibold text-slate-900">
            {loading
              ? "…"
              : t(countKey(streakDays, "trainingHome.streak.one", "trainingHome.streak.other"), {
                  count: streakDays,
                })}
          </p>
        </Card>
        <Card title={t("trainingHome.card.tasks")}>
          <p className="text-lg font-semibold text-slate-900">
            {loading ? "…" : `${completed} / ${tasks.length}`}
          </p>
          <Link
            to="/training/tasks"
            className="mt-2 inline-block text-sm font-medium text-sky-700"
          >
            {t("trainingHome.tasks.open")}
          </Link>
        </Card>
        <Card title={t("trainingHome.card.records")}>
          <p className="text-lg font-semibold text-slate-900">
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
          <p className="mt-1 font-mono text-sm text-slate-600">
            {loading
              ? "…"
              : pb500
                ? t("trainingHome.records.pb", { time: formatSecondsToTime(pb500.timeSeconds) })
                : t("trainingHome.records.noPb")}
          </p>
          <Link
            to="/training/records"
            className="mt-2 inline-block text-sm font-medium text-sky-700"
          >
            {t("trainingHome.records.open")}
          </Link>
        </Card>
      </div>

      <Card title={t("trainingHome.card.shop")} className="mt-4">
        <p className="text-lg font-semibold text-slate-900">
          {loading
            ? "…"
            : t(countKey(points, "trainingHome.shop.points.one", "trainingHome.shop.points.other"), {
                count: points,
              })}
        </p>
        <p className="mt-1 text-sm text-slate-600">
          {loading ? "…" : t(isPro ? "trainingHome.shop.pro" : "trainingHome.shop.free")}
        </p>
        <Link
          to="/training/shop"
          className="mt-2 inline-block text-sm font-medium text-sky-700"
        >
          {t("trainingHome.shop.open")}
        </Link>
      </Card>

      <Card title={t("trainingHome.card.academy")} className="mt-4">
        <p className="text-sm text-slate-600">
          {defaultStage
            ? t("trainingHome.academy.reference", {
                stage: academyLabel,
                ageRange: defaultStage.ageRange,
              })
            : t("trainingHome.academy.import")}
        </p>
        <Link
          to="/training/academy"
          className="mt-2 inline-block text-sm font-medium text-sky-700"
        >
          {t("trainingHome.academy.open")}
        </Link>
      </Card>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <Link to="/training/tasks" className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:bg-slate-50">
          <span className="font-medium text-slate-900">{t("trainingHome.shortcut.tasks.title")}</span>
          <p className="mt-1 text-sm text-slate-600">{t("trainingHome.shortcut.tasks.body")}</p>
        </Link>
        <Link to="/training/academy" className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:bg-slate-50">
          <span className="font-medium text-slate-900">{t("trainingHome.shortcut.academy.title")}</span>
          <p className="mt-1 text-sm text-slate-600">
            {defaultStage
              ? t("trainingHome.shortcut.academy.body", { stage: academyLabel })
              : t("trainingHome.shortcut.academy.fallback")}
          </p>
        </Link>
        <Link to="/training/records" className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:bg-slate-50">
          <span className="font-medium text-slate-900">{t("trainingHome.shortcut.records.title")}</span>
          <p className="mt-1 text-sm text-slate-600">{t("trainingHome.shortcut.records.body")}</p>
        </Link>
        <Link to="/training/shop" className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:bg-slate-50">
          <span className="font-medium text-slate-900">{t("trainingHome.shortcut.shop.title")}</span>
          <p className="mt-1 text-sm text-slate-600">
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
