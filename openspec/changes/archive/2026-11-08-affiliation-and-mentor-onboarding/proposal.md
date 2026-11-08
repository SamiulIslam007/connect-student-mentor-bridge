# Proposal

## Why

A mentor cannot become operational. `mentor_profiles.status` is written once as `DRAFT` and no code path moves it, no affiliation row exists in any table, and the seeded institutions have no claim flow — the affiliation-seed capability explicitly forbids one. Every later change (requests #7, discovery #6, reputation #10) is gated on Level 1 affiliation and on an activated mentor, so this is the blocker in front of the product's spine.

## What Changes

- Add the `affiliations` table with the canonical `affiliation_kind`, `affiliation_level`, `affiliation_method`, and `affiliation_status` enums (migration `0009`, plus the hand-written `connect_app` grant).
- Add `POST /v1/me/affiliations`: the caller claims one institution. When the caller's verified email domain is a registered `institution_domains` row, the claim is granted `LEVEL_1` / `VERIFIED` / `INSTITUTIONAL_EMAIL` immediately; otherwise it stays `LEVEL_0` / `PENDING`. Idempotent per institution. A claim for a different institution revokes the previous verified affiliation and suspends Level 1 until re-verified (FR-PROF-05).
- Add `mentor_profiles.onboarding_status` (`APPLIED` -> `EMAIL_VERIFIED` -> `AFFILIATION_VERIFIED`) and the operating-status transitions `DRAFT` -> `PENDING` -> `ACTIVE`, recomputed when the affiliation, the second factor, or the `MENTOR` role changes. `activated_at` is set once.
- Extend `GET /v1/me` with the caller's affiliations and with `status` and `onboarding_status` on the mentor profile.
- Extend the checked-in seed with a pilot placeholder domain (`example.edu.bd`) and an attestation source that writes `VERIFIED` / `ADMIN_ATTESTATION` affiliation rows for named pilot accounts. No admin route, no admin page, no separate CLI (D-56).
- Add a minimal affiliation section to `/profile` so a signed-in user can claim and see their status, with every string in the string catalog.
- Update `docs/api-contracts.md` §5.2 to record that the institution-admin approve/reject rows are deferred to the future admin surface, and `docs/data-model.md` to mark the columns this change does not create.

## Capabilities

### New Capabilities

- `institutions/affiliation-verification`: claiming an affiliation, the automatic Level 1 grant on a registered institutional email domain, the seeded attestation path, and the re-claim that suspends the previous Level 1. Traces to FR-VER-01, FR-VER-04 (gate only), FR-PROF-05.
- `profiles/mentor-onboarding`: the stored onboarding progress and the operating status of a mentor, computed from Level 1 affiliation plus an enrolled second factor. Traces to FR-PROF-02, FR-PROF-03 (partial, see Out of scope).

### Modified Capabilities

- `institutions/affiliation-seed`: the requirement **No affiliation claim flow yet** is replaced. That requirement forbids exactly the endpoint this change adds, so it cannot stay as written; the seed capability keeps only its reference-data and idempotency requirements.

## Impact

- **Code:** `packages/domain/src/` gains `affiliation.ts` and `mentor-onboarding.ts`; `services/api/src/` gains an `affiliations` module and one `syncMentorActivation` call site in profiles; `apps/web/` gains one route handler, one profile section, and strings. `packages/contracts/openapi.yaml` gains the endpoint and the two `GET /v1/me` additions.
- **Data:** one migration (`affiliations` plus four enums plus two `mentor_profiles` columns). No existing row is rewritten; the backfill for existing mentor profiles sets `onboarding_status = APPLIED` and leaves `status` at `DRAFT`.
- **Config:** none. Attestation records are checked-in source, not environment values.
- **Dependencies:** none added.
- **Docs:** `data-model.md` §4.1/§5.1/§5.2, `api-contracts.md` §5.2, `auth-and-access-control.md` §7, `functional-requirements.md` (FR-VER-01/04, FR-PROF-03 build notes), `docs/known-debt.md`, `mvp-build-plan.md` §5 row #5, `milestones-and-phases.md` Current state.

## Out of scope

- **Discovery (#6)** and every consumer of the Level 1 gate: the gate is computed and stored here, and enforced in #7. Nothing yet reads it.
- **Institution-admin approve/reject endpoints and any admin page or CLI** (D-56). Pending claims have no decision path in this change; the pilot's Level 1 comes from the seed.
- **Mentor agreements and orientation** (FR-PROF-03's consent half). Activation requires Level 1 and an enrolled second factor only; `VOLUNTEER_AGREEMENT` and `COMMUNITY_GUIDELINES` consent rows are still never written, so `orientation_completed_at` and `student_profiles.onboarding_completed_at` are not created. Recorded as debt, not silently dropped.
- **Level 2 employer-email verification** (FR-VER-03), affiliation expiry (an open decision in `data-model.md` §4.3), verified badges and their disclaimer (FR-VER-05), and mentor certificates (D-55, no requirement, table, route, or field).
- **`current_role_title` / `current_organization`** on `mentor_profiles`: not required by any FR and not needed by the activation gate.

## Risks and rollback

| Risk | Mitigation |
|---|---|
| A mentor reaches `ACTIVE` without accepting the volunteer agreement | Deliberate, owner-scoped exception recorded as debt with an owning change; the activation predicate is one pure function, so adding the consent clause later is one line plus a test |
| `ACTIVE` written from three call sites drifts | One exported `syncMentorActivation(userId)`; the three callers pass no policy of their own, and a test asserts each path reaches the same state |
| A user claims an institution whose domain they do not control | Level 1 is granted only from the **verified** account email's domain; an unverified email never auto-grants |
| Placeholder domain seen as a real partnership | `example.edu.bd` is reserved for documentation; the seed comment (D-57) and `local-setup.md` say so |
| Re-claim revokes Level 1 for an active mentor with live mentorships | No live mentorships exist before #7; the rule is restated in #7 for the case where they do |

**Rollback:** revert the change. The migration is additive, so `git revert` plus a forward migration that drops `affiliations` restores the previous schema; nothing else reads the new columns.

**Traces to** FR-VER-01, FR-VER-04, FR-PROF-01 (institution affiliation part), FR-PROF-02, FR-PROF-03 (Level 1 + MFA half), FR-PROF-05, FR-AUTH-04, SEC-AUTH-2, SEC-DATA-1, ADR-018, ADR-003, D-02, D-38, D-47, D-55, D-56, D-57, D-58.
