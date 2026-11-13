# Proposal: institution-admin-assignment-ui

## Why

`FR-INST-01` is Must and says a platform admin creates an institution "with its registered email domains, MoU date, Institution Admin users". The route that assigns an admin exists (`POST /v1/admin/institutions/{id}/admins`, built by `institution-admin-attestation`), and it refuses an email with no account. But no screen reaches it: the admin page lists institutions and creates them, and nothing anywhere lets the admin it just appointed be nominated. The clause is met by an API and not by a user.

## What Changes

- Add an "Add admin" control to each institution row on `/admin/institutions`: an email input, a submit, a confirmation notice, and a field-level error for an email with no account.
- Add the BFF route `POST /api/institutions/{id}/admins` forwarding to the existing API route. No API change.
- Surface the existing refusal clearly: an email with no account shows "no account uses this address" rather than a generic failure.
- Amend `FR-INST-01` to say admins are assigned through the existing grant route after creation, which is the recorded decision (D-109), instead of "in the same call".
- No contract change, no migration, no schema change, no new API route.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `institutions/onboarding`: one requirement is added for assigning an institution admin from the institution page, over the existing grant route.

## Impact

- **Code**: `apps/web/app/admin/institutions/page.tsx` (one form per row), `apps/web/app/api/institutions/[id]/admins/route.ts` (new), `apps/web/lib/institutions.ts` (a pure payload and refusal formatter), `apps/web/lib/strings.ts`.
- **Tests**: `apps/web/test/institution-admin-form.test.ts` (new, pure helper and page wiring); the existing `apps/web/test/institution-onboarding*.test.ts` stays untouched unless it freezes the page's element list.
- **API/contract**: none. The API route and its `email` body key already exist and are already in all four registries.
- **Data**: none.
- **Docs**: `docs/functional-requirements.md` (`FR-INST-01` complete with the amendment), `docs/api-contracts.md` (the grant route now has a named caller), `docs/mvp-build-plan.md` section 5, `docs/milestones-and-phases.md`.
- **Dependencies**: none added.

## Depends on

- `institution-admin-attestation` (archived 2026-11-11): the grant route, `resolveGrantTarget` and its existing-account refusal.
- `institution-onboarding` (archived 2026-11-12): the page this control lands on and its row shape.

## Out of scope

- Inviting an email that has no account (invite mail, a pending-admin table, an acceptance token) — a decision recorded at D-109 and repeated here.
- Listing the admins of an institution: no read route exists for role assignments and adding one is a different change.
- Removing an admin, transferring an admin, or scoping an admin to more than one institution.
- Pagination of the institution list (`DEBT-51`).

## Risks and rollback

| Risk | Mitigation |
|---|---|
| The control grants the role to the wrong account | The API resolves the email to an id and refuses an unknown one; the page never sends a user id, so a typo can only produce a refusal, never a grant to an unintended id |
| A platform admin's UI grants a role silently | The response is a confirmation notice naming the institution, and the grant writes an audit row already; the page shows the returned role list |
| The refusal is indistinguishable from a network failure | The page maps the API's `422 VALIDATION_ERROR` with the message about an existing account to its own string, and a test word-asserts it |
| The amendment reads as scope creep into FR-INST-01 | The amendment cites D-109 and leaves the rest of the row untouched; the proposal states it as a register correction, not a new decision |

Rollback: delete the BFF route and the control; revert the register row.

**Traces to** FR-INST-01 (the admin-users clause, amended to D-109); D-103 (the grant route), D-109 (no invite mail); DEBT-51 (untouched).
