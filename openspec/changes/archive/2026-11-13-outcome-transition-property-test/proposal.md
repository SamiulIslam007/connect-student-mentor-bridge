# Proposal: outcome-transition-property-test

## Why

Two Must rows are built in behaviour and unproven in the form the register asks for. `FR-OUT-06` requires that "a property test asserts that no event sequence reaches Counted without mentor confirmation or a platform decision", and `FR-REP-05` requires that "a schema test fails the build if one is added" for a like-style or cross-field aggregate. Neither test exists, so both rows sit at Partial while the code they describe is correct.

## What Changes

- Add a property test over sequences of outcome transitions: every action over every state, and every sequence of two and three actions from a fresh outcome, asserted against the one pure transition function.
- Assert the specific invariant `FR-OUT-06` names: no sequence of actions reaches `COUNTED` unless a mentor confirmation or a platform review decision precedes it, and no sequence reaches a state the transition table does not allow.
- Add a build-failing static guard over the reputation payload and the outcome payload key sets, and over `packages/contracts/openapi.yaml` and `services/api/src/db/schema/reputation.ts`, that fails when a key or column could become a score, a like, a star, a follower count, a rank, a rate or a cross-field aggregate.
- Freeze the guard's allowlist in the test itself, so adding a payload key is a deliberate two-file change.
- Tests only. No runtime behaviour, no route, no schema, no migration, no contract change.

## Capabilities

### New Capabilities

None. No behaviour changes, so `.openspec.yaml` sets `skip_specs: true`; the requirements already state the behaviour these tests prove.

### Modified Capabilities

None.

## Impact

- **Code**: none.
- **Tests**: new `packages/domain/test/outcome-property.test.ts` (transition sequences), new `packages/contracts/test/reputation-schema-guard.test.ts` (key-set and column guard).
- **API/contract/data/dependencies**: none.
- **Docs**: `docs/functional-requirements.md` (`FR-OUT-06` and `FR-REP-05` complete, with the test paths as evidence), `docs/known-debt.md` (no close, no open), `docs/mvp-build-plan.md` section 5, `docs/milestones-and-phases.md`.
- **CI**: the two files run inside the existing `checks` job; no workflow change.

## Depends on

- `outcomes-and-verification` (archived 2026-11-08): the transition function and the dispatch table.
- `reputation-ledger-and-counting` (archived 2026-11-08): the counting job, the impact payload and its key-set test.
- `platform-review-queue` (archived 2026-11-09): the review decision that is the second legal route to `COUNTED`.

## Out of scope

- A database-level assertion that no score column can be added: the guard is static, over the schema source and the contracts, not over a live catalog (the brief fixes this).
- Property tests for other state machines (requests, mentorships, sessions) — they are not Must rows.
- Fuzzing, mutation testing, or a test-time budget change.
- Re-testing the behaviours already covered by the existing integration suite.

## Risks and rollback

| Risk | Mitigation |
|---|---|
| A property test that passes because it explores nothing | The test asserts its own coverage: the number of (state, action) pairs visited equals the table size, and the sequence depth is checked, so a shrunken generator fails the test |
| The guard blocks a legitimate payload key later | The allowlist lives in the test with a comment naming the rule; a legitimate addition edits two files in one commit, which is the intended friction |
| The guard is bypassed by a string concat or an alias | The guard also scans the OpenAPI file for the forbidden suffixes, so a key renamed in one place and not the other fails |
| A long property test slows the suite | The sequence depth is bounded at three, so the state space stays in the thousands of evaluations, measured while writing the test |

Rollback: delete the two files, revert the two register rows. Nothing else changes.

**Traces to** FR-OUT-06, FR-REP-05; FR-REP-07 (no score exposed), FR-ADM-01 (the platform decision route); D-66 (the split that left the property test owed).
