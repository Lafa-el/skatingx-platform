# ADR-004: App-wide zh/en language switch

| Field | Value |
|---|---|
| Status | **Accepted (2026-10-17, owner approved).** Scope, timing and handling of user-entered text decided by the owner 2026-10-16 (section 2). Slices S6a–S6e are delivered; the Chinese wording was reviewed by the owner slice by slice. Sign-in error messages and the connection banner follow in A3. |
| Date | 2026-10-16 |
| Branch | `feat/i18n-s6a` |
| Supersedes | ADR-001, line "Existing pages hard-code mixed zh/en and bypass unified i18n; new module uses a unified i18n resource, old pages are untouched." Only that line; the rest of ADR-001 stands. |
| Why | The language setting (`settings/main.language`) changes only Race Day. The rest of the app is English text written into components, or, in Academy, Shop and the Pro banner, `language === "en" ? … : …` mixed inline. AGENTS.md forbids both. |
| Rule | AGENTS.md: zh/en text lives in unified i18n resources keyed by domain, never inline in components; locale-aware formatting for dates, numbers, units, currency. |
| Related | ADR-001 (Race Day i18n, D7 offline), `shared/i18n/translator.ts`, `shared/i18n/settings-messages.ts` |

---

## 1. Current state (measured, not estimated)

A syntax-tree scan (`apps/web/src/test/hardcoded-text.ts`) of every non-test source file in `apps/web/src` found **22 files and about 290 pieces of hardcoded text**. `modules/race-day` has none. Largest: `TrainingAcademyPage` (45), `TrainingShopPage` (38), `TrainingHomePage` (38), `SettingsPage` (38), `TrainingRecordsPage` (28), `DashboardPage` (24), `TrainingTasksPage` (21), `ProPlanBanner` (14), `app/navigation.ts` (14).

The scan counts text in JSX, text attributes (`aria-label`, `placeholder`, `title`, `alt`, …), display properties in objects (`label`, `title`, `message`, …) and every comparison of a value with `"en"` or `"zh"`. It cannot see text assembled somewhere unusual (for example a string built in a utility and passed down); those are caught in the manual zh/en walk-through of each slice, which stays mandatory.

Already bilingual and **not** in scope to re-translate: Academy lessons and stage labels (`@skatingx/content`, paired `titleZh/titleEn` fields) and reward names (`skating-domain/rewards.ts`). Their paired-field selection stays where it is, because it picks data, not interface text.

## 2. Decisions

| # | Decision | Reason |
|---|---|---|
| D1 | **Scope: the whole app**, delivered as slices S6a–S6e (section 5). | Owner decision 2026-10-16. |
| D2 | **Text the user typed is never translated**: names, notes, task titles, event and race names, video labels. Only interface text, built-in content and formatting change with the language. | Owner decision 2026-10-16. Translating it would change the user's own data. |
| D3 | **Merge and release as each slice is accepted**, not held for the Buffalo event. | Owner decision 2026-10-16, informed that S6b changes the shared navigation after the S5c "do not change the Shell" decision and that the change reaches Production before the event. The owner accepts that risk. Mitigation: S6b is its own slice, reversible alone (section 7). |
| D4 | **Resource layout follows the existing pattern.** One typed resource file per domain in `shared/i18n/` (`nav`, `shell`, `dashboard`, `athlete`, `aiCoach`, `settings`, `training`, `analysis`, `plan`), each exporting `tXxx = createTranslator(resources)`. A component calls `useLocale()` and `tXxx(locale, key)`, as `LanguageSetting` and Race Day already do. No new library, no new hook. | Smallest change; `Resources<K>` already makes a missing or extra translation a compile error. |
| D5 | **Keys are named by domain**, `dashboard.card.todayTraining`, never by English sentence. Placeholders are `{name}`, identical in both languages (existing test pattern). Plurals and counts use separate keys or number-free wording; no string concatenation of translated pieces. | AGENTS.md; word order differs between zh and en. |
| D6 | **The locale comes from one place**: `useLocale()` / `toLocale()`. Components do not compare a language value with `"en"`. Choosing text by language is the translator's job. | The comparison is how mixed text got in; the scan reports it. |
| D7 | **Dates, numbers, units and money use `Intl`** with the current locale, through shared helpers (for example the Race Day `lib/schedule.ts` day format). No hand-built date strings. | AGENTS.md. |
| D8 | **A test keeps it this way.** `i18n-coverage.test.ts` scans the app. Until S6e, files not yet migrated were listed with their slice and the list only shrank. S6e emptied it, so the list is gone (A2): any file with hardcoded text fails. | Prevents silent regressions and an unfinished slice hiding. |
| D9 | **Wording rules.** Chinese is written as natural Chinese, not word-for-word. Terms are fixed once in a glossary (section 4) and reused. Text must not claim more than the app computes: no "AI", "biomechanical analysis" or "diagnosis" wording where the feature does not do it (AGENTS.md privacy and claims rules). Unverified data keeps the existing "待确认 / Pending" terms. | Consistency; honesty. |

## 3. Non-goals

- No new languages. No per-page language, no automatic detection from the browser.
- No change to business logic, data, Firestore schema, Security Rules, indexes or dependencies.
- No layout or visual redesign. Only text changes; if a longer English or Chinese phrase breaks a layout, the layout is fixed minimally in that slice.
- No translating of Academy lesson content or user-entered text (D2).
- No changes to Race Day text, except moving a string both modules need into the shared layer if a slice requires it.
- No Service Worker, no change to the offline behavior in ADR-001 D7.
- No legacy repository is modified.

## 4. Glossary (draft; owner reviews)

The legacy training app is English only, so there is no earlier Chinese wording to keep. Race Day already fixed some terms; the rest are proposals.

| English | 中文 | Source |
|---|---|---|
| Race Day | 比赛日 | existing |
| Schedule / Results / Videos / Summary | 赛程 / 成绩 / 视频 / 总结 | existing |
| Pending (unverified) | 待确认 | existing, mandated by AGENTS.md |
| Settings | 设置 | existing |
| Dashboard | 总览 | proposed |
| Training | 训练 | proposed |
| Tasks | 任务 | proposed |
| Academy | 学院 | proposed |
| Records | 纪录 | proposed |
| Shop | 商店 | proposed |
| Analysis | 分析 | proposed |
| Athlete | 运动员 | proposed |
| Pro | Pro (kept in Latin) | proposed |
| AI Coach | AI 教练 | owner decision 2026-10-16: translate the existing name; the feature is only a placeholder |
| Biomechanics | 动作分析 | owner decision 2026-10-16: "生物力学" would claim more than the placeholder page does (D9) |
| Firestore (shown to users) | 数据服务 in Chinese; English keeps "Firestore" | owner decision 2026-10-16: parents and athletes should not see a product name they do not know |

Each slice's PR lists the Chinese text for that slice in a table so the owner can review it without reading code.

## 5. Slices

Each slice is its own branch and draft PR, merged by the owner, and releasable alone. Tests are written first; behavior stays identical.

| Slice | Content | Files (from the scan) |
|---|---|---|
| **S6a** (this PR) | This ADR; the scanner and its tests; the coverage test with the not-migrated list. **No user-visible change.** | `docs/adr`, `apps/web/src/test`, `apps/web/src/shared/i18n` |
| **S6b** | Shell and navigation: bottom nav, sub navigation labels, athlete selector, status banner, placeholder, language setting, locale derivation in `useIsPro`. Update the settings language note ("some screens are still English") once true. | `app/navigation.ts`, `components/*`, `hooks/useIsPro.ts` |
| **S6c** | Dashboard, Athlete, AI Coach, Settings pages. | `pages/*.tsx` |
| **S6d** | Training: Home, Tasks, Records, Academy, Shop; the Pro banner they share; `useAcademyImport`, `useRewardsShop`. The ~75 inline language branches become resource keys. | `pages/training/*`, `components/ProPlanBanner.tsx`, `hooks/*` |
| **S6e** (done, A2) | Analysis pages (four small placeholder pages). Then empty the not-migrated list. | `pages/analysis/*` |

Hooks follow the page that uses them, so `useAcademyImport` and `useRewardsShop` are in S6d, not S6e.

## 6. Risks

| Risk | Mitigation |
|---|---|
| A string is missed and one language shows the other's text | The scan, plus a per-page zh/en walk-through in each slice's PR; resource tests for same keys, same placeholders, no empty text. |
| S6b changes navigation, the path to every page, shortly before the field test | Own slice; links, routes and `isNavActive` are not changed, only labels; tests for each tab in both languages; owner checks on a phone. Revert is one PR. |
| English or Chinese text longer than before breaks a layout | Re-run the long-text check from S5b at 320 and 375 px for each slice. |
| Main bundle grows. Pages are not lazy-loaded today (only Race Day is), so these resources ship in the main chunk | About 300 strings in two languages, expected well under 10 kB gzip; measured and reported in every slice. Route-level lazy loading of the pages is a separate PR (AGENTS.md), after which the resources can move with the routes. |
| A Chinese phrase reads wrongly to a skater or parent | Owner reviews the table per slice; nothing merges without that. |
| Wording over-claims ("AI", "analysis") | D9; checked in review. |

## 7. Rollback

Every slice is front-end text only: no data, schema, rules, index or dependency change. Revert the slice's PR, or promote the previous Vercel deployment. S6b can be reverted without S6c–S6e, because the not-migrated list and the resources are per slice. No data rollback is needed.

## 8. Validation per slice

`npm ci`, `npm run lint`, `npm run typecheck`, `npm run test -- --run`, `npm run build`; `npm run test:rules` and `npm run test:migration` once per PR as a regression check although nothing in them changes. Plus: mutation checks on the key replacements, bundle size before and after, zh and en walk-through at 320 and 375 px, and the owner's phone check.

## 9. Amendments

### A1 (2026-10-17, owner approved): imported Academy tasks are written in one language

Section 3 says this work changes no data. One exception, agreed with the owner: when a drill is imported into today's tasks, its **tags** are now written in the language active at that moment, like the title, target and description already were. Before, the tags were always Chinese, so an English task carried Chinese tags.

- **What changes.** Only the value of `tags` on newly imported tasks. The field, its type and `academyItemId` are unchanged. No schema, Security Rules, index or dependency change; the rules do not look at `tags`. Nothing in the code reads `tags` except to show them.
- **Existing tasks are not touched.** They keep the tags they were written with. There is no migration and no read-time mapping: the English tags are written per drill, not word for word from the Chinese (32 of 66 drills have a different number of words, and one Chinese word maps to several English ones), so a stored Chinese tag cannot be translated reliably.
- **What the user sees.** A task shows the text it was written with, as for all user task text (D2). A task imported in Chinese keeps Chinese tags after a switch to English, next to its Chinese title, so a task never mixes the two.
- **Rollback.** Revert the PR; new imports are written in Chinese again. English tags already written stay as they are and display as stored. No data repair is needed.

### A2 (2026-10-17): S6e done, the not-migrated list is removed

- **Coverage test.** `NOT_MIGRATED` is deleted together with its "listed file still has hardcoded text" test. `i18n-coverage.test.ts` is now the plain rule from D8: no file in the app may have hardcoded text. The "scans the app" test stays so an empty scan cannot pass by accident.
- **Settings note.** The language setting no longer says that some screens are still English; every screen follows the setting. The text is now only "选择界面语言。" / "Choose the interface language."
- **Analysis pages.** They are placeholders and say no more than that: "动作分析" (never "生物力学", D9), and the shared placeholder note. A test checks that the Chinese never says "生物力学" on them. The English hub note no longer says "Biomechanics lab" (a placeholder has no lab; owner approved 2026-10-17); it now reads "Biomechanics, pacing charts, and equipment tracking."
- **Still shown as received, not translated (A3 later translated the sign-in ones).** Sign-in / sign-up error messages that come from the identity layer, and messages that come back from the data layer (Firestore errors), are shown as they arrive. Translating the sign-in ones touches `packages/firebase-client` identity code and is a separate slice with its own risk and rollback notes.
- **Rollback.** Revert the PR; the pages show their English text again and the setting note returns to the previous wording. No data change.

### A3 (2026-10-17, owner approved): sign-in error messages and the connection banner

A2 left sign-in errors as received and said translating them "touches identity code". The slice avoids that: the mapping lives in `apps/web`, and `packages/firebase-client` (including `getAuthErrorMessage`) is not modified.

- **What changes.** `AuthProvider` keeps what happened as a note, `{ key }` or `{ received }`, instead of an English sentence. `SettingsPage` turns the note into text in the current language when it draws it, so an error already on screen follows a language switch. New file `shared/i18n/auth-messages.ts` holds the ten known Firebase codes, the general "身份验证失败。" and the two "Firebase is not configured" texts. The banner details that `FirestoreProvider` produces itself (not configured, service not available, failed to initialise) are handled the same way.
- **English is unchanged.** A test compares each English text with `getAuthErrorMessage` for all ten codes and for the fallback cases, so the English wording cannot drift from the identity layer.
- **Not translated, shown as received (owner decision).** A code that is not in the table, an error with no code that has its own message ("No signed-in user to link."), and messages that come from the data layer. Unknown codes are looked up with `Object.hasOwn`, so names like `constructor` are not taken for codes.
- **The setup message is fully translated** (owner decision); `.env.example`, `.env.local` and `VITE_FIREBASE_*` stay as written.
- **Language of connection-banner problems.** They appear before the settings are loaded, so the language is not known yet and the banner is Chinese, the app default. This was already so for its fixed prefix; the detail now matches it. English is used when the settings were already known.
- **Risks.** Identity: no change to sign-in, link, sign-out, uid handling or Security Rules; the catch blocks still rethrow where they did. Privacy: development logging is now `[auth] <operation> failed` with the error code only, never the message, email or password (a test checks this). Account enumeration: the "wrong email or password" and "email already registered" texts are the same as before, in two languages; this slice neither adds nor removes any distinction.
- **Left alone.** `getAuthErrorMessage` is no longer called by the app but stays as public API of `firebase-client`.
- **Rollback.** Revert the PR; the English sentences come back. No data change.
