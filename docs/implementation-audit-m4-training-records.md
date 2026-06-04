# Implementation Audit — M4 Training Records / PB

**Date:** 2026-06-03  
**Prerequisites:** M0 shell, M1 Auth, M2 Firestore athlete, M3 Training Tasks  
**Reference (read-only):** `blaze-skate-training/src/App.jsx` — PB records, time parsing, distance tabs

---

## Executive summary

M4 adds **per-distance PB record documents** in Firestore, domain time parsing/formatting, CRUD on `/training/records`, and dashboard/training summaries.

| Goal | Status |
|------|--------|
| `training/records/{distanceId}` schema | Done (`training/main/records/{distanceId}` — 10 segments) |
| `TimeEntry` + `DistanceRecordsDocument` | Done |
| Domain time utilities | Done |
| Records page UI | Done |
| Default distance bootstrap | Done |
| Dashboard PB cards | Done |
| Training home records summary | Done |
| Charts / legacy import / analysis sync / custom distances | Not implemented |

**Build:** `npm run build` — **PASS**

---

## 1. Files changed

### `packages/schema`

| File | Change |
|------|--------|
| `records.ts` | `TimeEntry`, `DistanceRecordsDocument`, `DEFAULT_TRAINING_DISTANCES` |
| `paths.ts` | `trainingRecord`, `trainingRecordsCollection` (10-segment paths) |
| `training.ts` | Deprecated legacy `TrainingRecord` |
| `index.ts` | Exports |

### `packages/skating-domain`

| File | Change |
|------|--------|
| `records.ts` | `parseTimeToSeconds`, `formatSecondsToTime`, `getBestTime`, `getLatestTime`, `sortRecordsByDate`, helpers |

### `packages/firebase-client`

| File | Change |
|------|--------|
| `firestore/refs.ts` | `trainingRecordRef`, `trainingRecordsCollectionRef` |
| `firestore/training-records.ts` | ensure defaults, add/update/delete entry |
| `firestore/sanitize.ts` | `serializeTimeEntry`, `serializeTimeEntries` |
| `firestore/bootstrap.ts` | Calls `ensureDefaultDistanceRecords` after user bootstrap |
| `index.ts` | Exports |

### `apps/web`

| File | Change |
|------|--------|
| `hooks/useTrainingRecords.ts` | Collection snapshot + defaults ensure |
| `hooks/useTrainingRecordActions.ts` | add / edit / delete |
| `pages/training/TrainingRecordsPage.tsx` | Full records UI |
| `pages/DashboardPage.tsx` | 500m PB, fastest lap PB, latest record |
| `pages/training/TrainingHomePage.tsx` | Records summary card + link |

---

## 2. Firestore schema changes

```text
artifacts/skatingx-production/users/{userId}/
└── athletes/{athleteId}/
    └── training/
        └── main/
            └── records/{distanceId}    # one doc per distance
```

### Document: `training/main/records/{distanceId}`

| Field | Type |
|-------|------|
| `distanceId` | string (matches doc id) |
| `label` | string (display name) |
| `unit` | `"seconds"` |
| `entries` | `TimeEntry[]` |
| `updatedAt` | server timestamp |

### `TimeEntry`

| Field | Required |
|-------|----------|
| `id` | string |
| `date` | `YYYY-MM-DD` |
| `timeSeconds` | number (> 0) |
| `note` | optional |
| `source` | `manual` \| `race` \| `training` |
| `createdAt` | ISO string |
| `updatedAt` | ISO on edit |

**Path note:** Blueprint `training/records/{distanceId}` is 9 segments from the app root; implementation uses anchor doc `training/main` (same pattern as M3 `taskHistory`) for a valid **10-segment** document path.

---

## 3. Time parsing / formatting rules

### `parseTimeToSeconds(input)`

| Input | Result |
|-------|--------|
| `49.8`, `49.80` | `49.8` seconds |
| `0:49.80` | `49.8` seconds |
| `1:44.23` | `104.23` seconds |
| `2:47.00` | `167` seconds |
| Empty / invalid / ≤ 0 / > 30 min | `null` |

- Colon form: `minutes * 60 + seconds` (decimal seconds allowed).
- Plain number: treated as total seconds.
- Precision rounded to 3 decimal places.

### `formatSecondsToTime(seconds)`

- With minutes: `M:SS.xx` (e.g. `1:44.23`).
- Under 60s: `SS.xx` (e.g. `49.80`).

### Best / latest

- **PB (best):** minimum `timeSeconds` in `entries`.
- **Latest:** newest `date`, then `createdAt` (via `sortRecordsByDate`).

---

## 4. Default distances

Created idempotently on bootstrap and on records hook mount (`ensureDefaultDistanceRecords`):

| distanceId | label |
|------------|-------|
| `333m` | 333m |
| `500m` | 500m |
| `777m` | 777m |
| `1000m` | 1000m |
| `1500m` | 1500m |
| `start_half_lap` | Start Half Lap |
| `start_lap` | Start Lap |
| `fastest_lap` | Fastest Lap |

---

## 5. CRUD behavior

| Action | Firestore |
|--------|-----------|
| Add entry | `updateDoc` or `setDoc` on single distance doc; appends to `entries` |
| Edit entry | `updateDoc` replaces one entry by `id` |
| Delete entry | `updateDoc` filters `entries` |
| Ensure defaults | `setDoc` only if doc missing |

- Writes use `toFirestoreData()` / `serializeTimeEntry()` (no `undefined`).
- Other distance documents are never overwritten.
- `activeAthleteId` from `settings/main` drives `athleteId` in hooks.

---

## 6. Dashboard integration

New stat cards on `/dashboard`:

- **500m PB** — best entry for `500m`
- **Fastest lap PB** — best entry for `fastest_lap`
- **Latest record** — most recent entry across all default distances

Existing task/points/streak cards unchanged.

---

## 7. Training overview integration

`/training`:

- **Records** summary card: total entry count + 500m PB snippet + link to `/training/records`
- Nav tile updated from “Coming soon” to “PB times by distance”

---

## 8. Manual testing checklist

### Setup

- [ ] Signed-in user with Firestore rules allowing read/write under their tree
- [ ] Bootstrap creates 8 empty `training/main/records/*` docs (or on first visit to Records)

### Records page

- [ ] `/training/records` — distance tabs switch list
- [ ] Add: date + `49.8` → appears in list
- [ ] Add: `0:49.80` and `1:44.23` parse correctly
- [ ] Empty time / date shows validation message
- [ ] Best / Latest cards update after add
- [ ] PB badge on fastest entry in list
- [ ] Edit entry — form prefill, save updates Firestore
- [ ] Delete — confirm dialog, entry removed
- [ ] Empty state when no entries

### Dashboard / training home

- [ ] 500m PB card after adding 500m time
- [ ] Fastest lap PB after lap entry
- [ ] Latest record shows most recent across distances
- [ ] Training home shows entry count + 500m PB

### Firestore console

- [ ] `training/main/records/500m` has `entries[]` with `timeSeconds`, no undefined fields
- [ ] Other distance docs unchanged when editing one distance

---

## 9. Known limitations

| Limitation | Notes |
|------------|-------|
| Fixed distance set | No custom distances UI |
| No charts | Trend chart deferred |
| No legacy import | Old `records` / `records777` blobs not migrated |
| No analysis sync | Analysis sessions do not create entries |
| Single athlete subscription | Hooks use `activeAthleteId` but provider still bootstraps `lindsay` only |
| Dual `ensureDefaultDistanceRecords` | Bootstrap + records hook both call ensure (idempotent) |
| Max time 30 minutes | Parser rejects longer times as invalid |
| Collection listener | Dashboard + Records page each mount `useTrainingRecords` (duplicate listeners if both open) |
| RTL time input mask | Legacy `formatTimeInput` digit mask not ported; free-form parse instead |

---

## Related

- [implementation-audit-m3-training-tasks.md](./implementation-audit-m3-training-tasks.md)
- [SKATINGX_ARCHITECTURE_BLUEPRINT.md](./SKATINGX_ARCHITECTURE_BLUEPRINT.md)
