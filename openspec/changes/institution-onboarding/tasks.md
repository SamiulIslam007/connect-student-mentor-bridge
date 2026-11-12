# Tasks: institution-onboarding

## 0. Preconditions

- [x] 0.1 Re-read the repository snapshot in `design.md` against the real tree: `git log --oneline -1` (expect `6e88994`), `git status`, `grep -n -A12 "export const institutions" services/api/src/db/schema/trust.ts`, `grep -n "GRANT" services/api/drizzle/0000_baseline.sql`, `ls services/api/src/institutions/`, `grep -n "ThrottlerModule" services/api/src/app.module.ts`. Verify: every snapshot line is confirmed by an output or listed as a mismatch in the handoff before any code is written.

## 1. The service

- [x] 1.1 Add `services/api/src/institutions/institutions.service.ts` (the interface), `institutions.tokens.ts` (the injection token as an exported string constant), and `drizzle-institutions.service.ts` (the implementation), following the shape of the existing `attestations.service.ts`, `attestation.tokens.ts` and `drizzle-attestation.service.ts` in the same directory. Verify: `pnpm --filter api typecheck` passes.
- [x] 1.2 Implement `createInstitution({ name, kind, countryCode, mouSignedOn, domains, actorUserId, requestId })` as one transaction: insert the institution, insert one domain row per domain, append one `INSTITUTION_CREATED` audit row and one `INSTITUTION_DOMAIN_REGISTERED` row per domain, and return the created shape. Map a unique-violation on `institution_domains_domain_unique` to `409 INSTITUTION_DOMAIN_TAKEN` with the whole transaction rolled back. Verify: an integration test asserts the created rows, the exact audit row count and actions, the rollback case (no institution row after a duplicate domain), and that case-differing duplicates collide.
- [x] 1.3 Implement `listInstitutions()` returning every institution with its domains, ordered by name then id for a stable page, and no cursor. Verify: the same integration file asserts two created institutions with their domains and the documented key set.

## 2. The routes

- [x] 2.1 Add `services/api/src/institutions/institutions.controller.ts` with `POST /v1/institutions` and `GET /v1/institutions`, both behind `requireRole(this.identity, request, "PLATFORM_ADMIN", { requiresMfa: true })`, the write decorated with `@Throttle({ default: RATE_LIMITS.write })` and the read with the default bucket. Register the controller and the service provider in `institutions.module.ts`. Verify: an integration test asserts `401` with no session, `403` for a mentor and for an institution admin, the MFA refusal for a platform admin without a second factor, and the success path.
- [x] 2.2 Validate the body with the bounds in `design.md` R4 and refuse an undocumented top-level key through the existing allowlist interceptor. Verify: the request-validation inventory test passes, and a `422` names the offending field for each bound.
- [x] 2.3 Add `INSTITUTION_CREATED` and `INSTITUTION_DOMAIN_REGISTERED` to `AuditAction` in `services/api/src/identity/audit-log.ts`, with metadata carrying `kind`, `country_code` and the domain string only. Verify: the compiler names every consumer, and no metadata holds an at-sign.

## 3. Contract and the four registries

- [x] 3.1 Add the two paths to `packages/contracts/openapi.yaml`: `POST /v1/institutions` with its request schema (`name`, `kind`, `country_code`, `mou_signed_on`, `domains`) and its `201`/`401`/`403`/`409`/`422` responses, and `GET /v1/institutions` with `{ data: [...] }` and its `200`/`401`/`403` responses. Add the component schemas the paths reference. Verify: `pnpm --filter @connect/contracts test` passes.
- [x] 3.2 Add `"POST /v1/institutions": ["name", "kind", "country_code", "mou_signed_on", "domains"]` to `packages/contracts/src/body-keys.ts`, in its existing grouped position. The read route takes no body and gets no entry. Verify: the body-key parity test passes.
- [x] 3.3 Add the two `MATRIX` rows to `services/api/test/authorization-matrix.test.ts` with `access: "PLATFORM_ADMIN"`, the write marked `mutating` with a body probe that satisfies the allowlist, and add `InstitutionsController` plus its provider tokens to that file's controller and provider lists. Verify: the matrix test passes and reports both routes as platform-admin.
- [x] 3.4 Add `InstitutionsController` and its provider tokens to the controller and provider lists in `services/api/test/request-validation.integration.test.ts`. Verify: the file passes with no "allowlisted without a route" and no "route without an allowlist".

## 4. The web surface

- [x] 4.1 Add `apps/web/lib/institutions.ts`: the payload types, a list formatter, a create-body builder, and a validator that refuses an empty name, a malformed country code and a malformed domain before any request is made. Verify: `apps/web/test/institutions.test.ts` asserts the mapping, the empty list, and each refusal.
- [x] 4.2 Add `apps/web/app/api/institutions/route.ts` by copying `apps/web/app/api/review-queue/route.ts` and replacing only the upstream path (depth one); never hand-write an Authorization header. Verify: the route test asserts the forwarding, the status passthrough including `409`, and a non-JSON upstream mapping to `502`.
- [x] 4.3 Add `apps/web/app/admin/institutions/page.tsx` following `apps/web/app/admin/reports/page.tsx`: the five page states, a create form (name, kind select, country code, MoU date, domains as a comma-separated field), the list with status and domains, and the refusal path shown as an error state. Stitch is not used; the page reuses the existing admin pattern and string catalog. Verify: a page test reads the file and asserts the fetch calls, the required fields, the empty and error strings, following the existing no-render page-test pattern.
- [x] 4.4 Add the `institutions` group to `apps/web/lib/strings.ts` and the `/admin/institutions` entry to `apps/web/lib/navigation.ts` beside the existing platform-admin links. Verify: `apps/web/test/navigation.test.ts` asserts the entry for `PLATFORM_ADMIN`, its absence for `MENTOR` and `INSTITUTION_ADMIN`, and that signed-out navigation is unchanged.

## 5. Docs and decisions

- [x] 5.1 Update `docs/api-contracts.md` section 5.7 with both paths, their access, their bodies, their bounds, their refusal codes and the response shape.
- [x] 5.2 Update `docs/auth-and-access-control.md` with the platform-admin institution surface and its MFA requirement, and `docs/functional-requirements.md` marking `FR-INST-01` built to the depth this change reaches, naming what is still missing.
- [x] 5.3 Update `docs/known-debt.md`: add `DEBT-51` for the unpaginated institution list (full text at the end of this file), and confirm `FR-INST-01`'s status line is not contradicted anywhere else.
- [x] 5.4 Add the decision rows `D-109` to `D-113` and this change's `R` rows to `docs/decision-log.md` (full text at the end of this file).
- [x] 5.5 Update `docs/mvp-build-plan.md` section 5, `docs/milestones-and-phases.md` "Current state", and the `README.md` status line. Verify: the three docs agree on status, PR number and date. **Applied 2026-11-12:** the DONE row and the Current state entry land in this change's archive commit, because they cite the merge hash, which does not exist at apply time; that is the repository's established split.

## 6. Gates, review and handoff

- [x] 6.1 Run from the repo root with Docker up: `pnpm lint`, then `pnpm typecheck`, then `CI=true pnpm test`, then `pnpm build`. Record each exit code and the per-package totals. `CI=true` is what makes the integration files run; a run with skipped files and zero failures is UNVERIFIED. Run the four gates as one background job writing to a log file and poll it. CI creates `connect_test` itself and the whole checks job takes about 3.5 minutes.
- [x] 6.2 Run the review gate from `AGENTS.local.md` section 2: `verify-before-done`, `/ponytail-review`, `/ce-code-review`, the silent-failure hunt, the trust-rule check, `/ponytail-debt`, and `review-diff`. This change adds an admin write but no trust rule, so `/ponytail-audit` is recommended, not required.
- [x] 6.3 Confirm the diff contains only the tasks above, then write the handoff naming the PR, the merge commit, the four gate totals, the two routes, and the debt row opened.

## Decision rows to add at apply

Add each to `docs/decision-log.md` as its own row, and the debt row to `docs/known-debt.md`. They are reserved here because this propose round may create only files under `openspec/changes/`.

**D-109**

- Date: 2026-11-11
- Decision: `POST /v1/institutions` creates the institution and its domains only. The institution admin is assigned afterwards through the existing `POST /v1/admin/institutions/{id}/admins`, which this change does not modify.
- Reason: one route, one failure mode, no partial-failure rule for "institution created, admin not found".
- Status: Decided
- Affects: `institutions/onboarding`, `docs/api-contracts.md` section 5.7

**D-110**

- Date: 2026-11-11
- Decision: `name`, `kind` and `country_code` are required; `mou_signed_on` and `domains` are optional and labelled optional in the page. `min_cohort_size` is not in the body and stays null, so the suppression threshold remains 5.
- Reason: the required trio is the set of non-null columns, and a partner can be registered before the MoU is signed or the domains are known.
- Status: Decided
- Affects: `institutions/onboarding`, `packages/contracts/openapi.yaml`

**D-111**

- Date: 2026-11-11
- Decision: The institution resource lives at `/v1/institutions` for both the create and the list, guarded by `PLATFORM_ADMIN` with an enrolled second factor, rather than under `/v1/admin`.
- Reason: the actor owns the path name, as it does for `/v1/institution/...`; `/v1/admin` would misname a resource later reads may share.
- Status: Decided
- Affects: `institutions/onboarding`, `docs/auth-and-access-control.md`

**D-112**

- Date: 2026-11-11
- Decision: `GET /v1/institutions` returns every institution in one response with no pagination for the pilot, and the bound is recorded as debt.
- Reason: the pilot has one partner, and a cursor would add a second query shape and a second web state for a list that fits on one screen.
- Status: Decided
- Affects: `institutions/onboarding`, `docs/known-debt.md` (DEBT-51)

**D-113**

- Date: 2026-11-11
- Decision: `kind` is validated against the existing `institution_kind` enum values, and a domain that already exists in any letter case answers `409 INSTITUTION_DOMAIN_TAKEN` with the whole transaction rolled back. Domains are stored lower-cased.
- Reason: a free-text kind would fragment the taxonomy the dashboard groups by, and two institutions claiming one domain would make Level 1 matching arbitrary.
- Status: Decided
- Affects: `institutions/onboarding`, `docs/data-model.md`

**DEBT-51**

- Date: 2026-11-11
- Row: `GET /v1/institutions` has no pagination: it returns every institution in one response, so a deployment with many partners would return an unbounded list.
- Impact: the response grows without a bound; the page has no cursor state to add one without a contract change.
- Owner / target: the change that adds the institution dashboard (`FR-INST-02`), which needs a filtered list anyway.
- Status: Open

## Workflow follow-up

- Merge the PR with a merge commit after every check passes, then archive on its own `chore/archive-institution-onboarding` branch, because the ruleset refuses a direct push to `main`.
- At archive, confirm the new capability's requirements are synced verbatim and `openspec validate --all --strict` still passes with 40 items.
