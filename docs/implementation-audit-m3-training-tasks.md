# Implementation Audit — M3 Training Tasks

**Date:** 2026-06-03  
**Prerequisites:** M0 shell, M1 Auth, M2 Firestore athlete profile  
**Reference (read-only):** `blaze-skate-training/src/App.jsx` — daily tasks, toggle, points, bonus, streak, rollover

---

## Executive summary

M3 adds **daily training tasks** with Firestore-backed CRUD, **points / daily bonus**, **completedDays**, **streakDays**, and **cross-day rollover** into `taskHistory/{dateId}`.

| Goal | Status |
|------|--------|
| Extended `training/state` | Done (blueprint `training/state/main`) |
| `taskHistory/{dateId}` | Done (`training/main/taskHistory/{dateId}`) |
| Training Tasks UI `/training/tasks` | Done |
| Completion / uncomplete + points | Done (transactions) |
| All-tasks bonus | Done |
| Cross-day rollover | Done (`TrainingDayRollover`) |
| Streak calculation | Done (`@skatingx/skating-domain`) |
| Dashboard + `/training` summary | Done |
| Academy / records / shop / AI Coach | Not implemented |

**Build:** `npm run typecheck` + `npm run build` — **PASS**

---

## Bug fix — undefined Firestore writes (2026-06-03)

**Error:** `Transaction.update() called with invalid data. Unsupported field value: undefined` on `trainingState/main`.

**Root cause:** Task toggles set `completedAt: undefined` on uncomplete; new tasks set `target: undefined`; optional fields were spread into `todayTasks` arrays written via `tx.update`.

**Fix:**

| Change | Location |
|--------|----------|
| `sanitizeForFirestore` / `toFirestoreData` | `packages/firebase-client/src/firestore/sanitize.ts` |
| `serializeTrainingTask` — omit empty `target`/`description`; no `completedAt` until completed | same |
| `applyTaskToggle` — `delete completedAt` instead of `undefined` | `packages/skating-domain/src/tasks.ts` |
| `normalizeTask` — strip undefined optional fields on read | same |
| All M3 `tx.set` / `tx.update` / bootstrap `setDoc` use `toFirestoreData()` | `training-tasks.ts`, `bootstrap.ts` |

**Path alignment (blueprint):**

| Before (M3 initial) | After |
|---------------------|-------|
| `athletes/{id}/trainingState/main` | `athletes/{id}/training/state` |
| `athletes/{id}/taskHistory/{dateId}` | `athletes/{id}/training/main/taskHistory/{dateId}` |

Blueprint notation `training/state/main` is **9 path segments** (invalid for `doc()`). State lives at document **`training/state`** (8 segments). Task history uses anchor doc **`training/main`** (10 segments) per blueprint tree.

**Migration:** Copy data from old paths if you already tested M3; bootstrap only creates new paths for new users.

---

## 1. Files changed

### `packages/schema`

| File | Change |
|------|--------|
| `training.ts` | `TrainingTask`, `TrainingState`, `TaskHistoryDay` |
| `paths.ts` | `training/state`, `training/main/taskHistory/{dateId}` |
| `defaults.ts` | `pointsPerTask: 20`, `dailyBonusPoints: 50` |
| `index.ts` | New exports |

### `packages/skating-domain`

| File | Change |
|------|--------|
| `dates.ts` | `todayDateString`, `previousDateString`, `compareDateStrings` |
| `streak.ts` | `calculateStreakDays` (legacy-aligned) |
| `tasks.ts` | `applyTaskToggle`, `normalizeTrainingState`, `createTaskId` |

### `packages/firebase-client`

| File | Change |
|------|--------|
| `firestore/refs.ts` | `taskHistoryRef` |
| `firestore/training-tasks.ts` | rollover, add, delete, toggle transactions |
| `firestore/sanitize.ts` | `sanitizeForFirestore`, `serializeTrainingTask`, `toFirestoreData` |
| `index.ts` | exports |

### `apps/web`

| File | Change |
|------|--------|
| `components/TrainingDayRollover.tsx` | Cross-day on load |
| `hooks/useTrainingActions.ts` | add / delete / toggle |
| `pages/training/TrainingTasksPage.tsx` | Full tasks UI |
| `pages/training/TrainingHomePage.tsx` | Summary + links |
| `pages/DashboardPage.tsx` | Live stats cards |
| `app/App.tsx` | Mount rollover |

---

## 2. Firestore schema changes

```text
artifacts/skatingx-production/users/{userId}/
├── settings/main
└── athletes/{athleteId}/
    ├── profile/main
    ├── gamification/main
    └── training/
        ├── state                   # todayTasks, lastLoginDate, points rules
        └── main/
            └── taskHistory/{dateId}
```

### `training/state` (blueprint: `training/state/main`)

| Field | Type | Default (new users / normalized) |
|-------|------|--------------------------------|
| `todayTasks` | `TrainingTask[]` | `[]` |
| `lastLoginDate` | `YYYY-MM-DD` | today |
| `pointsPerTask` | number | `20` |
| `dailyBonusPoints` | number | `50` |
| `weeklyTemplate` | `{ monday..sunday: "" }` | empty strings |
| `updatedAt` | timestamp | server |

### `training/main/taskHistory/{dateId}`

| Field | Type |
|-------|------|
| `dateId` | string (doc id) |
| `tasks` | `TrainingTask[]` (archived day; serialized, no undefined) |
| `archivedAt` | ISO string |

**Path note:** `training/taskHistory/{dateId}` alone is **9 segments** (invalid). Valid path uses anchor doc `training/main` (10 segments).

### `gamification/main` (unchanged layout, M3 logic)

| Field | M3 usage |
|-------|----------|
| `points` | +/- task and bonus |
| `completedDays` | add/remove today on all-complete |
| `streakDays` | recalculated on each toggle/delete |

### `TrainingTask`

| Field | Required |
|-------|----------|
| `id` | string (unique) |
| `text` | string |
| `target` | optional |
| `description` | optional |
| `source` | `manual` \| `academy` \| `system` |
| `completed` | boolean |
| `createdAt` | ISO string |
| `completedAt` | ISO when completed |

---

## 3. Task completion logic

**Entry:** `toggleTrainingTask` → Firestore transaction.

1. Read `training/state` + `gamification/main`.
2. `applyTaskToggle` (`@skatingx/skating-domain`):
   - Toggle `completed` / `completedAt`.
   - Adjust points by ±`pointsPerTask` (floor at 0).
   - If all tasks become complete: +`dailyBonusPoints`, append today to `completedDays`.
   - If all-complete undone: −bonus, remove today from `completedDays`.
   - Recompute `streakDays` from `completedDays`.
3. Write both documents with `updatedAt: serverTimestamp()`.

**Uncomplete:** subtracts `pointsPerTask`; points never below 0.

---

## 4. Points and bonus logic

| Event | Points | completedDays | streakDays |
|-------|--------|---------------|------------|
| Complete one task | +`pointsPerTask` | — | recalc |
| Uncomplete task | −`pointsPerTask` (min 0) | — | recalc |
| All tasks complete (first time today) | +`dailyBonusPoints` | add today | recalc |
| Uncomplete after all done | −`dailyBonusPoints` (min 0) | remove today | recalc |
| Delete completed task | −`pointsPerTask`; may −bonus | may remove today | recalc |

Defaults match legacy-ish values: **20** / **50** (configurable per doc).

---

## 5. Rollover logic

**Trigger:** `TrainingDayRollover` after auth + Firestore ready + `trainingState` loaded.

**Condition:** `today > lastLoginDate` (string compare `YYYY-MM-DD`).

**Transaction:**

1. If `todayTasks.length > 0` → `set` `taskHistory/{lastLoginDate}` with tasks snapshot.
2. `update training/state`: `todayTasks: []`, `lastLoginDate: today`.
3. Does **not** change `points` or `completedDays`.

Runs once per uid per day transition (in-memory guard).

---

## 6. Streak calculation

`calculateStreakDays(completedDays, today)`:

- If neither today nor yesterday in `completedDays` → `0`.
- Else count consecutive days backward from today (if today completed) or from yesterday.
- Stored on each toggle/delete in `gamification.streakDays`.

Aligned with legacy `computedStreak` in `App.jsx`.

---

## 7. Default document creation flow

M2 bootstrap unchanged; **new fields** on training state come from `createDefaultTrainingState()` for **new** docs only.

Existing M2 docs without `pointsPerTask` / `dailyBonusPoints` are **normalized in app** via `normalizeTrainingState()` (defaults 20 / 50).

Rollover does not rewrite missing fields; optional one-time migration not included.

---

## 8. Hooks and UI

| Hook / component | Role |
|------------------|------|
| `useUserSettings()` | M2 (unchanged) |
| `useActiveAthlete()` | M2 (unchanged) |
| `useAthleteProfile()` | M2 |
| `useGamification()` | M2 + M3 writes |
| `useTrainingState()` | M2 + M3 writes |
| `useTrainingActions()` | add / delete / toggle + busy/error |

### `/training/tasks`

- Task list, add form, complete/uncomplete, delete (confirm)
- Points rules card
- Loading / Firestore / action errors

### `/training`

- Summary cards: athlete, points, streak, tasks fraction
- Links to tasks, academy, records, shop (latter three still placeholders)

### `/dashboard`

- Athlete, points, streak, completed/total tasks
- Existing navigation cards retained

---

## 9. Manual testing checklist

### Setup

- [ ] Firebase rules allow authenticated user read/write under their tree
- [ ] `.env.local` configured; app loads as guest or registered user

### Tasks

- [ ] `/training/tasks` — add task (empty text blocked)
- [ ] Complete task → points +20 (default)
- [ ] Uncomplete → points −20 (not below 0)
- [ ] Add 2+ tasks, complete all → bonus +50, message shown
- [ ] Uncomplete one → bonus removed, today removed from `completedDays`
- [ ] Delete task → confirm dialog; points adjust if was completed

### Rollover

- [ ] Set `lastLoginDate` in console to yesterday with tasks present
- [ ] Reload app → `todayTasks` empty; `taskHistory/{yesterday}` exists
- [ ] Points unchanged

### Dashboard / training home

- [ ] Counts match tasks page
- [ ] Streak updates when today marked complete on all tasks

### Firestore console

- [ ] `training/state` has `todayTasks`, `pointsPerTask`, `dailyBonusPoints`
- [ ] `gamification/main` has `points`, `completedDays`, `streakDays`
- [ ] `taskHistory/{date}` after rollover

---

## 10. Known limitations

| Limitation | Notes |
|------------|-------|
| Single athlete | Subscriptions still fixed to `lindsay` |
| `activeAthleteId` switch | Does not re-subscribe or bootstrap other athletes |
| Task history UI | Archived days not browsable in app yet |
| `weeklyTemplate` | Stored only; not shown/edited |
| Academy import | `source: academy` reserved, not wired |
| Points rules UI | Not editable on settings (defaults in doc) |
| Streak vs `completedDays` | Streak derived on write; manual console edits to `completedDays` need retoggle to refresh streak |
| Legacy migration | No import from `blaze-skate-training` profile blob |
| Offline persistence | M2 behavior; multi-tab may skip IndexedDB cache |

---

## 11. Assumptions

- Training state document: **`training/state`** (blueprint `state/main`; `/main` doc id omitted for valid segment count).
- Task history: **`training/main/taskHistory/{dateId}`**.
- All Firestore writes strip `undefined` via `toFirestoreData()`.
- Timestamps on tasks use **ISO strings** in Firestore for M3 (server timestamps on parent docs).
- Auth logic untouched (M1).
- Legacy monolith not copied — domain rules extracted, not UI structure.

---

## Related

- [implementation-audit-m2-firestore-athlete.md](./implementation-audit-m2-firestore-athlete.md)
- [SKATINGX_ARCHITECTURE_BLUEPRINT.md](./SKATINGX_ARCHITECTURE_BLUEPRINT.md)
