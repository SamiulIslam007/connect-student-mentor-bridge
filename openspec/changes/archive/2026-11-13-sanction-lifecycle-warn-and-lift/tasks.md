# Tasks: sanction-lifecycle-warn-and-lift

## 0. Preconditions

- [x] 0.1 Re-check the snapshot in `design.md`: `git log --oneline -1` (expect `3c8c571`), `git status`, `sed -n '55,130p' services/api/src/reports/admin.controller.ts`, `grep -n "suspendedUntil" services/api/src/db/schema/auth.ts services/api/src/reports/drizzle-reports.service.ts`, `sed -n '55,95p' services/api/src/platform/outbox/outbox-worker.ts`. Verify: every line confirmed or listed as a mismatch.
- [x] 0.2 Grep the test files that hand-build a module containing `ReportsAdminController` (a new injected dependency breaks them): `grep -ln "ReportsAdminController" services/api/test/*.ts`. Add the provider token to each in this change.
- [x] 0.3 Read the suspend path end to end (controller, service, transaction, audit action, template key) and write the exact sequence into this file, so the lift reuses it rather than re-deriving it.

## 1. Actions, templates, the shared service method

- [x] 1.1 Add `ACCOUNT_WARNED` and `ACCOUNT_REINSTATED` to `AuditAction` in `services/api/src/identity/audit-log.ts`. Verify: the compiler names every consumer and typecheck passes.
- [x] 1.2 Add the `account-warned` and `account-reinstated` templates beside `account-suspended`, each carrying the reason and, for the reinstated one, the end date that passed. Verify: `grep -rn "account-warned\|account-reinstated" services/api/src` shows the template key and its one caller each.
- [x] 1.3 Implement `warnAccount` and `liftSuspension` in `services/api/src/reports/drizzle-reports.service.ts` per `design.md` R1-R4: one transaction each, the lift a single conditional update with a `RETURNING`, the warning a no-op on the account row, both writing one audit row and one outbox event. Verify: unit-level assertions on the returned discriminator for a lifted row, a zero-row lift and a warning.

## 2. The two routes

- [x] 2.1 Add `POST /v1/admin/accounts/:id/warn` to `services/api/src/reports/admin.controller.ts` behind `requireRole(..., "PLATFORM_ADMIN", { requiresMfa: true })`, `@Throttle({ default: RATE_LIMITS.write })`, with a required `reason` of 1 to 1000 characters. Verify: typecheck passes and the refusal for an empty reason is `422` naming `reason`.
- [x] 2.2 Add `POST /v1/admin/accounts/:id/reinstate` the same way, mapping a zero-row update to `409 ACCOUNT_NOT_SUSPENDED`. Verify: typecheck passes and the conflict path is asserted in the integration test.
- [x] 2.3 Add the warning count to the report-queue projection: one grouped count over `audit_logs` for the page's account ids, exposed as `warning_count`. Verify: the reports integration test asserts the field for an account with two warnings and zero for one with none, and that the rest of the queue key set is unchanged apart from the addition.

## 3. The expiry job

- [x] 3.1 Add `services/api/src/reports/sanction-expiry.ts` with `liftExpiredSuspensions(database, now)`: selects at most 50 `SUSPENDED` rows whose stored end date is at or before the current instant, and lifts each through `liftSuspension` in its own transaction with `source: "job"`. Verify: an integration test covers the passed date, the null date, the future date, two consecutive runs and the concurrent-suspension case from the delta spec.
- [x] 3.2 Register the queue in `services/api/src/platform/outbox/outbox-worker.ts`: `ACCOUNT_SANCTION_QUEUE` with `boss.work` and `boss.schedule("*/15 * * * *")`, following the two existing queues. Verify: `grep -n "ACCOUNT_SANCTION_QUEUE" services/api/src` shows the export, the `work` call and the `schedule` call, and a live worker start logs the registration.

## 4. Contract and registries

- [x] 4.1 Add both paths to `packages/contracts/openapi.yaml` with their body schemas (`reason`) and their `200`/`401`/`403`/`404`/`409`/`422` responses, and the `warning_count` property on the report-queue schema. Verify: `pnpm --filter @connect/contracts test` passes.
- [x] 4.2 Add both routes to `packages/contracts/src/body-keys.ts` with `["reason"]`. Verify: the parity test passes.
- [x] 4.3 Add two `MATRIX` rows to `services/api/test/authorization-matrix.test.ts` with `access: "PLATFORM_ADMIN"`, `mutating: true` and a body probe carrying a reason. Verify: the matrix test passes.
- [x] 4.4 Add nothing to the request-validation controller list if `ReportsAdminController` is already there; confirm with a grep and record the result. Verify: no "allowlisted without a route".

## 5. The web controls

- [x] 5.1 Add the BFF routes `apps/web/app/api/admin/accounts/[id]/warn/route.ts` and `.../reinstate/route.ts` by copying the suspend route and replacing only the upstream path; never hand-write an Authorization header. Verify: route tests assert forwarding and the `409` and `422` passthroughs.
- [x] 5.2 Extend the row disclosure in `apps/web/app/admin/reports/page.tsx` with a Warn control (reason input) and a Reinstate control (reason input, rendered only when the row's account is suspended), and show `warning_count` on the row. Verify: a page test reads the file and asserts the two controls, their conditional render and the count.
- [x] 5.3 Add the strings. Verify: `grep -rn "Warn\|Reinstate" apps/web/app` finds no literal outside the catalogue.

## 6. Docs and register

- [x] 6.1 Amend `docs/functional-requirements.md` `FR-ADM-05` to "warn, suspend, lift", name removal as out of MVP by decision, and mark the row complete for that scope.
- [x] 6.2 Close `DEBT-40` in `docs/known-debt.md` with its evidence (the route, the job, the tests) and open a row only if a gap remains, naming it.
- [x] 6.3 Update `docs/api-contracts.md` (two routes, their refusals, the derived warning count), `docs/auth-and-access-control.md` (the lift), `docs/data-model.md` (the count is derived from audit rows, said so).
- [x] 6.4 Add the decision rows to `docs/decision-log.md` (full text at the end of this file), and update `docs/mvp-build-plan.md` section 5 and `docs/milestones-and-phases.md`.

## 7. Gates, review and handoff

- [x] 7.1 Run from the repo root: `pnpm lint`, `pnpm typecheck`, `CI=true pnpm test`, `pnpm build`, each with its exit code echoed, in one background job writing to a log file. Record per-package totals; the API and web counts must both rise.
- [x] 7.2 Review gate per `AGENTS.local.md` section 2: verify-before-done, `/ponytail-review`, the silent-failure hunt (a job that logs and continues is the specific risk), the trust-rule check, and an independent second review over the two transitions and the job's bounds.
- [x] 7.3 Handoff: the routes, the job and its schedule, the two templates, the derived count, the four gate totals, the register row as amended, `DEBT-40` closed, and the live-worker registration evidence from 3.2.

## Decision rows to add at apply

**D rows (numbers assigned at apply, next free block in `docs/decision-log.md`)**

- Decision: The warning count is derived from `ACCOUNT_WARNED` audit rows; no new column and no new table.
- Decision: One `liftSuspension` service method serves the admin route and the scheduled job; the route may lift any `SUSPENDED` account, the job only one whose end date has passed.
- Decision: The lift is a single conditional update; a suspension with no end date is never lifted by the job.
- Decision: Removal is out of the MVP, and `FR-ADM-05` is amended to "warn, suspend, lift".
- Affects: `trust/abuse-reports-and-sanctions`, `docs/functional-requirements.md`, `docs/data-model.md`, `docs/known-debt.md`
