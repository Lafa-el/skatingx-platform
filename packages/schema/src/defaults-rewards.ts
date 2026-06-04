import type { RewardItem, RewardsCatalogDocument } from "./rewards";

const now = () => new Date().toISOString();

export const DEFAULT_REWARD_ITEMS: Omit<RewardItem, "createdAt" | "updatedAt">[] = [
  {
    id: "reward_ice_cream",
    nameZh: "冰淇淋奖励",
    nameEn: "Ice cream treat",
    descriptionZh: "完成训练后的小奖励",
    descriptionEn: "A sweet treat after training",
    icon: "🍦",
    cost: 80,
    isActive: true,
  },
  {
    id: "reward_movie_night",
    nameZh: "电影之夜",
    nameEn: "Movie night",
    descriptionZh: "家庭电影时间",
    descriptionEn: "Family movie time",
    icon: "🎬",
    cost: 120,
    isActive: true,
  },
  {
    id: "reward_sticker",
    nameZh: "滑冰装备贴纸",
    nameEn: "Skating gear sticker",
    icon: "🏷️",
    cost: 150,
    isActive: true,
  },
  {
    id: "reward_dinner",
    nameZh: "自选晚餐",
    nameEn: "Choose dinner",
    descriptionZh: "挑选一顿喜欢的晚餐",
    descriptionEn: "Pick a favorite dinner",
    icon: "🍽️",
    cost: 200,
    isActive: true,
  },
  {
    id: "reward_screen_time",
    nameZh: "额外屏幕时间",
    nameEn: "Extra screen time",
    descriptionZh: "额外休闲屏幕时间",
    descriptionEn: "Bonus recreational screen time",
    icon: "📱",
    cost: 250,
    isActive: true,
  },
];

export function createDefaultRewardsCatalog(): RewardsCatalogDocument {
  const createdAt = now();
  return {
    items: DEFAULT_REWARD_ITEMS.map((item) => ({
      ...item,
      createdAt,
      updatedAt: createdAt,
    })),
  };
}
