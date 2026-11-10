# Tasks: abuse-reports-and-sanctions

Ordering note: the route registrations (OpenAPI path, MATRIX row, `ROUTE_BODY_KEYS` entry, module and middleware) are one task per route, because the inventory tests fail loudly and a partial apply must be visible. "Next free migration number at apply time" means whatever `drizzle-kit generate` emits; this change applies last, so the number depends on the two changes before it.

## 1. Schema

- [ ] 1.1 Add `report_kind` (`USER`, `MESSAGE`, `PROFILE`, `OUTCOME`) and `report_status` (`OPEN`, `RESOLVED`, `DISMISSED`) to `services/api/src/db/schema/enums.ts`, and the `reports` table to `platform.ts` with the fields in design D1, `reporter_user_id` and `resolved_by_user_id` referencing `users` with `ON DELETE RESTRICT`, and a bound check on `details`.
- [ ] 1.2 Add `suspended_until timestamptz NULL` to `users` in `auth.ts`, declared `input: false` like `status` and `anonymized_at`.
- [ ] 1.3 Generate the migration (next free number at apply time) and append the hand-written `GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "reports" TO connect_app;`.
- [ ] 1.4 `services/api/test/database.integration.test.ts`: update the table-count test name and assertion to the number the migration produces, add the `SET ROLE connect_app` probe for `reports`, and add the table to `truncateAll()` in `services/api/test/support/database.ts`.

## 2. Reports from a participant (test first)

- [ ] 2.1 `services/api/test/reports.integration.test.ts`: report created (`201`, row with status `OPEN`), malformed kind/id/reason (`422`), signed out (`401`), a report on a message outside the reporter's mentorship (`404`, no row), and a report on a message inside it (accepted).
- [ ] 2.2 Implement `services/api/src/reports/` (controller, service, tokens, module): `POST /v1/reports` resolving visibility per target kind through the existing services' participant checks, writing one row.
- [ ] 2.3 Register the route: `openapi.yaml` path with its body and `422`/`404`, `ROUTE_BODY_KEYS["POST /v1/reports"] = ["target_kind","target_id","reason","details"]`, the `MATRIX` row (`signed-in`, mutating), and the module/controller in `app.module.ts` (imports + `RequestIdMiddleware`).

## 3. The admin queue and the resolution (test first)

- [ ] 3.1 Same test file: queue refused without `PLATFORM_ADMIN` (`403 ROLE_REQUIRED`), refused without an enrolled second factor (`403 MFA_REQUIRED`), returned with both (keyset page), resolution once, second resolution `409`, one queued `report-resolved` email, and no reporter identity in any response or email body addressed to the target.
- [ ] 3.2 Implement the admin controller copying `review-queue.controller.ts` (cursor and limit validation, `requireRole(..., { requiresMfa: true })`) with `GET /v1/reports` and `POST /v1/reports/{id}/resolve`; the resolution is a conditional `UPDATE … WHERE status = 'OPEN'` so a second call affects zero rows and answers `409`.
- [ ] 3.3 Register both routes in the contract, `ROUTE_BODY_KEYS` (`GET` → `[]`, resolve → `["decision","reason"]`), the `MATRIX` (`PLATFORM_ADMIN`, mutating for the resolve), and the module.
- [ ] 3.4 Wire the `report-resolved` template into `email-sender.ts` and enqueue it through `EmailRequested` in the resolution transaction.

## 4. Suspension (test first)

- [ ] 4.1 `services/api/test/identity.integration.test.ts`: suspension with a reason and an end date stores `SUSPENDED` + `suspended_until`, removes two sessions in the same transaction, writes exactly one audit row, and queues one `account-suspended` email carrying the reason and the date and no reporter; a missing reason is `422` and changes nothing.
- [ ] 4.2 Extend `suspendAccount` to accept `suspendedUntil` and write it with the status; add the `account-suspended` template.
- [ ] 4.3 Implement `POST /v1/admin/accounts/{id}/suspend` in the admin controller (reason required, `end_date` optional ISO date, `PLATFORM_ADMIN` + MFA), and register it in the contract, `ROUTE_BODY_KEYS` (`["reason","end_date"]`), the `MATRIX`, and the module.
- [ ] 4.4 Web: `/admin/reports` page (queue, resolve form with reason, suspend action with reason and date), catalog strings, and the BFF routes; reuse the review-queue page shape.

## 5. The sign-in race (`DEBT-09`)

- [ ] 5.1 Unit test: a table-driven test over every `accountStatus` value asserting the post-session predicate refuses each non-`ACTIVE` status with the documented code and allows `ACTIVE`.
- [ ] 5.2 Implement the predicate and call it after `requireAccount(result.user.id)` in `signIn()`: on refusal, `revokeIssuedSession(sessionToken, requestId)` and throw the same `IdentityError` the hook would have thrown.
- [ ] 5.3 Integration test: after a successful sign-in, suspend the account and assert the issued token no longer authenticates, plus the existing "suspension revokes every session" test still passing.

## 6. The Report control

- [ ] 6.1 Render a Report control on `apps/web/app/mentorship/[id]/page.tsx`, visible only to a participant, opening a small form (reason select + optional details) that posts `/api/reports`.
- [ ] 6.2 BFF route `apps/web/app/api/reports/route.ts`; catalog strings for the control, the reasons, and the confirmation.
- [ ] 6.3 Test: `apps/web/test/report-control.test.ts` asserts the control is absent for a non-participant, present for a participant, and that a submitted report shows a confirmation rather than the report id.

## 7. Documentation

- [ ] 7.1 `docs/functional-requirements.md`: FR-ADM-04 and FR-ADM-05 marked built with what shipped and what did not (no warn, no remove, no automatic lift); FR-AUTH-10 names the new route.
- [ ] 7.2 `docs/api-contracts.md`: the four paths, their roles, the `403 ROLE_REQUIRED`/`MFA_REQUIRED` behaviour, and the `409` on a second resolution.
- [ ] 7.3 `docs/data-model.md`: the `reports` table, `users.suspended_until` labelled stored-not-enforced, and the resolution fields.
- [ ] 7.4 `docs/auth-and-access-control.md`: the admin surface, the MFA requirement, and that a break-glass read is still absent (`FR-ADM-06`).
- [ ] 7.5 `docs/known-debt.md`: close DEBT-09 with the evidence (the predicate test and the revocation test) and the honest note that the interleaving is not staged; add a row for automatic reinstatement and for the missing lift route; cross-reference DEBT-19 and DEBT-28.
- [ ] 7.6 `docs/decision-log.md` (D-87 to D-90 below), `README.md` status, `docs/mvp-build-plan.md` §5, `docs/milestones-and-phases.md`.
- [ ] 7.7 Docs-hygiene group, if `trust-surfaces` did not land it: the `docs/known-debt.md` rows for the unbuilt Must requirements, the D-79 correction, and the `Last reviewed` date.

## 8. Checks, review gate, handoff

- [ ] 8.1 Run `pnpm lint`, `pnpm typecheck`, `pnpm build`, `CI=true pnpm test`; capture each exit code and per-package counts.
- [ ] 8.2 Confirm the four route registrations exist for each new path (`openapi.yaml`, `ROUTE_BODY_KEYS`, `MATRIX`, module + middleware), the `GRANT` is in the migration, the probe covers `reports`, and no route exists without a contract entry.
- [ ] 8.3 Review gate: walk the diff against the design, verify the DEBT-09 evidence actually runs, then hand off with the gate output and every deviation from the brief.

## Decision rows to add at apply

- **D-87:** Reports live in one flat table keyed by `target_kind` + `target_id`, with one reviewer and no case object. Reason: four target kinds share one queue page and one resolution route; assignment, due dates and appeals are DEBT-28 and not in this release. Affects `trust/abuse-reports-and-sanctions`, `docs/data-model.md`, `docs/known-debt.md` (DEBT-28).
- **D-88:** Sanctions are suspend-only with a required reason and an optional `suspended_until` that is stored, shown and notified but never lifts automatically; no warn state and no remove state. Reason: a warning is an email, removal is deletion, and lifting a sanction is a decision rather than a timer. Affects `trust/abuse-reports-and-sanctions`, `docs/functional-requirements.md` FR-ADM-05, `docs/data-model.md`, `docs/known-debt.md`.
- **D-89:** DEBT-09 is closed by a post-session status re-check that revokes the just-issued session when the account is no longer `ACTIVE`; the suspension transaction was already atomic and is not what the debt described. Reason: the library owns the session insert, so the seam is a re-check, not a shared transaction. Affects `trust/abuse-reports-and-sanctions`, `identity/account-status-lifecycle` (no text change), `docs/known-debt.md` DEBT-09.
- **D-90:** Admin notices reuse the outbox with two new templates, `account-suspended` and `report-resolved`; neither names a reporter, and the reporter never learns the sanction. Reason: FR-NOT-01 requires one queued email per state change with retry, and the two recipients must not receive each other's facts. Affects `trust/abuse-reports-and-sanctions`, `docs/api-contracts.md` §5.x, `docs/functional-requirements.md` FR-NOT-01.
