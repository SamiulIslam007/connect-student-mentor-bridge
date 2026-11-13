# Design: suspended-account-directory-exclusion

## Context

**Repository snapshot (re-verified 2026-11-13 at propose).**

- Base: `main` at `731a5c7` after `register-annotation-cleanup`; `openspec validate --all --strict` passes; 656 tests green in CI. No migration in this change.
- `users.status` is the `account_status` enum (`PENDING`, `ACTIVE`, `SUSPENDED`, `DEACTIVATED`, `DELETION_PENDING`, `ANONYMIZED`); `suspendAccount` writes it and revokes every session in one transaction (`services/api/src/reports/drizzle-reports.service.ts`).
- `mentor_profiles.status` is a different enum (`DRAFT`, `PENDING`, `ACTIVE`, `SUSPENDED`, `REMOVED`) and is written only by `syncMentorActivation` and the deletion path.
- Discovery queries found by `grep -rn "from(mentorProfiles)" services/api/src` and read one by one:
  - `profiles/drizzle-profiles.service.ts` `listMentors` (line 344): conditions are `mentor_profiles.status = 'ACTIVE'` and an access mode that is not `PAUSED`.
  - `profiles/drizzle-profiles.service.ts` `readSuggestionPool` (line 459): the same two conditions plus the caller's own exclusion.
  - `profiles/drizzle-profiles.service.ts` `readMentorContext` (line 305): `mentor_profiles.status = 'ACTIVE'` checked in code after the read, and it serves `GET /v1/mentors/{id}`.
  - `reputation/drizzle-reputation.service.ts` `impactForMentorProfile` (line 113): `mentor_profiles.status = 'ACTIVE'` checked in code after the read, and it serves `GET /v1/mentors/{id}/impact`.
  - `requests/drizzle-requests.service.ts` `create` (line 203): reads the mentor row under a lock and passes `mentor.status` to `canCreateRequest`.
  - `reports/drizzle-reports.service.ts` `canReport` (PROFILE branch, line 96): authorizes a profile report on `mentor_profiles.status = 'ACTIVE'` alone. It is not discovery, but it is the same visibility rule: after this change a hidden profile that still accepts a report is a second way to prove the account exists, so the branch gains the account condition (found in review).
  - Not discovery, and deliberately unchanged: `impactForUser` (the mentor's own read; only an active account holds a session), `decide` (the accept path of an existing thread), `readParticipants` and `readRecord` (existing threads), `consent/drizzle-consent.service.ts` (the caller's own profile), `privacy/drizzle-privacy.service.ts` (the caller's own export and erasure), `onboarding/mentor-activation.ts` (the sync itself).
- `syncMentorActivation` (`services/api/src/onboarding/mentor-activation.ts` line 73) reads the row, computes the next status with the pure `mentorActivation`, and updates with `eq(mentorProfiles.userId, userId)` only.
- The lift already exists twice and writes no profile column: `POST /v1/admin/accounts/{id}/reinstate` and the `account-sanction` queue (`services/api/src/reports/sanction-expiry.ts`) both call `liftSuspension`, one conditional update that sets `status = 'ACTIVE'` and clears `suspended_until`.

## Goals / Non-Goals

**Goals**

- A suspended, self-deactivated, or anonymized account appears in no discovery surface and receives no new request.
- The exclusion is derived, not stored: the suspension row is the only fact, so a lift restores the listing with no profile write.
- The refusal a student sees names no cause, so a suspension is not disclosed through the request form.
- The activation funnel cannot overwrite a status another actor wrote.

**Non-Goals**

- No change to what a suspension does today (sessions, audit row, notice, end date).
- No change to existing threads, sessions, agreements, outcomes, or reputation rows.
- No rewrite of `mentor_profiles.status` and no second account-status column.
- No new admin surface, no new route, no migration.

## Decisions

The brief fixed the exclusion rule, the derived-not-stored rule, the request refusal, the pending-request assumption and the conditional write. Decisions taken while writing this design carry `R` numbers.

### R1. The condition is `users.status = 'ACTIVE'`, not a list of forbidden statuses

The four other statuses (`PENDING`, `SUSPENDED`, `DEACTIVATED`, `DELETION_PENDING`, `ANONYMIZED`) are all excluded by one equality, so a future status is excluded by default instead of silently listed. The directory already reads `users` for the display name, so three of the five queries need no new join. Alternative rejected: an `IN ('SUSPENDED', 'ANONYMIZED')` list, which would list a deactivated or deletion-pending mentor.

### R2. The mentor context and impact reads filter in SQL, not after the read

Both already returned `null` for a non-`ACTIVE` profile after reading the row. They gain the condition instead: one `and(...)` in the predicate for the context read, and an `innerJoin(users)` for the impact read. The in-code guard stays, because it also answers the non-uuid and not-found cases. Alternative rejected: reading `users.status` into the row and checking it in code, which keeps two places that must agree.

### R3. The request refusal is the pause branch of the domain predicate

`canCreateRequest` already answers `MENTOR_UNAVAILABLE` for a paused or non-operating mentor, and that branch is where the account status belongs: the predicate's input gains `mentor.accountStatus` and the existing condition gains a third disjunct. Placing it in the service before the predicate was rejected after review, because the predicate's own branches run first for every account: a `GROUP_OFFICE_HOURS` body, a self-request, or a below-Level-1 affiliation answers `422` or `MENTOR_NOT_VERIFIED` for an active account, so an early account check would have answered `409` for a suspended one and turned the refusal into a suspension oracle. With the check inside the pause branch, every other refusal keeps its documented answer whatever the account state, and a genuinely unknown id still answers `VALIDATION_ERROR` at the not-found check. Alternative rejected: treating the account as absent, which would answer "mentor_id does not name a mentor profile" for an id that does name one.

### R4. A request already sent to a mentor who is suspended afterwards keeps today's behaviour

Assumption recorded, not a decision: the pending request stays pending, the mentor's 48-hour window and the sweeper still apply, and the accept path still works, because the brief keeps existing threads readable and blocks only new discovery and new requests. The consequence is that a suspended mentor can accept a request that was already sent. That is stated in the report as the one behaviour a reviewer might want to change; changing it would need its own decision about the 48-hour promise in `FR-REQ-04`.

### R5. The conditional write compares the status the function read

`syncMentorActivation` gains `eq(mentorProfiles.status, profile.status)` in its `WHERE`, in the same `and(...)` as the user id. A writer that changed the status between the read and the write wins, and the next trigger recomputes from the row as it then is, so a skipped write is not a stuck state. Alternative rejected: row locking the read (`FOR UPDATE`), which would make the four call sites hold a lock across the consent and affiliation reads for no gain.

### R6. `REMOVED` is covered by the account status, not by a second condition

A deleted account is `ANONYMIZED` with `mentor_profiles.status = 'REMOVED'`, and a self-deactivated one is `DEACTIVATED` with the profile untouched. Both are excluded by `users.status = 'ACTIVE'`, so the removed-profile case needs no separate predicate and a test seeds an `ANONYMIZED` account with a `REMOVED` profile to prove it.

## Assumptions

1. `users.status = 'ACTIVE'` is the only state in which an account may be discovered or receive a request, which matches the session rule (only an active account holds a session).
2. A mentor profile row is never written by a suspension or a lift, so the byte-identical row assertion is the correct evidence for "no profile write".
3. The pilot directory is small, so the extra equality costs no measurable query time; the index question is not opened by this change.

## Acceptance criteria

1. A suspended mentor is absent from `GET /v1/mentors` (with and without filters), absent from `GET /v1/suggestions`, answers `404` on `GET /v1/mentors/{id}` and `GET /v1/mentors/{id}/impact`.
2. `POST /v1/requests` to that mentor answers `409 MENTOR_UNAVAILABLE` and writes no `mentorship_requests` row.
3. An account suspended through `POST /v1/admin/accounts/{id}/suspend` leaves the directory; `POST /v1/admin/accounts/{id}/reinstate` and `liftExpiredSuspensions` each bring it back, and the `mentor_profiles` row is byte-identical before the suspension and after each lift. A profile report on that account answers `404`.
7. A body the request validation refuses for its own reason (`GROUP_OFFICE_HOURS`, a self-request, a below-Level-1 affiliation) answers identically for an active and an inactive account, so the refusal order discloses nothing.
4. An `ANONYMIZED` account with a `REMOVED` mentor profile is excluded by every discovery surface.
5. With the `users.status` condition removed from `listMentors`, the directory test fails; with it removed from `syncMentorActivation`'s `WHERE`, the activation test fails, and each failure names the right test.
6. Every existing test passes unchanged, including the paused-mentor, capacity, and pagination cases.

## Risks

- The read-side change is small enough that a missed query looks like success; the grep list above is the inventory and the report repeats it.
- A suspension hides a mentor mid-conversation from a student who was about to ask: the `409` title is the same one a paused mentor returns, so the experience is unchanged from the student's side.
