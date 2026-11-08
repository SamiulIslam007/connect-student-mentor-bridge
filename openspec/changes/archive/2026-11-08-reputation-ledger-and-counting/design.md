# Design: reputation-ledger-and-counting

## Repository snapshot (verified 2026-11-08, re-check at apply)

- `docs/reputation-and-verification-policy.md` §7 defines `reputation_event = difficulty_weight(outcome_type) × tier_multiplier(evidence_tier) × contribution_multiplier(contribution_level) × pair_factor`, and §17 records difficulty weights, tier multipliers, and contribution multipliers as **Open**, the pair factor as a Proposed default `1/(1+n)`, and confidence-tier thresholds as Open.
- `docs/data-model.md:261` is transition T7 (`CONFIRMED` → `COUNTED` when `now >= cooling_ends_at` and no open case) and `:532` describes the reputation event shape.
- `services/api/src/requests/request-sweeper.ts:8-9` defines `REQUEST_SWEEP_QUEUE = "requests-sweeper"` with `REQUEST_SWEEP_CRON = "*/5 * * * *"`; `services/api/src/platform/outbox/outbox-worker.ts:21` imports it and schedules the job. That is the registration pattern a second pass copies.
- `services/api/src/worker.ts` boots `WorkerModule` with no HTTP port, so a counting pass must be a queue registration, not a second entrypoint.
- `services/api/src/me/me.controller.ts` and `services/api/src/profiles/profiles.controller.ts` are the two read-controller shapes an impact endpoint can follow.
- `packages/config/src/index.ts` is 11 lines and holds cross-package constants only; `packages/domain/src/index.ts` re-exports each rule module explicitly.
- Migration numbering after the two earlier proposals in this round is `0014`; `services/api/test/database.integration.test.ts` asserts a fixed table list and count, `authorization-matrix.test.ts` asserts one MATRIX row per registered route.
- Gates on 2026-11-08: `pnpm lint` exit 0, `pnpm typecheck` exit 0. `pnpm test` was NOT run in this pass.

## Goals / Non-Goals

**Goals**

- One guarded transition from `CONFIRMED` to `COUNTED`, and one append-only event that records the points and the factors that produced them.
- A snapshot that a replay test can prove, so reputation is derived rather than edited.
- A counts-only read that a mentor can show without exposing students.

**Non-Goals**

- Any reviewer surface, reversal, or appeal.
- Any numeric score, tier, or ranking in an API response or a page.
- Response-reliability metrics, institution aggregates, discovery.

## Decisions

**D1 — Every multiplier ships as a placeholder `1.0` in `@connect/config` (MATH-FLAG).** `docs/reputation-and-verification-policy.md` §17 marks difficulty weights, tier multipliers, and contribution multipliers Open, and the repo forbids inventing numbers. Points are therefore computed as `1.0 × 1.0 × 1.0 × pair_factor` and the result is stored but exposed nowhere. The constants carry a comment naming the policy table and the owner decision that sets them after pilot data. Rejected: Proposed defaults (4/3/2/2) — they are not in the doc, and shipping them would create a ranking nobody approved.

**D2 — Counting is its own pg-boss cron queue, `reputation-counter`, every ten minutes.** Registered next to `requests-sweeper` in `outbox-worker.ts`, selecting a bounded batch of `CONFIRMED` outcomes whose cooling has expired. Rejected: extending `sweepRequests` — it is a five-minute request-reminder pass, and mixing a different table and failure mode into it makes one slow pass starve the other.

**D3 — `field_impact_snapshots` is written by the counting job in the same transaction as the event.** The snapshot is a materialized total per (mentor, field, outcome type). Rejected: computing totals on every read — a profile read would then aggregate the whole ledger, and the replay guarantee would still need a stored artifact to compare against.

**D4 — The impact endpoints read the snapshot table, and the replay test is what keeps them honest.** A dashboard read is one indexed select per mentor; the test recomputes totals from `reputation_events` and asserts equality. Rejected: reading events with a group-by (slower, and duplicates the snapshot's purpose).

**D5 — Eligibility comes from `earnsMentorReputation` in `packages/domain`, not from a second rule in the service.** The counting job calls the predicate defined by `outcomes-and-verification` (its design decision D5 and decision-log row D-63), so the two changes cannot disagree. Consumer and producer are separated by one change; the predicate is inert there and live here.

**D6 — Points are stored as `numeric(12,6)`, never a float.** `AGENTS.md` rule 3 and `AGENTS.local.md` §9 require no careless floating point for scores. Pair factor is `numeric(6,4)`, and the applied multipliers are copied onto the event so a later config change cannot rewrite history.

**D7 — The counting transition is one conditional update, and the unique `outcome_id` on the event is the second guard.** Two concurrent workers cannot double-count: the update returns zero rows for the loser, and the insert would fail on the unique constraint anyway.

**D8 — The impact response is counts only, with no `score`, `points`, `tier`, or `ranking` key.** `docs/reputation-and-verification-policy.md` §8 keeps the numeric score internal until sample thresholds are met, and P4 (thresholds) is Open. Counts by field and outcome type are what the policy already allows.

**D9 — The `#10` split is recorded, not implied.** `docs/mvp-build-plan.md` §5 keeps `platform-review-queue` as a numbered row after this change, and a decision-log row states why the split happened.

## Data model

| Table | Columns | Constraints |
|---|---|---|
| `reputation_events` | `id`, `outcome_id` (unique, FK → `outcomes`), `mentor_profile_id`, `student_profile_id`, `field_id`, `outcome_type`, `event_type`, `difficulty_weight`, `tier_multiplier`, `contribution_multiplier`, `pair_factor`, `points`, `occurred_at`, `created_at` | unique `outcome_id`; check `event_type IN ('COUNTED')` for now (`REVERSAL` reserved for the clawback change); index (`mentor_profile_id`, `field_id`, `occurred_at`) |
| `field_impact_snapshots` | `id`, `mentor_profile_id`, `field_id`, `outcome_type`, `counted_count`, `points_total`, `updated_at` | unique (`mentor_profile_id`, `field_id`, `outcome_type`); check `counted_count >= 0` |

Grant: `GRANT SELECT, INSERT ON TABLE "reputation_events" TO connect_app;` and for `field_impact_snapshots` `SELECT, INSERT, UPDATE` — the job upserts a total, so update is required there; `DELETE` is not granted. The append-only probe covers `reputation_events` (`UPDATE`/`DELETE` refused) and `DELETE` on the snapshot.

## API surface

| Method and path | Roles | Notes |
|---|---|---|
| `GET /v1/me/impact` | signed-in | the caller's own counts; an empty list for a non-mentor |
| `GET /v1/mentors/{id}/impact` | signed-in | `404` when the profile is absent or not `ACTIVE` |

Response shape: `{ "data": [{ "field_id", "field_name", "outcome_type", "count" }], "counted_outcomes": <total> }` — no score key.

## Background jobs

`reputation-counter` cron `*/10 * * * *`: select up to N `CONFIRMED` outcomes with `cooling_ends_at <= now()`, lock each row, re-check the status and the absence of an open case, write the `COUNTED` event, insert the reputation event with the computed pair factor, upsert the snapshot, and commit per outcome so one bad row cannot stall the batch.

## Failure and edge cases

- Cooling expires while an outcome is in review: the status check fails, the row is skipped, and a later run counts it only if it returns to `CONFIRMED`.
- Pair factor under concurrency: the count of earlier counted outcomes and the insert happen in one transaction with the mentor's pair rows locked, so two simultaneous counts for the same pair cannot both read `n = 0`.
- A snapshot upsert conflict: `ON CONFLICT ( mentor, field, type ) DO UPDATE` with an additive `counted_count + 1` inside the same transaction, so a retried transaction neither increments twice nor leaves the total behind the event.
- A config change after counting: the event keeps the multipliers it applied, so a replay reproduces the stored points rather than today's config.

## Risks / Trade-offs

- Placeholder weights make points meaningless today → mitigated by exposing no score and labelling every constant.
- The snapshot can drift if a future change writes events without the upsert → the replay test fails loudly, and the next change (clawback) extends the same test.
- A ten-minute cron is coarse for the pilot → accepted; counting latency is a policy delay, not a user-facing action.
- Two new tables and a cron job in one session → the job and the read endpoint are separable in the task list.

## Migration plan

`0014` is additive: two tables, one enum, indexes, checks, and two grants. No existing table or column changes, so no backfill. A mentor whose outcomes were already counted before this migration does not exist, because counting is introduced here.

## Open questions

- Whether the snapshot should also carry a per-field total across outcome types for a cheaper profile read. This design derives that total in the query; a stored total would be a second thing to keep consistent.
- Whether `points_total` should ever leave the server: the policy keeps the numeric score internal until P4 sets thresholds, so the API omits it and the column exists for the future.
