# Design: institution-admin-assignment-ui

## Context

**Repository snapshot (verified 2026-11-12, re-check at apply).**

- `main` is at `3c8c571`, clean, 37 specs valid; CI run `43208893367` succeeded. No gate run in this propose round.
- `services/api/src/institutions/attestation.controller.ts` line 75 declares `@Post("admin/institutions/:id/admins")`, guarded by `requireRole(..., "PLATFORM_ADMIN", { requiresMfa: true })`, body key `email`, returning `{ roles: string[] }`.
- `resolveGrantTarget` (`services/api/src/institutions/drizzle-attestation.service.ts` line 221) trims and lowercases the email, refuses an unknown institution with `IdentityError("SESSION_NOT_FOUND")`, and refuses an unknown email with `IdentityError("VALIDATION_ERROR", "email must belong to an existing account")`.
- `apps/web/app/admin/institutions/page.tsx` already has: a list read through `/api/institutions`, a create form, a `state` machine with `loading`, `loadError`, `signedOut`, `mfaRequired`, `ready`, an `empty` line, and a `message` notice.
- `apps/web/app/api/institutions/route.ts` is the existing BFF route for that page (GET and POST); a per-institution route is new and will sit one segment deeper (`apps/web/app/api/institutions/[id]/admins/route.ts`).
- `docs/functional-requirements.md` `FR-INST-01` (line 219) already records the partial state and D-109.

## Goals / Non-Goals

**Goals**

- A platform admin can nominate an institution admin by email from the page they already use.
- The existing refusal surfaces as a readable field error.
- The register stops describing the clause as unmet when it is met by a route plus a control.

**Non-Goals**

- No invite flow, no admin list, no removal, no API or contract change.

## Decisions

The brief fixed the scope; decisions taken here carry `R` numbers.

### R1. The control is a row-level disclosure, not a new page

Each institution row gains an "Add admin" toggle that reveals one email input and a submit. Alternative rejected: a second page or a modal, which would need its own route, its own state machine and its own test for one field; the page already owns two forms and the pattern.

### R2. The page sends an email, never a user id

The API resolves the email, so a typo can only produce a `422`, never a grant to a different account. Alternative rejected: a user search and picker, which needs a new read route over accounts.

### R3. No API or contract change at all

The route, its guard, its body key and its four registry entries exist and are tested. Alternative rejected: adding `admin_emails` to the create call, which the brief rejects and which would make institution creation a multi-fact write with a partial-failure mode.

### R4. The amendment is a register correction, not a new decision

`FR-INST-01` is edited to name the grant route and cite D-109. Alternative rejected: leaving the row partial, which would keep a Must scored at half for a clause the owner has already decided to satisfy another way.

## Assumptions

1. An admin assigned this way is expected to have registered already; the pilot's first admin does. This is the D-109 consequence and is stated in the register row.
2. The institution list does not need to show which admins exist for this change to close the row; the response names the roles granted.

## Acceptance criteria

1. `grep -n "admins" apps/web/app/api/institutions/\\[id\\]/admins/route.ts` shows the upstream path `/v1/admin/institutions/{id}/admins`.
2. A page test asserts the control renders per row, that submit posts the email, that a `422` with the existing-account message renders the page's own string, and that a success renders the notice.
3. `git diff --name-only` contains no file under `services/api/src`, `services/api/drizzle`, or `packages/contracts`.
4. `FR-INST-01` names the grant route and D-109 and reads as complete.

## Risks

- A page test cannot render, so the wiring assertions read the file and assert the call, following the existing page-test pattern; the task says so explicitly to stop anyone adding a renderer.
- The BFF depth is `../../../..` from `apps/web/app/api/institutions/[id]/admins/route.ts`; miscounting it is the usual failure and the task requires counting it against an existing route at the same depth.
