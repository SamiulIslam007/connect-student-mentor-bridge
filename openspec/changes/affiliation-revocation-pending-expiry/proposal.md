# Proposal: affiliation-revocation-pending-expiry

## Why

`FR-VER-04` says that when Level 1 is revoked, pending requests expire with notice. The code revokes a superseded affiliation in two places — a claim that the new email domain cannot support (`drizzle-affiliations.service.ts` line 200, which inserts the new row as `LEVEL_0`/`PENDING`) and the institution admin's verification of a new claim (`drizzle-attestation.service.ts` line 132) — and neither touches the mentor's `PENDING` requests. The first path really does leave a mentor at Level 0 while requests sit in a student's queue for up to 48 hours, addressed to a mentor who can no longer accept them. `FR-VER-04` is `PARTIAL` for exactly this reason.

## What Changes

- One shared helper expires every `PENDING` request of a mentor whose account no longer holds a `VERIFIED` affiliation, inside the same transaction as the revocation, with one queued notice per affected request.
- The expiry records why: a new nullable `expiry_reason` on `mentorship_requests`, so a deadline expiry and an eligibility expiry are distinguishable afterwards.
- Response reliability stops counting an eligibility expiry against the mentor: the aggregate's "late or expired" filter excludes that reason, because the mentor could not have decided.
- Existing mentorships, outcomes and grants are untouched: only requests still `PENDING` move, and only to `EXPIRED`.
- Idempotent by construction: the update is conditional on `status = 'PENDING'`, so a second run finds no rows and queues no second notice.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. Two additions, one per owning capability: the revocation rule belongs to `institutions/affiliation-verification`, and the request's expiry belongs to `mentorship/request-lifecycle`. No existing requirement contradicts either, so nothing is restated.

## Impact

- **Code**: `services/api/src/affiliations/affiliation-expiry.ts` (new shared helper), `services/api/src/affiliations/drizzle-affiliations.service.ts` (call after the revoke and insert), `services/api/src/institutions/drizzle-attestation.service.ts` (call in the verify transaction, where it is a no-op because the replacement row is `VERIFIED`), `services/api/src/reputation/drizzle-reputation.service.ts` (the reliability filter).
- **Tests**: `services/api/test/affiliations.integration.test.ts`, `services/api/test/attestation.integration.test.ts`, `services/api/test/requests.integration.test.ts` (idempotency, the 48-hour interaction, the untouched accepted request), `services/api/test/reputation.integration.test.ts` (reliability is not penalised), `services/api/test/database.integration.test.ts` (no new table; the column probe runs as `connect_app`).
- **API/contract**: no route and no request change. `GET /v1/requests` gains `expiry_reason` in its projection, so `packages/contracts/openapi.yaml` gains one nullable field and `services/api/test/authorization-matrix.test.ts` is untouched (no new route); `body-keys.ts` and the request-validation inventory stay unchanged (no new body key).
- **Data**: migration `0019` adds `mentorship_requests.expiry_reason` with a check on its two values, backfilled to `DEADLINE` for existing `EXPIRED` rows; no new table, no new grant.
- **Docs**: `docs/data-model.md` (the column and the enum), `docs/api-contracts.md`, `docs/functional-requirements.md` (`FR-VER-04` to `DONE`, totals recomputed), `docs/known-debt.md`, `docs/decision-log.md`, `docs/mvp-build-plan.md`, `docs/milestones-and-phases.md`.

## Depends on

- `affiliation-and-mentor-onboarding` and `institution-admin-attestation` (archived 2026-11-08 and 2026-11-11): the two revocation paths and the level model.
- `requests-and-48h-flow` (archived 2026-11-08): the `PENDING`/`EXPIRED` states, the sweeper, and the `request-expired` notice.
- `response-reliability` (archived 2026-11-12): the aggregate this change narrows.

## Out of scope

- Suspension behaviour (`DEBT-59`): a suspended mentor's pending requests keep today's 48-hour window.
- Blocking new requests, which `suspended-account-directory-exclusion` and the Level-1 gate already do.
- Cancelling an accepted request or closing a live mentorship.
- An admin-initiated "revoke this affiliation" route: the two existing paths are the only revocation sites, and the first is reachable in production.
- Reworking the 48-hour promise or the reminder schedule.

## Risks and rollback

| Risk | Mitigation |
|---|---|
| A student loses a request they were about to be accepted on | The mentor was not Level 1 and could not have accepted the request anyway (the accept path checks eligibility through the request gate); the notice names the reason and offers the directory |
| Early expiry makes a mentor's response reliability worse | The reliability filter excludes the new reason, asserted by an integration test that compares the metric before and after |
| The helper fires during a legitimate replacement (old row revoked, new row verified) | The guard reads for any remaining `VERIFIED` row in the same transaction; the attestation path proves the no-op |
| Two expiries race and queue two notices | One conditional `UPDATE … WHERE status = 'PENDING' … RETURNING` owns the rows; the notice is queued per returned row |

Rollback: stop calling the helper and revert the reliability filter; requests that already expired stay expired, and no other row changed. The column can stay unused.
