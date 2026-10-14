# ADR-003: Component test dependencies (DOM environment for Vitest)

| Field | Value |
|---|---|
| Status | **Proposed. Waiting for owner approval. Nothing is installed.** |
| Date | 2026-10-14 |
| Branch | `feat/race-day-s2` |
| Why | AGENTS.md requires component tests and form requirements (label, keyboard, error text, loading state). Vitest currently runs in the `node` environment, so no React component can be rendered. |
| Rule | AGENTS.md: every new dependency states purpose, size, maintenance status, license and replaceability. Dependency changes are not mixed into feature code. |
| Related | ADR-002 (tooling dependencies, same format), ADR-001 D3 (module placement) |

Facts below come from the npm registry (`npm view`, read-only) on 2026-10-14. "Unpacked size" is the package alone, not its transitive tree. All packages are dev-only and do not enter the production bundle.

---

## 1. What we need to test, and what we do not claim

Component tests in S2 cover only the two highest-risk UI behaviors:

1. **Entry-form validation**: required fields, field length, error text shown, submit disabled while saving, keyboard submit (Enter), label-to-input association.
2. **The "pending" (待确认) marker**: unverified data always renders the pending marker; editing a verified item renders pending again.

A simulated DOM cannot verify layout, responsive behavior, touch interaction or real browser form validation. **The manual mobile and desktop check required by AGENTS.md stays mandatory**; these tests do not replace it, and PR descriptions will not say they do.

Everything else in S2 (conversion between ISO strings and Firestore `Timestamp`, sorting, grouping) is plain functions and repository code that already run in the `node` environment with no new dependency.

## 2. Proposed dependencies (all `devDependencies`, workspace root, one lockfile)

| Package | Pin | Purpose | License | Unpacked size | Last published | Replaceable by |
|---|---|---|---|---|---|---|
| `happy-dom` | `21.0.1` | Simulated DOM for Vitest (`window`, `document`, events) | MIT | 9.2 MB | 2026-10-12 | `jsdom` (see section 3) |
| `@testing-library/react` | `16.3.3` | Render components and query them by role and label, the way a user finds them | MIT | 340 kB | 2026-08-27 | React `act` plus raw `react-dom` (more boilerplate, queries by CSS selector) |
| `@testing-library/dom` | `10.4.2` | Required peer of `@testing-library/react` (queries and events) | MIT | 2.5 MB | 2026-09-13 | none (peer) |
| `@testing-library/user-event` | `14.6.8` | Realistic typing, tab and Enter key interaction, needed for the keyboard requirement | MIT | 438 kB | 2026-10-13 | `fireEvent` from Testing Library (does not model real keyboard flow) |

Compatibility checked against the repo:

- Repo resolves `react 19.2.7`, `vitest 4.1.11`, `vite 6.4.3`. `@testing-library/react 16.3.3` peers on `react ^18 || ^19`, `@testing-library/dom ^10`, and `@types/react(-dom) ^18 || ^19`, all satisfied.
- Vitest 4.1.11 lists `happy-dom` and `jsdom` as optional peers (`*`), so either works with the current Vitest.
- `happy-dom 21.0.1` requires Node `>=20.0.0`; this satisfies the repo's `engines.node >=20.19`. Direct dependencies: `ws`, `entities`, `whatwg-mimetype`, `buffer-image-size` (small tree).
- All four are MIT.

Maintenance status:

- Testing Library packages are widely used and were published within the last two months.
- `happy-dom` was published 2026-10-12, but the npm registry lists **a single maintainer**. Mitigation: it is a dev-only dependency, our usage is small, and swapping to `jsdom` is a config change plus an `engines` decision (section 3).

Security notes: `happy-dom` is a simulated browser. We run only our own component code in it, never load remote pages or untrusted scripts, and do not enable network access in tests. As in ADR-002, `npm audit` is run after install and its result is recorded in this ADR; new vulnerabilities in these dev-only packages are triaged separately from the pre-existing production ones.

## 3. Alternatives considered

- **A. `happy-dom` (proposed).** Works on Node 20.19 and newer, so it matches the owner decision on `engines.node` (ADR-002). Faster startup. Less browser-faithful than jsdom in some form behaviors, which is acceptable for the two behaviors in section 1 and is why manual mobile checks stay.
- **B. `jsdom 30.1.2`** (MIT, 5.5 MB unpacked, published 2026-10-04). More established with Testing Library. **Its `engines` field is Node `^22.22.2 || ^24.15.0 || >=26`.** The repo says `>=20.19`, CI uses Node 22.23.3 and local is v26, so it would run here, but a contributor on Node 20 or an older 22 would hit an engine mismatch. Choosing B means raising `engines.node`, which reverses an earlier owner decision, so I do not choose it without an explicit owner decision.
- **C. Add nothing; manual form acceptance only.** No dependency cost, but the two high-risk behaviors in section 1 would have no regression protection, and AGENTS.md lists component tests among the required test types. If chosen, the PR must say why component tests were skipped.
- **Rejected: `@testing-library/jest-dom`** (custom matchers such as `toBeInTheDocument`). Version 7.0.1 requires Node `>=22`, which conflicts with `engines.node >=20.19`, and it is not needed: tests assert with plain `expect` on queried elements.

## 4. How it is wired (after approval)

- The default Vitest environment **stays `node`**, so the existing 94 tests are unaffected. A component test opts in with a first-line docblock: `// @vitest-environment happy-dom`.
- `vitest.config.ts` already includes `apps/web/src/**/*.test.{ts,tsx}`, so no include change is needed.
- Vitest globals are off, so Testing Library's automatic cleanup does not register. A small helper `apps/web/src/test/dom.ts` registers `cleanup()` after each test and re-exports `render`, `screen` and `userEvent`. This matches the `test/` folder in the AGENTS.md structure.
- Component tests are written only when the form components exist (later in S2), not in the install commit.

## 5. Scope boundaries

- Only the four packages above; no test runner change, no coverage tool, no end-to-end tool.
- No change to production code or the production bundle. I will report the build size before and after to prove it.
- Not decided here: end-to-end browser tests (AGENTS.md mentions them for critical paths). That is a separate decision, for example before S5.

## 6. Install commands (to be run only after approval)

```bash
npm install -D happy-dom@21.0.1 \
  @testing-library/react@16.3.3 \
  @testing-library/dom@10.4.2 \
  @testing-library/user-event@14.6.8
```

Then, as separate steps: `npm ci` from a clean checkout to prove determinism; `npm run lint`, `typecheck`, `test -- --run`, `build`; `npm audit` with results added to section 8. The install is its own commit (`package.json` and `package-lock.json` only, plus the `test/dom.ts` helper if approved), before any feature code.

## 7. Rollback

`git revert` the install commit and delete the component test files. No production artifact depends on these packages, and no data or rules are involved. If `happy-dom` proves unreliable, switching to `jsdom` is a one-package swap plus the `engines` decision in section 3.

## 8. Decisions (owner)

- [ ] Choose: **A** `happy-dom` (proposed), **B** `jsdom` with `engines.node` raised, or **C** no component-test dependencies
- [ ] If A or B: approve the exact versions in section 2 (or section 3 for B)
- [ ] Approve rejecting `@testing-library/jest-dom`

Installation record and `npm audit` result: to be added after approval and install.
