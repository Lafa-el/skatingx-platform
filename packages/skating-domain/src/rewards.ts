import type { Language } from "@skatingx/schema";
import type { RewardItem, RewardRedemption } from "@skatingx/schema";

export function localizeRewardName(
  item: Pick<RewardItem, "nameZh" | "nameEn">,
  language: Language,
): string {
  return language === "en" ? item.nameEn : item.nameZh;
}

/**
 * The name to show for a past redemption. The redemption stores the name it was made under, in
 * the language of that moment, and the reward's id. The catalog has both names for the reward, so
 * the current language wins; a reward no longer in the catalog (or without a name in this
 * language) is shown under the name stored with the redemption.
 */
export function localizeRedemptionName(
  redemption: Pick<RewardRedemption, "rewardId" | "rewardName">,
  catalogItems: readonly Pick<RewardItem, "id" | "nameZh" | "nameEn">[],
  language: Language,
): string {
  const item = catalogItems.find((candidate) => candidate.id === redemption.rewardId);
  const current = item ? localizeRewardName(item, language).trim() : "";
  return current || redemption.rewardName;
}

export function localizeRewardDescription(
  item: Pick<RewardItem, "descriptionZh" | "descriptionEn">,
  language: Language,
): string | undefined {
  const text = language === "en" ? item.descriptionEn : item.descriptionZh;
  return text?.trim() || undefined;
}

export function getActiveRewards(items: RewardItem[]): RewardItem[] {
  return items.filter((r) => r.isActive).sort((a, b) => a.cost - b.cost);
}

export function sortRedemptionsNewest(
  redemptions: RewardRedemption[],
): RewardRedemption[] {
  return [...redemptions].sort((a, b) =>
    b.redeemedAt.localeCompare(a.redeemedAt),
  );
}

export function formatRedemptionStatus(
  status: RewardRedemption["status"],
  language: Language,
): string {
  const labels: Record<RewardRedemption["status"], { zh: string; en: string }> =
    {
      pending: { zh: "待确认", en: "Pending" },
      approved: { zh: "已批准", en: "Approved" },
      used: { zh: "已使用", en: "Used" },
      cancelled: { zh: "已取消", en: "Cancelled" },
    };
  return language === "en" ? labels[status].en : labels[status].zh;
}
