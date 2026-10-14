# ADR-002: Phase 0 tooling dependencies

| Field | Value |
|---|---|
| Status | **Approved and signed off by owner 2026-10-14 (the owner is the reviewer of record). npm packages installed (section 9). JDK 21 installed by the owner (Temurin 21.0.12.1, section 2).** |
| Date | 2026-10-14 |
| Branch | `feat/race-day-phase0` |
| Why | AGENTS.md CI gates require `lint`, `test -- --run`, and (for Firebase) `test:rules`. None of these scripts or tools exist today. |
| Rule | AGENTS.md: every new dependency states purpose, size, maintenance status, license, replaceability. Dependency upgrades are not mixed into feature PRs. |

Facts below come from the npm registry (`npm view`, read-only) on 2026-10-14. "Unpacked size" is the package alone, not its transitive tree. Dev-only: none of these enter the production bundle.

---

## 1. Proposed dependencies (all `devDependencies`, installed at the workspace root, one lockfile)

| Package | Pin | Purpose | License | Unpacked size | Last published | Replaceable by |
|---|---|---|---|---|---|---|
| `vitest` | `4.1.11` | Unit tests (time parsing, converters, summary function, permission logic) and the harness for Rules tests | MIT | 1.9 MB | 2026-10-12 | Jest (heavier, more config with Vite/ESM) |
| `eslint` | `10.12.0` | `npm run lint` | MIT | 2.9 MB | 2026-10-02 | Biome (different rule set; would be a tooling change) |
| `@eslint/js` | `10.0.1` | ESLint recommended config | MIT | 16 kB | — | part of ESLint |
| `typescript-eslint` | `8.71.2` | TS-aware lint rules; flags unjustified `any` and unsafe patterns | MIT | 43 kB (plus its sub-packages) | 2026-10-13 | none practical for strict-TS rules |
| `eslint-plugin-react-hooks` | `7.1.1` | Hooks correctness (rules of hooks, exhaustive deps) | MIT | 4.1 MB | 2026-10-13 | none |
| `globals` | `17.13.0` | Environment globals for flat ESLint config | MIT | 257 kB | — | inline list |
| `@firebase/rules-unit-testing` | **`4.0.1`** | Security Rules allow/deny tests against the emulator | Apache-2.0 | 184 kB | 4.0.x line current for firebase 11 | none official |
| `firebase-tools` | `15.33.0` | `firebase emulators:exec` for `test:rules`, and rules deployment | MIT | 6.0 MB; about 70 direct dependencies, so a large transitive tree | 2026-10-08 | global CLI (see 3) |

All licenses are permissive (MIT / Apache-2.0). All packages were published within the last two weeks, i.e. actively maintained.

### Version-selection notes (compatibility, checked against the lockfile)

- Repo currently resolves `firebase 11.10.0`, `vite 6.4.3`, `typescript 5.9.3`, `react 19.2.7`.
- **`@firebase/rules-unit-testing`: use `4.0.1`, not the latest `6.0.0`.** `6.0.0` peers on `firebase ^13`; `4.0.x` peers on `firebase ^11` (5.x needs `^12`). Upgrading Firebase itself is out of scope (AGENTS.md: no framework upgrades in migration PRs).
- **`vitest`: use the 4.x line (`4.1.11`), not `5.0.4`.** 4.x supports `vite ^6` and Node `^20 || ^22 || >=24`, matching the repo's `engines: node >=20`. 5.0.4 requires Node `^22.12 || ^24 || >=26` and was published two days ago; it adds risk with no benefit for this slice.
- `typescript-eslint 8.71.2` peers on `typescript >=4.8.4 <6.1.0`, so it works with 5.9.3.
- **Node engine:** ESLint 10 needs Node `^20.19 || ^22.13 || >=24`. The root `package.json` says `>=20`. Proposal: raise root `engines.node` to `>=20.19` and pin CI to Node 22 LTS. Local Node is v26.0.0, which satisfies all of the above.

---

## 2. Non-npm prerequisite: Java (approved 2026-10-14; install status below)

The Firestore emulator needs a Java runtime. **This machine had none** (`java -version` failed: "Unable to locate a Java Runtime"). Without it, `test:rules` cannot run.

### Verified required version: JDK 21 or newer

| Source | What it says |
|---|---|
| Official docs, [Install, configure and integrate Local Emulator Suite](https://firebase.google.com/docs/emulator-suite/install_and_configure) (page updated 2026-10-13) | "Java JDK version 11 or higher" |
| `firebase-tools@15.33.0` package source, `lib/emulator/commandUtils.js` | `MIN_SUPPORTED_JAVA_MAJOR_VERSION = 21`; message "firebase-tools no longer supports Java version before 21. Please install a JDK at version 21 or above" |
| Same package, `lib/emulator/controller.js` | Starting any Java-based emulator (Firestore) with Java below 21 **throws**; it is not just a warning |

The official docs page lags the CLI. **The version we pin (15.33.0) is the authority: JDK 21 minimum.** Chosen: Eclipse Temurin 21 (LTS), Homebrew cask `temurin@21`, version `21.0.12.1` at the time of checking.

### Install attempt and result (2026-10-14)

- Command: `brew install --cask temurin@21`
- Result: **failed**. The cask runs a `.pkg` installer through `sudo`, which needs an interactive admin password; the agent session has no terminal. Homebrew cleaned up; nothing was left installed. No other change was made to the machine.
- Platform note: this Mac reports `x86_64` (Intel / Tier 3 for Homebrew). Casks still install; bottles for formulae may be built from source.
- Status at the time: JDK not installed. **Update 2026-10-14: the owner installed it himself; `java -version` reports Temurin 21.0.12.1** (owner-reported; emulator tests ran against it locally and in CI with `actions/setup-java` Temurin 21).

## 3. Alternatives for `firebase-tools`

- **A. devDependency (proposed).** Version fixed by the lockfile; CI and every machine get identical behavior (AGENTS.md: deterministic install). Cost: large dev-only dependency tree, not bundled.
- **B. Global CLI only.** Already present locally (`15.19.1`, logged in). Not reproducible in CI; versions drift. Not recommended.
- **C. `npx firebase-tools@15.33.0` in scripts.** No lockfile entry, downloads at run time, slower and non-deterministic.

## 4. Scope boundaries

Not requested in S0, to avoid surprises:

- Component-test tooling (`jsdom` / `@testing-library/react`). AGENTS.md expects component tests per slice. If wanted, a separate note in this same format will be written before S2.
- Playwright or any E2E tool. Mobile and offline are covered by the manual checklist for Phase 0.
- PWA / Service Worker (decided against, ADR-001 D7).
- No runtime (`dependencies`) additions. The production bundle does not change because of this ADR.

## 5. Files that would be added after approval (S0, tooling only, no feature code)

- Root `package.json`: devDependencies, scripts `lint`, `test`, `test:rules`, and `test:migration` as an explicit "not applicable" echo (Phase 0 has no migration script; AGENTS.md requires this to be justified, not silently skipped), plus `engines.node` bump.
- `eslint.config.js`, `vitest.config.ts` (plus a separate config for Rules tests), `firebase.json`, `.firebaserc`, `firestore.indexes.json`. No `firestore.rules` until gate G1 passes (ADR-001 D8).
- One smoke test so `npm run test -- --run` is green for the right reason.
- Changes to `package-lock.json`, reported in the PR.

## 6. Install commands (to be run only after approval)

```bash
npm install -D vitest@4.1.11 \
  eslint@10.12.0 @eslint/js@10.0.1 globals@17.13.0 \
  typescript-eslint@8.71.2 eslint-plugin-react-hooks@7.1.1 \
  @firebase/rules-unit-testing@4.0.1 firebase-tools@15.33.0
```

Then, as separate steps: `npm ci` from a clean checkout to prove determinism, and `npm run lint`, `typecheck`, `test -- --run`, `build`.

## 7. Rollback

`git revert` the tooling commit (one commit, `package.json` + `package-lock.json` + config files). No production artifact depends on these packages.

## 8. Decisions (owner, 2026-10-14)

- [x] Approved: the 8 packages and exact versions in section 1.
- [x] Approved: root `engines.node` to `>=20.19`; CI on Node 22.
- [x] Approved: JDK installation, after verifying the required version (section 2: JDK 21+).
- [x] Chosen: `firebase-tools` option A (devDependency).

## 9. Installation record (2026-10-14)

Installed with the exact command in section 6. `package.json` records caret ranges (`^4.1.11` etc., the repo's existing convention); the **lockfile fixes the exact versions**, and CI uses `npm ci`.

| Package | Resolved |
|---|---|
| vitest | 4.1.11 |
| eslint | 10.12.0 |
| @eslint/js | 10.0.1 |
| globals | 17.13.0 |
| typescript-eslint | 8.71.2 |
| eslint-plugin-react-hooks | 7.1.1 |
| @firebase/rules-unit-testing | 4.0.1 |
| firebase-tools | 15.33.0 |

Observations to carry forward:

- **Engine warning:** `superstatic@10.0.0` (a `firebase-tools` dependency) declares `node: 20 || 22 || 24`; local Node is v26. Not an error here, and the reason CI is pinned to Node 22 (`.nvmrc`).
- **`npm audit`: 25 vulnerabilities (7 moderate, 17 high, 1 critical).** Split by origin, compared against the `HEAD` lockfile:
  - **8 are in the production dependency tree and already existed before this change** (2 moderate, 5 high, 1 critical): `@grpc/grpc-js`, `protobufjs`, `react-router`, `websocket-driver`, via existing `firebase` and `react-router-dom`. `npm audit --omit=dev` reports the same 8 on the baseline lockfile.
  - **17 are new and dev-only**, in the `firebase-tools` / tooling tree (for example `basic-ftp`, `braces`, `browserslist`, `postcss`, `nanoid`). They are not bundled into the app.
  - Per AGENTS.md, dependency upgrades are not mixed into this change. Fixing the production ones (a `firebase` / `react-router-dom` update) is a **separate PR with build, test and rollback notes**, tracked as an open item. The critical `websocket-driver` issue (resource-limit bypass in the WebSocket protocol library) should be assessed there for real exposure.
- **Production bundle unchanged:** built with the same environment, `index-ay8ctDTo.js` has the identical content hash before and after the install. The size depends on `VITE_FIREBASE_*` being inlined: a build without `.env.local` is 916.86 kB (see runbook section I).
- **Not yet verified:** that `@firebase/rules-unit-testing@4.0.1` works end to end against the emulator. This needs JDK 21 (section 2). Until then, `test:rules` is blocked.
