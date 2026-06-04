# Implementation Audit — M0 / Platform Skeleton

**Repository:** `skatingx-platform`  
**Audit date:** 2026-06-03  
**Reference architecture:** [SKATINGX_ARCHITECTURE_BLUEPRINT.md](./SKATINGX_ARCHITECTURE_BLUEPRINT.md) (v2.0)  
**Prior validation:** [PHASE-1-VALIDATION.md](./PHASE-1-VALIDATION.md)  
**Method:** Static tree review, blueprint diff, automated `typecheck` / `build` (no code changes)

---

## Executive summary

The repo is a **functional monorepo skeleton** suitable for continued implementation. Core shell routes, layouts, workspace packages, env-based Firebase init, schema interfaces, and in-memory active-athlete context are in place. **TypeScript and production build pass** with zero errors at audit time.

| Area | Verdict | Notes |
|------|---------|--------|
| 1. Folder structure | **Partial** | Matches blueprint at `apps/web` + `packages/*`; missing `firebase/`, `scripts/`, `features/`, `public/` |
| 2. Routing correctness | **Pass (MVP scope)** | All Phase 1 required paths implemented; blueprint “full” route map incomplete |
| 3. TypeScript errors | **Pass** | `schema` + `web` in root `typecheck`; other packages compile standalone |
| 4. Build configuration | **Pass** | npm workspaces + Vite 6; not pnpm/turbo per merge-audit checklist |
| 5. Firebase client structure | **Partial** | Init + env only; no Auth, Firestore, repos, persistence |
| 6. Package structure | **Pass (skeleton)** | Five packages present; three largely unused in app |
| 7. Blueprint alignment | **Partial** | Strong shell alignment; gaps on infra, features layout, SDK version, Zod |

**M0 (bootstrap) readiness:** **Adequate for local dev and M1/M2 feature work**, but **not** complete against merge-audit M0 items (CI, `firebase/` rules, DR-001 project binding, pnpm).

---

## 1. Folder structure

### Actual tree (implementation)

```text
skatingx-platform/
├── apps/web/
│   ├── index.html
│   ├── vite.config.ts
│   ├── tsconfig.json, tsconfig.node.json
│   ├── package.json
│   ├── dist/                    # build output (gitignored)
│   └── src/
│       ├── main.tsx
│       ├── app/
│       │   ├── App.tsx
│       │   ├── router.tsx
│       │   ├── navigation.ts
│       │   └── providers/
│       │       └── activeAthleteContext.tsx
│       ├── layouts/             # AppShell, TrainingLayout, AnalysisLayout
│       ├── pages/               # flat + training/ + analysis/
│       ├── components/          # Header, BottomNav, SubNav, AthleteSelector, …
│       └── styles/index.css
├── packages/
│   ├── schema/src/              # types, paths, constants (multi-file)
│   ├── skating-domain/src/
│   ├── firebase-client/src/
│   ├── content/src/
│   └── ui/src/
├── docs/                        # blueprint, decisions, audits, PHASE-1-VALIDATION
├── .env.example
├── package.json                 # npm workspaces
├── package-lock.json
└── README.md
```

### Blueprint §7 comparison

| Blueprint path | Present | Comment |
|----------------|---------|---------|
| `apps/web` | Yes | Single SPA as specified |
| `apps/web/public/` | **No** | No static assets folder (favicon, etc.) |
| `src/features/{dashboard,training,…}` | **No** | Logic lives under `pages/` + `components/` instead |
| `packages/schema` | Yes | Expanded beyond skeleton (M2 types) |
| `packages/skating-domain` | Yes | Placeholder only |
| `packages/firebase-client` | Yes | Init layer only |
| `packages/content` | Yes | Placeholder only |
| `packages/ui` | Yes | Button, Card |
| `firebase/` (rules, indexes, `firebase.json`) | **No** | M0 merge-audit item not started |
| `scripts/migrate/`, `scripts/seed/` | **No** | Expected post–Phase 2 |

### Dependency rule (blueprint)

**`apps/web` → packages only:** **Satisfied.** No package imports from `apps/web`.  
**Packages cross-import:** None observed (`schema` is acyclic).

---

## 2. Routing correctness

**Router:** React Router 7 (`react-router-dom` ^7.6.2) in `apps/web/src/app/router.tsx`, mounted from `App.tsx`.

### Phase 1 / skeleton routes (required)

| Path | Implemented | Layout | Page |
|------|-------------|--------|------|
| `/` → `/dashboard` | Yes | — | `Navigate` |
| `/dashboard` | Yes | `AppShell` | `DashboardPage` |
| `/training` | Yes | `TrainingLayout` | `TrainingHomePage` |
| `/training/tasks` | Yes | `TrainingLayout` | `TrainingTasksPage` |
| `/training/academy` | Yes | `TrainingLayout` | `TrainingAcademyPage` |
| `/training/records` | Yes | `TrainingLayout` | `TrainingRecordsPage` |
| `/training/shop` | Yes | `TrainingLayout` | `TrainingShopPage` |
| `/analysis` | Yes | `AnalysisLayout` | `AnalysisHubPage` |
| `/analysis/biomechanics` | Yes | `AnalysisLayout` | `AnalysisBiomechanicsPage` |
| `/analysis/pacing` | Yes | `AnalysisLayout` | `AnalysisPacingPage` |
| `/analysis/equipment` | Yes | `AnalysisLayout` | `AnalysisEquipmentPage` |
| `/athlete` | Yes | `AppShell` | `AthletePage` |
| `/ai-coach` | Yes | `AppShell` | `AiCoachPage` |
| `/settings` | Yes | `AppShell` | `SettingsPage` |
| `*` fallback | Yes | — | Redirect → `/dashboard` |

**Verdict:** **Correct** for agreed skeleton scope.

### Blueprint §6 routes not yet implemented

| Path | Blueprint intent | Status |
|------|------------------|--------|
| `/training/records/:distance` | Distance detail | Missing |
| `/training/plan` | Junior D weekly plan | Missing |
| `/analysis/sessions` | Session history | Missing |
| `/analysis/sessions/:sessionId` | Session detail | Missing |
| `/athlete/new` | Create athlete | Missing |
| `/athlete/:athleteId` | Edit profile | Missing |
| `/knowledge`, `/knowledge/:slug` | Knowledge base | Missing |
| `/ai-coach/recommendations` | Pending actions | Missing |
| `/settings/account` | Email auth | Missing |
| `/settings/parent` | PIN, PRO | Missing |

### Navigation chrome (blueprint §6)

| Element | Status |
|---------|--------|
| Mobile bottom bar (Dashboard, Training, Analysis, AI Coach, Settings) | Implemented (`BottomNav` + `primaryNav`) |
| Athlete switcher in header | Implemented (`AthleteSelector` placeholder roster) |
| Training sub-nav | Implemented (`SubNav` in `TrainingLayout`) |
| Analysis sub-nav | Implemented (`SubNav` in `AnalysisLayout`) |
| Route code splitting (biomechanics, pacing) | **Not implemented** — single bundle (~280 kB JS) |

### Routing quirks

- **`/athlete` uses `AppShell`** while blueprint lists athlete list under AppShell — aligned.
- **No nested settings or athlete routes** — acceptable for M0; add when Auth/settings port starts (M1+).

---

## 3. TypeScript errors

### Commands (audit run)

```bash
npm run typecheck   # @skatingx/schema + @skatingx/web
npm run build       # tsc --noEmit && vite build (@skatingx/web)
```

**Result:** **Exit code 0** — no TypeScript errors reported.

### Coverage gaps

| Package | Root `typecheck` | Standalone `tsc` |
|---------|------------------|------------------|
| `@skatingx/schema` | Yes | Pass |
| `@skatingx/web` | Yes | Pass (via build) |
| `@skatingx/firebase-client` | No | Pass |
| `@skatingx/ui` | No | Pass |
| `@skatingx/skating-domain` | No | Pass |
| `@skatingx/content` | No | **No `tsconfig.json`** |

**Verdict:** **No errors in checked targets.** Recommend extending root `typecheck` to all packages and adding `packages/content/tsconfig.json` for parity.

### Strictness (`apps/web/tsconfig.json`)

- `strict`, `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`, `noUncheckedSideEffectImports` — **good baseline**.

---

## 4. Build configuration

### Monorepo

| Item | Blueprint / merge-audit | Actual |
|------|----------------------|--------|
| Workspaces | pnpm (merge-audit Phase 1 checklist) | **npm workspaces** (`package.json` `workspaces`) |
| Orchestration | Optional turbo | **None** — scripts delegate to `@skatingx/web` only |
| Root scripts | — | `dev`, `build`, `typecheck` |

### `apps/web`

| Item | Value |
|------|--------|
| Bundler | Vite **6.4.x** (blueprint cites Vite 8 — version drift) |
| React | **19.x** |
| CSS | Tailwind **4.x** via `@tailwindcss/vite` |
| Build | `tsc --noEmit && vite build` |
| Output | `apps/web/dist/` |

### Vite aliases (`vite.config.ts`)

All `@skatingx/*` packages resolve to **TypeScript source** under `packages/*/src/index.ts` (no pre-build of packages). **`@/*` → `src/*`** for app imports.

**Verdict:** **Build configuration is valid and reproducible** for the web app. Gaps: no CI workflow file, no lint script, no shared TS project references, package version mismatch vs blueprint tooling notes.

---

## 5. Firebase client structure

**Package:** `packages/firebase-client`

### Implemented (aligned with blueprint env pattern)

| Export / file | Role |
|---------------|------|
| `readFirebaseConfigFromEnv()` | Reads six `VITE_FIREBASE_*` keys from `import.meta.env` |
| `isFirebaseConfigComplete()` | Guards init when keys missing |
| `initFirebase()` | `initializeApp` singleton; **no-op + `console.warn`** if incomplete |
| `getFirebaseApp()` | Returns app instance or null |
| `src/vite-env.d.ts` | Env typing for package |

**App wiring:** `apps/web/src/main.tsx` calls `initFirebase()` at startup. **No hardcoded Firebase config** — matches Analysis legacy pattern.

### Not implemented (blueprint §4, §8)

| Capability | Blueprint target | Status |
|------------|------------------|--------|
| SDK version | `firebase` ^**12.x** | **`^11.6.1`** installed |
| `VITE_PLATFORM_APP_ID` | Default `skatingx-production` | **Not in `.env.example` or client** |
| Auth | anonymous, email link, custom token | **Missing** |
| `enableIndexedDbPersistence` | All routes | **Missing** |
| Firestore repositories | `AthleteRepo`, `TrainingRepo`, etc. | **Missing** |
| Transaction helpers | Plan check-in | **Missing** |
| Embed overrides | `__initial_auth_token`, `__app_id` | **Missing** |

**Verdict:** **Structure is correct for M0 init-only**; package is a thin wrapper, not yet the “Firebase layer” described in the blueprint.

---

## 6. Package structure

### Workspace layout (`npm ls` at audit)

All five packages symlink correctly under `@skatingx/web`:

- `@skatingx/schema`
- `@skatingx/skating-domain`
- `@skatingx/firebase-client`
- `@skatingx/content`
- `@skatingx/ui`

### Usage in `apps/web` (runtime imports)

| Package | Declared dep | Used in `src` |
|---------|--------------|---------------|
| `@skatingx/firebase-client` | Yes | `main.tsx` |
| `@skatingx/ui` | Yes | `DashboardPage`, `AthletePage` |
| `@skatingx/schema` | Yes | `activeAthleteContext` (types only) |
| `@skatingx/skating-domain` | Yes | **Not imported** |
| `@skatingx/content` | Yes | **Not imported** |

### Package maturity vs blueprint §8

| Package | Blueprint expectation | Current state |
|---------|----------------------|---------------|
| **schema** | Types + Zod + path builders | **Interfaces + `paths` + `PLATFORM_APP_ID`**; **no Zod** |
| **skating-domain** | Legacy pure functions | Single placeholder `formatPlaceholderTime` |
| **firebase-client** | Init + auth + repos | Init + env only |
| **content** | academy.json, plans, i18n | `CONTENT_VERSION` placeholder |
| **ui** | Tokens, primitives, charts | `Button`, `Card` only |

**Verdict:** **Package boundaries match blueprint names and dependency direction.** Content is stub-level except **schema** (ahead of skeleton) and **ui** (minimal).

---

## 7. Architecture blueprint compliance

### Product / technical principles

| Principle | Skeleton support |
|-----------|------------------|
| Single deployable `apps/web` | Yes |
| No video upload by default | N/A (no analysis logic yet) |
| Env-based Firebase | Yes |
| Athlete-scoped data model | **Partial** — `activeAthleteContext` + `Athlete` type; no Firestore `userId` / `settings/main` |
| Deep links | Yes (React Router) |

### Major gaps vs target architecture

| Topic | Gap |
|-------|-----|
| **Auth (M1)** | No `AuthProvider`, anonymous/email flows |
| **Firestore** | No reads/writes; path helpers exist in schema only |
| **Legacy migration** | No `scripts/migrate/*` |
| **Security rules** | No `firebase/firestore.rules` |
| **Knowledge module** | No routes or content |
| **AI Coach** | Placeholder page only |
| **Training / Analysis features** | Placeholder pages only |
| **Gamification / User settings** | Types only; not wired to UI state beyond athlete |
| **OPEN_DECISIONS** | DR-001 (Firebase project) etc. still block production config |

### Ahead of blueprint skeleton

| Item | Notes |
|------|--------|
| **Schema types (M2)** | `User`, `Athlete`, `Gamification`, `TrainingTask`, `TrainingRecord`, `Race`, `Reward`, `EquipmentRecord`, `AnalysisSession`, `AnalysisTag`, extended `paths` |
| **Active athlete system** | `ActiveAthleteProvider`, `AthleteSelector`, Lindsay + demo roster |
| **Extended route set** | More than merge-audit “Phase 1” minimum (`/training/*`, `/analysis/*` subroutes) |

### Provider stack vs blueprint `providers/`

Blueprint lists: Auth, Firebase, Athlete, Theme, i18n.

| Provider | Status |
|----------|--------|
| Athlete | **`ActiveAthleteProvider`** (in-memory) |
| Firebase | Init only in `main.tsx`, no context |
| Auth | Missing |
| Theme | Missing |
| i18n | Missing |

---

## 8. Application layer notes

### Layouts

- **`AppShell`**, **`TrainingLayout`**, **`AnalysisLayout`** — match blueprint naming.
- Training/Analysis layouts duplicate header + bottom nav (intentional for sub-nav sections).

### State

- **`activeAthleteContext.tsx`**: default `lindsay` / Lindsay Lin / `2015-01-14`; does not persist selection to `localStorage` or Firestore.
- **No `User` / `Gamification` context** — schema types exist but unused in UI.

### Pages

- All feature routes render **`PagePlaceholder`** or minimal dashboard/athlete content — **no legacy port**.

---

## 9. Documentation and ops

| Artifact | Status |
|----------|--------|
| `README.md` | Run instructions present |
| `.env.example` | Six Firebase vars (matches client; missing `VITE_PLATFORM_APP_ID` from blueprint) |
| `docs/PHASE-1-VALIDATION.md` | Phase 1 checks documented |
| CI (lint/build) | **Not in repo** |
| `firebase/` deploy config | **Not in repo** |

---

## 10. Findings summary

### Strengths

1. Clear monorepo layout with enforced **app → packages** dependency direction.
2. **Complete MVP route map** for training/analysis shell with working layouts and nav.
3. **Strict TypeScript** on web app; clean production build.
4. **Firebase init** follows non-hardcoded env pattern.
5. **Schema package** anticipates Firestore document shapes and path helpers.
6. **Athlete switcher** demonstrates multi-athlete UX without backend.

### Risks / debt (prioritized)

| Priority | Item | Suggested phase |
|----------|------|-----------------|
| P0 | Approve DR-001; add real `.env` / Firebase project | M0 ops |
| P0 | Add `firebase/firestore.rules` + indexes | M0 |
| P1 | Auth provider + Firestore repos in `firebase-client` | M1 |
| P1 | Persist `activeAthleteId` to `settings/main` | M2 |
| P1 | Add Zod validators alongside schema interfaces | Phase 2 schema |
| P2 | Align Firebase SDK to ^12.x | Before Auth port |
| P2 | Route lazy splits for biomechanics/pacing | M9–M10 |
| P2 | Introduce `features/` or document `pages/` as intentional deviation | Ongoing |
| P3 | npm → pnpm + CI workflow | M0 checklist closure |
| P3 | Wire unused workspace packages or remove from web deps until needed | Hygiene |

---

## 11. Audit checklist (M0)

| M0 / bootstrap item (merge-readiness) | Done? |
|---------------------------------------|-------|
| Git repo + monorepo | Yes |
| `apps/web` Vite + React + Router + Tailwind | Yes |
| Placeholder routes | Yes (exceeds minimum) |
| `packages/firebase-client` env init | Yes |
| `packages/schema` paths/types | Partial (types yes; Zod no) |
| `firebase/` rules deployed | **No** |
| CI lint + build | **No** |
| DR-001 Firebase project decided | **Open** (see OPEN_DECISIONS) |
| Legacy code migration | **No** (by design) |

---

## 12. Conclusion

The **skatingx-platform code skeleton is structurally sound** for continuing implementation: routing, builds, and package wiring work; the implementation **follows the blueprint’s high-level shape** (single web app, shared packages, env Firebase, athlete-centric model).

It is **not yet a complete M0 bootstrap** per merge-readiness (missing CI, Firebase rules, production project binding, pnpm). It **exceeds a minimal shell** in routes, schema types, and athlete UX, while **lagging the full blueprint route map and Firebase/Auth layer**.

**Recommended next steps (no code in this audit):**

1. Close DR-001 and add `firebase/` + deploy pipeline.
2. M1: Auth + `firebase-client` repositories (read-only profile/gamification first).
3. Persist athlete selection to `User.activeAthleteId` when Firestore is available.
4. Add CI running `npm run typecheck` and `npm run build`.

---

## Related documents

- [SKATINGX_ARCHITECTURE_BLUEPRINT.md](./SKATINGX_ARCHITECTURE_BLUEPRINT.md)
- [merge-readiness-audit.md](./merge-readiness-audit.md) — M0–M13 migration order
- [PHASE-1-VALIDATION.md](./PHASE-1-VALIDATION.md)
- [SKATINGX_OPEN_DECISIONS.md](./SKATINGX_OPEN_DECISIONS.md)
