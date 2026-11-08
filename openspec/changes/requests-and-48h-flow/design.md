# Design

## Repository snapshot (verified 2026-11-08, re-check at apply)

- Tables today: `users`, `sessions`, `accounts`, `verifications`, `two_factors`, `consent_records`, `audit_logs`, `signup_blocks`, `institutions`, `institution_domains`, `role_assignments`, `fields`, `student_profiles`, `mentor_profiles`, `mentor_fields`, `student_field_interests`, `availability_windows`. **No `mentorship_requests`** and no request enum in `services/api/src/db/schema/enums.ts`.
- `mentor_profiles` already carries `weekly_capacity` (`smallint`, check `>= 1`, capped at 5 by policy), `access_mode`, and — after `affiliation-and-mentor-onboarding` (#5) — `status` with `ACTIVE` and `onboarding_status`. `isDiscoverable` exists as a pure policy that answers false for `PAUSED` and for a non-`ACTIVE` status.
- Migrations run `0000`–`0008`; #5 adds `0009`, `outbox-and-job-runner` (6a) adds `0010`, so this change's migration is `0011`.
- `services/api/test/authorization-matrix.test.ts` fails when a registered route is missing from its `MATRIX` table; every route added here must land in that table in the same change.
- `docs/api-contracts.md` §5.4 already defines the six endpoints, the state-transition table, and the errors `MENTOR_NOT_VERIFIED`, `MENTOR_AT_CAPACITY`, `DUPLICATE_PENDING_REQUEST`, `REQUEST_INVALID_STATE`. There is no code for any of them.
- `docs/data-model.md` §5.3 defines `mentorship_requests` (48-hour `expires_at`, 24-hour `reminder_sent_at`, one pending per pair) and line 209 says acceptance creates a `mentorships` row — #8 owns mentorships.
- `apps/web/lib/bff.ts` forwards cookie to bearer; `apps/web/lib/strings.ts` is the only place user-facing copy lives. Gates today: 230 tests pass, lint/typecheck/build green.

## Goals / Non-Goals

**Goals:** one creation path whose refusals are explicit and race-safe; a decision that happens exactly once; a timer that cannot double-send.

**Non-Goals:** discovery, mentorships, threads, outcomes, redirects, notification preferences.

## Decisions

**D1 — `mentorship_requests` with an MVP column subset.**
All structural columns from `data-model.md` §5.3 except `match_score`, `match_factors`, `config_version_id` (#6 owns the match snapshot), `redirected_from_request_id` (Phase 1b), and `ai_assisted` (never true).
*Rejected:* adding the columns now "for later" (a nullable column nothing writes is indistinguishable from a bug); renaming the table to `requests` (the data model, the plan, and future `mentorships.request_id` all say `mentorship_requests`).

**D2 — Capacity is a count under a row lock.**
Slots in use = `COUNT(pending)` + `COUNT(accepted with decided_at within 7 days)`, taken inside a transaction that first locks the mentor's `mentor_profiles` row with `SELECT … FOR UPDATE`.
*Rejected:* a stored `slots_used` counter (a second source of truth that drifts on every path that forgets to decrement); an advisory lock on the mentor id (works, but the row lock is already needed to read the capacity); counting only this calendar week (a week boundary is a timezone decision nobody made — a rolling 7 days is the same intent with no ambiguity, noted as the judgment call).

**D3 — Acceptance does not create a mentorship.**
The request reaches `ACCEPTED` and stops; `mentorships` arrives in #8, which also moves the capacity unit from accepted requests to active mentorships.
*Rejected:* creating a one-row mentorship here (it drags agreement fields, both parties' acknowledgements, and the thread into this change, which is #8's whole scope). `docs/data-model.md` line 209 is corrected in the docs task rather than left as a false statement.

**D4 — One sweeper, two conditional updates.**
A pg-boss scheduled job every 5 minutes (the schedule from `system-architecture.md` §8.2) runs `UPDATE … WHERE status = 'PENDING' AND reminder_sent_at IS NULL AND created_at <= now() - 24h RETURNING id` and `UPDATE … WHERE status = 'PENDING' AND expires_at <= now() RETURNING id`, then writes one `EmailRequested` outbox event per returned row.
*Rejected:* a delayed job per request at creation time (a lost job is a lost reminder, which is why the architecture specifies sweepers); a cron in the API process (two writers, and the API restarts lose the timer).

**D5 — Two new error codes.**
`MENTOR_UNAVAILABLE` (`409`) for a paused or non-operating mentor and `REQUEST_LIMIT_REACHED` (`409`) for the per-student pending cap.
*Rejected:* reusing `MENTOR_NOT_VERIFIED` for a paused mentor (it names the wrong cause and would mis-route the UI's copy); `422` for either (an eligibility refusal is not a field error).

**D6 — Duplicate submission is deduplicated by the partial unique index.**
`INSERT … ON CONFLICT DO NOTHING` against the one-pending-per-pair index, then read back the existing row and answer `DUPLICATE_PENDING_REQUEST`.
*Rejected:* the `idempotency_keys` table (a platform capability with no other consumer yet, and the pending-pair rule already makes a double submit harmless).

**D7 — Transitions are conditional updates, not read-then-write.**
`UPDATE … SET status = … WHERE id = $1 AND status = 'PENDING' RETURNING *`; zero rows means `409 REQUEST_INVALID_STATE`.
*Rejected:* selecting the row, checking the status in code, then updating (two accepts racing both pass the check; the `version` column is in the model for later and is not needed to make this safe).

**D8 — Three queued emails with explicit dedupe keys.**
`email:request-received:<id>`, `email:request-decided:<id>`, `email:request-expired:<id>`.
*Rejected:* sending inline (a Mailpit outage would fail the write path); keying on the user (a resent decision would be swallowed).

**D9 — The request form takes a mentor id from a link.**
`/request/new?mentor=<mentor_profile_id>`, with the mentor's name and access state fetched from the existing own-profile-free read path; no mentor list until #6.
*Rejected:* inventing a minimal "all mentors" list here (that is discovery, and it would be deleted the moment #6 lands).

## Assumptions

- #5 is applied before this change: the `ACTIVE` status and Level 1 affiliation are read, not computed here.
- 6a is applied before this change: `enqueueOutboxEvent` and the worker exist.
- A mentor's `weekly_capacity` is stable during the 7-day window; nothing in this change caps the accepted count itself.
- The pilot has few enough requests that a 5-minute sweeper satisfies "48 hours".

## Risks / Trade-offs

- **A 7-day rolling window is an interpretation of FR-REQ-06's "current week"** → recorded in the design and in the decision log; changing it later is one predicate.
- **Accepted requests consume capacity until #8** → a mentor can reach the cap with accepted-but-not-started relationships; acceptable for the pilot and corrected when mentorships exist.
- **Two round trips on a duplicate submit** (insert then read back) → one extra query on a rare path.
- **No idempotency key table means a genuine retry after a network split can produce two different requests** to two different mentors → still capped by the per-student pending limit of 3.
- **The request form is unreachable without a mentor link** → deliberate; the pilot shares the profile link, and #6 replaces it.

## Migration Plan

Additive `0011`: three enums, the table with its checks and the partial unique index, indexes on (`mentor_profile_id`, `status`) and (`student_profile_id`, `status`), and the `connect_app` grant. No backfill; a clean database and the existing one both migrate. Rollback is a forward migration dropping the table and the enums.
