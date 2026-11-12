# Tasks: response-reliability

## 0. Preconditions

- [ ] 0.1 Re-read the repository snapshot in `design.md` against the real tree: `git log --oneline -1` (expect `6e88994`), `git status`, `grep -n "decidedAt\|expiresAt\|status:" services/api/src/db/schema/requests.ts`, `grep -n -A12 "ImpactResponse:" packages/contracts/openapi.yaml`, `sed -n '1,20p' apps/web/lib/impact-view.ts`, `grep -n "Get(\"me/impact\")\|Get(\"mentors/:id/impact\")" services/api/src/reputation/reputation.controller.ts`. Verify: every snapshot line is confirmed by an output or listed as a mismatch in the handoff.
- [ ] 0.2 Find the 48-hour decision window the sweeper applies: `grep -rn "48\|DECISION_WINDOW\|expiresAt" services/api/src/requests/*.ts`. Record the file and the form it takes (imported constant or literal) in this file before writing the function, because the window is passed in, never re-declared.
- [ ] 0.3 Grep the tests that freeze the impact payload: `grep -rn "ImpactResponse\|counted_outcomes\|Object.keys(" packages/contracts/test services/api/test apps/web/test`. List every file that must change in this file before running any suite.

## 1. The pure function

- [ ] 1.1 Add `responseReliability(requests, windowHours)` to `packages/domain/src/reputation.ts`, taking the minimal row shape (status, created at, decided at) and returning `{ decidedInTime, lateOrExpired }`; iterate once, increment at most one bucket per row, and count `REDIRECTED` as a decision. Export the types and re-export from `packages/domain/src/index.ts`. Verify: `pnpm --filter @connect/domain test` passes with table-driven cases: decided in time, decided late, expired, withdrawn, pending, and a mixed set whose buckets sum to at most the row count.
- [ ] 1.2 Add `IMPACT_RELIABILITY_MIN_SAMPLE` to `packages/config/src/index.ts` beside the other proposed defaults, with a comment naming it a proposed default. Verify: `pnpm --filter @connect/config typecheck` passes and it is exported from the package entry.

## 2. The API read

- [ ] 2.1 Extend the own-impact read in `services/api/src/reputation/drizzle-reputation.service.ts` to count the mentor's requests with one aggregate query (one pass, no per-row loop) and return the two integers alongside the existing payload; pass the window from the value found in 0.2. Verify: `services/api/test/reputation.integration.test.ts` asserts 3 and 1 for three on-time decisions and one expired request, asserts a timely decline counts as in time, and asserts a withdrawn and a still-pending request appear in neither count.
- [ ] 2.2 Keep the public read unchanged: `impactForMentorProfile` must not gain the fields. Verify: the same integration file asserts the public payload's key set is exactly the pre-change set, and a `403`/`404` case still behaves as before.
- [ ] 2.3 Update `services/api/src/reputation/reputation.controller.ts` so only the own route carries the new fields, through a separate response type rather than a widened shared one. Verify: `pnpm --filter api typecheck` passes and the type distinction is visible in the controller.

## 3. Contract

- [ ] 3.1 Add `OwnImpactResponse` to `packages/contracts/openapi.yaml` as a complete object with `additionalProperties: false` and `required: [data, counted_outcomes, requests_decided_in_time, requests_late_or_expired]`, `data` referencing the existing `ImpactRow`, and point `/v1/me/impact` `200` at it. Leave `/v1/mentors/{id}/impact` on `ImpactResponse`. Verify: `pnpm --filter @connect/contracts test` passes, including the schema key-set assertions named in 0.3.
- [ ] 3.2 Add the fields to the `docs/api-contracts.md` impact read with one sentence saying the share is derived and no percentage is sent.

## 4. The web view

- [ ] 4.1 Extend `apps/web/lib/impact-view.ts`: two integer fields on `ImpactReport`, a `reliabilityState(report, minimum)` helper returning `hidden` or `shown`, and no percentage anywhere. Verify: `apps/web/test/impact-section.test.ts` (or a sibling case in it) asserts the state below and at the threshold, and asserts the model exposes no percentage.
- [ ] 4.2 Render the block in `apps/web/app/profile/impact-section.tsx`: heading, the two counts, one explanation line, and the not-enough-data line. All labels from `apps/web/lib/strings.ts`. Verify: a page or section test reads the file and asserts the block renders from the model and that no percentage sign appears in the component.
- [ ] 4.3 Check the BFF passthrough in `apps/web/test/impact-route.test.ts` still asserts the forwarded payload, and update it if it freezes keys. Verify: `pnpm --filter web test` passes.

## 5. Docs and decisions

- [ ] 5.1 Update `docs/functional-requirements.md`: `FR-REP-04` built with its evidence line, `FR-REP-02` re-annotated to say the reliability item is now built and the confidence tier is the remaining gap.
- [ ] 5.2 Close `DEBT-25` in `docs/known-debt.md` with the evidence (the test that proves the counts), and confirm `DEBT-24` stays open untouched.
- [ ] 5.3 Add the decision rows `D-114` to `D-117` and this change's `R` rows to `docs/decision-log.md` (full text at the end of this file).
- [ ] 5.4 Update `docs/mvp-build-plan.md` section 5, `docs/milestones-and-phases.md` "Current state", and the `README.md` status line. Verify: the three docs agree on status, PR number and date.

## 6. Gates, review and handoff

- [ ] 6.1 Run from the repo root with Docker up: `pnpm lint`, then `pnpm typecheck`, then `CI=true pnpm test`, then `pnpm build`. Record each exit code and the per-package totals. `CI=true` is what makes the integration files run; a run with skipped files and zero failures is UNVERIFIED. Run the four gates as one background job writing to a log file and poll it. CI creates `connect_test` itself and the whole checks job takes about 3.5 minutes.
- [ ] 6.2 Run the review gate from `AGENTS.local.md` section 2: `verify-before-done`, `/ponytail-review`, `/ce-code-review`, the silent-failure hunt, the trust-rule check, `/ponytail-debt`, and `review-diff`. The change touches reputation reads, so run `/ponytail-audit` as well.
- [ ] 6.3 Confirm the diff contains only the tasks above, then write the handoff naming the PR, the merge commit, the four gate totals, and the public-payload key-set assertion that proves no leak.

## Decision rows to add at apply

Add each to `docs/decision-log.md` as its own row. They are reserved here because this propose round may create only files under `openspec/changes/`.

**D-114**

- Date: 2026-11-11
- Decision: Response reliability counts every request the mentor has ever received, with no rolling window, and the pure function takes the window as an argument so no clock and no constant live inside it.
- Reason: a rolling window needs a clock parameter and an empty-window rule for no gain at pilot scale, and one source for the 48-hour value is what keeps the sweeper and this computation in step.
- Status: Decided
- Affects: `mentorship/reputation-ledger`, `services/api/src/reputation/`

**D-115**

- Date: 2026-11-11
- Decision: The two request counts appear on `GET /v1/me/impact` only. `GET /v1/mentors/{id}/impact` and every directory card keep their current payload.
- Reason: a public response rate is a reputation signal the policy does not authorise, and the own-impact view is where the mentor's own behaviour belongs.
- Status: Decided
- Affects: `mentorship/reputation-ledger`, `packages/contracts/openapi.yaml`

**D-116**

- Date: 2026-11-11
- Decision: The payload carries two integer counts, `requests_decided_in_time` and `requests_late_or_expired`, and no percentage, score, points, tier or ranking key. The share is derivable and the docs say so in words.
- Reason: the impact view model is frozen against anything that reads as a score or a percentage (design D8), and `FR-REP-05` forbids a cross-field aggregate.
- Status: Decided
- Affects: `mentorship/reputation-ledger`, `apps/web/lib/impact-view.ts`, `docs/api-contracts.md`

**D-117**

- Date: 2026-11-11
- Decision: Below three requests the impact section shows a single not-enough-data line instead of the two counts. The threshold is one constant in `packages/config` (`IMPACT_RELIABILITY_MIN_SAMPLE`, proposed default 3).
- Reason: a ratio over one or two requests reads as a judgement on no evidence, and the threshold is a tuning value, not code.
- Status: Decided
- Affects: `mentorship/reputation-ledger`, `packages/config/src/index.ts`, `apps/web/lib/impact-view.ts`

## Workflow follow-up

- Merge the PR with a merge commit after every check passes, then archive on its own `chore/archive-response-reliability` branch, because the ruleset refuses a direct push to `main`.
- At archive, diff the archived requirement against the new one: header identical, four scenarios present, exactly one body paragraph changed, and `openspec validate --all --strict` passing with 40 items.
