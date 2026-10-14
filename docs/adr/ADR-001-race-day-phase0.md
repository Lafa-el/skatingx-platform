# ADR-001: Race Day Companion Phase 0 — scope, data root, environment

| Field | Value |
|---|---|
| Status | **Accepted by owner (2026-10-14); pending reviewer sign-off** |
| Date | 2026-10-14 |
| Branch | `feat/race-day-phase0` |
| Deadline | Runnable by 2026-10-22; field test at Buffalo Championships 2026-10-24/25 |
| Governing rules | `AGENTS.md`, `.cursor/rules/00-project-standard.mdc` (no other rule source) |
| Related | DR-001 (Firebase project), DR-003 (Lindsay athlete), DR-012 (PRO model), DR-015 (staging topology) in `docs/SKATINGX_OPEN_DECISIONS.md`; ADR-002 (tooling dependencies) |

AGENTS.md requires an ADR when code and the standard conflict, and before any change touching Auth, Firestore schema, Security Rules or privacy boundaries. This ADR covers all four for the Race Day Companion (Phase 0).

---

## 1. Context

Race Day Companion is a module inside SkatingX, not a separate app. It shares account, athlete profile and subscription with Training / Analysis / Journal.

MVP capabilities: follow athletes, personal schedule, results feed and archive, race video collection, post-race summary card. Schedule and results are free. Video and summary are the paid tier.

Field-test subject (facts given by the owner; nothing else may be assumed):

- Event: Buffalo Championships, 2026-10-24/25
- Athlete: Lindsay, bib #134, Division 6 Wings
- Events: 500m / 500m / 1000m / Super 1500m

Phase 0 data is entered manually, seeded from the confirmed registration roster, and always marked "待确认" (pending) until verified. No automatic parsing.

### Observed repository state (baseline, 2026-10-14)

- Monorepo: `apps/web` plus `packages/{schema,firebase-client,skating-domain,ui,content}`. This differs from the `src/{app,modules,shared,services}` layout in AGENTS.md. It is kept as-is; this task does not restructure it.
- Baseline `npm run typecheck`: PASS. Baseline `npm run build`: PASS. Main JS bundle 917.22 kB (244.14 kB gzip), CSS 20.19 kB (4.82 kB gzip), single chunk, no route-level code splitting.
- Not in repo: `firestore.rules`, `firestore.indexes.json`, `firebase.json`, `.firebaserc`, `vercel.json`, tests, ESLint, Vitest, CI. Scripts `lint`, `test`, `test:rules` do not exist.
- Firebase project in `.env.local`: `skatingx-platform` (exists; `(default)` Firestore, FIRESTORE_NATIVE).
- Current Firestore data root in code: `artifacts/skatingx-production/users/{uid}/...` (`packages/schema/src/paths.ts`).

---

## 2. Decisions

### D1. Data root: keep `artifacts/skatingx-production/users/{uid}/...`

**Conflict:** AGENTS.md specifies `users/{uid}` as the root. DR-001 (approved) and all existing code use `artifacts/skatingx-production/users/{userId}/...`.

**Decision:** Phase 0 keeps the existing prefix and adds `raceDay/...` under it. Reasons:

1. DR-001 explicitly states new writes use this prefix.
2. Existing settings, athlete and training data already live there; a second root would split one user across two trees.
3. Changing the root is a data migration (dry-run, reconciliation, runbook) that cannot fit the 2026-10-22 deadline.
4. The ownership rule shape (`request.auth.uid == userId`) is the same under either root.

**Consequences:** A future move to `users/{uid}` needs its own ADR and a migration under `docs/migration/`. All path construction must go through `packages/schema/src/paths.ts`, never string literals in UI, so the move stays a one-file change.

**Rollback:** The `raceDay` subtree is purely additive. Removing the feature leaves existing data untouched.

### D2. Firebase project for Phase 0: `skatingx-platform` as staging

**Decision:** The field test runs on `skatingx-platform`, treated as **staging**.

**Conflict with DR-001:** DR-001 approved a new production project `skatingx-prod`. As of 2026-10-14 that project does not appear in the project list of the authenticated Firebase CLI account. DR-015 (staging/dev topology) is still Open.

**Consequences / constraints:**

- Real data about a minor athlete will live in `skatingx-platform` during Phase 0. It must contain only what Phase 0 needs: names, bib, division, times, places, notes. No video files, no photos, no tokens.
- After Buffalo, this data must be moved to the final production project through a separate migration with dry-run, reconciliation and runbook. The shared path prefix (D1) keeps that mapping straightforward. This follow-up is recorded as an open item (section 6).
- Local development and automated tests use the Firebase Emulator, never this project (AGENTS.md "Environments and safety").

### D3. Module placement, routing, navigation

- New top-level route `/race-day` with its own layout, same pattern as `/training` and `/analysis`, **lazy-loaded at route level**.
- Sub-routes: index (today), `schedule`, `results`, `videos`, `summary`, `setup`.
- Code lives in `apps/web/src/modules/race-day/`. Schema in `packages/schema`, repository in `packages/firebase-client`, pure functions in `packages/skating-domain`.
- UI components do not issue Firestore queries; reads and writes go through the repository layer. Firebase SDK types do not escape into business models.
- Navigation: Race Day **replaces the placeholder "AI Coach" tab** in the bottom nav. The `/ai-coach` route is retained and stays reachable from the Dashboard card. Entry visibility is controlled by `VITE_FEATURE_RACE_DAY`.
- Not touched: Training and Analysis page behavior, `isPro` semantics, any legacy repository.
- Minimal edits to shared files are allowed and must be called out in the PR: `router.tsx`, `navigation.ts`, `SubNav.tsx` (hard-coded `end` for `/training` and `/analysis`).

### D4. Scope, non-goals, and interpretation of ambiguous terms

**In scope:** roster/follow list, personal schedule, manual result entry and results feed, video metadata, summary card, offline-tolerant reads/writes, zh/en via unified i18n, mobile and desktop.

**Non-goals (Phase 0):** automatic schedule/result parsing, system push notifications (FCM), video upload, video analysis, payments, shared multi-user event catalog, automatic PB sync, following other users' accounts, public sharing, changes to legacy repositories.

**Interpretations (owner to correct if wrong):**

- "成绩推送" = in-app results feed, updated when results are entered manually. Not an OS/system push.
- "比赛视频归集" = a metadata record per race (which race, which athlete, label, where the file lives, optional external link, note).

#### Video collection ≠ video analysis

This is a hard boundary for Phase 0:

- **Collection** stores **metadata only**. No file is uploaded to Firebase Storage, no logging platform, no analysis platform. No bytes, frames or object URLs are persisted.
- **Collection does not run MediaPipe, pose detection or any analysis**, and the UI must not describe it as analysis, scoring, "AI" or "biomechanics".
- Video analysis belongs to the Analysis module, is not migrated yet, and is out of Phase 0. If it is ever offered on race videos it needs its own design, user opt-in, and ADR (AGENTS.md "Privacy and video analysis").

#### Paid-tier placement is provisional

- Schedule and results: free.
- Video metadata and summary card: placed in the paid tier **provisionally for Phase 0**. This is a placement for the field test, not a final pricing or packaging decision, and may change. It must be revisited with DR-012 (PRO monetization model).
- The only gate available today is `settings/main.isPro`, which is **client-writable and not a security boundary** (known, documented in `docs/implementation-audit-m6-shop-pro.md`). Phase 0 uses it as a UX gate only. No Security Rule enforces payment. The Lindsay test account will have it enabled manually. Nothing in the UI or docs may claim server-side entitlement.

### D5. Data accuracy: "待确认" is a data field, not a style

- Every race-day document carries provenance: `verification: "pending" | "verified"`, `source: "manual"`, `sourceNote`, and `verifiedAt` once verified.
- Default on creation is `pending`. The UI shows a visible "待确认 / Pending" badge for every pending item. Confirmed-tone wording (for example "official result") is only allowed for `verified` items.
- Seeded facts are limited to the list in Context. Unknown fields (heat, round, time, lane, time zone, venue) are stored as `null` or omitted, never guessed. The two "500m" entries are two independent race records; their relationship is not assumed.
- Results never auto-write to PB records in Phase 0. "Super 1500m" is not in `DEFAULT_TRAINING_DISTANCES`; mapping is deferred.

### D6. Data model (draft; finalized in S1 with Rules and tests in the same PR)

```text
artifacts/skatingx-production/users/{uid}/raceDay/{eventId}
  roster/{rosterId}
  races/{raceId}
  results/{raceId}_{rosterId}     # deterministic id: re-saving updates, never duplicates
  videos/{videoId}                # metadata only
  summaries/main
```

All paths have an even segment count. Conventions follow AGENTS.md:

- Mutable documents: `createdAt`, `updatedAt`, `schemaVersion`, provenance.
- Instants stored as Firestore `Timestamp`, with the event's IANA time zone stored on the event (marked pending) and display converted per user locale. Calendar days as `YYYY-MM-DD`.
- Race times stored as seconds (number), consistent with the existing `TimeEntry`; parsing and formatting reuse `parseTimeToSeconds` / `formatSecondsToTime`.
- The summary output carries `summaryVersion`. It is a factual comparison (times, places, advancement, count of pending items). It makes no coaching, medical or biomechanical claims.
- Volume is small (fewer than ~50 documents per event). Reads load subcollections and filter on the client, so no composite index is required. `firestore.indexes.json` is still committed (may be empty).

### D7. Offline behavior: operational mitigation only

The app has Firestore IndexedDB persistence but **no Service Worker**. With no network, a page that is already loaded keeps working (reads from cache, writes queued). A **reload with no network fails**, because the app shell is not cached.

**Decision:** no PWA / Service Worker in Phase 0 (it needs a new dependency and adds schedule risk). Mitigation goes into the runbook: load the app and all data on the device before arriving, do not close the tab, do not force-refresh at the venue. Persistence also degrades when the app is open in a second tab. This limitation is a field-test acceptance item and is recorded in the PR.

### D8. Security Rules: inspect first, never blind-overwrite

Firestore applies a single ruleset to the whole project. The existing deployed rules are **unknown** (the M2 audit only assumed an owner rule).

Procedure (gate G1, see runbook):

1. Owner reads the currently published rules in the Firebase console and records them (runbook section C). No deployment happens before this.
2. The recorded text is committed verbatim as the baseline `firestore.rules` in its own commit, so every later change is a reviewable diff.
3. Race-day rules are added in a separate commit: owner-only access under `.../users/{userId}/raceDay/**`, with field validation (enum values, required fields, types, size limits) and no widening of any existing rule.
4. Emulator tests (allow and deny paths) ship in the same PR.
5. Deployment is manual, by the owner, after review. Previous rules remain in the console history for rollback.

If the current rules are test-mode or open to all, that is escalated to the owner as a separate risk before anything else is written.

---

## 3. Alternatives considered

| Option | Why not |
|---|---|
| Switch root to `users/{uid}` now | Data migration with its own runbook; does not fit the deadline; contradicts DR-001 note. |
| Reuse `training/races/{raceId}` and `Race` type | Belongs to the Training module; cross-module internal reads are forbidden. The type is unused and has no fields for roster, heat or provenance. |
| Global shared event catalog with admin writes | Needs role model and admin tooling; Phase 0 has one user and manual entry. Deferred. |
| Upload videos for collection | Violates the privacy default; needs separate processing design and opt-in. |
| Add Service Worker for offline reload | New dependency, schedule risk; mitigated operationally. |

---

## 4. Risks and rollback

| Risk | Mitigation | Rollback |
|---|---|---|
| Unknown existing Rules (may be open or expired test mode) | Gate G1: record before any write; baseline commit | Console rules history; `git revert` and redeploy |
| Real minor's data in a non-final project (D2) | Minimal fields, no media, tracked follow-up migration | Delete the `raceDay` subtree; data is additive |
| Anonymous account loses data (cache cleared or new device) | Checklist: upgrade Lindsay account to email before 2026-10-20 | N/A; prevention only |
| `isPro` is client-writable | Documented UX gate only; no entitlement claims | Remove gate; features default to free |
| Reload offline fails (no Service Worker) | Runbook procedure, rehearsal | Use cached tab or wait for connectivity |
| Timeline | Cut order: videos, then summary persistence; keep roster/schedule/results | Feature flag off |
| Event time zone is an assumption | Stored as pending, editable | Edit field |

---

## 5. Known debt (recorded, not fixed here)

- Existing pages hard-code mixed zh/en and bypass unified i18n; new module uses a unified i18n resource, old pages are untouched.
- `FirestoreProvider` subscribes with `DEFAULT_ATHLETE_ID` rather than `activeAthleteId`.
- No route-level code splitting anywhere except the new module.
- `ProLockedCard` / `ProPlanBanner` copy mentions "(dev)"; race-day uses neutral copy instead.
- Offline persistence uses the deprecated `enableIndexedDbPersistence` API.
- No password-reset flow in the UI; recovery goes through the Firebase console (runbook section D).

## 6. Open follow-ups

1. Move Phase 0 data to the final production project after Buffalo (separate migration, runbook, ADR).
2. Resolve DR-001 / DR-015: `skatingx-prod` project existence and staging topology.
3. Revisit paid-tier placement with DR-012.
4. Decide whether PWA/offline shell is warranted before the next event.

## 7. Verification of this ADR

- [ ] Owner review of D1–D8
- [ ] Reviewer sign-off (AGENTS.md: AI self-check does not replace human approval)
- [ ] Gate G1 result recorded in `docs/runbooks/race-day-phase0-s0-checklist.md`
