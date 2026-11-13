# Tasks: institution-admin-assignment-ui

## 0. Preconditions

- [x] 0.1 Re-check the snapshot in `design.md`: `git log --oneline -1` (expect `3c8c571`), `git status`, `grep -n "@Post(\"admin/institutions" -A 20 services/api/src/institutions/attestation.controller.ts`, `grep -n "resolveGrantTarget" -A 22 services/api/src/institutions/drizzle-attestation.service.ts`, `sed -n '1,60p' apps/web/app/admin/institutions/page.tsx`. Verify: every line confirmed or listed as a mismatch.
- [x] 0.2 Confirm the API route is already in every registry, so this change adds none: `grep -rn "admin/institutions/:id/admins" packages/contracts/src/body-keys.ts services/api/test/authorization-matrix.test.ts services/api/test/request-validation.integration.test.ts packages/contracts/openapi.yaml`. Verify: four hits; if fewer, add the missing entries in this change and say so in the handoff.

## 1. The BFF route

- [x] 1.1 Add `apps/web/app/api/institutions/[id]/admins/route.ts` by copying `apps/web/app/api/institutions/route.ts` and replacing only the upstream path with `/v1/admin/institutions/{id}/admins`, forwarding the body unchanged and the session token through `proxyJson`. Verify: the route test asserts the upstream path, the method, the `200` passthrough, the `422` passthrough and the `403` passthrough.
- [x] 1.2 Count the relative-import depth against an existing route one level deep and state the count in a comment only if it is not `../../../..`. Verify: `pnpm --filter web typecheck` passes.

## 2. The page control

- [x] 2.1 Add the pure helper to `apps/web/lib/institutions.ts`: `adminAssignmentPayload(email)` returning the trimmed lowercase email and a validity flag, and `adminAssignmentError(status, detail)` mapping the API's existing-account message to the page's own string and any other failure to a generic one. Verify: unit tests cover a valid email, a whitespace email, the existing-account message and an unrelated message.
- [x] 2.2 Add the row control to `apps/web/app/admin/institutions/page.tsx`: an "Add admin" toggle per row, one email input, a submit disabled while the request runs, a per-row notice on success naming the returned roles, and a per-row error line. Verify: a page test reads the file and asserts the toggle, the input name, the `fetch` call to `/api/institutions/` with `/admins` appended, and the two notice branches.
- [x] 2.3 Add every string to `apps/web/lib/strings.ts` (label, help, submit, added, noAccount, failure). Verify: `grep -rn "Add admin" apps/web/app` finds no literal outside the catalog.

## 3. Tests

- [x] 3.1 Add `apps/web/test/institution-admin-form.test.ts` covering the two helpers from 2.1 and the page wiring from 2.2. Do not add a renderer: the existing page tests read the file and assert the call, and this one follows that pattern. Verify: the file passes with `pnpm --filter web test`.
- [x] 3.2 Add one API assertion only if 0.2 found a gap: an integration test that a non-admin caller is refused and that an unknown email writes nothing. If the route is already covered by `attestation.integration.test.ts`, record that file and the test name here instead of adding a duplicate.

## 4. Docs and register

- [x] 4.1 Amend `docs/functional-requirements.md` `FR-INST-01`: admins are assigned through the existing grant route after creation (D-109), the page offers the control, and the row reads complete with that narrowing named.
- [x] 4.2 Update `docs/api-contracts.md` so the grant route names its caller (the institution page) and its existing-account refusal; no schema text changes.
- [x] 4.3 Update `docs/mvp-build-plan.md` section 5 and `docs/milestones-and-phases.md` "Current state". No debt row is opened or closed; `DEBT-51` and `DEBT-46` stay untouched.

## 5. Gates, review and handoff

- [x] 5.1 Run from the repo root: `pnpm lint`, `pnpm typecheck`, `CI=true pnpm test`, `pnpm build`, each with its exit code echoed, in one background job writing to a log file. The web count must rise by the new test's cases; the API count must not change unless 3.2 added a test.
- [x] 5.2 Review gate per `AGENTS.local.md` section 2: verify-before-done, `/ponytail-review`, and the silent-failure hunt (a failed assignment must not render a success notice).
- [x] 5.3 Handoff: the BFF path, the helper behaviours, the page assertions, the four gate totals, the register row as amended, and confirmation that no API, contract or schema file changed.

## Apply record (2026-11-13)

- **0.1 confirmed**: `main` was `5daa7eb`, tree clean apart from six unapplied change directories; `POST admin/institutions/:id/admins` in `attestation.controller.ts` returns `roles`; `resolveGrantTarget` lowercases the email and refuses a missing account with `422 VALIDATION_ERROR` and the detail `email must belong to an existing account`.
- **0.2 registries**: three of the four carries the route already — `packages/contracts/src/body-keys.ts` (`["email"]`), `packages/contracts/openapi.yaml` (the path and its schema), and `authorization-matrix.test.ts` (the MATRIX row plus `AttestationController` and its providers). `request-validation.integration.test.ts` has no per-route entry by design: it derives the allowlists from `ROUTE_BODY_KEYS` and enumerates controllers, and `AttestationController` is already in its list. Nothing was added, and the suite's own "allowlisted without a route" assertion passes.
- **1.2 depth**: eight levels down from `apps/web`, so the imports are `../../../../../lib/…` — five, not the four an `api/<name>/route.ts` file needs — and the file carries a one-line comment saying so.
- **2.2 the success notice is written only after a response**: the page builds it inside the `response.ok` branch, and the failure branch maps the status and detail, so a failed assignment cannot render the success line.
- **3.2 no API test added**: `attestation.integration.test.ts` already covers the route ("a platform admin grants institution-admin, once, with one audit entry"), including the idempotent repeat; a duplicate here would assert the same behaviour twice.
- **5.1 gates**: see the handoff line below. Web 192 to 196 (+4); domain, contracts and api counts unchanged.
