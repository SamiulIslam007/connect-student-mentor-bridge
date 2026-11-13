# Design: outcome-transition-property-test

## Context

**Repository snapshot (verified 2026-11-12, re-check at apply).**

- `main` is at `3c8c571`, clean, 37 specs valid; CI run `43208893367` on that commit succeeded. No gate run in this propose round.
- `packages/domain/src/outcome.ts` is 141 lines: `OUTCOME_STATUSES` (7 values), `OUTCOME_ACTIONS`, `transition(from, action)` returning the next status or null, `reviewTarget` and `reviewDecisionIsLegal`, `CONTRIBUTION_LEVELS`, and `coolingEndsAt`.
- `packages/domain/test/outcome.test.ts` (129 lines) covers the transition pairs individually; no test composes two or three actions into a sequence.
- The existing `reputation.integration.test.ts` asserts the impact payload's exact key set through the API; `packages/contracts/test/openapi.test.ts` (582 lines) validates the contract's structure.
- The counting job (`services/api/src/reputation/counting-job.ts`) reaches `COUNTED` only from `CONFIRMED` with an expired cooling deadline, and the review route (`POST /v1/outcomes/{id}/review`) reaches it from `IN_PLATFORM_REVIEW` with a `platform_decision` basis. Those two are the only writers.
- `services/api/src/db/schema/reputation.ts` holds `reputation_events` and `field_impact_snapshots`; `points_total` exists and never leaves the server (DEBT-24).

## Goals / Non-Goals

**Goals**

- Prove the invariant, not restate it: no action sequence reaches `COUNTED` without a confirmation or a platform decision.
- Make a score-like payload key or column fail the build, in the place the register names.
- Keep both tests fast, deterministic, and free of a database.

**Non-Goals**

- No new assertion about which actor may call which action (the integration suite owns that).
- No live-catalog check; the schema guard is static by decision.
- No change to any production file.

## Decisions

The brief fixed the guard's shape; decisions taken here carry `R` numbers.

### R1. Sequence depth three, exhaustive over actions

The property test enumerates every (state, action) pair in the dispatch table, then every two-action and three-action sequence from a fresh outcome, and asserts the composed result equals folding the pure function. Depth three is the smallest depth that can reach `COUNTED` (report, confirm, count) and back out (count, reverse), so it proves what the requirement asks without an unbounded generator. Alternative rejected: a random generator, which can pass without covering the path that matters and cannot state its own coverage.

### R2. The invariant is asserted on the reachable set, not on a single trace

The test builds the set of reachable states per depth and asserts `COUNTED` appears only in a trace that contains `CONFIRM` or `REVIEW_VALID`. Alternative rejected: asserting on one hand-written trace per state, which is what the existing unit test already does and which is why the gap exists.

### R3. The guard is a static key-set and column scan with a frozen allowlist

`packages/contracts/test/reputation-schema-guard.test.ts` reads `packages/contracts/openapi.yaml`, `services/api/src/db/schema/reputation.ts` and `services/api/src/db/schema/outcomes.ts` as text, extracts every property name and every column name, and fails on a name matching the forbidden families (`score`, `points`, `rank`, `tier`, `like`, `star`, `follower`, `rating`, `percent`, `rate`, `average`, `aggregate`) unless it appears in the frozen allowlist. Alternative rejected: a runtime reflection test, which cannot see a column that no route reads and cannot fail a build before a migration exists.

### R4. The allowlist names the two existing exceptions and why

`points_total` is on the allowlist with a comment naming DEBT-24 (it exists, it is internal, it never leaves the server), and `value` in the impact payload is allowed because it is a count of counted outcomes. Alternative rejected: no allowlist, which would fail on day one and get deleted.

### R5. Both tests live in the packages, not in the API test tree

The transition property belongs in `packages/domain/test/`, next to the pure function, and the schema guard in `packages/contracts/test/`, next to the contract it reads. Alternative rejected: the API integration tree, which would need a database for a test that must never need one and would take the suite from seconds to minutes.

## Assumptions

1. The transition table in `docs/data-model.md` section 4.4 and `packages/domain/src/outcome.ts` are in sync; if they differ, the test asserts the code and the task records the doc drift.
2. `FR-OUT-06`'s "property test" is satisfied by exhaustive enumeration rather than a randomised property framework; the repo has no property-testing dependency and none is added.
3. `FR-REP-05`'s "schema test fails the build" is satisfied by a unit test inside CI's `pnpm test`, which does fail the build.

## Acceptance criteria

1. `pnpm --filter @connect/domain test` reports the new file and its pair-coverage assertion passes.
2. Deleting the `CONFIRMED` guard in the pure function, or adding a `score` property to the impact schema, makes one of the new tests fail. Both mutations are tried once and reverted.
3. Neither new file imports a database, a Nest module, or opens a network connection.
4. `grep -c '^test(' packages/domain/test/outcome-property.test.ts` is at least four (pairs, depth two, depth three, invariant).

## Risks

- The guard's keyword list is a heuristic: a key named `confidence` would pass while meaning a score. The design accepts that, and the list is one line to extend when a reviewer spots a synonym.
- The property test enumerates from a fresh outcome only; a sequence that starts from a mid-life state is covered by the pair table, not by the sequence walk. Stated here so nobody reads more into it than it proves.

## Apply notes (2026-11-13)

- **R6. The walk carries one move the pure function does not have.** `transition` and `reviewTarget` cannot reach `COUNTED`: the counting job writes it from `CONFIRMED` directly. The test therefore adds a `count` step whose legality (`CONFIRMED` only) is read from `services/api/src/reputation/counting-job.ts`, with a comment naming that file. Without it the three-step walk reaches zero `COUNTED` traces and the invariant proves nothing. Alternative rejected: leaving counting out, which would have made the two three-step tests pass while asserting nothing about the requirement.
- **R7. The pair test compares to a literal table, not to the switch.** The expected table is written out in the test from `docs/data-model.md` section 4.4, so the assertion can fail; comparing the function to itself could not. The coverage assertion is pinned to the table's dimensions (7 by 6), not to `OUTCOME_STATUSES.length` alone, so shrinking `OUTCOME_ACTIONS` fails it (verified: visited 35 of the table's 42 pairs).
- **Drift found by task 0.2, recorded not fixed.** `docs/data-model.md` T6 (`CONFIRMED` to `IN_PLATFORM_REVIEW` on an audit, anomaly flag or objection) has no code path. DEBT-55 records it; `FR-ADM-03` cannot be built until it exists.
- **The allowlist has four entries, not the two R4 predicted.** The scan found `evidence_tier`, `tier_multiplier`, `points` and `points_total`. R4's `value` never appeared and was dropped rather than kept as dead text.
- **The extractor reads column builders, not every quoted string.** A first pass scanned all quoted snake_case names and reported the check constraint `outcomes_evidence_tier_range`; restricting the pattern to the first argument of a column builder removed that class of false positive.
