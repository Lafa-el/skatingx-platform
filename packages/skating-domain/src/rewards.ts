import type { Language } from "@skatingx/schema";
import type { RewardItem, RewardRedemption } from "@skatingx/schema";

export function localizeRewardName(
  item: Pick<RewardItem, "nameZh" | "nameEn">,
  language: Language,
): string {
  return language === "en" ? item.nameEn : item.nameZh;
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
