import type { RewardItem } from "@skatingx/schema";
import {
  formatRedemptionStatus,
  getActiveRewards,
  localizeRedemptionName,
  localizeRewardDescription,
  localizeRewardName,
  sortRedemptionsNewest,
} from "@skatingx/skating-domain";
import { Button, Card, ErrorNotice, Notice, StatusTag } from "@skatingx/ui";

import { FirestoreStatusBanner } from "@/components/FirestoreStatusBanner";
import { ProLockedCard, ProPlanBanner } from "@/components/ProPlanBanner";
import { useGamification } from "@/app/providers/FirestoreProvider";
import { useIsPro } from "@/hooks/useIsPro";
import { useRewardActions } from "@/hooks/useRewardActions";
import { useRewardsShop } from "@/hooks/useRewardsShop";
import { formatCalendarDate } from "@/shared/i18n/format";
import { tShop } from "@/shared/i18n/shop-messages";
import { logActionFailure } from "@/shared/utils/logActionFailure";

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
    try {
      await redeem(reward.id, name, reward.cost);
    } catch (error) {
      // The hook already put the reason on the page.
      logActionFailure("training-shop", "redeem", error);
    }
  }

  return (
    <section className="max-w-lg">
      <h1 className="text-2xl font-bold text-brand-navy">
        {t("shop.page.title")}
      </h1>
      <p className="mt-1 text-brand-navy/80">
        {t("shop.page.subtitle")}
      </p>

      <FirestoreStatusBanner className="mt-4" />
      <ProPlanBanner isPro={isPro} locale={language} className="mt-4" />

      {error ? (
        <ErrorNotice className="mt-4">{error}</ErrorNotice>
      ) : null}

      {actionError ? (
        <ErrorNotice className="mt-4">{actionError}</ErrorNotice>
      ) : null}

      {lastSuccess ? (
        <Notice tone="success" role="status" className="mt-4">
          {t("shop.success", {
            name: localizeRedemptionName(lastSuccess, catalog?.items ?? [], language),
          })}
        </Notice>
      ) : null}

      <Card variant="raised" title={t("shop.points.title")} className="mt-4">
        <p className="sx-numeric text-3xl text-brand-navy">
          {pointsLoading || loading ? "…" : points}
        </p>
      </Card>

      <h2 className="mt-6 text-lg font-semibold text-brand-navy">
        {t("shop.catalog.title")}
      </h2>

      {loading ? (
        <p className="mt-2 text-sm text-brand-navy/70">{t("shop.catalog.loading")}</p>
      ) : rewards.length === 0 ? (
        <p className="mt-2 text-sm text-brand-navy/70">
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
                className="flex gap-3 rounded-card border border-brand-navy/10 bg-white p-4 shadow-card"
              >
                <span className="text-3xl" aria-hidden>
                  {reward.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-brand-navy">{name}</p>
                  {description ? (
                    <p className="mt-0.5 text-xs text-brand-navy/80">{description}</p>
                  ) : null}
                  <p className="mt-1 text-sm font-semibold text-brand-navy">
                    {t("shop.reward.cost", { cost: reward.cost })}
                  </p>
                  <Button variant="brand"
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

      <h2 className="mt-8 text-lg font-semibold text-brand-navy">
        {t("shop.custom.title")}
        <span className="ml-2 text-xs font-normal text-brand-navy/70">{t("shop.custom.proTag")}</span>
      </h2>

      {isPro ? (
        <Card variant="raised" title={t("shop.custom.cardTitle")} className="mt-3">
          <p className="text-sm font-semibold text-status-success">
            {t("shop.custom.active")}
          </p>
          <p className="mt-2 text-sm text-brand-navy/80">
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

      <h2 className="mt-8 text-lg font-semibold text-brand-navy">
        {t("shop.history.title")}
      </h2>

      {history.length === 0 ? (
        <p className="mt-2 text-sm text-brand-navy/70">
          {t("shop.history.empty")}
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-brand-navy/10 rounded-card border border-brand-navy/10 bg-white">
          {history.map((entry) => (
            <li key={entry.id} className="flex items-start justify-between gap-3 px-4 py-3">
              <div>
                <p className="font-medium text-brand-navy">{localizeRedemptionName(entry, catalog?.items ?? [], language)}</p>
                <p className="text-xs text-brand-navy/70">
                  {t("shop.history.line", {
                    date: formatCalendarDate(entry.redeemedAt.slice(0, 10), language),
                    cost: entry.cost,
                  })}
                </p>
              </div>
              <StatusTag tone="neutral" className="shrink-0">
                {formatRedemptionStatus(entry.status, language)}
              </StatusTag>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
