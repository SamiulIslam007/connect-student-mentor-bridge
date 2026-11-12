# Proposal: response-reliability

## Why

`FR-REP-04` is Must, scored zero, and recorded as `DEBT-25`: "Response reliability (FR-REP-04) is not computed: the impact view shows counts only ... the KPI is not derivable from the page." `FR-REP-02` is half built for the same reason — `docs/functional-requirements.md` marks it "Partially built ... response reliability and the confidence tier are not built".

The data needed already exists and is already written by the request flow: `mentorship_requests` carries `status` over `PENDING`, `ACCEPTED`, `DECLINED`, `REDIRECTED`, `EXPIRED` and `WITHDRAWN`, plus `decided_at` (`services/api/src/db/schema/requests.ts` line 44) and `expires_at` (line 47), with a check that `expires_at` is after `created_at`. Nothing new has to be captured, so this is a pure computation over rows the system already keeps, which makes it the cheapest remaining Must row in the reputation area and the only one that needs no migration.

It also settles an open inconsistency. The impact view was deliberately frozen against anything that reads like a score (`apps/web/lib/impact-view.ts`, design D8: "no field that could become a score, tier, percentage, or ranking"), and `FR-REP-05` forbids cross-field aggregates. A response rate as a percentage would collide with both. Two integer counts satisfy `FR-REP-04`'s KPI (the share of requests decided within 48 hours is derivable from them) without introducing a number a user could read as reputation.

## What Changes

- Add a pure function in `packages/domain` that, given a mentor's requests and the decision window in hours, returns two integers: decided within the window, and late or expired. No clock, no database, no configuration read inside the function.
- Add both counts to `GET /v1/me/impact` under their own documented keys. The public `GET /v1/mentors/{id}/impact` answer is unchanged, so the counts never appear on a public mentor card.
- Add a separate OpenAPI schema for the own-impact response, because `ImpactResponse` carries `additionalProperties: false` and is shared by both routes; extending it would publish the counts on the public route.
- Extend `apps/web/lib/impact-view.ts` with the two counts and a state for "not enough data yet", and render them in their own block in `apps/web/app/profile/impact-section.tsx` through the string catalog.
- Add the not-enough-data threshold as one named constant in `packages/config`.
- Modify the `mentorship/reputation-ledger` requirement "The impact view reports counts only" (header verbatim, all four scenario titles kept) and add one requirement for the computation.
- Close `DEBT-25`; raise the `FR-REP-02` partial to built for the reliability item and leave the confidence tier (Phase 1b) as the remaining gap.
- No migration: every column this reads already exists.

## Capabilities

### New Capabilities

None. The behaviour belongs to the capability that already owns the impact reads.

### Modified Capabilities

- `mentorship/reputation-ledger`: the requirement "The impact view reports counts only" is restated to include the two request counts on the own-impact route, keeping its header and all four scenario titles; one requirement is added for the computation itself.

## Impact

- **Code**: `packages/domain/src/reputation.ts` (the pure function and its types), `packages/domain/src/index.ts` (export), `packages/config/src/index.ts` (one constant), `services/api/src/reputation/reputation.service.ts` and `services/api/src/reputation/drizzle-reputation.service.ts` (the read), `services/api/src/reputation/reputation.controller.ts`, `apps/web/lib/impact-view.ts`, `apps/web/app/profile/impact-section.tsx`, `apps/web/lib/strings.ts`.
- **Tests**: new `packages/domain/test/reputation.test.ts` cases (the file exists; these are added to it), `services/api/test/reputation.integration.test.ts` (the payload and the exclusions), `apps/web/test/impact-section.test.ts` (the block and the not-enough-data state), `apps/web/test/impact-route.test.ts` (the passthrough), `packages/contracts/test/openapi.test.ts` if it freezes the impact schema's key set. Grep before running: `grep -rn "ImpactResponse\|counted_outcomes\|Object.keys(" packages/contracts/test services/api/test apps/web/test`.
- **API/contract**: `packages/contracts/openapi.yaml` gains one schema (`OwnImpactResponse`) and changes the `/v1/me/impact` `200` to reference it. `/v1/mentors/{id}/impact` is unchanged. No body keys and no new route, so `body-keys.ts` and the two route registries are untouched.
- **Data**: none.
- **Dependencies**: none added.
- **Docs**: `docs/functional-requirements.md` (`FR-REP-04` built, `FR-REP-02` re-annotated), `docs/api-contracts.md` section 5.3 or the reputation read it documents, `docs/known-debt.md` (`DEBT-25` closed), `docs/decision-log.md` (D-114 to D-117), `docs/mvp-build-plan.md` section 5, `docs/milestones-and-phases.md` current state, `README.md` status line.

## Depends on

- `mentorship/request-lifecycle` (archived 2026-11-08): the request rows, their statuses and their decision timestamps.
- `mentorship/reputation-ledger` (archived 2026-11-08): the impact reads and the counts-only contract this extends.
- `profiles/profile-visibility` (archived 2026-11-05): the reason the public route keeps its current shape.

## Out of scope

- The confidence tier (Phase 1b) and the internal numeric score (`DEBT-24`).
- Any public display of response reliability, and any cross-field aggregate.
- Weighting reliability into reputation, ranking, or suggestions: the counts are information, not an input.
- Historical backfill, per-field breakdowns, and a time-series view.
- The other half of `FR-REP-02`'s missing items beyond reliability.

## Risks and rollback

| Risk | Mitigation |
|---|---|
| The counts leak onto the public mentor card | The public route keeps `ImpactResponse`; the own route gets its own schema, and a contract test asserts the public response's key set |
| A percentage creeps in and collides with design D8 and `FR-REP-05` | The payload carries two integers and the docs say the share is derived client-side; the integration test asserts the absence of any percentage or score key |
| An expired request is counted twice | The pure function is a partition: each request increments exactly one bucket or neither, and a test asserts the buckets sum to at most the total |
| A withdrawn request drags a mentor's ratio down | Withdrawn and still-pending rows increment neither count, asserted table-driven |
| The 48-hour window exists as a literal in the sweeper and drifts from this computation | The window is an argument to the pure function, passed by the service from the same value the sweeper uses; the task names where to look and forbids a second literal |

Rollback: revert the commit. No stored data is written by this change, so nothing has to be repaired.

**Traces to** FR-REP-04 (response reliability from request timestamps), FR-REP-02 (mentor impact view), FR-REP-05 (no cross-field aggregate, no like-style field), FR-REP-07 (no numeric score exposed); ADR-018 (Drizzle); D-114 to D-117 (this change); DEBT-25 (closed), DEBT-24 (untouched).
