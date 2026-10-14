# Race Day Phase 0 — S0 checklist and runbook

| Field | Value |
|---|---|
| Related | `docs/adr/ADR-001-race-day-phase0.md`, `docs/adr/ADR-002-phase0-tooling-dependencies.md` |
| Branch | `feat/race-day-phase0` |
| Written | 2026-10-14 |
| Key dates | Code freeze 2026-10-21 evening. Runnable by 2026-10-22. Field test 2026-10-24/25. |

Legend: `[x]` done and evidenced here, `[ ]` open. Items marked **OWNER** need a person with Firebase console or account access. They cannot be done from the repo.

---

## A. Baseline (done, 2026-10-14)

Run on branch `feat/race-day-phase0` before any code change, Node v26.0.0, existing `node_modules`, no install.

- [x] `npm run typecheck` PASS (schema, skating-domain, firebase-client, web)
- [x] `npm run build` PASS
- [x] Working tree was clean before the ADR and runbook files were added

Build output baseline, to compare in every later PR (AGENTS.md: PRs report build-output change):

| Artifact | Size | gzip |
|---|---|---|
| `dist/assets/index-*.js` (single chunk) | 917.22 kB | 244.14 kB |
| `dist/assets/index-*.css` | 20.19 kB | 4.82 kB |
| `dist/index.html` | 0.39 kB | 0.27 kB |

Vite warns the chunk exceeds 500 kB. That is pre-existing. The race-day module must be lazy, so this number must not grow in the main chunk.

At baseline the scripts `lint`, `test` and `test:rules` did not exist, so they could not run. They were added later the same day (section E). After the toolchain was added, the production bundle was byte-identical when built with the same environment: the JS file keeps the same content hash (`index-ay8ctDTo.js`), so there was no build-output change.

**Build size depends on the environment.** Vite inlines the `VITE_FIREBASE_*` values into the bundle. A build without `apps/web/.env.local` (as in a clean checkout or CI) produces `index-DZ2jXrUu.js`, 916.86 kB (244.02 kB gzip). With the env file it is `index-ay8ctDTo.js`, 917.22 kB (244.14 kB gzip). I confirmed this by rebuilding the same clean clone with and without the file. Compare PR build sizes only against a build made with the same environment. The no-env figures are the CI baseline. Lint covers 86 files with 0 errors, and a deliberately bad snippet confirmed the rules fire (`any`, conditional hooks, unused variable, empty catch).

Not enabled yet: the React Compiler-based rules in `eslint-plugin-react-hooks` 7 (for example `set-state-in-effect`). They are likely to flag existing code. Plan: enable them for `apps/web/src/modules/race-day/**` only, once that module exists, so legacy code is not rewritten in a tooling change.

## B. Environment facts found (read-only)

- [x] Firebase CLI `15.19.1` installed globally, authenticated as `lafaellin@gmail.com`
- [x] Project `skatingx-platform` exists (project number `232066103339`)
- [x] `(default)` Firestore database exists, `FIRESTORE_NATIVE`, edition STANDARD
- [x] Project `skatingx-prod` (approved in DR-001) is **not** in this account's project list
- [x] All listed projects show "Resource Location ID: [Not specified]". The Firestore region still needs a check in the console (item C5).
- [x] `.env.local` is git-ignored and not tracked
- [ ] No Java runtime on this machine, so the Firestore emulator cannot run (ADR-002 section 2)
- [x] Other projects in the account (legacy): `blaze-skate-analysis`, `blaze-skate-journal`, `blaze-skate-training-platform`, `lindsay-math-lab`. They are legacy or unrelated and must not be touched.

---

## C. Gate G1 — current Firestore Rules (OWNER) — **blocks all rules work**

No Security Rules file will be written or deployed until this section is filled in. I cannot read the published ruleset from the repo or the CLI, so it must be read in the console. **Read only; do not edit or publish anything.**

Steps:

1. Open Firebase Console, select project `skatingx-platform`.
2. Firestore Database, then the **Rules** tab (database `(default)`).
3. Record the following in the table below.
4. Copy the **entire** rules text into a new local file and send it to me, or paste it into the PR description. Do not paste secrets (rules contain none).
5. Optional: Rules tab, "Rules history" (or Publish history), and note the previous versions. This is the rollback path.

| # | Question | Answer |
|---|---|---|
| C1 | Last published date/time | |
| C2 | Is it a "test mode" rule (for example `allow read, write: if request.time < timestamp.date(...)`)? If yes, what is the expiry date? Has it expired? | |
| C3 | Is any `match /{document=**}` rule present, and what does it allow? | |
| C4 | Is there a rule for `/artifacts/skatingx-production/users/{userId}/{document=**}` with `request.auth.uid == userId`? | |
| C5 | Firestore location/region (Firestore Database page, "Location") | |
| C6 | Are any other documents outside `artifacts/skatingx-production/` present at the root? Name only. | |

Interpretation, which I will apply once you answer:

- C2 shows test mode (open to everyone): escalate immediately. The existing Lindsay data is publicly readable and writable. Fixing it is a separate, higher-priority change than Race Day.
- C2 shows test mode that has expired: the app is currently failing writes, and bootstrap should already show an error banner. Tell me, as that may explain current behavior.
- C4 present and no wildcard: the baseline is acceptable. I commit it verbatim as `firestore.rules`, then add the race-day rules in a separate commit.
- Anything unexpected: stop and discuss. No overwriting.

Rollback for any later rules change: console Rules history (restore previous version), or `git revert` plus redeploy.

**G1 status: [ ] open**

## D. Auth and Lindsay account upgrade (OWNER)

Why: the app signs in anonymously on first load. An anonymous account lives only in that browser profile's storage. Clearing site data, using a different browser or phone, or iOS private mode loses access, and with it Lindsay's data and any race-day data. Linking email and password keeps the **same UID** (Firebase `linkWithCredential`), so existing data stays attached.

### D1. Firebase console checks

- [ ] Authentication, Sign-in method: **Anonymous** is enabled
- [ ] Authentication, Sign-in method: **Email/Password** is enabled
- [ ] Authentication, Settings, Authorized domains: contains `localhost` and the staging Vercel domain (add once it exists)
- [ ] Authentication, Users: find the account that owns Lindsay's data and note its UID (used in D2 step 2). If more than one anonymous user exists, the one with data under `artifacts/skatingx-production/users/{uid}/` in Firestore is the right one.

### D2. Upgrade procedure — do it on the device and browser that already holds the session

**Use "Link account", not "Sign in to existing account".** Signing in with an email that is not yet linked switches to a different UID and the data would appear to vanish.

1. Open the app (staging or `npm run dev`) in the **same browser profile** that was used so far.
2. Go to Settings. Note the **UID** and confirm **Anonymous: Yes**.
3. Compare the UID with the one found in D1. If it differs, stop. You are on a different anonymous session.
4. In the card **"Link email & password"**, use an email that you control and can receive mail on, plus a strong password. Click **"Link account"**.
5. Verify, without reloading: Status shows "Registered User", **Anonymous: No**, Email is shown, and the **UID is unchanged**.
6. Reload. Confirm still signed in, Dashboard still shows Lindsay Lin, and PB records and tasks are still present.
7. Store the password in a password manager.
8. On a **second browser or device**, open Settings, use **"Sign in to existing account"** with the same email and password. Confirm the **same UID** and the same Dashboard data. This proves the data survives a device change.
9. Record the result below.

### D3. Recovery path

The UI has **no password-reset flow**. If the password is lost, recovery is manual: Firebase Console, Authentication, Users, row menu, "Reset password" (sends a reset email). Check that the console account can do this, and note who has console access.

- [ ] Reset-password email confirmed deliverable to the chosen address
- [ ] Person with console access identified: ________________

### D4. Result record (fill in)

| Item | Value |
|---|---|
| UID before (first 8 chars) | |
| UID after (first 8 chars) | |
| Anonymous after | |
| Second-device sign-in OK | |
| Date | |
| Done by | |

Target date: complete by **2026-10-16**. Hard deadline **2026-10-20**. After that there is no time to recover if something goes wrong.

---

## E. Tooling and prerequisites (see ADR-002)

- [x] Owner approved the 8 ADR-002 packages and versions (2026-10-14)
- [x] Owner approved root `engines.node` `>=20.19` and CI on Node 22
- [x] Owner approved JDK installation, conditional on verifying the version
- [x] Owner chose `firebase-tools` as a devDependency (option A)
- [x] Packages installed; lockfile updated (ADR-002 section 9)
- [x] Scripts added: `lint`, `test`, `test:rules`, `test:migration`
- [x] `test:migration` is an explicit "N/A: no migration scripts" and fails if `scripts/migrations/` ever contains files
- [x] `test:rules` fails with "BLOCKED" until `firestore.rules` exists (gate G1). It never passes with open rules.
- [x] Tests exist and are green: 32 characterization tests for `parseTimeToSeconds`, `formatSecondsToTime`, `getBestTime`, `getLatestTime`, `sortRecordsByDate`, `normalizeDistanceId`. A mutation check (deliberately broken source) failed 4 tests, then the source was restored with no diff.
- [x] Gates re-run in the working tree: `lint`, `typecheck`, `test -- --run`, `build` pass; `test:migration` is N/A; `test:rules` BLOCKED (expected)
- [x] `npm ci` verified on a clean checkout (section I)

### E1. JDK 21 for the Firestore emulator — **not installed yet**

Required version, verified against the package we pin (details and sources in ADR-002 section 2):

- **JDK 21 or newer.** `firebase-tools@15.33.0` has `MIN_SUPPORTED_JAVA_MAJOR_VERSION = 21` and refuses to start the Firestore emulator on anything older. The public docs page still says "JDK 11 or higher" and is out of date on this point.
- Chosen: Eclipse Temurin 21 (LTS), Homebrew cask `temurin@21` (`21.0.12.1` when checked).

Attempt on 2026-10-14: `brew install --cask temurin@21` **failed**. The cask installs a `.pkg` with `sudo` and asks for an admin password; the agent has no terminal to enter it. Nothing was installed or left behind.

Ways forward (owner picks one):

- **Option 1 (recommended): you run it in your own terminal**, where the password prompt works:

  ```bash
  brew install --cask temurin@21
  java -version        # expect: openjdk version "21.x.x"
  ```

  Then tell the agent, and the agent runs the emulator-based checks.

- **Option 2: user-level JDK, no admin password.** Download the Temurin 21 `.tar.gz` for macOS x64 from adoptium.net, verify its published SHA-256, and unpack it to `~/Library/Java/JavaVirtualMachines/`, a per-user location that macOS and `/usr/bin/java` recognize. It is the same JDK from the same vendor, with narrower privileges, and removing it means deleting one folder. This is a different install method from the one approved, so the agent will not do it without a fresh OK.

Verification once installed (agent runs; results recorded here):

- [ ] `java -version` reports major version 21 or higher
- [ ] The emulator starts and a throwaway test, using a temporary rules file kept outside the repository, passes against `@firebase/rules-unit-testing@4.0.1`, which proves the harness. The real rules tests come after gate G1.

CI note: the workflow will need a JDK 21 step (for example `actions/setup-java` with Temurin 21) when `test:rules` is added to it.

## F. Deployment preparation (S0 planning, execution in S5)

Not present today: `vercel.json`, `firebase.json`, `.firebaserc`.

- [ ] Create or confirm the Vercel project. Root directory is the repo root. Build command `npm run build`. Output directory `apps/web/dist`.
- [ ] Add an SPA fallback rewrite (all paths to `/index.html`). Without it, reloading a deep link such as `/race-day/schedule` returns 404 on Vercel. This will be a file change in a later slice.
- [ ] Set the six `VITE_FIREBASE_*` variables in Vercel for the staging environment, plus `VITE_FEATURE_RACE_DAY`. These are client config, not secrets.
- [ ] Add the Vercel domain to the Firebase Auth authorized domains (D1)
- [ ] Bind the release to a Git commit and keep the build record (AGENTS.md)

## G. S0 exit criteria

S0 is complete when all of the following are true:

- [x] Branch `feat/race-day-phase0` created
- [x] Baseline typecheck and build recorded (section A)
- [x] ADR-001 written
- [x] ADR-002 written for review
- [ ] ADR-001 reviewed and signed off (owner, then reviewer)
- [ ] ADR-002 approved or amended by the owner
- [ ] Gate G1 answered (section C)
- [ ] Auth checks D1 done and Lindsay upgrade D2 to D4 recorded
- [ ] Tooling installed and lint, test, test:rules scripts present (section E)
- [ ] Gates run on the tooling commit

Cut line if the schedule slips (ADR-001): drop video metadata first, then summary persistence. Roster, schedule and results are the minimum.

## H. Field-day operating procedure (draft, finalized in S5)

Offline is mitigated operationally (ADR-001 D7). There is no Service Worker.

1. The evening before: sign in on the race-day phone. Open Race Day. Load every page once (today, schedule, results, videos, summary).
2. Confirm the status banner shows no error and the pending badges are visible.
3. At the venue: do not close the tab, do not force-refresh, do not open the app in a second tab.
4. If connectivity drops, keep entering results. They queue and sync on reconnect.
5. After each entry, confirm it shows as pending. Mark it verified only after checking the official result.
6. If the tab is lost while offline, do not clear site data. Restore connectivity and reload.

## I. Clean-checkout verification (2026-10-14)

Fresh `git clone` of branch `feat/race-day-phase0` at commit `ebf8b9d` into a temporary directory, no `node_modules`, no `.env.local`, Node v26.0.0 (CI will use Node 22).

| Step | Result |
|---|---|
| `npm ci` | exit 0, 906 packages added, 25 audit findings (same split as ADR-002 section 9) |
| Lockfile drift after `npm ci` | none (`git status` clean) |
| `npm run lint` | pass |
| `npm run typecheck` | pass |
| `npm run test -- --run` | pass, 32 of 32 tests |
| `npm run build` | pass, `index-DZ2jXrUu.js` 916.86 kB (244.02 kB gzip), CSS 20.19 kB (4.82 kB gzip) |
| `npm run build` with `apps/web/.env.local` added | `index-ay8ctDTo.js` 917.22 kB, identical to the baseline in section A |
| `npm run test:migration` | N/A by design |
| `npm run test:rules` | BLOCKED by design until `firestore.rules` exists (gate G1) |

Limits of this verification:

- Run on Node 26, not the pinned Node 22. `superstatic@10.0.0` warns about Node 26. Re-run on Node 22 when CI first executes (the workflow exists but has never run).
- `.github/workflows/ci.yml` has not been executed. It has not been pushed and was not linted by a CI system.
- Emulator-based checks have not run (no JDK, section E1).

## J. S0 status at the end of this session

Done:

- [x] Branch `feat/race-day-phase0`
- [x] Baseline typecheck and build
- [x] ADR-001, ADR-002, this runbook (committed `a4c13a1`)
- [x] Toolchain, scripts, configs, tests (committed `ebf8b9d`, no feature code)
- [x] Clean-checkout verification (section I)
- [x] JDK required version verified from official docs and package source (JDK 21+)

Open, in order of what blocks what:

1. **JDK 21 install** (section E1): blocks `test:rules` verification.
2. **Gate G1, console rules** (section C), owner: blocks writing any `firestore.rules`.
3. **Lindsay account upgrade** (section D), owner: target 2026-10-16, hard deadline 2026-10-20.
4. **Auth console checks and Vercel domain** (sections D1 and F), owner.
5. Reviewer sign-off on ADR-001 and ADR-002.
6. Separate PR for the 8 pre-existing production dependency vulnerabilities (ADR-002 section 9).
