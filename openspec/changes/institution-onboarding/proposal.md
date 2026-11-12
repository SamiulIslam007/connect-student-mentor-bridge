# Proposal: institution-onboarding

## Why

`FR-INST-01` is Must, scored zero, and has no implementation of any kind: there is no `InstitutionsController`, no create path, and no `/v1/institutions` entry in `packages/contracts/openapi.yaml` (58 documented paths, none of them creates an institution). The `institutions` and `institution_domains` tables have existed since migration `0000_baseline.sql`, and the only institution write in the codebase is `POST /v1/admin/institutions/{id}/admins` in `services/api/src/institutions/attestation.controller.ts`, which grants a role for an institution that something else must have created.

The consequence is concrete. On a fresh install the only institutions that exist are the ones `services/api/src/db/seed/` writes in development, and the only institution admins are the demo accounts. `FR-VER-02`'s attestation queue therefore works in a demo and cannot be exercised in a pilot: there is no supported way to stand up a partner institution, register its email domains, or record that an MoU was signed. The institution half of the pilot demo is blocked on one route and one page, and the data model is already shaped for it (`name`, `kind`, `country_code`, `status` defaulting to `ONBOARDING`, `mou_signed_on`, `min_cohort_size`, plus a `citext` domain table with a unique index).

## What Changes

- Add `POST /v1/institutions`, available to `PLATFORM_ADMIN` with an enrolled second factor. The body carries `name`, `kind`, `country_code`, an optional `mou_signed_on`, and an optional `domains` array. It writes one `institutions` row and one `institution_domains` row per domain in a single transaction.
- Add `GET /v1/institutions`, same actor, returning every institution with its domains and status, without pagination.
- Append one `INSTITUTION_CREATED` audit row per creation and one `INSTITUTION_DOMAIN_REGISTERED` row per domain, naming the actor, inside the same transaction.
- Refuse a duplicate domain with `409 INSTITUTION_DOMAIN_TAKEN` and create nothing. `institution_domains.domain` is `citext` with `institution_domains_domain_unique`, so a case-differing duplicate must collide, and the test proves it.
- Add `apps/web/app/admin/institutions/page.tsx` with a create form and a list, plus its BFF routes, its string-catalog group, its pure helper and its test.
- Register the two routes in all four hand-maintained registries and add the paths to `packages/contracts/openapi.yaml`.
- Narrow `FR-INST-01` with the parts this change does not cover (status transitions, institution-admin creation in the same call, domain verification).
- No migration: both tables exist and `connect_app` already holds SELECT, INSERT, UPDATE and DELETE on them (`services/api/drizzle/0000_baseline.sql` line 147).

## Capabilities

### New Capabilities

- `institutions/onboarding`: creating an institution, registering its email domains, the uniqueness rule, and the audit trail of both.

### Modified Capabilities

None. `institutions/affiliation-verification` is deliberately not touched: its requirement header "No admin decision surface exists in this release" is already recorded as a stale header (DEBT-47) and editing it invites an archive collision for no gain.

## Impact

- **Code**: `services/api/src/institutions/institutions.controller.ts` (new), `services/api/src/institutions/institutions.service.ts` and `institutions.tokens.ts` (new), `services/api/src/institutions/drizzle-institutions.service.ts` (new), `services/api/src/institutions/institutions.module.ts` (register the controller and the service token), `services/api/src/identity/audit-log.ts` (two action members), `apps/web/app/admin/institutions/page.tsx` (new), `apps/web/app/api/institutions/route.ts` (new), `apps/web/lib/institutions.ts` (new), `apps/web/lib/strings.ts`, `apps/web/lib/navigation.ts` only if a second platform-admin link is wanted (it is not: the page is reached from `/admin/reviews` and `/admin/reports` navigation, so a link is added there instead).
- **Tests**: new `services/api/test/institutions.integration.test.ts`, new `apps/web/test/institutions.test.ts`; edited `services/api/test/authorization-matrix.test.ts` (two MATRIX rows plus the controller and provider lists), `services/api/test/request-validation.integration.test.ts` (controller and provider lists). `services/api/test/database.integration.test.ts` is not touched: no table is added.
- **API/contract**: `packages/contracts/openapi.yaml` gains two paths and three component schemas; `packages/contracts/src/body-keys.ts` gains `POST /v1/institutions` with five keys. The read route takes no body and gets no entry.
- **Data**: none. No table, column, enum or migration.
- **Dependencies**: none added.
- **Docs**: `docs/api-contracts.md` section 5.7 (two paths), `docs/auth-and-access-control.md` (the platform-admin institution surface), `docs/functional-requirements.md` (`FR-INST-01` narrowed), `docs/data-model.md` (no change needed; confirm the domain uniqueness rule is already stated), `docs/known-debt.md` (one new row for pagination), `docs/decision-log.md` (D-109 to D-113), `docs/mvp-build-plan.md` section 5, `docs/milestones-and-phases.md` current state, `README.md` status line.

## Depends on

- `institutions/affiliation-verification` (archived 2026-11-11): the institution tables, `institutionKind`, and the grant route this change leaves unchanged.
- `identity/role-authorization` (archived 2026-11-05): `requireRole` with the `requiresMfa` option, which every route here uses.
- `trust/abuse-reports-and-sanctions` (archived 2026-11-10): the admin-write pattern (one transaction, one audit row, a required reason where there is a judgement).
- `platform/request-validation` (archived 2026-11-09): the body allowlist, `ROUTE_BODY_KEYS`, and its parity test.
- `platform/rate-limits` (archived 2026-11-09): the buckets the two routes take.

## Out of scope

- The institution dashboard and aggregates (`FR-INST-02`, `FR-INST-03`).
- Creating the institution admin inside the create call: that stays `POST /v1/admin/institutions/{id}/admins`, unchanged (D-109).
- Institution status transitions (`ONBOARDING` to `ACTIVE` to `SUSPENDED`), editing, deletion, or an MoU document upload.
- Domain verification: `institution_domains.verified_at` stays null; registering a domain is an administrative assertion, not an email challenge.
- Bulk admin assignment, CSV import, and an institutions search.
- Pagination (D-112, DEBT-51).

## Risks and rollback

| Risk | Mitigation |
|---|---|
| The route becomes a privilege-escalation path | It only creates an institution, grants no role, and requires `PLATFORM_ADMIN` plus an enrolled second factor; the actor is in the audit row |
| Two requests register the same domain and one gets a raw database error | The unique index is the guard, and the service maps its violation to `409 INSTITUTION_DOMAIN_TAKEN`; a concurrent test drives it |
| A case-differing duplicate slips through | The column is `citext`, and the test registers the same domain in different case and asserts the `409` |
| A partially created institution is left behind when one domain fails | The whole write is one transaction: institution, domains and both audit kinds commit together or not at all |
| The page is unreachable for a real account | `PLATFORM_ADMIN` is grantable by the checked-in seed and is documented; a nav entry is added beside the existing admin links |
| A new controller breaks twenty unrelated tests | The four registries are updated in the same change, and the api suite is run once at the end rather than per task |

Rollback: delete the controller, service, tokens, page, BFF route and helper; revert the contract, the body keys, the MATRIX rows and the two audit actions. Institutions created before a rollback stay in the database as `ONBOARDING` rows, which is a legal state the data model already describes, so no data repair is needed.

**Traces to** FR-INST-01 (institution onboarding by a Platform Admin), FR-AUTH-07 (object-level authorization on every endpoint), FR-AUD-01 (audit of admin actions), FR-VER-01 (registered email domains are what Level 1 matches against), FR-PROF-04 (no student data is involved anywhere here); ADR-008 (append-only audit), ADR-018 (Drizzle); D-109 to D-113 (this change); DEBT-51 (opened).
