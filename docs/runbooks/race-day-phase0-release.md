# Race Day Phase 0 — release and field-day runbook

Applies to the Buffalo Championships field test, **2026-10-24/25**. Athlete: Lindsay (bib #134). This replaces the draft section H of `race-day-phase0-s0-checklist.md`.

Staging is the release: `https://skatingx-platform-web.vercel.app` (Vercel project `skatingx-platform-web`, production deployments of `main`), backed by the `skatingx-platform` Firebase project. Phase 0 data is entered by hand and stays marked "待确认" until someone checks it against the official source.

## Timeline

| Date | What |
|---|---|
| 2026-10-18 – 10-19 | Owner runs the staging checks: the S5b items below, `race-day-phase0-offline-rehearsal.md` on the race-day phone, and the manual steps of the earlier slice runbooks that have not been re-run. |
| 2026-10-20 | Owner sends findings. |
| 2026-10-21 | Fixes for findings only, one small PR each. **Code freeze that evening.** |
| 2026-10-22 | Runnable. Release record (below) filled in. |
| 2026-10-23 | Evening-before procedure on the race-day phone. |
| 2026-10-24/25 | Field test. |

After the freeze only a fix for something that blocks the field test goes in, as its own PR with the owner's approval. No dependency upgrades, no refactors, no new features.

## Release checklist (owner, 2026-10-22)

Everything here can be checked from a browser or the consoles. Tick each and fill in the record.

- [ ] `main` has the intended last commit and its CI run is green (lint, typecheck, tests, build, rules tests).
- [ ] A **Production** deployment exists in Vercel for exactly that commit and is Ready. A merge once produced no deployment (2026-10-16); if there is none, create one from the Vercel dashboard for `main`. Do not deploy from a local folder: the release must be tied to a Git commit.
- [ ] Vercel production environment has `VITE_FEATURE_RACE_DAY=true` and the six `VITE_FIREBASE_*` values for project `skatingx-platform`. A changed value needs a redeploy.
- [ ] The Rules published in the Firebase console are identical to `firestore.rules` on `main` (open the Rules tab and compare). Rules are published by hand; the app cannot do it. Note the console's last-published time in the record, which is also the rollback point.
- [ ] The race-day account: language chosen in Settings, and `isPro` set to `true` in the Firebase console on `users/{uid}/settings/main` (Videos and Summary are behind it; the flag is a temporary arrangement, not an entitlement). The Settings page has no PRO switch since PR B, so confirm Lindsay can open Videos and Summary **before** relying on it.
- [ ] The event exists with the right days, the time zone `America/New_York` and the venue. Entries seeded from a template or typed in are still "待确认" until checked. Nothing is shown as confirmed unless you confirmed it.
- [ ] Roster: Lindsay marked "这是我自己的运动员", bib #134, plus anyone followed. Schedule: every race that is known, with the time where known.
- [ ] Smoke test below passed on the race-day phone.

## Smoke test (10 minutes, after the last deployment)

1. Open the staging URL on the race-day phone, signed in. Open Race Day.
2. Today shows the event, the phase ("距离比赛还有 N 天" or "今天是比赛日"), and the next race.
3. Schedule, Results, Videos, Summary and Setup open and show the data. Switch the language once and back.
4. Enter a throw-away result on a throw-away race, see it on Today and Summary, delete it.
5. Reload once online. Everything is still there.

## Evening before (2026-10-23, on the race-day phone, on good network)

1. Sign in. Open Race Day. Open **every** tab once (Today, Schedule, Results, Videos, Summary, Setup). This downloads the whole module and loads the data.
2. Confirm: no error banner, pending markers visible, Today shows the right phase.
3. Charge the phone and bring a charger or battery pack. Turn off auto-lock or set it long, so the screen stays on while in use.
4. Use the normal browser, **not private mode**. Close all other tabs of the app.

## At the venue

1. Do not close the tab, do not force-refresh, do not open the app in a second tab or window, do not clear site data.
2. If the network drops, keep working. Changes show on screen and say "已保存在本机". They are sent when the network returns.
3. After each result, check it shows 待确认. Mark it confirmed only after comparing with the official result.
4. If you see "有一项修改未能同步到服务器,已被撤销": enter that change again and check it.
5. If the page is lost while offline (the browser shows "no internet"), restore the network and reload. Changes queued before the page was lost are kept (rehearsal step 12).
6. Anything the app cannot do (it does not parse official results, play or upload video, or give advice) is done on paper or in your own tools. Treat the pending count on Today as the list of results still to check.

## Known limits, accepted for Phase 0

| Limit | Why it is accepted | What to do |
|---|---|---|
| No Service Worker: reload or first open with no network fails (ADR-001 D7) | A PWA needs a new dependency and adds schedule risk | Procedure above and the rehearsal |
| If the Race Day module has not been opened yet and the network is down, opening it fails; the app has no error screen for that (it can show a blank area) | Part of the same limit; the app shell is outside this slice | Open Race Day on good network first (evening before) |
| Only one tab holds the offline copy | Firestore limitation of the persistence mode used | One tab only |
| PRO is a client-side flag, not enforced by Security Rules | Phase 0 trial; the copy says it is temporary | None |
| The next race on Today is the first without a result, not by the clock | Avoids guessing on late or reordered races; the page says so | Enter results as races finish |
| Data is entered by hand; nothing is read from the official site | Phase 0 scope | Check against the official source |
| Region of the Firestore database is `nam5` and cannot be changed | Fixed in S0 | None |

## Rollback

Choose the smallest step that fixes the problem. None of them deletes user data: Phase 0 only adds data under `raceDay/...`.

| Step | How | Effect | Time |
|---|---|---|---|
| 1. Previous build | Vercel dashboard, Deployments, open the last good Production deployment, Promote / Instant Rollback | The site serves the old build at once | Minutes |
| 2. Hide Race Day | Set `VITE_FEATURE_RACE_DAY` to `false` in Vercel and redeploy | The Race Day route and tab are gone; data stays in Firestore | A deploy (about a minute) |
| 3. Revert the change | `git revert` of the merge commit, as a PR to `main` | Code goes back, tied to a commit | A PR and a deploy |
| 4. Rules | Firebase console, Rules, history: restore the previous version | Rules go back. Only needed if a rules change was published; none is planned for the field test | Minutes |

Data written by a later build is ignored by an earlier one; leftover documents are harmless and can be deleted from the console.

## Release record

Pre-filled on 2026-10-17 for commit `2902f8f`. Items marked "owner-reported" were told to the agent and were **not** independently verified by it. If `main` changes before the freeze, repeat the rows that depend on the commit and update the record on 2026-10-22.

| Item | Value |
|---|---|
| `main` commit | `2902f8f` (merge of #34), 2026-10-17 |
| CI run | [success](https://github.com/Lafa-el/skatingx-platform/actions/runs/39083713866), 2026-10-17 8:41 PM EDT. Includes lint, typecheck, tests, build, rules tests |
| Vercel Production deployment (URL and time) | GitHub deployment status `success` for `2902f8f`, 2026-10-17 8:42 PM EDT, `https://skatingx-platform-gkuecskyk-lafa-el-s-projects.vercel.app`. The Ready state in the Vercel dashboard was not checked by the agent; owner-reported OK |
| Rules last published (console time) | _owner to fill in_ (owner-reported: console Rules match `firestore.rules` on `main`) |
| Vercel env: feature flag and Firebase project checked by / date | Owner-reported OK, 2026-10-17. _owner to confirm name and time_ |
| Race-day account: `isPro` set, Videos and Summary open | Owner-reported OK, 2026-10-17 |
| Event, time zone, venue, roster and schedule | Owner-reported OK, 2026-10-17. Entries stay "待确认" until checked against the official source |
| Phone-width check (agent) | 2026-10-17, 80 combinations at 320 px and 375 px: six Race Day pages, Chinese and English, normal, empty and long-text data, plus the locked Videos and Summary pages. No horizontal overflow, no control under 44 px, no stuck loading state. Also the PRO banner and locked card (Academy, Shop). Test data only; the temporary test page was deleted and nothing was committed |
| Smoke test by / date | Owner-reported passed, 2026-10-17. _owner to confirm device_ |
| Offline rehearsal by / date, device and browser | _owner to fill in_ (rehearsal is `race-day-phase0-offline-rehearsal.md`) |
| Open findings and their decisions | None reported as of 2026-10-17 |
| Approved for the field test by | _owner_ |
