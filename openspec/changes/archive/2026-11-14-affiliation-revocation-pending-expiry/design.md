# Design: affiliation-revocation-pending-expiry

## Context

**Repository snapshot (verified 2026-11-14 at propose, re-check at apply).**

- Base: `main` at `42768e9`, clean tree, zero active changes; gates at propose: lint 0, typecheck 0, 674 tests / 0 fail / 0 skipped, build 0.
- Two revocation sites, both `UPDATE affiliations SET status = 'REVOKED', revoked_at = now()`:
  - `services/api/src/affiliations/drizzle-affiliations.service.ts` line 200, inside `claim()`, followed by an insert of the new row at line 217 and `syncMentorActivation` at line 247. `resolveAffiliationClaim` (`packages/domain/src/affiliation.ts` line 44) returns `{ level: "LEVEL_0", status: "PENDING" }` when the email domain does not match the target institution's registered domains, so this path really leaves the account at Level 0. The spec already states it: `openspec/specs/institutions/affiliation-verification/spec.md` line 47, scenario "Level 1 is lost on a claim the new domain cannot support".
  - `services/api/src/institutions/drizzle-attestation.service.ts` line 132, inside the `verify` decision, followed by the same transaction setting the claim to `VERIFIED`, so the account always ends with a verified row and nothing should expire.
- The request side: `requestStatus` is `PENDING`/`ACCEPTED`/`DECLINED`/`EXPIRED`/`WITHDRAWN` (`services/api/src/db/schema/enums.ts`); `mentorship_requests.expiresAt` and a `(status, expiresAt)` index exist (`services/api/src/db/schema/requests.ts` lines 43–65). The five-minute sweeper emits `request-expired` with a dedupe key of `email:request-expired:` followed by the request id (`services/api/src/requests/request-sweeper.ts` lines 86–124).
- `expireOutcomes`/`slotsInUse` count `PENDING` plus `ACCEPTED` within 7 days, so an `EXPIRED` request frees the mentor's slot and the student's three-request cap automatically.
- Response reliability counts `status = 'EXPIRED'` in `requestsLateOrExpired` with no reason filter (`services/api/src/reputation/drizzle-reputation.service.ts` line 101).
- `EMAIL_TEMPLATE` union is 20 members (`services/api/src/email/email-sender.ts` lines 1–21) and includes `request-expired`.
- `mentorship_requests` has no `expiry_reason` column: `grep -rn "expiry_reason" services/api/src` returns nothing.

## Goals / Non-Goals

**Goals**

- A student's request never sits with a mentor who cannot accept it.
- The expiry is distinguishable from a deadline expiry, and it does not punish the mentor.
- Idempotent under a retried transaction and under a job re-run.

**Non-Goals**

- No admin revoke route, no suspension handling, no mentorship cancellation.
- No change to the 48-hour promise or the reminder timings.
- No new audit action for an expiry (see R5).

## Decisions

The owner fixed the trigger, the same-transaction rule, the notice, the untouched accepted work and the idempotency requirement. Decisions taken here carry `R` numbers.

### R1. The guard is "this account holds no VERIFIED affiliation", evaluated after the writes

Both call sites run one helper at the end of their transaction: select any `VERIFIED` affiliation for the account; if one exists, return; otherwise expire and notify. A boolean keyed on "a revocation happened" would misfire on the attestation path, where the replacement row is verified in the same transaction. Alternative rejected: counting revocations, which cannot tell a supersede from a loss.

### R2. A new nullable `expiry_reason` column, because reliability must not be punished

Without it, `requestsLateOrExpired` cannot tell an eligibility expiry (the mentor could not decide) from a deadline expiry (the mentor did not decide). Migration `0019` adds `expiry_reason` `text` with `check (expiry_reason is null or expiry_reason in ('DEADLINE','MENTOR_INELIGIBLE'))`, backfills existing `EXPIRED` rows with `DEADLINE`, and the aggregate excludes `MENTOR_INELIGIBLE`. Alternative rejected: inferring from the mentor's current affiliation, which changes over time and would rewrite history.

### R3. The expiry is one conditional `UPDATE … RETURNING`, and the notice is queued per returned row

`WHERE mentor_profile_id = … AND status = 'PENDING'` then `RETURNING id`. A retry returns zero rows; the outbox dedupe key (`email:request-expired-ineligible:` followed by the request id) is a second guard. The student's pending count and the mentor's slot count both drop because neither counts `EXPIRED`.

### R4. The notice reuses the `request-expired` template with reason-specific text

The fact is the same — the request expired — and the union member already exists. A new template would add a union member and a second subject line for no user-visible gain. The text names the reason in the student's own terms ("your mentor's affiliation could not be re-verified") and never names the institution or the mentor's email.

### R5. No audit row for the expiry itself

The request sweeper writes none today, and `FR-AUD-01`'s documented list has no request-expiry event; the cause is already recorded by the `AFFILIATION_REVOKED` row in the same transaction. Inventing a `REQUEST_EXPIRED` action would put an entry in the union that no read filter names. If the owner wants expiry in the audit log, it is one action plus one filter entry, and it belongs with the retention/audit change, not here.

## Assumptions

1. A mentor at Level 0 can never accept a pending request: the accept path reads the request and the capacity, and the request gate refused creation for a non-verified mentor; the expiry removes the case anyway.
2. The two revocation sites are the only ones; `grep -rn "\"REVOKED\"" services/api/src` finds exactly these two writes plus the enum and the read model.
3. The notice is the only participant communication; no in-app notification list exists (`FR-NOT-02` is Should).

## Risks

- A student mid-48-hours sees an expiry they did not cause. Mitigation: the notice names the reason and links the directory; the reliability metric absorbs the loss, not the student.
- The column is one more thing the contract must carry. Mitigation: it is nullable, additive, and only `GET /v1/requests` names it; the contract test asserts the added property rather than a changed key set.

## Acceptance criteria

1. A claim that leaves the account at Level 0 expires every `PENDING` request of that mentor, one notice each, in the same transaction.
2. An attestation verification expires nothing and leaves the replacement verified.
3. A retried transaction and a second invocation queue no second notice.
4. An `ACCEPTED` request and its mentorship are byte-identical across the flow.
5. `requestsLateOrExpired` is unchanged by an eligibility expiry and rises by one for a deadline expiry.
6. Migration `0019` is reusable: `pnpm exec drizzle-kit generate` produces nothing further, and `database.integration.test.ts` still asserts the same table count.
7. `GET /v1/requests` returns `expiry_reason` for an expired request, and `null` otherwise.
