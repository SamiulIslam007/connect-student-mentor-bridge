# Tasks: outcome-transition-property-test

## 0. Preconditions

- [x] 0.1 Re-check the snapshot in `design.md`: `git log --oneline -1` (expect `3c8c571`), `git status`, `grep -n "export function transition" -A 18 packages/domain/src/outcome.ts`, `grep -n "OUTCOME_STATUSES\|OUTCOME_ACTIONS" packages/domain/src/outcome.ts`, `grep -n "points_total\|pointsTotal" packages/contracts/openapi.yaml services/api/src/db/schema/reputation.ts`. Verify: every line confirmed or listed as a mismatch.
- [x] 0.2 Read `docs/data-model.md` section 4.4 and compare its transition table with the code table; record any difference in this file before writing the test, so the test does not encode a doc drift as truth.

## 1. The transition property test

- [x] 1.1 Add `packages/domain/test/outcome-property.test.ts` with four tests: every (state, action) pair equals the dispatch table; every two-action sequence from a fresh outcome equals the fold of the pure function; every three-action sequence does the same; and no reachable trace contains `COUNTED` without `CONFIRM` or `REVIEW_VALID`. Verify: the file passes on its own with `pnpm --filter @connect/domain test` and each test names its depth in its own message.
- [x] 1.2 Assert coverage inside the test: the number of pairs visited equals `OUTCOME_STATUSES.length` times `OUTCOME_ACTIONS.length`, and the three-action walk visits a non-zero number of `COUNTED` traces. Verify: shrinking the action list in a scratch edit makes the coverage assertion fail, then revert.
- [x] 1.3 Assert the legal-route invariant directly: a trace that reaches `COUNTED` carries a confirmation or a platform decision, and a trace that reaches `REJECTED` carries a review decision. Verify: the assertion message names the offending trace.
- [x] 1.4 Measure the runtime and record it in this file. Verify: the whole file runs in under two seconds; if it does not, reduce the depth to two and say so in the handoff.

## 2. The schema guard

- [x] 2.1 Add `packages/contracts/test/reputation-schema-guard.test.ts`: read `packages/contracts/openapi.yaml`, `services/api/src/db/schema/reputation.ts` and `services/api/src/db/schema/outcomes.ts` with `readFileSync`, extract property and column names, and fail on any name in the forbidden families that is not in the frozen allowlist. Verify: the file passes, and the allowlist carries a comment per entry naming why it is allowed.
- [x] 2.2 Add the negative self-check inside the same file: the extractor, run against a fixture string containing `score` and `follower_count`, reports both, so a broken regex cannot pass silently. Verify: the test fails if the extractor is stubbed to return an empty list.
- [x] 2.3 Prove the guard bites: add `score: number` to the impact schema in a scratch edit, confirm the test fails with the key named, then revert. Record the observed failure message in this file.
- [x] 2.4 Scan the OpenAPI file for the same families so a key renamed in the schema but not the contract also fails. Verify: a scratch edit to `openapi.yaml` alone fails the test.

## 3. Docs and register

- [x] 3.1 Update `docs/functional-requirements.md`: `FR-OUT-06` complete (name the property test and what it proves) and `FR-REP-05` complete (name the guard, its allowlist and the fact that it fails the build).
- [x] 3.2 Update `docs/mvp-build-plan.md` section 5 and `docs/milestones-and-phases.md` "Current state" with this change's status.
- [x] 3.3 No debt row is opened or closed; if 0.2 found a doc drift between the table and the code, add one row naming it instead of fixing it here.

## 4. Gates, review and handoff

- [x] 4.1 Run from the repo root: `pnpm lint`, `pnpm typecheck`, `CI=true pnpm test`, `pnpm build`, each as its own command with its exit code echoed, in one background job writing to a log file. Record per-package totals: domain and contracts counts must each rise by the number of new tests.
- [x] 4.2 Review gate per `AGENTS.local.md` section 2: verify-before-done and a diff read. This change touches no production file; assert that explicitly with `git diff --name-only | grep -v test`.
- [x] 4.3 Handoff: the two new files, the observed failure message from 2.3, the runtime from 1.4, the four gate totals and the register rows flipped.

## Workflow follow-up

- The PR body states that no runtime file changed, so the reviewer spends the time on the two tests' coverage claims rather than on a diff that does not exist.

## Apply record (2026-11-13)

- **0.1 confirmed**: `main` was `498ea80` (this round's first merge, not `3c8c571`), tree clean apart from the eight unapplied change directories; `transition` 18 lines, `OUTCOME_STATUSES` 7, `OUTCOME_ACTIONS` 6, `points_total` in `schema/reputation.ts` only and absent from `openapi.yaml`.
- **0.2 drift, recorded here and in DEBT-55**: `docs/data-model.md` section 4.4 T6 (`CONFIRMED` to `IN_PLATFORM_REVIEW` on an audit, anomaly flag or objection) has no code path. `transition` refuses every action from `CONFIRMED` except `withdraw`. The pair test therefore encodes the code's table, and DEBT-55 records the gap rather than fixing it here.
- **1.2 mutation**: with `"withdraw"` deleted from `OUTCOME_ACTIONS` the pair test failed with `pair coverage: visited 35 of the table's 42 pairs`; the line was restored and the failure is gone.
- **1.4 runtime**: `node --import tsx --test test/outcome-property.test.ts` reports 4 tests, 4 pass, `duration_ms 491` (real 0.8 s), so depth three was kept.
- **2.3 mutation**: adding `score:` to `OwnImpactResponse` in `openapi.yaml` alone failed the guard with `forbidden names: score`; restored.
- **2.4 mutation**: adding a `score` column to `schema/reputation.ts` alone failed it with the same message; restored.
- **2.1 allowlist reality**: the scan found four names, not the two design R4 expected — `evidence_tier`, `tier_multiplier`, `points`, `points_total`. `value` never appeared and was dropped.
- **4.1 gates**: `LINT=0`, `TYPECHECK=0`, `TEST=0`, `BUILD=0`. Per package: domain 123 (+4), web 187 (unchanged), contracts 23 (+4), api 254 (unchanged), 0 skipped everywhere; total 587 (was 579).
- **4.2 no production file changed**: `git diff --name-only` on the branch names only the two new test files and the four docs, plus the archived change directory.
