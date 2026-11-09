# Design: platform-review-queue

## Repository snapshot (verified 2026-11-09, re-check at apply)

- `services/api/src/db/schema/enums.ts:142` already defines the full `outcome_status` set including `COUNTED`, `REJECTED`, `REVERSED`; `:160` defines `outcome_event_type` including `CASE_OPENED`, `CASE_RESOLVED`, `REJECTED`, `REVERSED`; `:201` defines `reputation_event_type = ('COUNTED', 'REVERSAL')`; `verifier_kind` already has `PLATFORM_DECISION` and `verifier_decision` already has `VALID`/`NOT_VALID`. **No enum change is needed.**
- Two schema objects block a reversal row today: `services/api/src/db/schema/reputation.ts:52` has `check("reputation_events_counted_only", event_type = 'COUNTED')`, and `:51` has `uniqueIndex("reputation_events_outcome_unique").on(outcome_id)`, which would refuse a second event for the same outcome. Both must change (migration `0015`).
- `services/api/src/outcomes/outcomes.controller.ts:59` registers `POST /v1/outcomes`, `GET /v1/outcomes`, `GET /v1/outcomes/:id`, `:id/confirm`, `:id/dispute`, `:id/withdraw`. There is no review route, no admin route, and no `GET /v1/review-queue`.
- `docs/data-model.md:255-269` lists T8 (valid → `COUNTED`), T9 (not valid → `REJECTED`), T11 (`COUNTED` → `REVERSED` with a compensating event). `:176` still claims those states are unreachable. `§4.5` defines a `disputes` table with `dispute_kind`/`dispute_status`; **no such table exists** in `services/api/src/db/schema/` and no migration creates it — the case is the outcome row plus its `verification_records`.
- `services/api/src/authorization/authorize.ts:38` is `requireRole(identity, request, role, { requiresMfa })` and throws `ROLE_REQUIRED` or `MFA_REQUIRED`; `packages/domain/src/identity.ts:26` already answers `true` for `PLATFORM_ADMIN`.
- No route grants `PLATFORM_ADMIN`: `grep -rn "PLATFORM_ADMIN" services/api/src` finds only the enum, the schema check, and one audit `actorRole`. `role_assignments` requires only `user_id` and `role` (`services/api/src/db/schema/roles.ts:13-30`), and its active-row index is partial on `revoked_at IS NULL`.
- `services/api/src/reputation/counting-job.ts:120` writes the `COUNTED` status and the snapshot inside one transaction; `field_impact_snapshots` has `count("field_impact_snapshots_count_non_negative", counted_count >= 0)`.
- `services/api/src/outcomes/outcome.service.ts:74` is `outcomePayload`, which today exposes no verification record; `drizzle-outcome.service.ts:501` already stores the dispute reason in `verification_records.statement` and `outcome_events.payload.reason`.
- Gates on 2026-11-09 with Docker up: `pnpm lint` 0, `pnpm typecheck` 0, `pnpm build` 0, `pnpm test` under `CI=true` green (domain 87, web 102, contracts 16, api 175 tests, 0 skipped).

## Goals / Non-Goals

**Goals**

- One reviewer route that is the only exit from `IN_PLATFORM_REVIEW`, with a required written reason and one audit row and one email per decision.
- A clawback that appends a compensating ledger event, decrements the snapshot, and keeps the replay guarantee true.
- A queue read that a Platform Admin can work from, and a page that does the same in the browser.

**Non-Goals**

- Appeals, a second reviewer, assignment, due dates, SLAs.
- A `disputes` table, case numbers, or a case status machine.
- Audit sampling or anomaly detection that opens cases automatically.
- Any change to counting's schedule, weights, or eligibility rule.

## Decisions

**D1 — The queue is its own read: `GET /v1/review-queue`.** The existing `GET /v1/outcomes` is participant-scoped by design (`docs/api-contracts.md:360`, "Own outcomes") and its repository layer resolves "own" from the session; widening it to return other people's outcomes for an admin would put two authorization models on one route and risk a leak the moment a predicate is missed. A dedicated route keeps the `PLATFORM_ADMIN` + `requiresMfa` policy in one place, returns a case-shaped row (outcome summary, case kind, reason, opened-at, waiting time), and leaves the participant route untouched. Rejected: `GET /v1/outcomes?status=in_platform_review` with an admin branch inside the same handler.

**D2 — One decision endpoint, on the outcome: `POST /v1/outcomes/{id}/review`.** Body `{decision: "valid" | "invalid", reason: "1 to 1000 characters"}`. `valid` is legal only from `IN_PLATFORM_REVIEW` and reaches `COUNTED`; `invalid` is legal from `IN_PLATFORM_REVIEW` (reaches `REJECTED`) and from `COUNTED` (reaches `REVERSED`, the clawback). Every other combination is `409 OUTCOME_INVALID_STATE`. Rejected: a separate `POST /v1/admin/outcomes/{id}/audit` + `/resolve` pair from `docs/api-contracts.md` §5.9 — two routes, a case object, and a "start review" state for one reviewer deciding once.

**D3 — No `disputes` table; the case is the outcome plus its verification records.** The queue needs: the outcome, the reason that opened the case (`verification_records.statement`), the case kind (the latest record's `kind`: `MENTOR_DISPUTE`, `CONFLICT_OF_INTEREST`, or the day-7 `ESCALATED_D7` event when no record exists), and when it opened (the latest `outcome_events.occurred_at` in that state). All of it exists. Adding the table would need migration `0015` for a schema whose only consumer is a list ordered by one indexed column. `docs/data-model.md` §4.5 is corrected to say the table is **not built** and the case is derived; DEBT gets a row for the case object if a later change needs assignment or appeal history. Rejected: build §4.5's table now.

**D4 — The migration is exactly two changes to one table.** `0015` (a) drops and re-adds `reputation_events_counted_only` as `event_type IN ('COUNTED', 'REVERSAL')`, and (b) drops `reputation_events_outcome_unique` and creates two partial unique indexes: `reputation_events_counted_unique ON (outcome_id) WHERE event_type = 'COUNTED'` and `reputation_events_reversal_unique ON (outcome_id) WHERE event_type = 'REVERSAL'`. The widened check must be dropped by name (`ALTER TABLE ... DROP CONSTRAINT`) because Drizzle emits a check by its SQL name. No new table, no new enum value, no grant change (`connect_app` already has `SELECT, INSERT` on the table, and `REVERSAL` is an insert).

**D5 — Clawback is T11 through the same endpoint, not a separate flag route.** `POST /v1/outcomes/{id}/review` with `invalid` on a `COUNTED` outcome writes the `REVERSED` status, one `CASE_RESOLVED`/`REVERSED` outcome event, one `verification_records` row (`PLATFORM_DECISION`, `NOT_VALID`, the reason), one audit row, one `reputation_events` row with `event_type = 'REVERSAL'` and the negated points of the original event, and decrements the snapshot by one count and the same points. This makes the clawback reachable without inventing a "flag for review" state that nothing else uses. Rejected: add `POST /v1/outcomes/{id}/flag` plus a queue entry (a new transition from `COUNTED` to `IN_PLATFORM_REVIEW` that `docs/data-model.md` §4.4 does not list).

**D6 — A valid decision counts with `counted_basis = 'PLATFORM_DECISION'`, so it never earns mentor reputation.** Every outcome that can be in `IN_PLATFORM_REVIEW` in this release reached it from `PENDING_CONFIRMATION` (dispute, conflict, day-7) or from `CONFIRMED` (no route exists), so `contribution_confirmed` is either null or the case arrived without a confirmation; the only basis this path can honestly write is `PLATFORM_DECISION`. `earnsMentorReputation` (`packages/domain/src/outcome.ts`) then answers false, which is D-63 applied, not re-decided. The response and the page label the outcome "platform-decided", and an assertion checks that no `reputation_events` row appears for it. Rejected: inferring `MENTOR_CONFIRMED` when `confirmed_at` is set — it would let a dispute that was later found valid earn reputation, contradicting D-63.

**D7 — Both participants read the decision through the outcome read, not a new endpoint.** `GET /v1/outcomes/{id}` gains a `decisions` array (`decision`, `reason`, `decided_at`) built from `verification_records` where `kind = 'PLATFORM_DECISION'`. No new route, no new authorization branch, and the participant predicate that already protects the route still applies. The list read stays unchanged to keep its payload small.

**D8 — The reviewer route is `requireRole(identity, request, "PLATFORM_ADMIN", { requiresMfa: true })`.** The role and the policy exist; the enforcement is one call, and `MFA_REQUIRED` is already mapped to `403` in `problem-details.filter.ts:28`. The pilot admin role is granted by hand (D-73): `INSERT INTO role_assignments (user_id, role) SELECT id, 'PLATFORM_ADMIN' FROM users WHERE email = '<owner email>' ON CONFLICT DO NOTHING;` — documented in `docs/api-contracts.md` §5.9 and in this design, with no script and no route.

**D9 — One email per decision, to the other party and the student.** A decision is queued through the existing outbox with a key of `email:outcome-review:<outcome id>:<decision>`, so a retried request cannot send twice. The student always receives it; the mentor receives it when the outcome belongs to a mentorship they still participate in. Rejected: a single combined email — the two parties need different wording for a `REVERSED` case.

## Data model

| Object | Change |
|---|---|
| `reputation_events` | check `reputation_events_counted_only` widened to `IN ('COUNTED', 'REVERSAL')`; unique index on `outcome_id` replaced by two partial unique indexes, one per `event_type` |
| `outcomes` | no column change; `reversed_at` already exists and is set on T11 |
| `outcome_events` | no change; `CASE_RESOLVED` and `REVERSED` already exist |
| `verification_records` | no change; `PLATFORM_DECISION` + `VALID`/`NOT_VALID` already exist |

Migration `0015` is the only schema work. `connect_app` grants are unchanged (insert-only on `reputation_events`, insert+select on the two append-only tables).

## API surface

| Method and path | Roles | Notes |
|---|---|---|
| `GET /v1/review-queue?cursor=&limit=` | `PLATFORM_ADMIN` + MFA | Outcomes in `IN_PLATFORM_REVIEW`, oldest `mentor_decision_due_at` first, capped at 50. Row: outcome id, mentorship id, outcome type, description, field, student name, mentor name, `case_kind`, `reason`, `opened_at`, `waiting_days`, `counted_basis` |
| `POST /v1/outcomes/{id}/review` | `PLATFORM_ADMIN` + MFA | `{decision, reason}`; `valid` → `COUNTED`; `invalid` → `REJECTED` (from review) or `REVERSED` (from `COUNTED`, with clawback). `409 OUTCOME_INVALID_STATE` otherwise; `422` for a missing or over-long reason |
| `GET /v1/outcomes/{id}` | participant | Adds `decisions: [{decision, reason, decided_at}]` |

## Effort split

Two phases, so the backend can merge first:

- **Phase A (backend)**: migration `0015` + schema + the review action + the queue read + the decision exposure + the reversal ledger + tests + contract + docs. Roughly a full day.
- **Phase B (page)**: the BFF route, `/admin/reviews`, strings, navigation, page tests. Roughly half a day.

`tasks.md` groups 1 to 6 are Phase A; groups 7 to 8 are Phase B. If the day runs out, Phase A is a complete, testable increment and Phase B is a separate PR on the same change.

## Assumptions

- The pilot has exactly one reviewer (the owner), so no assignment, claim, or reviewer-differs rule is needed; D-76 records the narrowing.
- The seeded or hand-granted admin account has an enrolled second factor. Without one the queue answers `403 MFA_REQUIRED`, which is the intended behaviour and a setup step in the docs.
- `mentor_decision_due_at` is a usable ordering key for review cases even though it was set for the mentor's deadline; it is indexed with `status` and is monotonic with case age.

## Risks

| Risk | Mitigation |
|---|---|
| The reversal double-subtracts | The `COUNTED` → `REVERSED` guard makes the second call `409`, and the partial unique index refuses a second `REVERSAL` row |
| The snapshot goes negative | One reversal per counted outcome, and the `counted_count >= 0` check stays; the test asserts 0 after a single reversal |
| A participant sees another participant's decision late | The decision is written in the same transaction as the status and the event, and the outcome read returns it; the email is only a notification |
| An admin without MFA is locked out of the queue | Documented setup step (D-73 plus an enrolled factor); the refusal is the designed behaviour |
| `docs/data-model.md` §4.5 keeps describing a table that does not exist | Corrected in this change, with a debt row for the case object |
