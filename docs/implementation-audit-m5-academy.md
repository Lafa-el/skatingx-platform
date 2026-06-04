# Implementation Audit — M5 Academy Content + Import

**Date:** 2026-06-03  
**Prerequisites:** M0–M4  
**Reference (read-only):** `blaze-skate-training/src/App.jsx` — `BLAZE_ACADEMY`, `importAcademyRoutine`, `importSingleTask`

---

## Executive summary

M5 adds **static BLAZE Academy content** in `@skatingx/content` and **import into today’s Firestore tasks** (`training/state` → `todayTasks`) with `source: "academy"`, duplicate prevention by `academyItemId`, and UI on `/training/academy`.

| Goal | Status |
|------|--------|
| Structured academy catalog (zh/en) | Done |
| `/training/academy` UI | Done |
| Import single item | Done |
| Import day plan / weekday routine | Done |
| Tasks page academy badges | Done |
| Training home academy card | Done |
| Firestore content collections | Not added (static TS only) |
| PRO gating / PDF / AI Coach | Not implemented |

**Build:** `npm run build` — **PASS**

---

## 1. Files changed

### `packages/content`

| File | Change |
|------|--------|
| `src/academy-types.ts` | `AcademyStage`, `AcademyModule`, `AcademyItem`, `WeeklyRoutine`, etc. |
| `src/academy.ts` | Helpers: `getAcademyStages`, `localizeAcademyItem`, `findAcademyItem` |
| `src/academy-stages.generated.ts` | Merged zh/en catalog (generated) |
| `src/academy-legacy-raw.cjs` | Extracted legacy `BLAZE_ACADEMY` (regen input) |
| `scripts/generate-academy.mjs` | Regenerate catalog from legacy |
| `src/index.ts` | Public exports |
| `package.json` | `./academy` export, `generate:academy` script |

### `packages/schema`

| File | Change |
|------|--------|
| `training.ts` | `TrainingTask.academyItemId?`, `tags?` |

### `packages/skating-domain`

| File | Change |
|------|--------|
| `src/academy.ts` | Fuzzy routine match, import candidates, duplicate check |
| `src/tasks.ts` | `normalizeTask` preserves academy fields |
| `package.json` | Depends on `@skatingx/content` |

### `packages/firebase-client`

| File | Change |
|------|--------|
| `firestore/training-tasks.ts` | `importAcademyTasks` transaction |
| `firestore/sanitize.ts` | Serialize `academyItemId`, `tags` |
| `index.ts` | Exports |

### `apps/web`

| File | Change |
|------|--------|
| `hooks/useAcademyImport.ts` | Import item / day plan / weekday |
| `pages/training/TrainingAcademyPage.tsx` | Full academy UI |
| `pages/training/TrainingTasksPage.tsx` | Academy badge, description, tags |
| `pages/training/TrainingHomePage.tsx` | Academy summary + link |

---

## 2. Academy content model

### Stages (3)

| id | Age | Modules (approx) |
|----|-----|------------------|
| `age4_6` | 4–6 | 4 modules, 16 items |
| `age7_10` | 7–10 | 5 modules, 27 items |
| `age11_16` | 11–16 | 5 modules, 27 items |

### `AcademyItem`

- Bilingual: `titleZh` / `titleEn`, `descriptionZh` / `descriptionEn`, `targetZh` / `targetEn`
- `category`: inferred (`dryland`, `strength`, `mobility`, `technique`, `recovery`, …)
- `tags`: from legacy `tag` field (space-split)
- Stable `id`: `{stageId}-m{moduleIdx}-i{itemIdx}`

### `WeeklyRoutine`

- `dayPlans[]`: legacy weekly cards (day label, title, duration, task label strings)
- `days`: `monday`…`sunday` maps for weekday import selector
- **No bulk “import entire week” button** — reference-only multi-day layout; per-day import only (safe)

### Regeneration

```bash
cd packages/content && npm run generate:academy
```

Reads `src/academy-legacy-raw.cjs` (from `blaze-skate-training` `BLAZE_ACADEMY`).

---

## 3. Import logic

### Single item

1. User taps **Import today** on an `AcademyItem`.
2. `buildAcademyImportCandidate` → localized title, description, target, tags.
3. `importAcademyTasks` Firestore transaction appends to `todayTasks`.

### Day plan (legacy weekly card)

1. User taps **Import this plan to today** on a `dayPlan`.
2. Each `taskLabel` fuzzy-matched via `matchRoutineTaskLabel` (legacy-aligned rules).
3. Unmatched labels import as fallback manual text + target split from label string.

### Weekday selector

1. User picks weekday (Mon–Sun) + **Import day**.
2. Imports all `weeklyRoutine.days[weekday]` routine labels (same matching as above).

### `TrainingTask` fields written

| Field | Value |
|-------|--------|
| `text` | Localized title |
| `description` | Localized description |
| `target` | Localized target/dosage |
| `source` | `"academy"` |
| `academyItemId` | Catalog id (or stable fallback id for unmatched routine lines) |
| `tags` | Item tags or `academy-routine` |
| `completed` | `false` |
| `createdAt` | ISO timestamp |

---

## 4. Duplicate prevention

- Before append, `filterNewAcademyCandidates` skips any task where `source === "academy"` and `academyItemId` already exists in **today’s** `todayTasks`.
- UI disables **Add** when item already imported (`hasAcademyItemImportedToday`).
- Transaction returns `{ imported, skipped }`; UI shows counts.
- Rollover archives tasks; same `academyItemId` may be imported again on a new calendar day.

---

## 5. Training tasks integration

On `/training/tasks`:

- **Academy** badge when `source === "academy"`
- **Description** line when present
- **Tags** line when present
- Target line unchanged

---

## 6. Training overview integration

On `/training`:

- **Academy** card with default reference stage (`age7_10` if present)
- Nav tile links to `/training/academy` with stage hint

Language follows `settings/main.language` (`zh` | `en`).

---

## 7. Manual testing checklist

### Academy page

- [ ] `/training/academy` — switch age stages (4–6, 7–10, 11–16)
- [ ] Expand modules, read zh content (Settings → language zh)
- [ ] Switch Settings to en — titles/descriptions in English
- [ ] Import one item → message shows imported count
- [ ] Same item shows **Added** / disabled second import
- [ ] Import a **day plan** → multiple tasks on `/training/tasks`
- [ ] Import **weekday** (e.g. Tuesday for age4_6) → expected tasks
- [ ] Unmatched routine strings still create tasks (fallback text)

### Tasks

- [ ] Academy tasks show badge, description, tags
- [ ] Complete/uncomplete still updates points (M3)

### Firestore

- [ ] `training/state` `todayTasks[]` entries have `source: "academy"`, `academyItemId`, no `undefined`

---

## 8. Known limitations

| Limitation | Notes |
|------------|-------|
| Static content only | No Firestore academy CMS; regen script for updates |
| No PRO lock | Legacy locked items beyond first per module not replicated |
| No RTL time-style input | N/A for academy |
| Full-week bulk import | Intentionally omitted; per day plan / weekday only |
| Fallback routine ids | Unmatched labels use synthetic `academyItemId`; duplicate skip only if same id |
| Default stage on /training | Shows `age7_10` placeholder, not user-selected stage |
| Large JS bundle | Full catalog embedded in client bundle |
| `academy-legacy-raw.cjs` | Committed extract for regeneration; not loaded at runtime |

---

## Related

- [implementation-audit-m3-training-tasks.md](./implementation-audit-m3-training-tasks.md)
- [implementation-audit-m4-training-records.md](./implementation-audit-m4-training-records.md)
