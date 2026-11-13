# Proposal: consent-purposes-and-mentor-agreements

## Why

`FR-CONS-01` is Must and half built: only `TERMS` and `PRIVACY_NOTICE` are recorded, so `VOLUNTEER_AGREEMENT` and `COMMUNITY_GUIDELINES` are never written and `FR-PROF-03`'s activation gate cannot require them (DEBT-18). `FR-CONS-02` — revocable student consent for institution data sharing — does not exist at all (DEBT-36). Gate 2 names the gap directly: "Consent screens live for the five MVP purposes; append-only records verified" (`docs/pilot-plan.md` line 89).

## What Changes

- Record all five MVP consent purposes through one signed-in route: `GET /v1/me/consents` (each purpose, its current document version, and whether the caller's latest record matches it) and `POST /v1/me/consents` (purpose, document version, action `GRANTED` or `WITHDRAWN`). Every write appends one `consent_records` row and one audit row.
- Add one consent screen at `/consent` that renders the volunteer agreement and the community guidelines for a mentor and the institution data-sharing consent for a student, each with an accept and a withdraw control. Terms and the privacy notice keep their published pages (`/terms`, `/privacy`), which completes the five.
- Gate mentor activation on the volunteer agreement, the community guidelines and a recorded orientation acknowledgement, in addition to Level 1 and an enrolled second factor. Add `mentor_profiles.orientation_completed_at`.
- Grandfather already-`ACTIVE` mentor profiles: the gate runs at activation and on the events that already re-evaluate it, never as a data migration of existing rows.
- Institution data-sharing consent is per institution, granted and withdrawn by the student; a withdrawal clears only the sharing flag and never revokes an affiliation.
- A document version bump surfaces a banner with a link to `/consent`; it never blocks the app. Re-acceptance is in scope.
- One migration: `mentor_profiles.orientation_completed_at`.
- No change to the registration consent check, to the published documents, or to any existing route's shape.

## Capabilities

### New Capabilities

- `trust/consent-purposes`: recording, revoking, versioning and serving consent for the three purposes the registration flow does not cover, and the re-acceptance signal when a version changes.

### Modified Capabilities

- `profiles/mentor-onboarding`: the operating predicate gains the two agreement consents and the orientation acknowledgement; the requirement that records the un-gated state is removed and replaced by the gated one.

## Impact

- **Code**: `services/api/src/consent/` (new: controller, service interface, drizzle service, tokens, module) following the `privacy` module split; `services/api/src/onboarding/mentor-activation.ts` (predicate input); `services/api/src/profiles/drizzle-profiles.service.ts` (the activation sync reads the consents); `services/api/src/me/me.controller.ts` (re-acceptance signal); `services/api/src/db/schema/profiles.ts` (one column); `apps/web/app/consent/page.tsx` (new), `apps/web/app/api/me/consents/route.ts` (new), `apps/web/lib/consents.ts` (new), `apps/web/lib/strings.ts`, `apps/web/app/profile/page.tsx` and `apps/web/app/session-nav.tsx` (banner).
- **Tests**: new `services/api/test/consents.integration.test.ts`; edited `services/api/test/authorization-matrix.test.ts` and `request-validation.integration.test.ts` (route registries), `services/api/test/profiles.integration.test.ts` (the activation predicate), `services/api/test/database.integration.test.ts` (only if a column probe exists for it), `apps/web/test/consent-screen.test.ts` (new).
- **API/contract**: two paths in `packages/contracts/openapi.yaml` and their body keys in `packages/contracts/src/body-keys.ts`; one nullable `orientation_completed_at` on the mentor onboarding read.
- **Data**: one migration adding `mentor_profiles.orientation_completed_at`; no new table, so no new grant.
- **Docs**: `docs/functional-requirements.md` (`FR-CONS-01`, `FR-CONS-02`, `FR-PROF-03` built), `docs/known-debt.md` (DEBT-18 and DEBT-36 closed), `docs/data-model.md` (the column), `docs/api-contracts.md` (two routes), `docs/auth-and-access-control.md` (the activation predicate), `docs/pilot-plan.md` (the Gate 2 consent line points at `/consent`), `docs/decision-log.md`, `docs/mvp-build-plan.md` section 5, `docs/milestones-and-phases.md`.

## Depends on

- `trust/consent-and-audit-records` (archived 2026-11-10): `consent_records`, its purpose enum and the append-only rule the new route reuses.
- `profiles/mentor-onboarding` (archived 2026-11-08): the activation predicate this change extends.
- `identity/role-authorization` (archived 2026-11-05): the session guard and `requireRole`.

## Out of scope

- A quiz or a scored orientation: the acknowledgement is a stored timestamp plus an audit row.
- `INSTITUTION_DATA_SHARING` reads by an institution — no institution-level student data surface exists (FR-INST-02 is Later), so the consent is recorded and enforced by absence, not consumed.
- Consent for employers (Phase 3) and for AI processing (never).
- Per-purpose withdrawal audit reports or a consent history page.
- Any change to `CONSENT_DOCUMENT_VERSION` or to the document text.

## Risks and rollback

| Risk | Mitigation |
|---|---|
| The new gate deactivates real mentors on deploy | The predicate is evaluated at activation and on the existing re-evaluation events; no row is rewritten by the migration, so an already-`ACTIVE` profile stays `ACTIVE`, and a test asserts it |
| A student withdraws consent and loses their affiliation | The withdrawal writes only a `WITHDRAWN` consent row; a test asserts the `affiliations` rows are byte-identical before and after |
| Re-acceptance becomes a hard block and locks users out | The banner is informational and the signal is read-only; a test asserts no route refuses because of a stale version |
| Two consent routes drift from the append-only rule | Both writes go through the existing `consent_records` insert path; the capability spec states insert-only for the app role, and the database probe already covers the table |
| A dev or demo account stops working | The demo seed grants the two new consents and the orientation for its mentor, in the same change |

Rollback: revert the migration (drop the column), delete the module and the page. Consent rows written before a rollback stay as history, which is correct.

**Traces to** FR-CONS-01, FR-CONS-02, FR-PROF-03 (and FR-AUTH-04's second factor through the existing predicate); SEC-AC-5; DEBT-18, DEBT-36 (closed); D-82 (registration consent, unchanged).
