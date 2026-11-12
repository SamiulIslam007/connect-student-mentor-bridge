# Design: response-reliability

## Context

See `proposal.md` for motivation. Only the state that shapes the approach is recorded here.

**Repository snapshot (verified 2026-11-11, re-check at apply).**

- `main` is at `6e88994`, clean; no active change; 35 specs valid before this round. No gate was run in this propose round.
- `mentorship_requests` (`services/api/src/db/schema/requests.ts`): `status` default `PENDING`, `decidedAt` nullable, `expiresAt` not null, `createdAt`, with `mentorship_requests_expires_after_creation` and a `(status, expires_at)` index. `request_status` is `PENDING`, `ACCEPTED`, `DECLINED`, `REDIRECTED`, `EXPIRED`, `WITHDRAWN`. `REDIRECTED` is a Phase 1b status with no write path today.
- `services/api/src/reputation/` holds `counting-job.ts`, `drizzle-reputation.service.ts`, `reputation.controller.ts`, `reputation.module.ts`, `reputation.tokens.ts`. There is no `reputation.service.ts` interface file; the controller injects the token and the class implements its own shape, so the interface lives beside the Drizzle implementation or in `reputation.tokens.ts`.
- `reputation.controller.ts` line 35 `@Get("me/impact")` and line 41 `@Get("mentors/:id/impact")`; both return `payload(...)` from the same builder.
- `packages/contracts/openapi.yaml` line 2019 and line 2037 reference `#/components/schemas/ImpactResponse`, which is defined at line 3633 with `additionalProperties: false` and `required: [data, counted_outcomes]`. `ImpactRow` is a separate schema.
- `apps/web/lib/impact-view.ts` defines `ImpactRow`, `ImpactReport` (`data`, `counted_outcomes`) and `ImpactState` (`loading`, `error`, `empty`, `ready`); its header comment records design D8's rule that no field may become "a score, tier, percentage, or ranking".
- `apps/web/app/profile/impact-section.tsx` renders the section and is the only consumer of the view model.
- `packages/config/src/index.ts` already exports `OUTCOME_COOLING_PERIOD_DAYS`, `REPUTATION_DIFFICULTY_WEIGHTS`, `REPUTATION_TIER_MULTIPLIERS`, `REPUTATION_CONTRIBUTION_MULTIPLIERS`, `MATCH_FACTOR_WEIGHTS` and `RATE_LIMITS`; there is no request-window constant there, so the 48-hour value the sweeper applies lives in the requests module and must be found, not invented.
- Tests that read impact: `services/api/test/reputation.integration.test.ts`, `apps/web/test/impact-section.test.ts`, `apps/web/test/impact-route.test.ts`, and `packages/contracts/test/openapi.test.ts` (which freezes several schema key sets with `Object.keys(...).sort()`).

## Goals / Non-Goals

**Goals**

- The mentor's own impact view answers "how many of my requests did I decide in time" from stored rows, without a new column.
- The number is a pair of counts, so it cannot be read as a reputation score and cannot collide with the counts-only contract.
- The computation is pure and table-driven, so every edge case (withdrawn, pending, expired, late, decided) is a test row rather than a manual check.

**Non-Goals**

- No percentage on the wire and no percentage in the UI.
- No public exposure, no ranking input, no reputation weight.
- No confidence tier, no points, no time series.

## Decisions

Owner decisions keep the numbers the brief fixed (D-114 to D-117). Decisions taken while writing carry `R` numbers.

### D-114. The window is all-time (owner decision)

The two counts cover every request the mentor has ever received, with no rolling window and no clock inside the pure function. Alternative rejected: a rolling 90 days, which needs a clock parameter, an empty-window rule, and a decision about whether a quiet month improves the ratio.

### D-115. The counts are visible to the mentor only (owner decision)

They appear on `GET /v1/me/impact` and in the mentor's own profile page section. They never appear on `GET /v1/mentors/{id}/impact` and never on a directory card. Alternative rejected: public display, which would turn a KPI into a reputation signal `FR-REP-05` and the reputation policy do not authorise.

### D-116. Counts only, never a percentage (owner decision)

The payload carries `requests_decided_in_time` and `requests_late_or_expired`, both integers. The share is derivable, and the docs say so in words. Alternative rejected: a `response_rate` percentage, which would violate the frozen view model's own rule (`apps/web/lib/impact-view.ts`, design D8) and read as a score.

### D-117. Below three requests the view shows a not-enough-data state (owner decision)

The threshold is one named constant in `packages/config` (proposed name `IMPACT_RELIABILITY_MIN_SAMPLE`, value 3) and the UI shows a single line instead of the two counts when their sum is below it. Alternative rejected: showing "0 of 0" or a percentage of one request, both of which read as a judgement on no evidence.

### R1. One bucket per request, and the buckets are a partition

`decided_in_time`: `status` is `ACCEPTED`, `DECLINED` or `REDIRECTED`, `decided_at` is set, and `decided_at - created_at` is at most the window. `late_or_expired`: `status` is `EXPIRED`, or `decided_at` is set and the decision came after the window. Everything else (`PENDING`, `WITHDRAWN`) increments neither. The function iterates once and increments at most one bucket per row, which is what makes "never both" structural rather than asserted. Alternative rejected: two independent filters, which allows a row to satisfy both.

### R2. The window is an argument, not a constant read inside the function

`responseReliability(requests, windowHours)` takes the window. The service passes the value the request sweeper already applies, so there is exactly one source. If that value is a literal in the requests module at apply time, the task says to pass it from there rather than write a second literal, and to note the duplication as a comment if it cannot be imported without a cross-module dependency. Alternative rejected: a new config constant, which would create a second source for a number the sweeper already owns.

### R3. The own-impact route gets its own schema

`IMPACT_RESPONSE` has `additionalProperties: false` and is shared by both routes, so it cannot be extended in place without publishing the counts publicly (D-115). The change adds `OwnImpactResponse` as a complete object (`data` referencing the existing `ImpactRow`, `counted_outcomes`, and the two new integers, all required), and points only `/v1/me/impact` at it. Alternative rejected: `allOf` composition, which does not compose with `additionalProperties: false` in a way a reader can trust, and would need the base schema changed anyway.

### R4. The view model carries the counts and one derived state, nothing else

`ImpactReport` gains `requests_decided_in_time` and `requests_late_or_expired`. A new pure helper `reliabilityState(report, minimum)` returns `hidden` or `shown`, so the not-enough-data rule is testable without a renderer, following the existing `impactState` pattern in the same file. No percentage is computed anywhere, including the view model.

### R5. The block is its own section in the impact view

The two counts render in a separate block below the field and outcome counts, with their own heading and one explanation line, because they are about the mentor's behaviour rather than their outcomes. Every label and the explanation line come from `apps/web/lib/strings.ts`.

## Acceptance criteria

1. A mentor with three requests decided inside 48 hours and one expired request reads `requests_decided_in_time` of 3 and `requests_late_or_expired` of 1 from `GET /v1/me/impact`.
2. A timely decline counts as decided in time and does not lower anything; a withdrawn request and a still-pending request appear in neither count.
3. A request decided after the window counts once, as late, and never also as in time; an expired request counts once, as late or expired.
4. The payload contains no percentage, score, points, tier or ranking key, and no student identifier; `GET /v1/mentors/{id}/impact` returns exactly the keys it returned before this change.
5. The profile page shows the two counts in their own block when the sum is at least the configured minimum, and a single not-enough-data line below it.
6. Every label comes from the string catalog, and the four gates pass with the documented per-package totals plus the new tests.

## Assumptions

1. A "decision" means `ACCEPTED`, `DECLINED` or `REDIRECTED` with `decided_at` set. `REDIRECTED` has no write path today, so including it changes no current number and keeps the rule true when `FR-REQ-04` ships.
2. Requests a mentor never received (wrong scope) do not exist: every row in the table is addressed to one mentor profile.
3. All-time is meaningful at pilot scale; a mentor with two requests in total will be below the threshold and see the not-enough-data line, which is the intended behaviour.

## Risks / Trade-offs

- Two counts instead of a rate pushes the arithmetic onto the reader. Mitigation: one explanation line in the UI says what the pair means, and the docs state that the share is derived.
- The public route and the own route now have different schemas, which is a second thing to keep in step. Mitigation: the public schema is unchanged and the contract test asserts its key set, so a leak is a test failure rather than a review note.
- Extending an impact payload breaks key-set assertions in at least one existing test. Mitigation: the task greps for `ImpactResponse`, `counted_outcomes` and `Object.keys(` in the contracts, api and web test trees before running the suite, and the affected files are named in `tasks.md`.
- The 48-hour value may be a literal in the requests module. Mitigation: the function takes it as an argument, and the task forbids a second literal.

## Open Questions

- Whether the two counts should also appear in the moderation or admin views. No requirement asks for it, and `FR-PROF-04` argues against widening what an admin sees. Left out.

## Migration Plan

None. No schema change, no backfill, no stored value. Deploy order: the domain function and its tests, then the service and contract, then the view. A client that never opens the profile page is unaffected.

## Spec delta notes

The `MODIFIED` block restates the whole requirement "The impact view reports counts only" from `openspec/specs/mentorship/reputation-ledger/spec.md` line 99, keeps its header byte for byte, and keeps all four existing scenario titles in their existing order: "Counts appear after counting", "Non-counted states are excluded", "A platform-decided outcome is excluded", "No score is exposed". No scenario is added, renamed or dropped. Only the requirement body changes, to say that the own-impact read also returns the two request counts and that neither read gains a percentage.
