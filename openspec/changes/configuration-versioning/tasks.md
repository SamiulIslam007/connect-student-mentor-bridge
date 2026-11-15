# Tasks: configuration-versioning

## 0. Preconditions

- [ ] 0.1 Re-check the snapshot in `design.md`: `git log --oneline -1`, `git status --short`, `ls services/api/drizzle/*.sql | tail -1` (expect `0020_…` if `thread-read-state` landed, else `0019_…` — record which, and the number this change must use), `grep -n "REPUTATION_" packages/config/src/index.ts`, `grep -n "config_version" services/api/src/db/schema/reputation.ts` (expect no hits).
- [ ] 0.2 Record the exact value of every constant that version 1 will seed, copied from `packages/config/src/index.ts` at apply time, into this file. The seed SQL must be byte-equal to those values; a seed written from memory is the one real data risk in this change.
- [ ] 0.3 Read `services/api/src/reputation/counting-job.ts` in full and note every place a multiplier is read, so R6 changes each one exactly once.
- [ ] 0.4 Read `services/api/src/reports/admin.controller.ts` and `services/api/src/audit/audit.controller.ts` and record the exact `requireRole` + `@Throttle` + keyset pattern to copy for the two new routes.
- [ ] 0.5 If `audit-sampling` is not yet applied, note that `AUDIT_SAMPLE_RATE` does not exist and version 1's `audit_sample_rate` seeds `0.25` from this change's own constant; record the decision here.

## 1. Schema and migration

- [ ] 1.1 Add `services/api/src/db/schema/config.ts` with `configVersions`: `id`, `version` (integer, not null, `uniqueIndex`), `payload` (`jsonb`, not null), `digest` (text, not null), `reason` (text, not null, check 1..1000), `createdByUserId` (text, FK `users.id`, restrict, not null), `createdAt`. Export it from `db/schema/index.ts`.
- [ ] 1.2 Add `configVersionId` to `reputationEvents` in `db/schema/reputation.ts`: `uuid("config_version_id").notNull().references(() => configVersions.id, { onDelete: "restrict" })`.
- [ ] 1.3 Generate `0021_*.sql` with `pnpm --filter api db:generate`, then read it and confirm it does the add-column-nullable / seed / backfill / set-not-null order rather than a bare `NOT NULL` add. If drizzle emits a single `NOT NULL` add, hand-edit the file into the four statements of design R5 and record that edit here.
- [ ] 1.4 Append the grant block: `GRANT SELECT, INSERT ON TABLE "config_versions" TO connect_app;` — no `UPDATE`, no `DELETE`. Verify: `grep -n "GRANT" services/api/drizzle/0021_*.sql` and `\dp config_versions` on the test database.
- [ ] 1.5 Apply to the local and test databases; then assert the three facts: one row with `version = 1`, no null `config_version_id` anywhere, and `\d reputation_events` shows the column `NOT NULL`. Paste all three outputs here.
- [ ] 1.6 Record the rollback path in this file (design R5/Rollback): route off, job reads the highest version, a later `DROP COLUMN` migration if the feature is withdrawn.

## 2. The pure validator

- [ ] 2.1 `packages/domain/src/config-payload.ts`: `validateConfigPayload(input): { ok: true } | { ok: false; field: string; message: string }` and the exported `CONFIG_RANGES` constant (design R1). Every map must carry exactly its enum's members; an unknown key is a refusal. No Node import.
- [ ] 2.2 Unit tests in `packages/domain/test/config-payload.test.ts`: a valid payload passes; each out-of-range field is refused and names itself; a missing map member is refused; an extra member is refused; a non-integer `cooling_days` is refused; `audit_sample_rate` at 0 and 1 both pass. Verify: `pnpm --filter @connect/domain test`.
- [ ] 2.3 Mutation checks recorded here: widen one range to `Infinity` and confirm the boundary test fails; drop the "exactly the members" check and confirm the missing-member test fails. Restore.

## 3. The service and the routes

- [ ] 3.1 `services/api/src/admin-config/config.service.ts` (interface + tokens) and `drizzle-config.service.ts`: `activeVersion()`, `listVersions({ limit, cursor })`, `createVersion({ actorUserId, reason, payload })`. `createVersion` normalises the payload into the fixed key order, validates it through 2.1, computes `digest = sha256(...)` with `node:crypto`, inserts with the `MAX(version) + 1` statement of design R4, appends one `CONFIGURATION_CHANGED` audit row in the same transaction, and maps a unique violation to `409 CONFIG_VERSION_CONFLICT`.
- [ ] 3.2 `services/api/src/admin-config/config.controller.ts`: `GET /v1/admin/config` and `POST /v1/admin/config`, both `requireRole(..., "PLATFORM_ADMIN", { requiresMfa: true })` and `@Throttle({ default: RATE_LIMITS.write })` on the `POST`. Register the module in `app.module.ts`.
- [ ] 3.3 `AuditAction` union (`services/api/src/identity/audit-log.ts`) and `AUDIT_ACTION_MAP` (`services/api/src/audit/audit.service.ts`) gain `CONFIGURATION_CHANGED` **in both**. Verify: `pnpm --filter api typecheck` fails if only one is updated (the map is a `Record<AuditAction, true>`), which is the assertion.
- [ ] 3.4 `docs/auth-and-access-control.md` §12's "documented but not applicable" list loses "configuration change" and the table gains the event.

## 4. The counting job reads the version

- [ ] 4.1 `activeConfigVersion(db)` in `services/api/src/admin-config/` (or `reputation/` if the dependency direction favours it — record the choice), returning `{ id, version, payload } | null`.
- [ ] 4.2 `counting-job.ts`: call it once per run; on `null` log `configuration.none_active` and return `{ counted: 0, events: 0 }` with no query against `outcomes`; otherwise pass the payload's maps into `difficultyFor` / `tierFor` / `contributionFor` and stamp `configVersionId` on every inserted row, including the `REVERSAL` row written by the review path (check `outcomes`/`review` service for that insert and stamp it too).
- [ ] 4.3 If `audit-sampling` has landed, replace `auditSampleRate()`'s body with a read of `active.payload.audit_sample_rate` passed in by the sampler (design R8), touching no draw logic.
- [ ] 4.4 Integration tests in `services/api/test/reputation.integration.test.ts`: a counted outcome's ledger row carries the active version id; the multipliers on the row equal that version's payload values; with the table emptied (inside a transaction rolled back after the test) the job writes nothing and leaves the outcome `CONFIRMED`; a second version changes the next count's multipliers and leaves the first row untouched; the replay test still reproduces the snapshot.
- [ ] 4.5 Integration tests for a reversal row carrying a version id.
- [ ] 4.6 Mutation checks recorded here: remove the `null` guard and confirm the "no active version" test fails; stamp a hard-coded version id and confirm the "second version" test fails. Restore.

## 5. Registry, contract and the routes' other duties

- [ ] 5.1 `packages/contracts/openapi.yaml`: two paths, the request and response schemas including the `digest` and the enum of payload keys, `403 ROLE_REQUIRED` / `403 MFA_REQUIRED` / `409 CONFIG_VERSION_CONFLICT` / `422` documented, `429` on the `POST`.
- [ ] 5.2 `@connect/contracts` `ROUTE_BODY_KEYS`: `"POST /v1/admin/config": ["reason", "cooling_days", "difficulty_weights", "tier_multipliers", "contribution_multipliers", "audit_sample_rate"]`, matching the published schema key for key.
- [ ] 5.3 `MATRIX`: two rows, `platform-admin` with `requiresMfa`, `mutating: true` on the `POST`.
- [ ] 5.4 `services/api/test/config.integration.test.ts`: create → `201`, one audit row, earlier version unchanged; history ordering and cursor; `403` for each of the three other roles; `403 MFA_REQUIRED`; `422` for a missing reason, an out-of-range value and an unknown key; `409` on a forced version collision; the digest equals a recomputation from the stored payload.
- [ ] 5.5 Confirm the reputation schema guard still passes: `pnpm --filter @connect/contracts test` (the new column must not trip a forbidden family, and `config_version_id` must not be shaped like a score).

## 6. Docs gate

- [ ] 6.1 `docs/data-model.md`: `config_versions` (columns, unique index, grant, immutability rule), `reputation_events.config_version_id` with its FK, and the payload shape with each field's range.
- [ ] 6.2 `docs/api-contracts.md`: both routes, the payload, the refusals, and one sentence that `RATE_LIMITS` is deliberately not configurable.
- [ ] 6.3 `docs/functional-requirements.md`: `FR-ADM-07` to `DONE` with the test names; recount §2.16 by command and publish the new total with the date.
- [ ] 6.4 `docs/architecture-decisions.md`: one ADR — "configuration is data; history is immutable; the pair factor is a formula, not a value" (the reason `RATE_LIMITS` stays code belongs in it).
- [ ] 6.5 `docs/known-debt.md`: close `DEBT-31` with the evidence sentence. `docs/decision-log.md`: one row per decision R1–R8 not already covered by the brief, including the "four multipliers" resolution in the proposal.
- [ ] 6.6 Audit findings **C1** and **C2**: fix if this change lands first, otherwise verify and leave.
- [ ] 6.7 `docs/mvp-build-plan.md` §5 row, `docs/milestones-and-phases.md` "Current state", `.hermes.md` §10 if still stale.
- [ ] 6.8 `docs/local-setup.md`: one line in the runbook section showing the `GET` and `POST` with `curl` and the MFA requirement, so an operator can create a version without the UI this change does not build.

## 7. Verification gate

- [ ] 7.1 `pnpm lint && pnpm typecheck && pnpm test && pnpm build`, real totals pasted here, skipped 0.
- [ ] 7.2 `openspec validate configuration-versioning --strict` passes.
- [ ] 7.3 Read the migration SQL aloud (paste it here) against design R5: add nullable, seed, backfill, set not null, FK, grant.
- [ ] 7.4 `git status`, `git diff --staged` reviewed; no unrelated file.
- [ ] 7.5 Stop. Not archived until the owner says so.
