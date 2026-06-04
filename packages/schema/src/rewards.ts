import type { Timestamp } from "./common";

export type RedemptionStatus = "pending" | "approved" | "used" | "cancelled";

export interface RewardItem {
  id: string;
  nameZh: string;
  nameEn: string;
  descriptionZh?: string;
  descriptionEn?: string;
  icon: string;
  cost: number;
  isActive: boolean;
  createdAt: string;
  updatedAt?: string;
}

/** `training/main/rewards/catalog` document. */
export interface RewardsCatalogDocument {
  items: RewardItem[];
  updatedAt?: Timestamp;
}

export interface RewardRedemption {
  id: string;
  rewardId: string;
  rewardName: string;
  cost: number;
  redeemedAt: string;
  status: RedemptionStatus;
  note?: string;
  updatedAt?: Timestamp;
}
