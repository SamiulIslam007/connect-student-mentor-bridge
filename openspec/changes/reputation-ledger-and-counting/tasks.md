# Tasks: reputation-ledger-and-counting

## 1. Schema, enums, migration, grants

- [ ] 1.1 Add `reputation_event_type` to `services/api/src/db/schema/enums.ts` and `reputation_events` / `field_impact_snapshots` to `services/api/src/db/schema/reputation.ts`, exporting both from `db/schema/index.ts`; verify `pnpm --filter api typecheck` passes.
- [ ] 1.2 Generate migration `0014` with `pnpm --filter api db:generate`, then hand-write `GRANT SELECT, INSERT ON TABLE "reputation_events" TO connect_app;` and `GRANT SELECT, INSERT, UPDATE ON TABLE "field_impact_snapshots" TO connect_app;`; verify both lines are present and that `DELETE` is granted nowhere in the file.
- [ ] 1.3 Extend `services/api/test/database.integration.test.ts`: add the two tables, update the count wording, add the `connect_app` probe for the snapshots table, and add the append-only probe asserting `UPDATE`/`DELETE` on `reputation_events` are refused; verify the test passes under `CI=true`.
- [ ] 1.4 Document both tables, the unique constraints, the `numeric` precisions, and the reserved `REVERSAL` event type in `docs/data-model.md` §4.1 and §5.6; verify every column in the design table appears in the doc.

## 2. The formula and the pair factor

- [ ] 2.1 Add `packages/domain/src/reputation.ts` with `PAIR_FACTOR_DECAY` (a pure `pairFactor(n)` returning `1/(1+n)`), `reputationPoints({difficultyWeight, tierMultiplier, contributionMultiplier, pairFactor})`, and `earlierCountedForPair` as a pure count helper, exporting from `packages/domain/src/index.ts`; verify `pnpm --filter @connect/domain test` passes.
- [ ] 2.2 Add placeholder constants to `packages/config/src/index.ts`: `REPUTATION_DIFFICULTY_WEIGHTS`, `REPUTATION_TIER_MULTIPLIERS`, `REPUTATION_CONTRIBUTION_MULTIPLIERS`, each `1.0` with a comment naming `docs/reputation-and-verification-policy.md` §17 and marking them placeholders pending pilot data; verify `pnpm --filter @connect/config typecheck` passes.
- [ ] 2.3 Add `packages/domain/test/reputation.test.ts` covering pair factors `1`, `1/2`, `1/3`, that an uncounted outcome does not raise `n`, and that the product equals the configured factors; verify the suite names each case.
- [ ] 2.4 Label the placeholders in `docs/reputation-and-verification-policy.md` §17 as "shipped as 1.0 placeholders, values still Open"; verify the table no longer implies a value exists in code.

## 3. The counting job

- [ ] 3.1 Add `services/api/src/reputation/{counting-job.ts,drizzle-reputation.service.ts,reputation.tokens.ts,reputation.module.ts}` implementing one pass: bounded select of `CONFIRMED` outcomes with `cooling_ends_at <= now()`, row lock, re-check status and open case, then count; verify a unit-level test drives the pass against a seeded outcome.
- [ ] 3.2 Write the `COUNTED` outcome event, the reputation event with its copied multipliers and pair factor, and the snapshot upsert inside one transaction per outcome; verify `services/api/test/reputation.integration.test.ts` covers the counted row, the single event, and the snapshot total.
- [ ] 3.3 Register `REPUTATION_COUNT_QUEUE = "reputation-counter"` with `REPUTATION_COUNT_CRON = "*/10 * * * *"` next to `requests-sweeper` in `services/api/src/platform/outbox/outbox-worker.ts`; verify the worker test or the existing worker smoke check shows both queues registered.
- [ ] 3.4 Assert the guards: not counted before `cooling_ends_at`, not counted while `IN_PLATFORM_REVIEW`, never counted for a platform-decided or conflict-declared outcome, and a repeated run writes nothing new; verify all four cases are in the integration test and pass.

## 4. Snapshot and replay

- [ ] 4.1 Implement the snapshot upsert with `ON CONFLICT (mentor_profile_id, field_id, outcome_type) DO UPDATE` adding one to `counted_count` and the points to `points_total`; verify a two-outcome test reports `counted_count = 2` and the summed points.
- [ ] 4.2 Add a replay function that recomputes the snapshot rows from `reputation_events` and a test asserting exact equality with the stored rows after a mixed sequence; verify the test fails if one stored total is perturbed.

## 5. Impact endpoints

- [ ] 5.1 Add `services/api/src/reputation/reputation.controller.ts` with `GET /v1/me/impact` (the caller's own counts) and `GET /v1/mentors/{id}/impact` (`404` when the profile is absent or not `ACTIVE`); verify integration tests cover the signed-in read, the anonymous `401`, and both `404` cases.
- [ ] 5.2 Shape the response as counts by field and outcome type plus a `counted_outcomes` total, with no `score`, `points`, `tier`, or ranking key; verify a test asserts the exact key set of the response object.
- [ ] 5.3 Assert exclusion rules at the endpoint: pending, confirmed-not-counted, in-review, withdrawn, rejected, and platform-decided outcomes never appear in a count; verify each state is exercised.
- [ ] 5.4 Add both routes to the `MATRIX` in `services/api/test/authorization-matrix.test.ts` and extend that stack with the new controller and tokens; verify the matrix test passes.

## 6. Contract and API docs

- [ ] 6.1 Add the two impact paths and their schemas to `packages/contracts/openapi.yaml`, explicitly without a score property; verify `pnpm --filter @connect/contracts test` passes and the contract's path inventory equals the controller decorators.
- [ ] 6.2 Document the two endpoints, the response shape, and the exclusion rules in `docs/api-contracts.md` §5.3; verify the documented keys match the test's exact key-set assertion.
- [ ] 6.3 Mark FR-REP-01 to FR-REP-05 and FR-REP-07 in `docs/functional-requirements.md` as built to counts-only depth, naming confidence tiers as still deferred; verify no FR is claimed beyond what the endpoints return.

## 7. Web impact section

- [ ] 7.1 Add `apps/web/app/api/me/impact/route.ts` following the existing BFF probe pattern; verify `apps/web/test/impact-route.test.ts` covers forwarding, `401` passthrough, and a non-JSON upstream mapped to `502`.
- [ ] 7.2 Add the impact section to `apps/web/app/profile/page.tsx`, counts only, reusing existing typography and list tokens; verify `apps/web/test/impact-section.test.ts` renders the counts, the empty state, and the error state.
- [ ] 7.3 Add every new label to `apps/web/lib/strings.ts`; verify no hard-coded user-facing sentence remains and that no score, tier, or percentage is rendered.

## 8. Plan split, decisions, debt, and trackers

- [ ] 8.1 Record the split of `#10` in `docs/mvp-build-plan.md` §5: this change as `DONE`, and a new row `platform-review-queue` (reviewer decisions with a written reason, `REJECTED`, clawback) keeping its place after it; verify no change number is reused and the dependency line is stated.
- [ ] 8.2 Add `docs/decision-log.md` rows D-66 (the `#10` split and why), D-67 (difficulty, tier, and contribution multipliers ship as `1.0` placeholders pending pilot data), and D-68 (the counts-only impact view ships before discovery, because mentor recognition is the only non-monetary pilot reward); verify each row has Date, Decision, Reason, Status, Affects.
- [ ] 8.3 Add `docs/known-debt.md` rows for: outcomes that enter `IN_PLATFORM_REVIEW` with no exit until `platform-review-queue`; `points_total` never leaving the server until the confidence thresholds are decided; and response reliability, which `docs/reputation-and-verification-policy.md` §8 lists as a display item but this change does not compute; verify each row names one owner and one target.
- [ ] 8.4 Update `docs/milestones-and-phases.md` "Current state" and Sprint 6 row, `docs/mvp-build-plan.md` row status, and the `README.md` status line; verify all three name this change and the date.

## 9. Checks, docs gate, review gate, handoff

- [ ] 9.1 Run `pnpm lint`, `pnpm typecheck`, `CI=true pnpm test`, and `pnpm build` from the repo root, each as its own command with its exit code captured; verify all four report 0 failures and no skipped integration test.
- [ ] 9.2 Run the docs gate over the touched docs (`data-model`, `api-contracts`, `functional-requirements`, `reputation-and-verification-policy`, `known-debt`, `mvp-build-plan`, `milestones-and-phases`, `README`); verify every table, endpoint, constant, and plan change in the diff appears in a doc.
- [ ] 9.3 Run the review gate plus the trust-rule check (only counted outcomes count, append-only ledger, derived reputation, no public score); verify each finding is fixed in scope or reported with a debt row.
- [ ] 9.4 Write the handoff with commits, per-package gate output, docs changed, and anything UNVERIFIED; verify the raw `git log --oneline` is quoted.

## Workflow follow-up

- Archive only after the owner reviews the merged PR and says so.
- `platform-review-queue` is the next change in the plan; do not start it from this branch.
