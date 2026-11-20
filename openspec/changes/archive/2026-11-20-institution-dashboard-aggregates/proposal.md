# Proposal: institution-dashboard-aggregates

## Why

`FR-INST-02` is unbuilt, and it is the only read a pilot partner would open: an institution admin can today decide affiliation claims and nothing else, so the institution that signs the MoU sees no evidence the platform works. `DEBT-51` records the second half — `GET /v1/institutions` returns every row with no pagination — and that row's own target says the pagination belongs with this change.

## What Changes

- One new read, `GET /v1/institution/aggregates?institution_id=...`: the `FR-INST-02` counts for one institution, to a caller holding `INSTITUTION_ADMIN` with an enrolled second factor and an assignment for that institution. Integers only, no student identifier, `404` for an institution the caller does not administer.
- Small-cohort suppression: every count below the settled floor of five is withheld and named in a `suppressed` list; a by-field row below the floor is omitted.
- `GET /v1/institutions` gains keyset pagination: an opaque `cursor`, `limit` 1 to 100 defaulting to 50, and `next_cursor` absent on the last page. **BREAKING** for a caller that ignores the cursor — it now reads one page.
- One pure floor helper in `@connect/domain` and one constant in `@connect/config` (`INSTITUTION_COHORT_FLOOR = 5`), so the threshold has one home.
- No migration and no new table: every count reads tables that exist.

## Capabilities

### New Capabilities

- `institutions/institution-dashboard`: the aggregate read, its scope, its suppression rule and its payload shape.

### Modified Capabilities

- `institutions/onboarding`: the requirement "A platform admin lists the institutions with their domains" states "with no pagination in this release"; it now carries a cursor.

## Impact

- **Code**: `services/api/src/institutions/institutions.controller.ts` (one route on a new controller or the existing one), `services/api/src/institutions/institution-dashboard.service.ts` (one query per metric group), `services/api/src/institutions/drizzle-institutions.service.ts` (`listInstitutions` gains a cursor), `services/api/src/authorization/authorize.ts` (an `requireInstitutionAdmin`-shaped helper that returns the scoped `institution_id`), `packages/domain/src/impact.ts` or a new `aggregates.ts` (the pure floor helper), `packages/config/src/index.ts` (the floor constant).
- **Contract**: `packages/contracts/openapi.yaml` gains the path and the `InstitutionAggregates` schema; the `/v1/institutions` path gains `cursor` and `limit` and its response gains `next_cursor`. `packages/contracts/src/body-keys.ts` gains an empty entry for the new GET only if the inventory test requires it (a GET takes no body).
- **Data**: none. No migration; the table count stays 33.
- **Tests**: `services/api/test/institution-dashboard.integration.test.ts` (new), `services/api/test/institutions.integration.test.ts` (pagination), `services/api/test/authorization-matrix.test.ts` (one MATRIX row plus the controller and provider lists), `services/api/test/request-validation.integration.test.ts` (the same controller list), `packages/domain/test/aggregates.test.ts` (the floor), `packages/contracts/test/openapi.test.ts` (parity, unchanged rules).
- **Docs**: `docs/functional-requirements.md` (`FR-INST-02` annotation, and `FR-INST-01`'s pagination clause is closed by this change per `DEBT-51`), `docs/known-debt.md` (close `DEBT-51`, open the aggregation-page row), `docs/api-contracts.md` §5.7, `docs/data-model.md` (no change — say so), `docs/auth-and-access-control.md` (one matrix row), `docs/mvp-build-plan.md` §5, `docs/milestones-and-phases.md`, `README.md` status line, `docs/decision-log.md`.

## Depends on

None. It reads tables that exist and adds no migration, so it may land before or after `idempotency-key-on-writes`; if both land together, this one applies first because it does not touch `0023`.

## Out of scope

- **The web page.** A minimal `/institution/aggregates` page is not in this change: this round is backend-first and a page needs an approved visual direction the repo cannot generate itself. Recorded as a follow-up debt row, not as a hidden gap.
- **Funnel detail** (`FR-INST-02`'s Phase 1b half): per-stage conversion from sign-up to counted outcome. One change, later.
- **CSV export** (`FR-INST-03`): its own change, after this read exists.
- **Student-level data** (`FR-INST-04`, Could): needs an active consent and is not a pilot feature.
- **Pagination for the institution-admin queues**: the attestation queue already keysets on id.
- Editing, status transitions and domain verification for institutions: `FR-INST-01` is amended separately by `pilot-runbook-and-docs-truth`.

## Risks and rollback

| Risk | Mitigation |
|---|---|
| An aggregate leaks a slice of one student (a count of 1 in a four-person cohort) | Every count is suppressed below five and named in `suppressed`; the by-field rows are suppressed individually; a test asserts a fixture of four is withheld and five is reported |
| The `institution_id` parameter becomes an existence oracle | The same `404` for an unknown id and for an institution the caller does not administer, asserted by one test that compares both bodies |
| Pagination silently truncates an existing caller | The default page is 50 rows and the only caller (the admin page) holds a handful; the response carries `next_cursor` and the docs say a caller must follow it |
| A count query scans a table with no supporting index | Every metric reads an indexed column (`affiliations_institution_id_idx`, `mentorship_requests_mentor_status_idx`, `outcomes_status`-keyed indexes); pilot volume makes the read cheap, and the design names the index per metric |
| The payload grows into a score | Integers only, no rate, no ranking; a payload key-set test fails if a percentage or score-shaped key appears |

**Rollback**: remove the route, its MATRIX row and its OpenAPI path; `GET /v1/institutions` keeps the cursor parameters but a caller that sends neither gets the same rows in the same order. No data to undo, no migration to reverse.

**Traces to** FR-INST-02, FR-INST-01, SEC-AC-5, D-111 to D-116, D-114 to D-116, DEBT-51.
