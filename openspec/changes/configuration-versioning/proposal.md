# Proposal: configuration-versioning

## Why

`FR-ADM-07` is a Must and it is `NOT STARTED`: "weights, thresholds, timings, and limits are versioned, changed only by Platform Admin, and audited", and its Then clause is sharper still — *every ledger event records the version it used*. Today the values are nine exported constants in `packages/config/src/index.ts`; a change is a deploy with no immutable version, no admin attribution and no audit row, and `reputation_events` copies the applied multipliers onto the row but has no way to say *which configuration* priced it (`db/schema/reputation.ts` has no version column). A pilot tuning change therefore cannot be attributed, and an auditor reading the ledger cannot reconstruct the rules in force.

## What Changes

- One `config_versions` table of immutable rows: a monotonically increasing `version`, one `jsonb` payload of the runtime tunables, a `sha256` digest of that payload, the reason, and the creating account. Version 1 is seeded by the migration from today's constants, so the table is never empty and history has a baseline.
- One platform-admin route pair: `GET /v1/admin/config` (current version plus history) and `POST /v1/admin/config` (create version N+1 from a stated payload, with a required reason, MFA, and one `CONFIGURATION_CHANGED` audit row).
- `reputation_events.config_version_id`: one new column, `NOT NULL`, backfilled to version 1 for existing rows, written by the counting job from the version it actually used.
- The counting job reads the cooling period and the three multiplier maps from the active version instead of the module constants; the pure domain functions keep taking values as arguments and do not learn about the database.
- `CONFIGURATION_CHANGED` is added to the writer union **and** the reader map, so an admin can filter the audit log by it.
- No re-scoring: history keeps the values it used (FR-REP-06, the recalibration tool, stays separate).

## Capabilities

### New Capabilities

- `platform/configuration-versions`: the immutable version table, the admin route pair, the active-version read, and the rule that a ledger event records the version it used.

### Modified Capabilities

- `mentorship/reputation-ledger`: one requirement is added — every ledger event records the configuration version that priced it, and a missing version stops the job rather than writing an unattributed event. No existing requirement changes.

## Impact

- **Code**: new `services/api/src/db/schema/config.ts`, new `services/api/src/admin-config/` (controller, service, tokens, module), `services/api/src/app.module.ts`, `services/api/src/reputation/counting-job.ts` (read the active version, pass the values, record the id), `services/api/src/db/schema/reputation.ts` (one column), `packages/domain/src/` (one pure range validator), `packages/config/src/index.ts` (the constants stay as the seed source and the fallback documentation, not as the runtime read).
- **Contract**: `packages/contracts/openapi.yaml` gains two paths and two schemas; `@connect/contracts` `ROUTE_BODY_KEYS` gains `POST /v1/admin/config`; `MATRIX` gains two platform-admin + MFA rows; the `GET` gains no body key.
- **Data**: migration `0021` — `CREATE TABLE config_versions`, its grant block, `ALTER TABLE reputation_events ADD COLUMN config_version_id` (nullable), the version-1 seed row, the backfill `UPDATE`, then `SET NOT NULL`. Forward-only.
- **Tests**: `packages/domain/test/config-payload.test.ts` (range validation), `services/api/test/config.integration.test.ts` (create, refuse, audit, immutability, active read), `services/api/test/reputation.integration.test.ts` (every new ledger row carries the version; a missing version stops the count; the replay still reproduces the snapshot).
- **Docs**: `docs/data-model.md` (the table, the column, the grant, the enum-free payload shape), `docs/api-contracts.md` (two routes and the refusal shapes), `docs/functional-requirements.md` (`FR-ADM-07` to `DONE` with evidence), `docs/architecture-decisions.md` (one ADR: configuration is data, and history is immutable), `docs/decision-log.md`, `docs/auth-and-access-control.md` §12 (the configuration-change event stops being "not applicable"), `docs/known-debt.md` (close `DEBT-31`), `docs/mvp-build-plan.md` §5, `docs/milestones-and-phases.md`, `README.md` status line.

## Depends on

- `reputation-ledger-and-counting` (archived 2026-11-08): the ledger, the multipliers copied onto the row, and the replay test this change extends.
- `platform-review-queue` / `abuse-reports-and-sanctions` (archived 2026-11-09/10): the platform-admin + MFA route pattern and the first admin write.
- `audit-sampling` (this round): its rate becomes one field of version 1. If audit-sampling has not landed, version 1 simply carries the rate it would use.

## Out of scope

- Re-scoring, replay, or compensating events (FR-REP-06, a Should).
- Admin-editable rate limits, cron expressions, page sizes and session timeouts. They never price a ledger row and they are a denial-of-service surface if a form can change them; `design.md` R1 states this boundary.
- A UI. `/admin/config` is not built; the route is usable by an API client and by a curl in the runbook.
- Per-institution configuration, drafts, approval workflows, or scheduled activation.
- Anomaly triggers, difficulty calibration and the confidence tiers — the values stay exactly what version 1 records.

## Risks and rollback

| Risk | Mitigation |
|---|---|
| A ledger row is written under a configuration nobody can reconstruct | The version is `NOT NULL` and the payload is immutable with its own digest; the test fails if a counted event has no version |
| A typo in a posted payload silently re-prices every future outcome | The payload is range-validated in a pure domain function (cooling 1–90 days, each multiplier within a stated band, rate within 0–1) and a refusal writes nothing; the route is MFA-gated, audited, and reason-bearing |
| The counting job runs while no version is active (an empty table, a botched deploy) | The job logs and counts nothing rather than writing an unattributed event — a delayed count is recoverable, an unattributed one is not |
| The migration's backfill leaves historical rows null | The column is added nullable, backfilled to version 1, then set `NOT NULL` in the same migration; the migration is read before it runs, per the repo rule |
| An admin changes a value mid-batch and one batch mixes two versions | The job reads the active version once per run and stamps every row it writes with that version; a mid-batch change affects the next run only |

Rollback: the route can be disabled (remove the controller registration) and the job falls back to reading the highest existing version, which is the pre-change behaviour with an extra column. The migration is forward-only; reversing it needs a new migration that drops the column, which is only safe if the route stays disabled.

## Decisions taken here

The brief says the payload carries "the four multipliers". Three of them are value maps — difficulty, evidence tier, contribution. The fourth, the pair factor, is a **formula** (`1/(1+n)` over earlier counted outcomes, `packages/domain/src/reputation.ts`), not a value, so it cannot live in a `jsonb` payload without inventing a new shape. The payload therefore carries the three maps plus the cooling period and the sample rate, and the version is documented as also fixing the pair-factor form. This is stated in `design.md` R2 and in the ADR.
