import {
  createDefaultRewardsCatalog,
  todayDateString,
  type Gamification,
  type RewardRedemption,
  type RewardsCatalogDocument,
} from "@skatingx/schema";
import {
  getDoc,
  runTransaction,
  serverTimestamp,
  setDoc,
  type Firestore,
} from "firebase/firestore";

import {
  athleteGamificationRef,
  trainingRedemptionRef,
  trainingRewardsCatalogRef,
} from "./refs";
import { recordPointsChange } from "./points-ledger";
import { toFirestoreData } from "./sanitize";

export type RewardsActorContext = {
  db: Firestore;
  userId: string;
  athleteId: string;
};

export function normalizeRewardsCatalog(
  raw: RewardsCatalogDocument | undefined,
): RewardsCatalogDocument {
  return {
    items: (raw?.items ?? []).map((item) => ({
      ...item,
      isActive: item.isActive !== false,
    })),
    updatedAt: raw?.updatedAt,
  };
}

export async function ensureDefaultRewardsCatalog(
  ctx: RewardsActorContext,
): Promise<boolean> {
  const ref = trainingRewardsCatalogRef(ctx.db, ctx.userId, ctx.athleteId);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    return false;
  }
  await setDoc(ref, toFirestoreData(createDefaultRewardsCatalog()));
  return true;
}

function createRedemptionId(): string {
  return `redemption_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export type RedeemRewardResult = {
  redemptionId: string;
  pointsAfter: number;
};

export async function redeemReward(
  ctx: RewardsActorContext,
  rewardId: string,
  rewardName: string,
  cost: number,
): Promise<RedeemRewardResult> {
  const catalogRef = trainingRewardsCatalogRef(ctx.db, ctx.userId, ctx.athleteId);
  const gamificationRef = athleteGamificationRef(
    ctx.db,
    ctx.userId,
    ctx.athleteId,
  );
  const redemptionId = createRedemptionId();
  const redemptionRef = trainingRedemptionRef(
    ctx.db,
    ctx.userId,
    ctx.athleteId,
    redemptionId,
  );
  const nowIso = new Date().toISOString();
  const today = todayDateString();

  return runTransaction(ctx.db, async (tx) => {
    const catalogSnap = await tx.get(catalogRef);
    const gamificationSnap = await tx.get(gamificationRef);
    const catalog = normalizeRewardsCatalog(
      catalogSnap.data() as RewardsCatalogDocument | undefined,
    );
    const reward = catalog.items.find(
      (r) => r.id === rewardId && r.isActive,
    );
    if (!reward) {
      throw new Error("Reward is not available.");
    }
    if (reward.cost !== cost) {
      throw new Error("Reward cost mismatch. Refresh and try again.");
    }

    const gamification = gamificationSnap.data() as Gamification | undefined;
    const balance = gamification?.points ?? 0;
    if (balance < cost) {
      throw new Error("Not enough points for this reward.");
    }

    const pointsAfter = await recordPointsChange(
      tx,
      ctx.db,
      ctx.userId,
      ctx.athleteId,
      balance,
      [{ dateId: today, delta: -cost, reason: "reward-redeem", refId: redemptionId }],
      today,
    );
    const redemption: RewardRedemption = {
      id: redemptionId,
      rewardId,
      rewardName,
      cost,
      redeemedAt: nowIso,
      status: "pending",
    };

    tx.set(redemptionRef, toFirestoreData(redemption));
    tx.update(
      gamificationRef,
      toFirestoreData({
        points: pointsAfter,
        updatedAt: serverTimestamp(),
      }),
    );

    return { redemptionId, pointsAfter };
  });
}
