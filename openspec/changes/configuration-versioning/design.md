# Design: configuration-versioning

## Context

**Repository snapshot (verified 2026-11-15 at propose; re-check at apply).**

- Base: `main` at `c3996dd`, zero active changes before this round, gates green (`pnpm test` 711 pass / 0 fail / 0 skipped).
- The tunables are nine exports in `packages/config/src/index.ts`: `OUTCOME_COOLING_PERIOD_DAYS = 14`, `REPUTATION_DIFFICULTY_WEIGHTS`, `REPUTATION_TIER_MULTIPLIERS`, `REPUTATION_CONTRIBUTION_MULTIPLIERS`, `MATCH_FACTOR_WEIGHTS`, `MATCH_ALUMNI_BATCH_DISTANCE`, `IMPACT_RELIABILITY_MIN_SAMPLE`, `RATE_LIMITS`, `CONSENT_DOCUMENT_VERSION` (plus `auditSampleRate()` once `audit-sampling` lands).
- `services/api/src/reputation/counting-job.ts` imports three of those maps and reads them inside `difficultyFor`, `tierFor`, `contributionFor`, then writes `reputation_events` with the four numbers copied onto the row (`difficulty_weight`, `tier_multiplier`, `contribution_multiplier`, `pair_factor`, `points`). It already stamps `actorRole: "SYSTEM"` and `requestId: "system:reputation-counter"` on the event.
- `reputation_events` (`db/schema/reputation.ts`) has no version column and two unique partial indexes (one `COUNTED`, one `REVERSAL` per outcome) — a new column changes neither.
- `pairFactor(n)` is a pure function of the count of earlier `COUNTED` rows for the pair (`packages/domain/src/reputation.ts`); it is a formula, not a stored value.
- Migration `0019_wet_war_machine.sql` is the latest; grants are hand-written blocks (`0006_grant_two_factor_table.sql`), role `connect_app`.
- Admin route patterns to copy: `services/api/src/reports/admin.controller.ts` (`requireRole(..., "PLATFORM_ADMIN", { requiresMfa: true })`), `institutions.controller.ts` (`POST /v1/institutions`), and `audit.controller.ts` for a keyset list.
- `node:crypto` is already used in `services/api/src/identity/email-hash.ts`, so a SHA-256 digest belongs in the API layer. `packages/domain` imports nothing from Node and must stay that way (ESLint boundary).
- `AUDIT_ACTION_MAP` (`services/api/src/audit/audit.service.ts`) is a `Record<AuditAction, true>`, so adding a member to the union fails the build until the map is updated — the mechanism D-153 introduced.

## Goals / Non-Goals

**Goals**

- A pilot tuning change is an immutable, attributed, audited version — not a deploy.
- Every ledger row can say which rules priced it, and history is never rewritten.
- The counting path reads one version once per run, so one batch cannot mix two configurations.

**Non-Goals**

- No replay, no recalculation of history, no compensating events.
- No UI, no drafts, no approval workflow, no scheduling.
- No admin control of rate limits, cron expressions, page sizes or session timeouts.

## Decisions

The owner fixed: runtime tunables only; `POST /v1/admin/config` with MFA, a reason and an audit row; jobs read the active version; no re-scoring; backfill to version 1 with `NOT NULL` for new rows; `jsonb` plus a SHA-256 digest; `CONFIGURATION_CHANGED` in both unions. The decisions below are the ones left open.

### R1. "Runtime tunables" means the values that price a ledger row, and nothing else

Version 1's payload is exactly:

```json
{
  "cooling_days": 14,
  "difficulty_weights": { "ADMISSION": 1, "INTERNSHIP": 1, "JOB_OFFER": 1, "SKILL_MILESTONE": 1, "INTERVIEW": 1 },
  "tier_multipliers": { "0": 1, "1": 1, "2": 1 },
  "contribution_multipliers": { "DIRECTLY_ENABLED": 1, "HELPED": 1, "MINOR": 1 },
  "audit_sample_rate": 0.25
}
```

Excluded on purpose: `RATE_LIMITS`, the cron strings, `MATCH_FACTOR_WEIGHTS`, `IMPACT_RELIABILITY_MIN_SAMPLE`, `CONSENT_DOCUMENT_VERSION`. Alternative rejected: everything in `@connect/config`, which would let a web form change a rate limit or a cron expression — a denial-of-service and a load-shedding surface with an audit row instead of a code review. `RATE_LIMITS` in particular is a security control and stays a code constant under `AGENTS.md` rule 13.

Ranges, enforced by one pure validator in `packages/domain` (`validateConfigPayload(payload) → { ok } | { field, message }`): `cooling_days` integer 1–90; every difficulty weight a number 0–10; every tier multiplier a number 0–10; every contribution multiplier a number 0–10; `audit_sample_rate` a number 0–1. The three maps must carry exactly the enum members the schema defines — a missing key is a refusal, because a missing key would mean "fall back to 1" silently in the counting job.

### R2. The pair factor is a formula and is recorded as fixed, not as a value

The brief counts four multipliers; the fourth is `1/(1+n)`. It cannot be a number in the payload without inventing a different mechanism, and inventing one is exactly what a `MATH-FLAG` forbids. The version therefore records that it fixes the pair-factor form, in the ADR and in this design; `pairFactor` stays a pure domain function with its own property test. Alternative rejected: a `pair_factor_alpha` field, which would be an invented parameter with no decision behind it.

### R3. One table, one payload document, one digest, no update path

`config_versions`: `id` (uuid), `version` (integer, unique, not null), `payload` (jsonb, not null), `digest` (text, not null, 64 hex characters), `reason` (text, not null, checked 1..1000), `created_by_user_id` (text, FK `users.id`, `onDelete: "restrict"`, not null), `created_at`. The grant block is `SELECT, INSERT` only — no `UPDATE`, no `DELETE` — so immutability is enforced by the database role, not by a convention. Alternative rejected: a key/value table with one row per setting, which needs a version-scoped read per key and cannot be digest-checked as one document.

`digest = sha256(JSON.stringify(payload))` computed in the service with `node:crypto`, uppercase-insensitive, stored lowercase. The route returns the digest; a reader can recompute it. `JSON.stringify` key order is deterministic only if the payload is normalised first, so the service rebuilds the payload object from a fixed key order before hashing and storing — that is the one subtlety the test must pin.

### R4. Version numbers are assigned in the database, not by the caller

`INSERT INTO config_versions (version, …) SELECT COALESCE(MAX(version), 0) + 1, … FROM config_versions` in one statement, with a unique index on `version`. Alternative rejected: read the max, then insert, which races. A collision under concurrency produces a unique violation the route maps to `409 CONFIG_VERSION_CONFLICT`; a retry is the caller's business.

### R5. `reputation_events.config_version_id` is added nullable, backfilled, then made `NOT NULL`

One migration, in that order: `ALTER TABLE … ADD COLUMN config_version_id uuid REFERENCES config_versions(id) ON DELETE RESTRICT`; `INSERT` version 1; `UPDATE reputation_events SET config_version_id = <version 1 id> WHERE config_version_id IS NULL`; `ALTER TABLE … ALTER COLUMN config_version_id SET NOT NULL`. Doing it in one file means there is no window in which a null is legal. Alternative rejected: a nullable column forever, which invites "unknown version" as a permanent state.

The FK is `RESTRICT`: a version row can never be deleted while a ledger row names it, which is the structural half of immutability (the grant removes the other half).

### R6. The counting job reads one version per run and refuses to write without one

`activeConfigVersion(db)` returns `{ id, version, payload } | null`. `countDueOutcomes` calls it once at the top of the run; when it is `null` the function logs `configuration.none_active` and returns `{ counted: 0, events: 0 }` without touching a row. When it is present, `difficultyFor`, `tierFor` and `contributionFor` take the payload's maps as arguments (their signatures change; the pure rules in `@connect/domain` already take plain numbers), and every inserted `reputation_events` row carries `configVersionId: active.id`.

Fail-closed is the point: an unattributed ledger row is worse than a delayed count, so the job refuses to run rather than defaulting to the code constants. The constants stay in `@connect/config` as the seed source for version 1 and as documentation of the defaults; no runtime path reads them after this change except the migration's seed.

### R7. The two routes, and why the read is a route and not a page

`GET /v1/admin/config` returns `{ active, history[] }` with `limit` 1..50 and a keyset cursor on `version`; `POST /v1/admin/config` returns `201` with the new version. Both are `PLATFORM_ADMIN` + `requiresMfa: true` and are throttled. Alternative rejected: exposing the active version on a public or signed-in route, which would publish the pricing rules; the ledger event's multiplier columns already give a participant everything a participant needs.

### R8. Where `audit-sampling`'s seam is replaced

If `audit-sampling` has landed, `shouldSample` keeps its signature and `auditSampleRate()`'s body becomes `active.payload.audit_sample_rate` — the sampler reads the active version once per run and passes the rate in, so the hash salt and the draw logic are untouched. If it has not landed, version 1 carries `audit_sample_rate` from the constant that change will add, and its own tasks read it from here.

## Migration and rollback

- **Migration `0021`** (forward-only): `CREATE TABLE config_versions` + unique index on `version` + grant block (`SELECT, INSERT`); `INSERT` the version-1 seed row with its payload and digest (a literal in the SQL, matching R1); `ALTER TABLE reputation_events ADD COLUMN config_version_id uuid`; the FK; `UPDATE` the backfill; `SET NOT NULL`.
- **Read the generated SQL before running it** (repo rule): the seed insert and the backfill must both be present, and `SET NOT NULL` must come last.
- **Rollback**: the route pair can be removed and the job can fall back to the highest existing version — that is the pre-change behaviour plus one column. Reversing the migration needs a new `DROP COLUMN` migration and is only safe once the write path is gone. No ledger row is deleted by either direction.
- **Data risk**: the backfill stamps every historical row with version 1's id. That is a claim — "these were priced by the values in force before the change" — and it is true because version 1 *is* those values. The migration must not run after the constants have changed; the task list asserts the seed equals `/^` the constants at apply time.

## Risks and what must fail closed

- **Fail closed**: no active version → no ledger write; an out-of-range payload → no version created; a missing audit row → the transaction rolls back (the append happens inside the same transaction, the pattern every admin write already uses); a role or MFA refusal → nothing written.
- The digest is a tamper *detector*, not a hash chain: it proves a payload was not edited after storage, and the `SELECT, INSERT`-only grant is what prevents the edit.
- A single `POST` can re-price every future outcome. That is the feature; the controls are MFA, a reason, the audit row, range validation, and the fact that history keeps the values it used.
- The `RATE_LIMITS` exclusion is a deliberate boundary, not an oversight: `AGENTS.md` rule 13 makes throttling a code concern.
