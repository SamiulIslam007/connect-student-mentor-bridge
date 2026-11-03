# Proposal

## Why

Sprint 1's checkpoint is "a new user can sign up, pass the 18+ gate, and create a student or mentor profile with a self-created field". Everything except the profile exists: registration creates an account, email verification activates it, and `GET /v1/me` returns the account record. A verified user still cannot state a goal, a headline, or the field they want help in.

Every later capability attaches to a role profile or a field. Affiliation claims (change #5), discovery and matching (change #6), requests (#7), and reputation (#10) have nothing to key on until this change lands. Fields also have to be dynamic from the first write (D-08): a fixed list would need migrating away later, and a wrong normalizer would permanently fragment the taxonomy that reputation is keyed on, because `field_id` is the matching key.

## What Changes

- Adds six tables and one migration: `fields`, `student_profiles`, `student_field_interests`, `mentor_profiles`, `mentor_fields`, and the `field_status` and `mentor_status` enums.
- Adds a pure field normalizer (trim, NFKC, case-fold, collapse separators) so "Data science", "data-science", and "DATA SCIENCE" resolve to one row.
- Adds `PUT /v1/me/student-profile` and `PUT /v1/me/mentor-profile`, full-replace saves that derive the acting user from the session only.
- Adds `GET /v1/fields`, which lists the active field taxonomy for the pick-or-create control.
- Extends `GET /v1/me` with the caller's own `student_profile` and `mentor_profile` (nullable) through a new `MeResponse` schema. `AccountSummary`, shared with the sign-in response, is unchanged.
- Field names are the input; creation happens only as a side effect of a profile save (`primary_field: "Data science"`, `interest_fields: ["AI"]`). There is no `POST /v1/fields`.
- Adds one profile page with a student section and a mentor section, its BFF routes, and the string-catalog entries.
- Fixes documentation that is currently wrong about this area: `uuid` user keys, missing enums, the duplicated mentor primary-field representation, the unverified-user line in `auth-and-access-control.md`, the `If-Match` references, and Sprint 1's requirement list.

**No breaking changes.** `GET /v1/me` gains two nullable properties; existing clients that ignore unknown properties are unaffected.

## Capabilities

### New Capabilities

- `profiles/dynamic-fields`: how a typed field name becomes one canonical `fields` row, which names collide, how the taxonomy is listed, and why no fixed list exists.
- `profiles/student-and-mentor-profiles`: saving and reading a student and a mentor profile, their required and optional content, the weekly capacity bound, and who may read or write them.

### Modified Capabilities

- `profiles/profile-bootstrap`: the clause that no endpoint may expose profile fields "until a later capability adds them" is satisfied by this capability; `GET /v1/me` now carries the caller's profiles, and `account_status` submitted to a profile update is still ignored.

## Impact

- **Schema:** six tables plus `field_status` and `mentor_status`, delivered as one forward-only Drizzle migration. `availability_windows` is **not** created here; its enum `availability_context` is documented now to avoid churn.
- **Domain:** `packages/domain/src/fields.ts` (normalizer) and `packages/domain/src/profiles.ts` (validation rules, `MENTOR_WEEKLY_CAPACITY_MAX`). Both pure, with unit tests.
- **API:** new `profiles` module, `GET /v1/fields`, and the `GET /v1/me` extension. No new dependency; validation reuses the existing `IdentityError("VALIDATION_ERROR")` mapping to `422 VALIDATION_FAILED`.
- **Web:** one `/profile` page, three BFF routes, and string-catalog entries.
- **Contract:** `packages/contracts/openapi.yaml` gains the two PUTs, `GET /v1/fields`, `MeResponse`, and the profile schemas.
- **Docs:** `data-model.md`, `api-contracts.md`, `auth-and-access-control.md`, `milestones-and-phases.md`, `mvp-build-plan.md`, `decision-log.md`, `README.md`.
- **Tests:** domain unit tests, DB-backed API integration tests, contract tests, and web route tests. `identity.integration.test.ts`'s exact-key-set assertion changes by design.

## Out of Scope

Fenced deliberately; each item has a named home.

- Optional institution affiliation, program, department, and batch year on the student profile → change #5 (`affiliation-and-mentor-onboarding`), because they live in `affiliations`.
- Mentor onboarding: volunteer agreement, conflict-of-interest policy, community guidelines, orientation, and the MFA gate → change #5.
- Profile visibility to other users and the public mentor profile → Sprint 2 (`access-google-mfa-and-sessions` scope, FR-PROF-04).
- Capacity enforcement, the capacity lock, and `CAPACITY_BELOW_ACTIVE` → change #7 (`requests-and-capacity`). This change stores the cap and validates its bounds only.
- "A paused mentor is hidden from discovery" → change #6, which owns discovery.
- `availability_windows`, availability validation, its UI, `access_mode`, and the pause/resume endpoints → the follow-up change `profile-availability-and-access-mode`. **No availability or access-mode code ships here.**
- Field merge, rename, and retirement workflows → Phase 1b (D-23). The `RETIRED` value exists in the enum; nothing writes it yet.
- Search, filtering, or pagination on `GET /v1/fields` → Phase 1b if the list grows.

FR-PROF-01 and FR-PROF-02 are therefore **partially** satisfied by this change: the profile content and the capacity bound are buildable now; affiliation (FR-PROF-01), the suggestions feed (FR-PROF-01), capacity enforcement (FR-PROF-02), and paused-hides-from-discovery (FR-PROF-02) belong to the changes above. FR-PROF-05's affiliation re-verification is #5; this change ships the edit surface it will hook.

## Risks

- **`GET /v1/me` is a shared contract.** Extending `AccountSummary` would make the sign-in response untruthful. Mitigation: a separate `MeResponse`; `AccountSummary` untouched.
- **Concurrent field creation.** Two users typing the same new name at once could create duplicates. Mitigation: unique `normalized_slug` plus an upsert that returns the existing row.
- **Unicode normalization.** Bangla field names must not collapse to an empty slug. Mitigation: NFKC and case-folding (not ASCII transliteration), with Bangla test cases.
- **An existing test asserts the exact `/v1/me` key set.** It will fail after this change. That is a conformance edit, not a regression, and must be updated with the new full key set rather than weakened.

## Rollback

Revert the branch. The migration is additive (new tables and enums only) and rewrites no existing row, so a rollback leaves `users`, `sessions`, `consent_records`, and `audit_logs` untouched. No production data exists. Reverting the contract and docs is part of the same revert.

**Traces to:** FR-PROF-01, FR-PROF-02 (partial, see Out of Scope), FR-PROF-05 (edit surface), FR-AUTH-06, FR-AUTH-07, FR-AUTH-08; D-08, D-23, D-36; ADR-003, ADR-018; SEC-API-1.
