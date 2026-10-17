# Implementation Audit — M6 Shop / Rewards / PRO

**Date:** 2026-06-03  
**Update 2026-10-17:** the Settings PRO switch described below (and its "(dev)" copy) was removed. `isPro` is now set by an administrator in the Firebase console, and the PRO banner and locked card no longer link to Settings. The read side (`useIsPro`, strict `isPro === true`) is unchanged. The rest of this document is the record as written in M6.  
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
| PRO UI gating (Academy / Shop / Dashboard) | Done |
| Custom rewards CRUD | Placeholder only (Option A) |
| Stripe / WeChat / PIN hash | Not implemented |

**Build:** `npm run build` — **PASS** (after PRO gating wiring)

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
| `hooks/useIsPro.ts` | Live `settings/main.isPro` + language for gated pages |
| `hooks/useRewardsShop.ts` | Catalog + redemptions listeners (no PRO logic) |
| `hooks/useRewardActions.ts` | Redeem action |
| `hooks/useAcademyImport.ts` | Throws if advanced import without PRO |
| `components/ProPlanBanner.tsx` | `ProPlanBanner`, `ProLockedCard` |
| `pages/training/TrainingShopPage.tsx` | Catalog redeem + PRO custom section |
| `pages/SettingsPage.tsx` | PRO dev toggle, payment disclaimer |
| `pages/training/TrainingAcademyPage.tsx` | Browse + single import free; bulk import gated |
| `pages/DashboardPage.tsx` | Plan card: Free plan / PRO active |
| `pages/training/TrainingHomePage.tsx` | Shop card reflects plan |

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

## 5. PRO flag and UI gating

### Source of truth

| Location | Field | Behavior |
|----------|-------|----------|
| `settings/main` | `isPro` | Default `false` on bootstrap; **strict** check: only `isPro === true` counts as PRO |
| `settings/main` | `parentPinEnabled` | Default `false`; displayed read-only |
| `settings/main` | `parentPinHash` | Schema only — **never written** in M6 |

**Hook:** `useIsPro()` subscribes to `useUserSettings()` (Firestore `onSnapshot` on `settings/main`). Academy, Shop, Dashboard, and Training home react without page reload when the Settings toggle changes.

**Settings UI:** Enable / Disable PRO (dev) via `updateUserSettings`. Copy: *"Development only. Payment is not implemented."*

### What `isPro` controls today

| Area | Free (`isPro === false`) | PRO (`isPro === true`) |
|------|--------------------------|-------------------------|
| **Daily tasks** (`/training/tasks`) | Full access | Unchanged |
| **Records** (`/training/records`) | Full access | Unchanged |
| **Academy browse** | Stages, modules, weekly routine **visible** | Same |
| **Academy — single item import** | Enabled (per drill in expanded module) | Enabled |
| **Academy — weekday / day-plan import** | UI disabled + `ProLockedCard`; `useAcademyImport` throws if invoked | Import weekday + import day plan enabled |
| **Academy — PRO card** | Hidden | Shows “PRO features” list (advanced import on; AI/custom plans listed as coming) |
| **Shop — catalog redeem** | Enabled | Enabled |
| **Shop — custom rewards** | `ProLockedCard` | Placeholder management card (“PRO active”) |
| **Shop / Academy banners** | `ProPlanBanner`: Free plan | `ProPlanBanner`: PRO active |
| **Dashboard Plan card** | “Free plan” | “PRO active” |
| **Training home Shop card** | “Free plan · catalog rewards only” | “PRO active · catalog + custom rewards (placeholder)” |

### What remains placeholder (not gated off — not built)

| Feature | M6 status |
|---------|-----------|
| Custom rewards CRUD | Copy-only placeholder when PRO; no Firestore writes |
| AI-powered training plans | Listed on Academy PRO card only |
| Custom training plans | Listed on Academy PRO card only |
| Payment / Stripe / WeChat | Not implemented |
| Parent PIN lock on shop/settings | Not implemented |
| Server-side PRO enforcement | Client dev flag only; redeem transaction does not check `isPro` |
| Redemption approve / status workflow | Always `pending` |

### Shared components

- **`ProPlanBanner`** — top-of-page plan status on Shop (and reusable elsewhere).
- **`ProLockedCard`** — amber lock card with link to Settings; used for Academy routine lock and Shop custom rewards.

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

### Redeem (not PRO-gated)

- [ ] With enough points → redeem → points decrease, history entry appears
- [ ] Insufficient points → button disabled / error on forced path
- [ ] Confirm dialog before redeem
- [ ] `gamification/main.points` never below 0
- [ ] With PRO **off**, catalog redeem still works

### History

- [ ] Redemption list shows name, date, cost, status badge
- [ ] Empty state when no redemptions

### Settings PRO toggle

- [ ] Settings shows: “Development only. Payment is not implemented.”
- [ ] Toggle **Enable PRO (dev)** → status line shows “PRO active”
- [ ] Toggle **Disable PRO (dev)** → status line shows “Free plan”
- [ ] No page reload required for other tabs (live snapshot)

### PRO gating — Dashboard & training home

- [ ] Dashboard **Plan** card: “Free plan” when PRO off, “PRO active” when on
- [ ] `/training` Shop card copy matches plan (free vs PRO)

### PRO gating — Shop

- [ ] PRO off: `ProPlanBanner` shows Free plan; catalog section redeemable
- [ ] PRO off: Custom rewards shows locked `ProLockedCard`
- [ ] PRO on: `ProPlanBanner` shows PRO active; custom rewards placeholder card
- [ ] Toggle PRO on Settings while Shop is open → banner and custom section update

### PRO gating — Academy

- [ ] PRO off: browse stages/modules; **single** “Add to today” on a drill still works
- [ ] PRO off: weekly routine section shows locked card with message: *PRO required for advanced routine import and AI-powered training plans*
- [ ] PRO off: weekday select + Import day / Import plan buttons disabled (greyed)
- [ ] PRO on: weekday + day-plan import enabled; bottom **PRO features** card visible
- [ ] PRO on: advanced import succeeds; PRO off: forced import path shows error from hook

### Not blocked (regression)

- [ ] `/training/tasks` — complete tasks with PRO off
- [ ] `/training/records` — add/view records with PRO off
- [ ] Academy module expand/collapse with PRO off

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
| PRO shop lock on redeem | Catalog intentionally open to all; only custom rewards section is PRO-gated |
| PRO server enforcement | `redeemReward` does not read `isPro`; gating is UI + academy import hook only |
| Multiple rapid redeems | Serialized via gamification doc transaction |

---

## Related

- [implementation-audit-m3-training-tasks.md](./implementation-audit-m3-training-tasks.md)
- [implementation-audit-m5-academy.md](./implementation-audit-m5-academy.md)
- [SKATINGX_ARCHITECTURE_BLUEPRINT.md](./SKATINGX_ARCHITECTURE_BLUEPRINT.md)
