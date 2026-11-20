# Design: institution-dashboard-aggregates

## Context

**Repository snapshot (verified 2026-11-20 at propose; re-check at apply).**

- `openspec validate --all --strict` on `main` at `bcdb2e4` printed `44 passed, 0 failed` **before** this round's change directories existed; the apply re-runs it and quotes the new total.
- `services/api/src/institutions/institutions.controller.ts:35-41` holds `@Get("institutions")` with `requireRole(this.identity, request, "PLATFORM_ADMIN", { requiresMfa: true })`; `institutionsPayload` is the projection helper.
- `services/api/src/institutions/drizzle-institutions.service.ts:188-199` — `listInstitutions()` selects every row `.orderBy(asc(institutions.name), asc(institutions.id))` and then loads domains per institution; it takes no limit and no cursor.
- `packages/contracts/openapi.yaml:1540-1560` — `GET /v1/institutions` says in its own description "No pagination in this release (D-112, DEBT-51)".
- `services/api/test/authorization-matrix.test.ts:246` — the MATRIX row is `{ route: /^GET \/v1\/institutions$/, access: "PLATFORM_ADMIN" }`; the file also lists controllers and providers by hand (lines 15-20 for this module).
- Only one institution-admin page exists (`apps/web/app/institution/attestations/page.tsx`); `/admin/institutions/page.tsx` is the platform-admin page. No aggregates path exists anywhere in `packages/contracts/openapi.yaml`.
- Join columns confirmed in the schema: `affiliations.user_id`, `affiliations.institution_id`, `affiliations.status` (`PENDING`, `VERIFIED`, `REJECTED`, `REVOKED`, `EXPIRED`), `mentor_profiles.user_id` + `status` (`DRAFT`, `PENDING`, `ACTIVE`, `SUSPENDED`, `REMOVED`), `mentorship_requests.mentor_profile_id` / `student_profile_id` / `status` (`PENDING`, `ACCEPTED`, `DECLINED`, `REDIRECTED`, `EXPIRED`, `WITHDRAWN`) / `decided_at` / `expires_at`, `outcomes.mentorship_id` / `field_id` / `status` / `counted_at`, `mentorships.mentor_profile_id` / `student_profile_id`.
- `affiliations_one_verified_unique` allows one `VERIFIED` affiliation per account, so "verified alumni" counts accounts, not claims.
- Rate convention: `D-114` to `D-116` moved response reliability onto two integer counts and kept every percentage off the wire; `FR-REP-04`'s row says "derived from the pair and sending no percentage or rate".
- Table count is asserted in `services/api/test/database.integration.test.ts:47` ("the thirty-three tables"). This change adds no table.

## Goals / Non-Goals

**Goals**

- One read that answers `FR-INST-02`'s aggregate list for one institution, in integers, with every small slice withheld.
- `DEBT-51` closed by a keyset cursor on the existing list, with no change to its order.
- The floor rule in one pure function and one constant, so the threshold is not retyped.

**Non-Goals**

- No web page, no CSV, no funnel detail, no student-level rows.
- No new table, no migration, no backfill, no materialised view.
- No audit row for the read (it discloses no personal data and changes nothing; `D-137` is the precedent for a read that writes nothing).
- No change to the attestation queue or its pagination.

## Metric definitions

Every count is computed from columns that already exist. The apply pins each one to a test with a fixture it can count by hand.

| Metric | Source |
|---|---|
| `verified_alumni` | distinct `affiliations.user_id` where `institution_id` is the requested institution and `status = 'VERIFIED'` |
| `active_mentors` | distinct `mentor_profiles.user_id` with `status = 'ACTIVE'`, an account whose `users.status = 'ACTIVE'`, and a `VERIFIED` affiliation to the institution |
| `requests_received` | `mentorship_requests` whose `mentor_profile_id` belongs to an active mentor of the institution |
| `requests_accepted` / `requests_decided` | the subset with `status = 'ACCEPTED'`, and the subset with `status` in (`ACCEPTED`, `DECLINED`, `EXPIRED`) |
| `requests_decided_in_time` / `requests_late_or_expired` | the same decided set partitioned by `decided_at` within 48 hours of the request's own creation, and everything else (the partition `responseReliability` already defines) |
| `outcomes_reported` / `outcomes_confirmed` | `outcomes` joined through `mentorships` to those mentors, where the status is anything, and where `confirmed_at` is not null |
| `counted_outcomes_by_field` | `outcomes` with `status = 'COUNTED'`, grouped by `field_id`, joined to `fields` for the name |

## Decisions

The owner fixed the metric set, the scope, the floor of five and the pagination. The decisions below are the ones left open.

### R1. Counts, never rates

`acceptance share` and `decided-within-48h share` ship as integer pairs (`requests_accepted` with `requests_decided`, `requests_decided_in_time` with `requests_late_or_expired`), and the client computes any share it shows. Alternative rejected: sending a rounded percentage, which is the exact shape `D-114` to `D-116` removed from the reputation read, and which cannot be suppressed correctly (a share of one in four is a count of one).

### R2. The institution is a required parameter, and both misses are one 404

`institution_id` is a required query parameter, validated as a UUID; an id that names nothing and an id the caller does not administer both answer `404 INSTITUTION_NOT_FOUND` with the same body. Alternative rejected: deriving the institution from the caller's single assignment, which publishes a wrong answer the day an admin holds two institutions, and which makes the eventual multi-institution case a second route.

The scope check is a new helper beside `requireInstitutionAdmin` in `services/api/src/authorization/authorize.ts` that returns the scoped `institution_id` from `role_assignments.institution_id` — the existing `requireRole` returns a bare `Role[]` and carries no scope, which is the defect the repo already records.

### R3. Suppression omits the value and names it

A count below five is absent from the payload and named in a `suppressed` array of metric keys; a by-field row whose counted total is below five is omitted entirely, and no field id appears in `suppressed` (an id would confirm that a small slice exists). Alternative rejected: a null value, which a client renders as zero, and a rounded value, which is a lie.

The floor is `INSTITUTION_COHORT_FLOOR = 5` in `@connect/config` (the settled threshold in `AGENTS.local.md` §1.1 and `D-112`'s family), read through one helper so a version payload can replace it later without touching the query.

### R4. API only in this change

No page, no BFF route. A page needs an approved visual direction and this round is backend-first; the audit that produced this round ranked the read above the page because the read is the hard half. Recorded as a debt row ("no institution aggregates page exists; the read is API-only") plus a follow-up change, in the pattern `DEBT-63` uses for evidence.

### R5. Keyset on name then id, default page 50

The existing order is `asc(name), asc(id)`, so the cursor is the opaque encoding of that pair and the predicate is "name greater, or name equal and id greater". `limit` is 1 to 100 with a default of 50 — the default is high because the pilot holds a handful of institutions and the only caller today is the admin page, which sends no cursor. Alternative rejected: offset pagination, which repeats or skips a row when an institution is created mid-walk.

The `/admin/institutions` page keeps working unchanged and does not follow `next_cursor` yet; with pilot volume under one page that is a recorded bound, not a defect, and the debt row from R4 names it.

### R6. No-store, and no audit row

The aggregates carry `Cache-Control: no-store`: every count moves as requests arrive, and a cached response would show a partner yesterday's numbers. The read writes no audit entry — it discloses no personal data and changes nothing, and `D-137` set that precedent for a read of the audit log itself.

## Acceptance criteria

1. `GET /v1/institution/aggregates` answers `200` with the documented key set for an assigned institution admin with an enrolled second factor.
2. The same route answers `403` for a student, a mentor and a platform admin with no institution assignment, and `401` without a credential.
3. An institution the caller does not administer and an id that exists nowhere produce byte-identical `404` bodies.
4. A payload key-set assertion fails if any percentage, share, score, ranking or student identifier appears.
5. With four verified alumni the count is absent and named in `suppressed`; with five it is present and not named.
6. The by-field breakdown omits a field with four counted outcomes and includes one with five.
7. `GET /v1/institutions?limit=2` returns two rows and a `next_cursor`; the follow-up request returns the next rows with no repeat and no omission; the last page carries no `next_cursor`.
8. A malformed `cursor` answers `422`; `limit=0` and `limit=101` answer `422`.
9. The inventory tests pass untouched in rule: the new route has an OpenAPI path, a MATRIX row and the two controller lists.
10. No migration file and no table-count change: the table test still reads thirty-three.

## Assumptions

- Pilot volume keeps every metric query cheap; none needs a materialised view or a cache.
- One institution per admin is the pilot case; the parameter exists so the second case is a parameter change, not a redesign.
- `confirmed_at` is the right instant for "outcomes confirmed" (it is set on the mentor's confirmation and is the only such column).

## Risks

Already tabulated in the proposal; the two this design adds:

- A metric whose join double-counts (an account with two mentorships) — each metric names `distinct user` or a row count in the table above, and the test fixture is built so the two differ.
- `requests_decided_in_time` must reuse `responseReliability`'s partition rather than re-deriving "48 hours"; the apply reads `packages/domain/src/reputation.ts` first and cites the function it mirrors.
