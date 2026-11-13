# Tasks: consent-purposes-and-mentor-agreements

## 0. Preconditions

- [x] 0.1 Re-check the snapshot in `design.md`: `git log --oneline -1` (expect `3c8c571`), `git status`, `grep -n "consentPurpose" -A 8 services/api/src/db/schema/enums.ts`, `grep -n "consentRecords" -A 16 services/api/src/db/schema/trust.ts`, `grep -rn "mfaEnrolled" services/api/src`, `grep -n "GRANT SELECT, INSERT ON TABLE" services/api/drizzle/0000_baseline.sql`. Verify: every line confirmed or listed as a mismatch in the handoff.
- [x] 0.2 Grep every caller of the activation predicate before editing it: `grep -rn "activationFor\|activation" services/api/src --include=*.ts | grep -v test`. Write the list into this file; a missed caller leaves a path to `ACTIVE` without consent.
- [x] 0.3 Grep the test files that build a Nest module containing `MeController` or `ProfilesController`, since both gain an injected dependency: `grep -ln "MeController\|ProfilesController" services/api/test/*.ts`. Add the new provider token to each in the same change.

## 1. Migration

- [x] 1.1 Add `orientationCompletedAt: timestamp("orientation_completed_at", { withTimezone: true })` (nullable) to `mentor_profiles` in `services/api/src/db/schema/profiles.ts`, then `pnpm --filter api db:generate` to produce `services/api/drizzle/0018_*.sql`. Verify: the generated file contains one `ALTER TABLE "mentor_profiles" ADD COLUMN "orientation_completed_at"` and no `DROP`, no enum change and no backfill.
- [x] 1.2 Confirm no grant is needed (no new table) and that `docs/data-model.md` section 5.2 gains the column with its meaning. Verify: `grep -n "orientation_completed_at" docs/data-model.md services/api/drizzle/0018_*.sql` shows both.

## 2. The consent module

- [x] 2.1 Add `services/api/src/consent/` with `consent.controller.ts`, `consent.service.ts` (interface), `drizzle-consent.service.ts`, `consent.tokens.ts` and `consent.module.ts`, registered in `app.module.ts`, following the `privacy` module split. Verify: `pnpm --filter api typecheck` passes and the module resolves in the integration stack.
- [x] 2.2 Implement `GET /v1/me/consents`: the five purposes, each with `current_version`, `accepted_version` (nullable), `action` (nullable), `institution_id` (nullable) and, for a data-sharing purpose, the caller's affiliations with their institution names. Verify: an integration test asserts the exact key set and that no other account's row appears.
- [x] 2.3 Implement `POST /v1/me/consents`: validate `purpose` against the enum, `action` against `GRANTED` and `WITHDRAWN`, a non-empty `document_version` of at most 32 characters, and `institution_id` required only for `INSTITUTION_DATA_SHARING` and resolved to an institution the caller has an affiliation with (`404` otherwise). Append one `consent_records` row and one audit row (`CONSENT_GRANTED` or `CONSENT_WITHDRAWN`) in one transaction. Verify: a test asserts the row counts, the audit action, and that an unknown purpose, a bad action, a missing institution and an unaffiliated institution each answer `422` or `404` with no row written.
- [x] 2.4 Stamp the orientation: when the accepted purpose is `VOLUNTEER_AGREEMENT` and `mentor_profiles.orientation_completed_at` is null for the caller, set it once in the same transaction and append one `ORIENTATION_COMPLETED` audit row. Verify: accepting twice a day apart keeps the first timestamp and writes two audit rows.
- [x] 2.5 Add `CONSENT_GRANTED`, `CONSENT_WITHDRAWN` and `ORIENTATION_COMPLETED` to `AuditAction` in `services/api/src/identity/audit-log.ts`. Verify: the compiler names every consumer and typecheck passes.

## 3. The activation gate

- [x] 3.1 Extend `mentor-activation.ts` with `hasVolunteerAgreement`, `hasCommunityGuidelines` and `orientationCompleted` inputs and the widened predicate, keeping the returned shape. Verify: unit tests cover the four combinations that must stay `PENDING` and the one that becomes `ACTIVE`.
- [x] 3.2 Fill the three inputs in `services/api/src/profiles/drizzle-profiles.service.ts` at every call site named in 0.2, from one query over `consent_records` plus the profile row. Verify: `grep -rn "hasVolunteerAgreement" services/api/src` shows every call site filled, and `pnpm --filter api typecheck` passes.
- [x] 3.3 Update the demo seed so its mentor holds both agreements and the orientation, and so its admins are unaffected. Verify: `pnpm --filter api db:seed:demo` followed by a read shows the mentor `ACTIVE`.

## 4. Contract and the four registries

- [x] 4.1 Add `GET /v1/me/consents` and `POST /v1/me/consents` to `packages/contracts/openapi.yaml` with their schemas and their `200`/`401`/`404`/`422` responses. Verify: `pnpm --filter @connect/contracts test` passes.
- [x] 4.2 Add `"POST /v1/me/consents": ["purpose", "action", "document_version", "institution_id"]` to `packages/contracts/src/body-keys.ts`. Verify: the parity test passes.
- [x] 4.3 Add both routes to the `MATRIX` in `services/api/test/authorization-matrix.test.ts` with `access: "signed-in"`, the write marked `mutating: true`, plus the controller and its provider tokens in that file's lists. Verify: the matrix test passes.
- [x] 4.4 Add the controller and its provider tokens to the controller and provider lists in `services/api/test/request-validation.integration.test.ts`. Verify: no "allowlisted without a route" and no "route without an allowlist".

## 5. The web surface

- [x] 5.1 Add the BFF route `apps/web/app/api/me/consents/route.ts` (GET and POST) by copying the nearest `/api/me/...` route and replacing only the upstream path; never hand-write an Authorization header. Verify: the route test asserts forwarding, the `422` passthrough and the `401` passthrough.
- [x] 5.2 Add `apps/web/lib/consents.ts` with pure helpers: which purposes a caller can hold, the version-mismatch predicate, and the label/state text per purpose. Verify: unit tests cover a mentor, a student with an affiliation, a student without one, and a matching and a stale version.
- [x] 5.3 Add `apps/web/app/consent/page.tsx`: one section per purpose the caller can hold, each with the document title, its version, an accept and a withdraw control, a loading state, an error state and a confirmation notice. Verify: a page test reads the file and asserts the fetch calls, the conditional sections and the presence of the three state strings.
- [x] 5.4 Add the re-acceptance banner: `apps/web/app/session-nav.tsx` (or the account page) renders a link to `/consent` when any purpose is stale, using the version-mismatch helper. Verify: a unit test asserts the banner text appears for a stale version and not for a matching one.
- [x] 5.5 Add every string to `apps/web/lib/strings.ts`. Verify: `grep -rn "volunteer agreement" apps/web/app` finds no literal outside the catalog.

## 6. Docs and register

- [x] 6.1 Update `docs/functional-requirements.md`: `FR-CONS-01` built (five purposes, append-only, re-acceptance), `FR-CONS-02` built (grant and withdrawal per institution, affiliation untouched), `FR-PROF-03` built (Level 1, second factor, two agreements, orientation).
- [x] 6.2 Update `docs/known-debt.md`: close `DEBT-18` and `DEBT-36` with their evidence, and add no new row unless a gap remains (state which).
- [x] 6.3 Update `docs/api-contracts.md` (two routes, their refusals and the one-transaction rule), `docs/auth-and-access-control.md` (the activation predicate), `docs/data-model.md` (the column), `docs/pilot-plan.md` line 89 (name `/terms`, `/privacy`, `/consent`).
- [x] 6.4 Add the decision rows to `docs/decision-log.md` (full text at the end of this file) and update `docs/mvp-build-plan.md` section 5, `docs/milestones-and-phases.md` "Current state" and the `README.md` status line.

## 7. Gates, review and handoff

- [x] 7.1 Run from the repo root with Docker up, as one background job writing to a log file: `pnpm lint`, `pnpm typecheck`, `CI=true pnpm test`, `pnpm build`, each with its exit code echoed. Record per-package totals; a run with skipped integration files is UNVERIFIED.
- [x] 7.2 Review gate per `AGENTS.local.md` section 2: verify-before-done, `/ponytail-review`, the silent-failure hunt (a consent write that fails silently is the specific risk), the trust-rule check and `/ponytail-debt`.
- [x] 7.3 Independent second review in a fresh context over the diff, the two delta specs and the new tests; require explicit answers on: can any path reach `ACTIVE` without the three new inputs, can a withdrawal change an affiliation, and can a signed-in user write a consent for another account.
- [x] 7.4 Write the handoff: PR, merge commit, the four gate totals, the register rows flipped, the debt rows closed, and any assumption in `design.md` the apply contradicted.

## Decision rows to add at apply

**D rows (numbers assigned at apply, next free block in `docs/decision-log.md`)**

- Decision: One signed-in consent route pair (`GET` and `POST /v1/me/consents`) serves all five purposes; the purpose enum is the only source of valid values and no new enum value is added.
- Decision: The orientation is `mentor_profiles.orientation_completed_at` plus an `ORIENTATION_COMPLETED` audit row, not a consent purpose.
- Decision: Re-acceptance is a read-only signal on the own account read plus a banner; no route refuses a stale document version.
- Decision: The activation predicate takes the consents as inputs and stays pure; no backfill writes a consent nobody gave, so an already-`ACTIVE` profile keeps its status until its next re-evaluation.
- Affects: `trust/consent-purposes`, `profiles/mentor-onboarding`, `docs/data-model.md`, `docs/auth-and-access-control.md`

## Apply record (2026-11-13)

- **0.1 confirmed**: `main` was `1669e86` (this round's second merge), tree clean apart from seven unapplied change directories; the five `consent_purpose` values and both `consent_action` values were already in the enum; `consent_records` and its index unchanged; `activation` reads in `onboarding/mentor-activation.ts`; `consent_records` holds `SELECT, INSERT` only.
- **0.2 callers of the activation predicate**: six — `affiliations/drizzle-affiliations.service.ts` (claim), `institutions/drizzle-attestation.service.ts` (institution-admin decision), and `identity/better-auth-identity.service.ts` at four second-factor and role-grant points. All six go through `syncMentorActivation`, so the three inputs are filled there once.
- **0.3 the blast radius was not the controllers.** The consent routes live in a new `ConsentController`, so `MeController` and `ProfilesController` gained no dependency and the fourteen test stacks named by this task did not change. What did change is every fixture that drives a mentor to `ACTIVE`: `attestation`, `requests`, `mentorship`, `outcomes` and `reputation` each build one through the API, so `services/api/test/support/agreements.ts` grants the two consents and the orientation and each `activeMentor`-shaped helper calls it. That is the honest cost of a trust rule.
- **1.1** `drizzle-kit generate` produced `0018_many_gabe_jones.sql`: one `ALTER TABLE "mentor_profiles" ADD COLUMN "orientation_completed_at" timestamp with time zone` and nothing else. No grant (no new table). The dev database needed `pnpm --filter api db:migrate` before the seed could run.
- **2.4** accepting twice keeps the first timestamp and writes one `ORIENTATION_COMPLETED` row plus one `CONSENT_GRANTED` row per acceptance.
- **3.3** `SEED_DEMO_MENTORS=1 pnpm --filter api db:seed:demo` reported `inserted 0, skipped 2` because both demo mentors already existed, so the seed gained an idempotent `grantDemoAgreements` for an existing demo mentor; a read then showed `ACTIVE`, `oriented t`, `consents 2` for both. Demo data only: no migration writes a consent row for a real account (D-130).
- **5.4** a `/consent` nav entry was added as well as the banner, because the banner is the only other route to the page and it renders only when a version is stale.
- **7.1 gates**: see the handoff block below.
