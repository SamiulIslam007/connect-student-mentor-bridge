# Tasks: institution-dashboard-aggregates

Decision rows to add at apply (reserved, one contiguous block): **D-211 to D-214** — D-211 counts-not-rates, D-212 the required `institution_id` with one 404, D-213 suppression by omission with the floor in config, D-214 keyset on name then id with default 50. The design's `R` numbers may add more; continue the block, never reuse a reserved number.

## 0. Preconditions

- [x] 0.1 Re-read the snapshot: `git log --oneline -1`, `git status --short`, `sed -n '35,60p' services/api/src/institutions/institutions.controller.ts`, `sed -n '185,220p' services/api/src/institutions/drizzle-institutions.service.ts`. Record every mismatch with the design before writing code.
- [x] 0.2 Confirm no aggregates route exists: `grep -rn "aggregate" packages/contracts/openapi.yaml services/api/src/institutions | grep -v aggregateType`.
- [x] 0.3 Read `packages/domain/src/reputation.ts` for `responseReliability` and record the function this change mirrors for `requests_decided_in_time`.
- [x] 0.4 Confirm the table count and that no migration is needed: `grep -n "thirty-three" services/api/test/database.integration.test.ts`, `ls services/api/drizzle/*.sql | tail -1` (must still be `0022`).

## 1. The floor rule

- [x] 1.1 `packages/domain/src/aggregates.ts`: `withholdBelowFloor(value, floor)` returning the value or `null`, and `withheldMetrics(counts, floor)` returning the sorted metric keys that fall below it. No Node or database import; exported from `packages/domain/src/index.ts`.
- [x] 1.2 `packages/domain/test/aggregates.test.ts`: zero, four and five against a floor of five; a floor of zero withholds nothing; the returned key order is stable.
- [x] 1.3 `packages/config/src/index.ts`: `INSTITUTION_COHORT_FLOOR = 5` with the one-line reason it is not a version payload yet (limits stay code by `D-184`).
- [x] 1.4 Mutation checks recorded here: change the comparison to less-or-equal and confirm the five-is-reported test fails; drop the sort and confirm the order test fails. Restore both.

## 2. The read

- [x] 2.1 `services/api/src/authorization/authorize.ts`: a helper returning the caller's scoped institution id for one requested id, refusing with `404 INSTITUTION_NOT_FOUND` for both the unknown and the unassigned case, and requiring `INSTITUTION_ADMIN` with `requiresMfa`.
- [x] 2.2 `services/api/src/institutions/institution-dashboard.service.ts` (and its drizzle implementation): the metric queries from the design's table, each in one statement, each with the institution filter pushed into the join.
- [x] 2.3 `services/api/src/institutions/institution-dashboard.controller.ts`: `@Get("institution/aggregates")` with `@Throttle({ default: RATE_LIMITS.read })`-shaped throttling, the `institution_id` validated as a UUID with `422` otherwise, the suppression applied through the domain helper, and `Cache-Control: no-store` on the response.
- [x] 2.4 Register the controller in `services/api/src/app.module.ts`.

## 3. Pagination on the existing list

- [x] 3.1 `packages/domain/src/cursor.ts` (or the existing cursor helper if one already exists — check `grep -rn "encodeCursor\|decodeCursor" packages/domain/src services/api/src` first): encode and decode the name and id pair, with a `422` on a malformed value.
- [x] 3.2 `drizzle-institutions.service.ts`: `listInstitutions({ cursor, limit })` applying the keyset predicate and `limit + 1` to decide `next_cursor`; the controller parses `limit` (1 to 100, default 50).
- [x] 3.3 `packages/domain/test/cursor.test.ts`: round trip, malformed input, an id-only and a name-only cursor both refused.

## 4. Contract and registries

- [x] 4.1 `packages/contracts/openapi.yaml`: the new path with its `institution_id` parameter, `200`/`401`/`403`/`404`/`422`/`429`, the `InstitutionAggregates` schema (integers plus `suppressed` plus `counted_outcomes_by_field`), and the `no-store` note; `/v1/institutions` gains `cursor` and `limit` and its response gains `next_cursor`, and the sentence "No pagination in this release" is deleted.
- [x] 4.2 `services/api/test/authorization-matrix.test.ts`: one MATRIX row for the new route, plus the new controller and its provider tokens in the file's lists.
- [x] 4.3 `services/api/test/request-validation.integration.test.ts`: the same controller and provider lists.
- [x] 4.4 `packages/contracts/src/body-keys.ts`: only if the inventory test demands an entry for a bodyless GET; record the answer either way.

## 5. Tests

- [x] 5.1 `services/api/test/institution-dashboard.integration.test.ts` (new): the ten acceptance criteria in the design, one test each, with a fixture of two institutions, two fields, and counts on both sides of the floor.
- [x] 5.2 `services/api/test/institutions.integration.test.ts`: three institutions with `limit=2` walk two pages with no repeat or omission; the last page has no `next_cursor`; `limit=0` and `limit=101` are `422`; a malformed cursor is `422`.
- [x] 5.3 Diff plan spacing and `pnpm test`, then run the two touched files alone and record their real counts.
- [x] 5.4 Mutation checks recorded here: drop the institution filter from one metric and confirm the scoping test fails; return `200` for the unassigned institution and confirm the 404 test fails. Restore both.

## 6. Docs

- [x] 6.1 `docs/functional-requirements.md`: `FR-INST-02` gains its "Built by" annotation naming the route, the metric set and the floor; `FR-INST-01`'s pagination clause is marked closed by this change (the row's own DONE amendment belongs to `pilot-runbook-and-docs-truth`).
- [x] 6.2 `docs/known-debt.md`: close `DEBT-51` with the evidence line; open one row for the missing aggregates page and the cursor-following admin page.
- [x] 6.3 `docs/api-contracts.md` §5.7: the two paths, the parameters, the `404` rule and the suppression rule in one paragraph each.
- [x] 6.4 `docs/auth-and-access-control.md`: one matrix row — institution admin, own institution, aggregates only.
- [x] 6.5 `docs/mvp-build-plan.md` §5, `docs/milestones-and-phases.md` "Current state", `README.md` status line, `docs/decision-log.md` (the reserved D-211 to D-214 rows with Date/Decision/Reason/Status/Affects). Write the real fix in this change; the later changes of this round verify only.

## 7. Checks, review, handoff

- [x] 7.1 `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` — each its own command, each exit code recorded.
- [x] 7.2 `openspec validate institution-dashboard-aggregates --strict` and `openspec validate --all --strict`; quote the printed totals.
- [x] 7.3 Review gate per `AGENTS.local.md` §2: the diff line by line, the trust-rule check, the silent-failure pass, and `review-diff` to confirm the diff holds only what these tasks require.
- [x] 7.4 Confirm no migration and no table change: `git status --short services/api/drizzle` is empty and the database test name still says thirty-three.
- [x] 7.5 Handoff in chat: acceptance criteria with their evidence, the retired statement from the OpenAPI description, and the debt row opened.

## Verification record (2026-11-20)

- Gates: `pnpm lint` 0, `pnpm typecheck` 0, `pnpm build` 0, `pnpm test` 0 — domain 158, web 245, contracts 23, api 366, 0 skipped.
- Focused: `node --import tsx --test test/institution-dashboard.integration.test.ts` → 10 tests, 10 pass, 0 fail.
- `openspec validate institution-dashboard-aggregates --strict` and `openspec validate --all --strict`: quoted in the round report.
- Mutation 1 (`withholdBelowFloor` `<` → `<=`): `aggregates.test.ts` failed 2 of 4 (the five-is-reported case), restored.
- Mutation 2 (drop `.sort()`): the stable-order case failed, restored.
- Mutation 3 (drop the institution filter from `verified_alumni`): the own-institution test reported 9 instead of 5, restored.
- Mutation 4 (skip the scope check in `requireScopedInstitution`): the two-404 test answered 200 instead of 404, restored.
- Task 4.4: the inventory test needs no `ROUTE_BODY_KEYS` entry for a bodyless GET; no entry was added and `packages/contracts` stayed green.
- One deviation: the FR-REP-05 schema guard forbids the word family `aggregate`, so `packages/contracts/test/reputation-schema-guard.test.ts` gained two reasoned allowlist entries for the path and the schema name (D-213's counts-only payload is the reason).
