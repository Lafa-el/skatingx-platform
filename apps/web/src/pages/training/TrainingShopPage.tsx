import type { RewardItem } from "@skatingx/schema";
import {
  formatRedemptionStatus,
  getActiveRewards,
  localizeRewardDescription,
  localizeRewardName,
  sortRedemptionsNewest,
} from "@skatingx/skating-domain";
import { Button, Card } from "@skatingx/ui";

import { FirestoreStatusBanner } from "@/components/FirestoreStatusBanner";
import {
  useGamification,
} from "@/app/providers/FirestoreProvider";
import { useRewardActions } from "@/hooks/useRewardActions";
import { useRewardsShop } from "@/hooks/useRewardsShop";

export function TrainingShopPage() {
  const { data: gamification, loading: pointsLoading } = useGamification();
  const {
    catalog,
    redemptions,
    loading,
    error,
    isPro,
    language,
  } = useRewardsShop();
  const {
    redeem,
    busy,
    actionError,
    lastSuccess,
    clearActionError,
    clearLastSuccess,
  } = useRewardActions();

  const isEn = language === "en";
  const points = gamification?.points ?? 0;
  const rewards = getActiveRewards(catalog?.items ?? []);
  const history = sortRedemptionsNewest(redemptions);

  async function handleRedeem(reward: RewardItem) {
    const name = localizeRewardName(reward, language);
    const confirmed = window.confirm(
      isEn
        ? `Redeem "${name}" for ${reward.cost} points?`
        : `使用 ${reward.cost} 积分兑换「${name}」？`,
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
        {isEn ? "Reward shop" : "奖励商店"}
      </h1>
      <p className="mt-1 text-slate-600">
        {isEn
          ? "Spend Blaze points on rewards. Redemptions are saved to your history."
          : "使用冰焰积分兑换奖励，兑换记录会保存在历史中。"}
      </p>

      <FirestoreStatusBanner className="mt-4" />

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
          {isEn
            ? `Redeemed successfully! Enjoy your ${lastSuccess}.`
            : `兑换成功！快去享受【${lastSuccess}】吧！`}
        </p>
      ) : null}

      <Card title={isEn ? "Your points" : "当前积分"} className="mt-4">
        <p className="text-3xl font-bold text-slate-900">
          {pointsLoading || loading ? "…" : points}
        </p>
      </Card>

      <h2 className="mt-6 text-lg font-semibold text-slate-900">
        {isEn ? "Rewards" : "可兑换奖励"}
      </h2>

      {loading ? (
        <p className="mt-2 text-sm text-slate-500">{isEn ? "Loading…" : "加载中…"}</p>
      ) : rewards.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">
          {isEn ? "No rewards in catalog yet." : "暂无奖励商品。"}
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
                    {reward.cost} {isEn ? "pts" : "分"}
                  </p>
                  <Button
                    type="button"
                    className="mt-2"
                    disabled={busy || !canAfford}
                    onClick={() => void handleRedeem(reward)}
                  >
                    {busy
                      ? isEn
                        ? "Redeeming…"
                        : "兑换中…"
                      : canAfford
                        ? isEn
                          ? "Redeem"
                          : "兑换"
                        : isEn
                          ? "Not enough points"
                          : "积分不足"}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Card
        title={isEn ? "Custom rewards (PRO)" : "自定义奖励（PRO）"}
        className="mt-6"
      >
        {isPro ? (
          <p className="text-sm text-slate-600">
            {isEn
              ? "Custom reward management is a placeholder in M6. Full add/edit UI ships with payment and parent tools later."
              : "自定义奖励管理为 M6 占位功能，完整增删改将在支付与家长功能上线后提供。"}
          </p>
        ) : (
          <p className="text-sm text-slate-600">
            {isEn
              ? "Unlock PRO to manage custom rewards for your athlete. Payment integration is not implemented yet — use Settings to toggle PRO for development."
              : "升级 PRO 后可管理自定义奖励。支付尚未接入 — 开发阶段可在设置中手动开启 PRO。"}
          </p>
        )}
      </Card>

      <h2 className="mt-8 text-lg font-semibold text-slate-900">
        {isEn ? "Redemption history" : "兑换记录"}
      </h2>

      {history.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">
          {isEn ? "No redemptions yet." : "还没有兑换记录。"}
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
          {history.map((entry) => (
            <li key={entry.id} className="flex items-start justify-between gap-3 px-4 py-3">
              <div>
                <p className="font-medium text-slate-900">{entry.rewardName}</p>
                <p className="text-xs text-slate-500">
                  {entry.redeemedAt.slice(0, 10)} · −{entry.cost}{" "}
                  {isEn ? "pts" : "分"}
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
