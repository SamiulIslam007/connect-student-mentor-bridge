# Design: institution-onboarding

## Context

See `proposal.md` for motivation. Only the state that shapes the approach is recorded here.

**Repository snapshot (verified 2026-11-11, re-check at apply).**

- `main` is at `6e88994`, clean; no active change; 35 specs valid before this round. CI run `42989401590` is green, checks job 3m28s. No gate was run in this propose round.
- `institutions` (`services/api/src/db/schema/trust.ts` line 25): `id`, `name` not null, `kind` not null, `country_code` char(2) not null, `status` default `ONBOARDING`, `mou_signed_on` date nullable, `min_cohort_size` smallint nullable, timestamps.
- `institution_domains` (same file, line 36): `id`, `institution_id` not null with cascade, `domain` **citext** not null, `verified_at` nullable, timestamps, `institution_domains_domain_unique` unique index on `domain`, and an index on `institution_id`.
- `institution_kind` is a pg enum: `UNIVERSITY`, `BOOTCAMP`, `TRAINING_INSTITUTE`, `OTHER`. `institution_status` is `ONBOARDING`, `ACTIVE`, `SUSPENDED`.
- `services/api/src/institutions/` already exists with `attestation.controller.ts`, `attestations.service.ts`, `attestation.tokens.ts`, `drizzle-attestation.service.ts` and `institutions.module.ts`; `InstitutionsModule` is imported by `app.module.ts`.
- `Grants`: `services/api/drizzle/0000_baseline.sql` line 147 grants SELECT, INSERT, UPDATE, DELETE on `institutions` and `institution_domains` to `connect_app`. No migration is needed.
- `requireRole(identity, request, "PLATFORM_ADMIN", { requiresMfa: true })` is the pattern used by `services/api/src/reports/admin.controller.ts` and `services/api/src/institutions/attestation.controller.ts`.
- `AuditAction` (`services/api/src/identity/audit-log.ts`) is a closed union whose last members are `ACCOUNT_DELETED` and `REPORT_RESOLVED`; `audit_logs.action` is a plain `text` column, so a new member needs no migration. `appendAuditEntry` documents that metadata must never hold a password, hash, token or raw email address.
- `ROUTE_BODY_KEYS` (`packages/contracts/src/body-keys.ts`) is a route-to-keys map parity-tested against the OpenAPI request schemas by `packages/contracts/test/openapi.test.ts`. It keys on the colon form, for example `POST /v1/admin/institutions/:id/admins`.
- `services/api/test/authorization-matrix.test.ts` carries `MATRIX` rows of the shape `{ route, access, mutating, body }` where `access` is `public`, `signed-in` or a role name, plus a controller list and a provider-token list.
- `apps/web/app/admin/reports/page.tsx` is a client page with a loading, ready, error, signed-out and mfa-required state, fetch calls to a BFF route, and a required-reason form. It is the pattern this page copies.
- `apps/web/app/api/review-queue/route.ts` is the BFF read pattern: read the session cookie, refuse unauthenticated, forward with `forwardUpstream`, map a non-JSON upstream to a problem, pass the status through.

**Library behaviour confirmed with context7 (2026-11-11):** `@nestjs/throttler` 6.7.1 is installed and the repo already uses the named form `@Throttle({ default: RATE_LIMITS.x })`, so the write route takes the existing `write` bucket and the read route takes `default` with no new wiring.

## Goals / Non-Goals

**Goals**

- One route and one page that let a platform admin stand up a partner institution with its domains and its MoU date.
- The domain uniqueness rule enforced by the database and reported as a problem response, never as a `500`.
- An audit trail that says who created which institution and which domains, in the same transaction.

**Non-Goals**

- No dashboard, no aggregates, no CSV, no status machine.
- No institution admin creation in the same call.
- No new table, column, enum or migration.

## Decisions

Owner decisions keep the numbers the brief fixed (D-109 to D-113). Decisions taken while writing carry `R` numbers.

### D-109. Creation stops at the institution (owner decision)

`POST /v1/institutions` creates the institution and its domains and nothing else. The institution admin is assigned afterwards through the existing `POST /v1/admin/institutions/{id}/admins`, which is not modified. Alternative rejected: taking an admin email in the same body, which would put two writes with different failure modes behind one route and would need a rollback rule for "institution created, admin not found".

### D-110. Name, kind and country code are required; MoU date and domains are optional (owner decision)

`name`, `kind` and `country_code` are required because the columns are not null. `mou_signed_on` and `domains` are optional and labelled optional in the page, because an institution can be registered before its MoU is signed and a domain list can be filled later. `min_cohort_size` is not in the body at all: it stays null, and the small-cohort suppression threshold remains the documented owner value of 5. Alternative rejected: requiring an MoU date, which would block registering a partner before signature and contradicts the schema's nullable column.

### D-111. The route home is `/v1/institutions`, platform-scoped (owner decision)

The actor owns the path name, as it does for the attestation routes (`/v1/institution/...` for an institution admin). `/v1/admin/...` would misname a platform-level resource that later reads may share with another role. Alternative rejected: `/v1/admin/institutions`, which reads as an admin-only mirror rather than the resource itself.

### D-112. No pagination for the pilot, recorded as debt (owner decision)

`GET /v1/institutions` returns every institution in one response. The pilot has one partner; the bound is a debt row, not a cursor. Alternative rejected: a keyset cursor now, which would need a second query shape and a second web state for a list that fits on one screen.

### D-113. Reuse `institutionKind`; a duplicate domain answers `409` (owner decision)

The body's `kind` is validated against the existing pg enum values, with `422` naming the field for anything else. A domain that already exists, in any case, answers `409 INSTITUTION_DOMAIN_TAKEN` and the transaction writes nothing. Alternative rejected: a free-text kind, which would fragment the taxonomy the institution dashboard will group by, and a silent "domain already registered, continue", which would leave two institutions claiming one domain.

### R1. Two audit actions, one per fact

`INSTITUTION_CREATED` is appended once per institution with `object_type` institutions, `object_id` the new id, and metadata carrying `kind` and `country_code`. `INSTITUTION_DOMAIN_REGISTERED` is appended once per domain with metadata carrying the domain string. A domain is not an email address, so the "no raw email in metadata" rule is not bent; the attestation projection already exposes domains for the same reason (D-101). Alternative rejected: one action with a domain array in metadata, which would lose the per-domain row count the brief asks for.

### R2. The body carries `domains` as an array of strings

`domains: string[]`, each a bare domain (letters, digits, dot and hyphen), lower-cased before the write, with no at-sign and no scheme. Alternative rejected: objects with a verification flag, because `verified_at` stays null and a client-supplied flag would be a lie.

### R3. The response shape

`POST` answers `201` with the created institution: `id`, `name`, `kind`, `country_code`, `status`, `mou_signed_on`, and `domains` as an array of strings. `GET` answers `200` with an object `{ data: [ ... ] }` where each entry has the same shape plus `domains`. A wrapper object is used so a future cursor or count can be added without changing the response type from an array to an object, which is the breaking change nobody wants at pilot time.

### R4. Field bounds, stated once

`name` 1 to 160 characters after trim; `country_code` exactly two letters, upper-cased; `domains` at most 20 entries, each 3 to 253 characters; `mou_signed_on` an ISO date, not in the future. Each refusal is `422 VALIDATION_ERROR` naming the field. These numbers live in the controller's validation constants and in the OpenAPI schema, and the parity test keeps them from drifting.

### R5. The page copies the report queue, and Stitch is not used

`apps/web/app/admin/institutions/page.tsx` follows `apps/web/app/admin/reports/page.tsx`: a client page, the same five page states, a required-field form, a list, and the refusal path rendered as an error state. Stitch is not connected for this run, so no Stitch task exists; `design.md` records that the page reuses the existing admin pattern and the existing string catalog and component styles. The nav entry goes beside the existing platform-admin links in `apps/web/lib/navigation.ts`.

## Acceptance criteria

1. A platform admin with an enrolled second factor creates an institution with two domains and reads it back from `GET /v1/institutions` with both domains, status `ONBOARDING`, and the MoU date it sent.
2. A duplicate domain, including the same domain in different case, answers `409 INSTITUTION_DOMAIN_TAKEN`, and no institution and no domain row is created.
3. A caller without `PLATFORM_ADMIN` answers `403 ROLE_REQUIRED`; a platform admin without an enrolled second factor is refused before any write.
4. Creation writes exactly one `INSTITUTION_CREATED` row and one `INSTITUTION_DOMAIN_REGISTERED` row per domain, all naming the actor, all in the creation transaction.
5. An unknown `kind`, a one-letter `country_code`, an empty `name`, a domain containing an at-sign, or an undocumented top-level key each answer `422` naming the field, and nothing is written.
6. The authorization matrix, the body-key parity test and the request-validation inventory all pass with the two new routes present.
7. The page creates an institution and lists it, and shows the refusal response as an error state rather than a crash.

## Assumptions

1. No institution exists in a production database before this route, so the first creation is also the first row. Nothing here depends on that being true.
2. `citext` is enabled in the database, which it must be for the column to exist; the uniqueness test proves the behaviour rather than assuming it.
3. A platform admin can see every institution; there is no per-institution scope on this surface because the actor is platform-wide.
4. `min_cohort_size` staying null is acceptable until the dashboard needs it, and the suppression threshold remains the documented value of 5.

## Risks / Trade-offs

- The list endpoint grows without a bound. Mitigation: DEBT-51 records it, and the pilot has one institution.
- A new controller touches four registries and twenty test files build provider lists by hand. Mitigation: the controller is registered in `InstitutionsModule` (already imported by `app.module.ts`), the two test files that enumerate controllers are updated in the same change, and the api suite runs once at the end.
- The page is a second admin page in a nav that is already role-gated. Mitigation: it follows the existing pattern and the navigation test asserts the entry's presence for `PLATFORM_ADMIN` and absence for every other role.
- A domain typed with a trailing dot or a scheme is rejected rather than normalized. Mitigation: the message names the expected form, and the page shows it as a field error.

## Open Questions

- Whether an institution should be readable by an institution admin for its own row. Not needed by any current requirement, and the route is platform-scoped; if the dashboard needs it, it arrives with `FR-INST-02`.

## Migration Plan

None. No schema change and no backfill. Deploy order: the service and controller, then the contract and the registries, then the page. A client that never opens the page is unaffected. Rollback is the revert of the commit; rows created before a rollback remain as `ONBOARDING` institutions, a legal state.
