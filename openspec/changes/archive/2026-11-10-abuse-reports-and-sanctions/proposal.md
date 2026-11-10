# Proposal: abuse-reports-and-sanctions

## Why

`FR-ADM-04` (abuse reporting with a moderation queue) and `FR-ADM-05` (account sanctions with a reason and an end date) are Must and unbuilt, and `FR-AUTH-10` is only half reachable: `IdentityService.suspendAccount` exists with a transaction and a test (`services/api/src/identity/better-auth-identity.service.ts:604`) but **no HTTP route calls it** — grep finds only the domain interface, the service, and `identity.integration.test.ts`. The product already carries a messaging thread between strangers, a public mentor directory, and an outcome ledger, and a student has no way to report anything; the only moderation available today is a hand-written SQL statement with no audit row and no notice to the person affected. `DEBT-09` records the matching race: the sign-in path reads the account status and then lets the library create a session, so a suspension that lands between the two can leave one live session for a suspended account.

## What Changes

- Add a `reports` table for four target kinds — user, message, profile, outcome — in one flat table (`target_kind` + `target_id`), owner decision D4, plus the tables' grant.
- Add `POST /v1/reports` for any signed-in user. A report is refused when the reporter cannot see the target, and the reported user is never told who reported them.
- Add `GET /v1/reports` and `POST /v1/reports/{id}/resolve` behind `PLATFORM_ADMIN` with an enrolled second factor, following `review-queue.controller.ts` (D-76 single reviewer, D-77 MFA). A resolution carries a written reason and a decision; the reporter is emailed that their report was resolved, without naming the sanction.
- Add `POST /v1/admin/accounts/{id}/suspend` wired to the existing `suspendAccount`, with a required reason and an optional end date. Suspension, session revocation, the audit row, and the notice email are one action; **BREAKING** for nobody, it is a new route, but it is the first admin write.
- Add `suspended_until` to `users` so an end date is represented, shown in the admin queue, and carried in the audit metadata and the user's email. Automatic reinstatement when the date passes is **not** built (see Out of scope).
- Close `DEBT-09` by re-checking the account status after the library issued the session and revoking that session when the account is no longer `ACTIVE`, so a suspension racing a sign-in cannot leave a live token.
- Add `/admin/reports` (queue + resolve + suspend) and a "Report" control on the mentorship thread.
- No new dependency. One migration.

## Capabilities

### New Capabilities

- `trust/abuse-reports-and-sanctions`: the report record and its four target kinds, who may read the queue, what a resolution is, the suspension action with its reason and end date, the session-race refusal, and the audit-and-notify rule for every admin action.

### Modified Capabilities

None. `identity/account-status-lifecycle` already requires "Suspension revokes every session" in one transaction and already refuses sign-in for `SUSPENDED`; this change adds the route and the race guard without changing that requirement's text or its scenarios. No other spec speaks about reports or sanctions.

## Impact

- **Code**: new `services/api/src/admin/` (reports controller, reports service, sanctions controller, tokens, module) or `services/api/src/reports/` for the participant-facing create route; `services/api/src/db/schema/platform.ts` (the `reports` table) and `auth.ts` (`suspended_until`); `enums.ts` (report kind and status); `services/api/src/identity/better-auth-identity.service.ts` (the post-session status re-check and the end-date argument on `suspendAccount`); `services/api/src/email/email-sender.ts` (two templates); `services/api/src/app.module.ts`; `apps/web/app/admin/reports/page.tsx` (new), `apps/web/app/mentorship/[id]/page.tsx` (the Report control), the BFF routes, `apps/web/lib/strings.ts`.
- **Tests**: new `services/api/test/reports.integration.test.ts`, extensions to `services/api/test/identity.integration.test.ts` (the post-session refusal and the end date), `services/api/test/authorization-matrix.test.ts` (four rows), `services/api/test/database.integration.test.ts` (count and probe), `packages/contracts/test/openapi.test.ts`, a web test for the admin page and the thread control.
- **API/contract**: `packages/contracts/openapi.yaml` gains four paths; `packages/contracts/src/body-keys.ts` gains each entry (`POST /v1/reports` → `target_kind`, `target_id`, `reason`, `details`; `POST /v1/reports/:id/resolve` → `decision`, `reason`; `POST /v1/admin/accounts/:id/suspend` → `reason`, `end_date`; `GET /v1/reports` → none).
- **Data**: one migration adding the `reports` table, its enums, and `users.suspended_until`, plus the hand-written `GRANT … TO connect_app` for the new table. `database.integration.test.ts` moves from twenty-nine or thirty tables at apply time — assert the number the migration produces, do not assume.
- **Docs**: `docs/functional-requirements.md` (FR-ADM-04, FR-ADM-05, FR-AUTH-10), `docs/api-contracts.md` (four paths), `docs/data-model.md` (the `reports` table, `suspension_until`, the resolution fields), `docs/auth-and-access-control.md` (the admin surface and its MFA requirement), `docs/known-debt.md` (DEBT-09 closed, DEBT-19 and DEBT-28 cross-referenced, a new row for automatic reinstatement), `docs/decision-log.md` (four rows), `docs/decision-log.md` D-79 correction if `trust-surfaces` has not landed it first, `README.md`, `docs/mvp-build-plan.md` §5, `docs/milestones-and-phases.md`.
- **Dependencies**: none added. Reuses `requireRole`, the outbox `EmailRequested` handler, and the existing `suspendAccount`.

## Depends on

- `identity/account-status-lifecycle` (archived): the `SUSPENDED` status, the sign-in refusal, and the transactional revocation this change exposes over HTTP.
- `mentorship/platform-review` (archived): the admin route pattern (`requireRole` with `requiresMfa`) this change copies.
- `platform/outbox-and-job-runner` (archived): the queued notice email.
- Nothing from `trust-surfaces` or `privacy-export-and-erasure`. It applies last in the announced order and would apply unchanged if the other two were dropped.

## Out of scope

- A "warn" state and a "remove" state (owner decision D3). A warning is an email, not a status, and removal is deletion, which `privacy-export-and-erasure` owns.
- Automatic reinstatement when `suspended_until` passes. The column is stored, shown, and audited; the job that lifts it is a debt row, because lifting a sanction is a decision, not a timer, in a pilot with one reviewer.
- Appeals (`FR-ADM-02` is Later), case assignment, due dates, SLAs and case numbers (`DEBT-28`), and break-glass thread reading (`FR-ADM-06`).
- Report controls on the directory card, the profile page, and the outcome section: the API accepts all four target kinds, and the first interface control ships on the mentorship thread where abuse between two people actually happens.
- Notifying the *target* of a report before a decision. Only a suspension is notified, with the reason.
- Any content moderation of the message itself, and any automatic sanctioning.

## Risks and rollback

| Risk | Mitigation |
|---|---|
| A report is used to harass or dox the target | The reported user is never told who reported them, the reason field is bounded, and only a platform admin with a second factor reads the queue |
| An admin suspends the wrong account | The reason is required, the action is one transaction, the notice email states the reason and the end date, and the audit row names the actor; an erroneous suspension is lifted by another audited action (out of scope here, manual until then) |
| `suspended_until` reads as an automatic expiry that does not exist | The column is documented as stored-not-enforced in `docs/data-model.md` and a debt row owns the job; the admin page labels it "suspension ends" and the notice email says the account will not be reinstated automatically until an admin acts — if apply finds that wording too strong, the label says "review date" instead |
| The sign-in race guard is untestable as an interleaving | The rule ships as a pure status predicate with an exhaustive unit test, plus the existing "suspension revokes every session" integration test; the design states plainly that the interleaving itself is not deterministically reproducible against the identity library |
| The first admin write route breaks the three registrations the repo requires | The OpenAPI path, the MATRIX row, and `ROUTE_BODY_KEYS` are one task each, and the inventory tests fail loudly if one is missed |

Rollback: revert the commit and drop the two tables/column if the migration ran. Reports written before rollback are lost with the table; that is acceptable because the pilot has no other consumer of them. No existing row is modified except `users.suspended_until`, which reverts to its default.

**Traces to** FR-ADM-04 (abuse reporting and moderation), FR-ADM-05 (sanctions with reason and end date), FR-AUTH-10 (suspension revokes every session), FR-NOT-01 (one queued email per state change), FR-AUD-01 (audit of admin actions); SEC-* none new; ADR-008 (append-only audit), ADR-018 (Drizzle); D-87 to D-90 (this change's decisions); DEBT-09 (closed here), DEBT-19 and DEBT-28 (bounded, not built), D-76 and D-77 (the single reviewer and the MFA rule this change follows).
