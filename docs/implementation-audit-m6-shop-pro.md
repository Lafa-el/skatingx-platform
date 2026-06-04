# Implementation Audit — M6 Shop / Rewards / PRO

**Date:** 2026-06-03  
**Prerequisites:** M0–M5  
**Reference (read-only):** `blaze-skate-training/src/App.jsx` — `buyReward`, `customRewards`, `rewardHistory`, `isPro`, `parentPin`

---

## Executive summary

M6 adds a **reward catalog**, **point redemptions** (Firestore transaction), **redemption history**, and **PRO / parent settings foundation** on `settings/main`.

| Goal | Status |
|------|--------|
| `training/main/rewards/catalog` | Done |
| `training/main/redemptions/{id}` | Done |
| Default reward catalog | Done (5 items) |
| `/training/shop` UI | Done |
| Redemption transaction | Done |
| PRO manual flag + Settings toggle | Done |
| Custom rewards CRUD | Placeholder only (Option A) |
| Stripe / WeChat / PIN hash | Not implemented |

**Build:** `npm run build` — **PASS**

---

## 1. Files changed

### `packages/schema`

| File | Change |
|------|--------|
| `rewards.ts` | `RewardItem`, `RewardsCatalogDocument`, `RewardRedemption`, `RedemptionStatus` |
| `defaults-rewards.ts` | Default catalog items |
| `user.ts` | `isPro`, `parentPinEnabled` docs |
| `defaults.ts` | `isPro: false`, `parentPinEnabled: false` on new users |
| `paths.ts` | `trainingRewardsCatalog`, `trainingRedemption`, `trainingRedemptionsCollection` (10-segment paths) |

### `packages/skating-domain`

| File | Change |
|------|--------|
| `rewards.ts` | Localize names, sort rewards/redemptions, status labels |

### `packages/firebase-client`

| File | Change |
|------|--------|
| `firestore/training-rewards.ts` | `ensureDefaultRewardsCatalog`, `redeemReward` transaction |
| `firestore/settings.ts` | `updateUserSettings` |
| `firestore/refs.ts` | Catalog + redemptions refs |
| `firestore/bootstrap.ts` | Seed catalog on bootstrap |
| `index.ts` | Exports |

### `apps/web`

| File | Change |
|------|--------|
| `hooks/useRewardsShop.ts` | Catalog + redemptions listeners |
| `hooks/useRewardActions.ts` | Redeem action |
| `pages/training/TrainingShopPage.tsx` | Full shop UI |
| `pages/SettingsPage.tsx` | PRO toggle, parent PIN note |
| `pages/training/TrainingAcademyPage.tsx` | PRO coming-soon section |
| `pages/DashboardPage.tsx` | Points, latest redemption, PRO |
| `pages/training/TrainingHomePage.tsx` | Shop card |

---

## 2. Firestore schema changes

```text
artifacts/skatingx-production/users/{userId}/
├── settings/main
│   ├── isPro: boolean
│   ├── parentPinEnabled?: boolean
│   └── parentPinHash?: string   # not written in M6
└── athletes/{athleteId}/
    ├── gamification/main        # points balance (canonical)
    └── training/main/
        ├── rewards/catalog      # RewardsCatalogDocument
        └── redemptions/{redemptionId}
```

**Path note:** Blueprint `training/rewards/catalog` is 9 segments (invalid). Implementation uses **`training/main/rewards/catalog`** (10 segments), same anchor pattern as records/task history.

### `training/main/rewards/catalog`

| Field | Type |
|-------|------|
| `items` | `RewardItem[]` |
| `updatedAt` | server timestamp |

### `training/main/redemptions/{id}`

| Field | Type |
|-------|------|
| `id` | string |
| `rewardId` | string |
| `rewardName` | string (localized at redeem time) |
| `cost` | number |
| `redeemedAt` | ISO string |
| `status` | `pending` \| `approved` \| `used` \| `cancelled` |
| `note` | optional |

---

## 3. Reward catalog model

### Default items (bootstrap)

| id | EN | ZH | Cost | Icon |
|----|----|----|------|------|
| `reward_ice_cream` | Ice cream treat | 冰淇淋奖励 | 80 | 🍦 |
| `reward_movie_night` | Movie night | 电影之夜 | 120 | 🎬 |
| `reward_sticker` | Skating gear sticker | 滑冰装备贴纸 | 150 | 🏷️ |
| `reward_dinner` | Choose dinner | 自选晚餐 | 200 | 🍽️ |
| `reward_screen_time` | Extra screen time | 额外屏幕时间 | 250 | 📱 |

Each `RewardItem` includes `nameZh`, `nameEn`, optional descriptions, `icon`, `cost`, `isActive`, `createdAt`, `updatedAt`.

---

## 4. Redemption logic

**Function:** `redeemReward` — single Firestore **transaction**.

1. Read `rewards/catalog` + `gamification/main`.
2. Find reward by `rewardId` with `isActive === true`.
3. Verify `points >= cost` (and cost matches catalog — anti-tamper).
4. `pointsAfter = max(0, points - cost)`.
5. `set` `redemptions/{newId}` with `status: "pending"`.
6. `update` `gamification/main.points`.

**Not in transaction:** catalog document (read-only during redeem). Concurrent redeems are serialized per athlete gamification doc.

**Points floor:** `Math.max(0, points - cost)` — cannot go negative.

---

## 5. PRO flag implementation

| Location | Field | M6 behavior |
|----------|-------|-------------|
| `settings/main` | `isPro` | Default `false` on bootstrap; manual toggle on Settings page |
| `settings/main` | `parentPinEnabled` | Default `false`; displayed read-only |
| `settings/main` | `parentPinHash` | Schema only — **never written** in M6 |

**Settings UI:** Enable / Disable PRO (dev) via `updateUserSettings`. Copy explains no Stripe/WeChat.

**Academy:** All import features remain **unblocked** in M6. Bottom card lists future PRO features.

**Shop:** PRO shows custom-rewards **placeholder**; non-PRO shows locked message (no hard block on default catalog redeem).

---

## 6. Security limitations

| Topic | M6 status |
|-------|-----------|
| Parent PIN | Not collected; no plaintext PIN; no hash stored |
| PRO entitlement | Client-writable `isPro` — suitable for dev only |
| Reward cost | Re-validated server-side against catalog in transaction |
| Admin roles | None |
| Payment fraud | N/A — no payments |
| Redemption approval | Always `pending`; no parent approve flow yet |

---

## 7. Manual testing checklist

### Bootstrap / catalog

- [ ] New user bootstrap creates `training/main/rewards/catalog` with 5 items
- [ ] `/training/shop` lists rewards sorted by cost

### Redeem

- [ ] With enough points → redeem → points decrease, history entry appears
- [ ] Insufficient points → button disabled / error on forced path
- [ ] Confirm dialog before redeem
- [ ] `gamification/main.points` never below 0

### History

- [ ] Redemption list shows name, date, cost, status badge
- [ ] Empty state when no redemptions

### PRO / Settings

- [ ] Settings → Enable PRO (dev) → Dashboard PRO card shows Active
- [ ] Shop custom rewards section shows placeholder when PRO on
- [ ] Academy still allows import when PRO off

### Dashboard / training home

- [ ] Dashboard: points, latest redemption, PRO status
- [ ] `/training`: shop card with points + link

---

## 8. Known limitations

| Limitation | Notes |
|------------|-------|
| Custom rewards CRUD | Placeholder only (Option A) |
| Redemption status workflow | Always `pending`; no parent approve UI |
| Legacy `rewardHistory` | Not migrated from blaze-skate-training blob |
| Catalog edits | No UI to edit catalog; bootstrap-only seed |
| `isPro` security | Any client can flip flag via Settings (dev) |
| Parent PIN | Documented only; no lock on shop/settings |
| PRO shop lock on redeem | Legacy locked redeem for non-PRO not replicated — catalog open to all |
| Multiple rapid redeems | Serialized via gamification doc transaction |

---

## Related

- [implementation-audit-m3-training-tasks.md](./implementation-audit-m3-training-tasks.md)
- [implementation-audit-m5-academy.md](./implementation-audit-m5-academy.md)
- [SKATINGX_ARCHITECTURE_BLUEPRINT.md](./SKATINGX_ARCHITECTURE_BLUEPRINT.md)
