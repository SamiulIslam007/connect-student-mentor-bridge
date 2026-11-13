# Proposal: suspended-account-directory-exclusion

## Why

`FR-ADM-05` and `FR-AUTH-10` say a suspended account receives no new requests, and the directory spec says only mentors who may receive a request are listed. The code satisfies neither fully: `suspendAccount` writes `users.status` only, while every discovery query filters on `mentor_profiles.status`, which stays `ACTIVE` through a suspension. A suspended or self-deactivated mentor therefore remains listed, remains in the ranked suggestions, keeps a readable public profile and impact view, and can still be sent a new request. The exclusion is one derivation that the code never makes.

The same review found a second, smaller defect in the one activation funnel: `syncMentorActivation` reads a mentor's status, computes the next one, and then writes unconditionally, so a status written by another actor between the read and the write is overwritten.

## What Changes

- Every discovery query gains the account-status condition, derived from `users.status` and never from a rewrite of `mentor_profiles.status`: the public directory, the ranked suggestions pool, the mentor context read (`GET /v1/mentors/{id}`), and the public impact read (`GET /v1/mentors/{id}/impact`).
- A new request to a mentor whose account is not `ACTIVE` is refused with `409 MENTOR_UNAVAILABLE`, the same answer a paused mentor gets, so the refusal names no cause.
- `syncMentorActivation` writes conditionally on the status it read, so a concurrent status change by another actor wins instead of being clobbered.
- No schema change and no migration: the exclusion is a predicate on a column that already exists, and lifting a suspension (the reinstate route or the `account-sanction` job) restores the listing with no profile write.
- Existing mentorship threads, session agreements, requests already sent and outcomes stay readable to both sides; only new discovery and new requests are blocked.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. Each delta is an added requirement in the capability that already owns the surface. No current requirement contradicts a stricter eligibility rule, so no existing block is restated.

## Impact

- **Code**: `services/api/src/profiles/drizzle-profiles.service.ts` (`listMentors`, `readSuggestionPool`, `readMentorContext`), `services/api/src/reputation/drizzle-reputation.service.ts` (`impactForMentorProfile`), `packages/domain/src/request.ts` (the pause branch of `canCreateRequest`), `services/api/src/requests/drizzle-requests.service.ts` (`create`), `services/api/src/reports/drizzle-reports.service.ts` (the profile report target), `services/api/src/onboarding/mentor-activation.ts` (the conditional write).
- **Tests**: `services/api/test/profiles.integration.test.ts` (directory and context), `services/api/test/matching.integration.test.ts` (suggestions), `services/api/test/requests.integration.test.ts` (the refusal), `services/api/test/reputation.integration.test.ts` (impact), `services/api/test/reports.integration.test.ts` (suspend, both lifts, byte-identical profile row), `services/api/test/mentor-activation.test.ts` (the conditional write).
- **API/contract**: no route, parameter, or body change; `GET /v1/mentors/{id}` and the directory return `404` or an absent card for a suspended account, which the existing contract already allows.
- **Data**: none.
- **Docs**: `docs/functional-requirements.md` (`FR-DISC-01`, `FR-ADM-05` status lines), `docs/known-debt.md`, `docs/decision-log.md`, `docs/auth-and-access-control.md` (the suspension paragraph), `docs/mvp-build-plan.md`, `docs/milestones-and-phases.md`.

## Depends on

- `mentor-directory` (archived 2026-11-09): the public read and its projection.
- `mentor-suggestions-and-reasons` (archived 2026-11-11): the bounded suggestion pool.
- `abuse-reports-and-sanctions` (archived 2026-11-10) and `sanction-lifecycle-warn-and-lift` (archived 2026-11-13): the suspension, the reinstate route, and the `account-sanction` job this change relies on and does not modify.

## Out of scope

- Rewriting `mentor_profiles.status` on suspension, or any second copy of the account status.
- Deleting or hiding existing mentorship threads, outcomes, or agreements of a suspended mentor.
- Cancelling requests already sent to a mentor who is suspended afterwards (`R3` keeps today's behaviour).
- An admin surface that lists the suspended mentor's pending requests.
- The deactivation reversal (DEBT-50, closed) and the account lifecycle itself.

## Risks and rollback

| Risk | Mitigation |
|---|---|
| A suspension silently hides a mentor from a student who already saw them | The request refusal is a `409` with the existing `MENTOR_UNAVAILABLE` title, and the directory never returns a card for the account, so a stale link is the only path and it answers as unavailable |
| The exclusion is applied to one query and forgotten in the next | `design.md` lists every discovery query found by grep, each one carries the condition, and a test per surface asserts the absence |
| Lifting a suspension does not restore the listing | No profile write is involved, so the test asserts the reappearance after both the route and the job, and asserts the mentor profile row is byte-identical across the whole flow |
| The conditional write leaves a mentor stuck in the wrong status | The condition is the status the function read in the same call; the next trigger recomputes from the current row, so a skipped write heals on the next sync |

Rollback: remove the account-status conditions and the request refusal; the suspension itself and its audit row are unchanged. No data changes.
