import type { RewardItem } from "@skatingx/schema";
import {
  formatRedemptionStatus,
  getActiveRewards,
  localizeRedemptionName,
  localizeRewardDescription,
  localizeRewardName,
  sortRedemptionsNewest,
} from "@skatingx/skating-domain";
import { Button, Card } from "@skatingx/ui";

import { FirestoreStatusBanner } from "@/components/FirestoreStatusBanner";
import { ProLockedCard, ProPlanBanner } from "@/components/ProPlanBanner";
import { useGamification } from "@/app/providers/FirestoreProvider";
import { useIsPro } from "@/hooks/useIsPro";
import { useRewardActions } from "@/hooks/useRewardActions";
import { useRewardsShop } from "@/hooks/useRewardsShop";
import { formatCalendarDate } from "@/shared/i18n/format";
import { tShop } from "@/shared/i18n/shop-messages";

export function TrainingShopPage() {
  const { isPro, language } = useIsPro();
  const { data: gamification, loading: pointsLoading } = useGamification();
  const { catalog, redemptions, loading, error } = useRewardsShop();
  const {
    redeem,
    busy,
    actionError,
    lastSuccess,
    clearActionError,
    clearLastSuccess,
  } = useRewardActions();

  const t = (key: Parameters<typeof tShop>[1], params?: Parameters<typeof tShop>[2]) =>
    tShop(language, key, params);
  const points = gamification?.points ?? 0;
  const rewards = getActiveRewards(catalog?.items ?? []);
  const history = sortRedemptionsNewest(redemptions);

  async function handleRedeem(reward: RewardItem) {
    const name = localizeRewardName(reward, language);
    const confirmed = window.confirm(
      t(reward.cost === 1 ? "shop.confirm.one" : "shop.confirm.other", {
        name,
        cost: reward.cost,
      }),
    );
    if (!confirmed) {
      return;
    }
    clearActionError();
    clearLastSuccess();
    await redeem(reward.id, name, reward.cost);
  }

  return (
    <section className="max-w-lg">
      <h1 className="text-2xl font-bold text-slate-900">
        {t("shop.page.title")}
      </h1>
      <p className="mt-1 text-slate-600">
        {t("shop.page.subtitle")}
      </p>

      <FirestoreStatusBanner className="mt-4" />
      <ProPlanBanner isPro={isPro} locale={language} className="mt-4" />

      {error ? (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
          {error}
        </p>
      ) : null}

      {actionError ? (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
          {actionError}
        </p>
      ) : null}

      {lastSuccess ? (
        <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {t("shop.success", {
            name: localizeRedemptionName(lastSuccess, catalog?.items ?? [], language),
          })}
        </p>
      ) : null}

      <Card title={t("shop.points.title")} className="mt-4">
        <p className="text-3xl font-bold text-slate-900">
          {pointsLoading || loading ? "…" : points}
        </p>
      </Card>

      <h2 className="mt-6 text-lg font-semibold text-slate-900">
        {t("shop.catalog.title")}
      </h2>

      {loading ? (
        <p className="mt-2 text-sm text-slate-500">{t("shop.catalog.loading")}</p>
      ) : rewards.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">
          {t("shop.catalog.empty")}
        </p>
      ) : (
        <div className="mt-3 grid gap-3">
          {rewards.map((reward) => {
            const name = localizeRewardName(reward, language);
            const description = localizeRewardDescription(reward, language);
            const canAfford = points >= reward.cost;
            return (
              <div
                key={reward.id}
                className="flex gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <span className="text-3xl" aria-hidden>
                  {reward.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-900">{name}</p>
                  {description ? (
                    <p className="mt-0.5 text-xs text-slate-600">{description}</p>
                  ) : null}
                  <p className="mt-1 text-sm font-medium text-sky-700">
                    {t("shop.reward.cost", { cost: reward.cost })}
                  </p>
                  <Button
                    type="button"
                    className="mt-2"
                    disabled={busy || !canAfford}
                    onClick={() => void handleRedeem(reward)}
                  >
                    {busy
                      ? t("shop.reward.redeeming")
                      : canAfford
                        ? t("shop.reward.redeem")
                        : t("shop.reward.notEnough")}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <h2 className="mt-8 text-lg font-semibold text-slate-900">
        {t("shop.custom.title")}
        <span className="ml-2 text-xs font-normal text-slate-500">{t("shop.custom.proTag")}</span>
      </h2>

      {isPro ? (
        <Card title={t("shop.custom.cardTitle")} className="mt-3">
          <p className="text-sm font-semibold text-emerald-800">
            {t("shop.custom.active")}
          </p>
          <p className="mt-2 text-sm text-slate-600">
            {t("shop.custom.placeholder")}
          </p>
        </Card>
      ) : (
        <ProLockedCard
          locale={language}
          message={t("shop.custom.locked")}
          className="mt-3"
        />
      )}

      <h2 className="mt-8 text-lg font-semibold text-slate-900">
        {t("shop.history.title")}
      </h2>

      {history.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">
          {t("shop.history.empty")}
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
          {history.map((entry) => (
            <li key={entry.id} className="flex items-start justify-between gap-3 px-4 py-3">
              <div>
                <p className="font-medium text-slate-900">{localizeRedemptionName(entry, catalog?.items ?? [], language)}</p>
                <p className="text-xs text-slate-500">
                  {t("shop.history.line", {
                    date: formatCalendarDate(entry.redeemedAt.slice(0, 10), language),
                    cost: entry.cost,
                  })}
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-700">
                {formatRedemptionStatus(entry.status, language)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
