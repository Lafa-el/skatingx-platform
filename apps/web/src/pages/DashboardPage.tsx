import { Link } from "react-router-dom";
import { normalizeTrainingState } from "@skatingx/firebase-client";
import { formatSecondsToTime, localizeRedemptionName } from "@skatingx/skating-domain";
import { Card, ErrorNotice, ProgressBar } from "@skatingx/ui";

import { FirestoreStatusBanner } from "@/components/FirestoreStatusBanner";
import {
  useAthleteProfile,
  useGamification,
  useTrainingState,
} from "@/app/providers/FirestoreProvider";
import { useIsPro } from "@/hooks/useIsPro";
import { useLocale } from "@/hooks/useLocale";
import { useRewardsShop } from "@/hooks/useRewardsShop";
import { useTrainingRecords } from "@/hooks/useTrainingRecords";
import { type DashboardMessageKey, tDashboard } from "@/shared/i18n/dashboard-messages";
import { formatCalendarDate } from "@/shared/i18n/format";

/** Destinations do not depend on the language; only the text is looked up. */
const dashboardCards: ReadonlyArray<{
  titleKey: DashboardMessageKey;
  bodyKey: DashboardMessageKey;
  to: string;
}> = [
  {
    titleKey: "dashboard.shortcut.training.title",
    bodyKey: "dashboard.shortcut.training.body",
    to: "/training/tasks",
  },
  {
    titleKey: "dashboard.shortcut.analysis.title",
    bodyKey: "dashboard.shortcut.analysis.body",
    to: "/analysis",
  },
  {
    titleKey: "dashboard.shortcut.athlete.title",
    bodyKey: "dashboard.shortcut.athlete.body",
    to: "/athlete",
  },
  {
    titleKey: "dashboard.shortcut.aiCoach.title",
    bodyKey: "dashboard.shortcut.aiCoach.body",
    to: "/ai-coach",
  },
];

export function DashboardPage() {
  const locale = useLocale();
  const { data: profile, loading: profileLoading, error: profileError } =
    useAthleteProfile();
  const {
    data: gamification,
    loading: gamificationLoading,
    error: gamificationError,
  } = useGamification();
  const {
    data: rawState,
    loading: trainingLoading,
    error: trainingError,
  } = useTrainingState();
  const {
    loading: recordsLoading,
    error: recordsError,
    getBestForDistance,
    latestEntryOverall,
  } = useTrainingRecords();
  const { isPro, loading: proLoading } = useIsPro();
  const {
    catalog: shopCatalog,
    latestRedemption,
    loading: shopLoading,
    error: shopError,
  } = useRewardsShop();

  const loading =
    profileLoading ||
    gamificationLoading ||
    trainingLoading ||
    recordsLoading ||
    proLoading ||
    shopLoading;
  const error =
    profileError ??
    gamificationError ??
    trainingError ??
    recordsError ??
    shopError;

  const state = rawState ? normalizeTrainingState(rawState) : null;
  const tasks = state?.todayTasks ?? [];
  const completedCount = tasks.filter((t) => t.completed).length;
  const taskCount = tasks.length;

  const name = profile?.displayName ?? "…";
  const points = gamification?.points ?? 0;
  const streakDays = gamification?.streakDays ?? 0;
  const pb500 = getBestForDistance("500m");
  const pbFastestLap = getBestForDistance("fastest_lap");

  return (
    <section>
      <h1 className="text-2xl font-bold text-brand-navy">
        {tDashboard(locale, "dashboard.title")}
      </h1>
      <p className="mt-1 text-brand-navy/80">
        {loading
          ? tDashboard(locale, "dashboard.loading")
          : tDashboard(locale, "dashboard.welcome", { name })}
      </p>

      <FirestoreStatusBanner className="mt-4" />

      {error ? <ErrorNotice className="mt-4">{error}</ErrorNotice> : null}

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card variant="raised" title={tDashboard(locale, "dashboard.card.athlete")}>
          <p className="text-lg font-semibold text-brand-navy">
            {loading ? "…" : name}
          </p>
        </Card>
        <Card variant="raised" title={tDashboard(locale, "dashboard.card.points")}>
          <p className="sx-numeric text-3xl text-brand-navy">
            {loading ? "…" : points}
          </p>
        </Card>
        <Card variant="raised" title={tDashboard(locale, "dashboard.card.streak")}>
          <p className="text-lg font-semibold text-brand-navy">
            {loading
              ? "…"
              : tDashboard(
                  locale,
                  streakDays === 1 ? "dashboard.streak.one" : "dashboard.streak.other",
                  { count: streakDays },
                )}
          </p>
        </Card>
        <Card variant="hero" title={tDashboard(locale, "dashboard.card.tasks")}>
          <p className="sx-numeric text-4xl text-brand-navy">
            {loading ? "…" : `${completedCount} / ${taskCount}`}
          </p>
          <p className="mt-1 text-xs text-brand-navy">
            {tDashboard(locale, "dashboard.tasks.hint")}
          </p>
          {!loading && taskCount > 0 ? (
            <ProgressBar
              className="mt-3"
              label={tDashboard(locale, "dashboard.card.tasks")}
              value={completedCount}
              max={taskCount}
            />
          ) : null}
        </Card>
        <Card variant="raised" title={tDashboard(locale, "dashboard.card.pb500")}>
          <p className="sx-numeric text-2xl text-brand-navy">
            {loading ? "…" : pb500 ? formatSecondsToTime(pb500.timeSeconds) : "—"}
          </p>
          {pb500 ? (
            <p className="mt-1 text-xs text-brand-navy/70">
              {formatCalendarDate(pb500.date, locale)}
            </p>
          ) : null}
        </Card>
        <Card variant="raised" title={tDashboard(locale, "dashboard.card.pbFastestLap")}>
          <p className="sx-numeric text-2xl text-brand-navy">
            {loading
              ? "…"
              : pbFastestLap
                ? formatSecondsToTime(pbFastestLap.timeSeconds)
                : "—"}
          </p>
          {pbFastestLap ? (
            <p className="mt-1 text-xs text-brand-navy/70">
              {formatCalendarDate(pbFastestLap.date, locale)}
            </p>
          ) : null}
        </Card>
        <Card variant="raised" title={tDashboard(locale, "dashboard.card.plan")}>
          <p className="text-lg font-semibold text-brand-navy">
            {loading
              ? "…"
              : tDashboard(locale, isPro ? "dashboard.plan.pro" : "dashboard.plan.free")}
          </p>
        </Card>
        <Card variant="raised" title={tDashboard(locale, "dashboard.card.redemption")}>
          <p className="text-lg font-semibold text-brand-navy">
            {loading
              ? "…"
              : latestRedemption
                ? localizeRedemptionName(latestRedemption, shopCatalog?.items ?? [], locale)
                : "—"}
          </p>
          {latestRedemption ? (
            <p className="mt-1 text-xs text-brand-navy/70">
              {tDashboard(locale, "dashboard.redemption.cost", {
                cost: latestRedemption.cost,
                date: formatCalendarDate(latestRedemption.redeemedAt.slice(0, 10), locale),
              })}
            </p>
          ) : (
            <p className="mt-1 text-xs text-brand-navy/70">
              {tDashboard(locale, "dashboard.redemption.none")}
            </p>
          )}
        </Card>
        <Card variant="raised" title={tDashboard(locale, "dashboard.card.record")}>
          <p className="sx-numeric text-2xl text-brand-navy">
            {loading
              ? "…"
              : latestEntryOverall
                ? formatSecondsToTime(latestEntryOverall.timeSeconds)
                : "—"}
          </p>
          {latestEntryOverall ? (
            <p className="mt-1 text-xs text-brand-navy/70">
              {formatCalendarDate(latestEntryOverall.date, locale)}
            </p>
          ) : (
            <p className="mt-1 text-xs text-brand-navy/70">
              {tDashboard(locale, "dashboard.record.none")}
            </p>
          )}
        </Card>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {dashboardCards.map((card) => (
          <Link
            key={card.to}
            to={card.to}
            className="block rounded-card no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-navy"
          >
            <Card variant="raised" title={tDashboard(locale, card.titleKey)}>
              <p>{tDashboard(locale, card.bodyKey)}</p>
              <span className="mt-2 inline-block text-sm font-semibold text-brand-navy underline underline-offset-2">
                {tDashboard(locale, "dashboard.shortcut.open")}
              </span>
            </Card>
          </Link>
        ))}
      </div>
    </section>
  );
}
