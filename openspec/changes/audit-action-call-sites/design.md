# Design: audit-action-call-sites

## Context

**Repository snapshot (re-verified 2026-11-14 at propose).**

- Base: `main` at `24ca085` after `suspended-account-directory-exclusion`; `openspec validate --all --strict` passes; 664 tests.
- The documented list is `docs/auth-and-access-control.md` section 12 (seven categories) plus the events named in `docs/data-model.md`; `FR-AUD-01` and `SEC-LOG-1` point at it.
- `appendAuditEntry` (`services/api/src/identity/audit-log.ts`) writes `action`, `actorUserId`, `actorRole`, `objectType`, `objectId`, `requestId`, `reason`, `breakGlass`, `metadata`, and its `AuditAction` union is the closed set of actions.
- Call sites found by `grep -rn "appendAuditEntry" services/api/src`: identity sign-in/out, MFA, reset, role grant, provider sign-in; consent; affiliations; attestation; institutions; mentorship break-glass; outcomes; the outcome sweeper; reports (resolve, warn, reinstate); privacy deletion. Nothing writes a data export, and nothing writes a denial.
- `exportAccount` (`services/api/src/privacy/drizzle-privacy.service.ts` line 69) opens a repeatable-read transaction, reads every section including `audit_logs` (line 107), inserts one `privacy_requests` row (line 216) and returns the document. `PrivacyOptions` carries `database`, `secret` and an optional `now`.
- `requireRole` and `requireInstitutionAdmin` (`services/api/src/authorization/authorize.ts`) throw `ROLE_REQUIRED` or `MFA_REQUIRED`; `ProblemDetailsFilter` maps both to `403` and is registered as `APP_FILTER` with `useClass` (`services/api/src/app.module.ts` line 82) and constructed directly in four tests and in `test/support/api-stack.ts` line 187.
- `AUDIT_ACTIONS` (`services/api/src/audit/audit.service.ts`) omits `ACCOUNT_WARNED` and `ACCOUNT_REINSTATED` although `drizzle-reports.service.ts` writes both.

## Goals / Non-Goals

**Goals**

- Every documented action that has a code path writes exactly one row, in the transaction of the fact it records, or on the refusal path for a denial.
- The admin filter accepts every action the writers use.
- The documented list says which actions have no code path yet, so the register's claim is checkable.

**Non-Goals**

- No new feature is built to make an action auditable: a documented action with no code path is marked, not invented.
- No denial rows for ordinary role refusals, no notification, no hash chain, no index, no retention.

## Decisions

The brief fixed the comparison method, the same-transaction rule, the no-invention rule and the metadata rule. Decisions taken here carry `R` numbers.

### R1. `DATA_EXPORTED` is appended inside the export transaction, after the document is read

The entry goes after the `privacy_requests` insert and before the return, with `actorUserId` and `objectId` both the caller, `objectType` `users`, the request id, and no metadata: the export already records its version on `privacy_requests`. The document's `audit_entries` section is read earlier in the same transaction, so the row is not inside the document it describes, and a failed insert rolls back both rows. Alternative rejected: writing it after the transaction commits, which would leave an export that was delivered but not recorded, or recorded but refused.

### R2. The export service takes an audit writer as an option, defaulting to the real one

`PrivacyOptions` gains an optional `auditWriter` function (the database and one entry in, a promise of nothing out), defaulted to `appendAuditEntry` and used by both `exportAccount` and `deleteAccount`. This is the seam `BetterAuthIdentityService` already exposes for the same reason: a test can fail one action and prove the transaction rolls back, which a successful write cannot prove. Alternative rejected: wrapping the database in the test, which cannot reach the transaction's own `tx`.

### R3. A denial is recorded by the exception filter, not by `requireRole`

`requireRole` has no database handle and adding one to every caller would touch eight controllers for one row. Instead `actingAccountWithRoles` notes `{ userId, roles }` on the request, `requireRole` (and the institution-scope refusal) notes that this was a sensitive denial and which role was required, and `ProblemDetailsFilter` — which already owns the refusal response and its `requestId` — appends one `PERMISSION_DENIED` row for a `ROLE_REQUIRED` or `MFA_REQUIRED` error that carries that note. The filter's writer is optional so the three unit-style filters in the tests keep working unchanged; `app.module.ts` supplies it through a factory with the `DATABASE` token, and the integration stack supplies it too, so the behaviour under test is the behaviour in production.

A sensitive action is one that requires `PLATFORM_ADMIN` or `INSTITUTION_ADMIN`; the note is only written for those two roles, so a mentor calling a student route writes nothing. Alternative rejected: recording every `403`, which logs routine role mistakes and makes the log useless for its purpose.

### R4. The row names the route in metadata, never a body

`objectType` is `users` and `objectId` is the caller, because the caller is the object that was refused; `metadata` carries `{ method, path, required_role }` and nothing from the request body. The read projection never selects `metadata`, so this is for a future investigator, not the page.

### R5. A failed denial write is logged, not surfaced

The filter catches a failure of its own audit write, logs it with the request id, and still returns the `403` it already decided. Failing the response because the log could not be written would turn a refusal into an outage; the opposite (silently ignoring) is what the log line prevents.

### R6. The documented list is annotated where no code path exists

Section 12 gains a short list of documented events that no code path emits yet, each with the requirement that will build it: password change, lockout, role revoked, affiliation overridden, admin removal (D-142), configuration change (FR-ADM-07), evidence viewed (DEBT-22), and institution-level student-data view. The section keeps the table it has; the annotation is a second paragraph, so a reader can tell policy from code. `FR-AUD-01` then reads Done under the brief's rule — every documented action with a code path is covered.

## Assumptions

1. A `DATA_EXPORTED` row per export (not per document section) is the intended granularity, matching "one row per fact".
2. The denial is a fact even though nothing was written: the row records an attempted sensitive action, which is what the section 12 Authorization category asks for.
3. The person behind a denial is the account whose session the request carried; an anonymous caller cannot reach these routes because the role check runs after the session check.

## Acceptance criteria

1. `POST /v1/privacy/export` writes exactly one `DATA_EXPORTED` row with the caller as actor and the response's request id, and the exported document does not contain that row.
2. An export whose audit insert fails writes no `privacy_requests` row and no `DATA_EXPORTED` row; the response is the same `500` family as any other failure.
3. A platform-admin route called without an enrolled second factor answers `403 MFA_REQUIRED` and appends one `PERMISSION_DENIED` row naming the caller and the route; the same route called by a mentor answers `403` and appends one row too.
4. A mentor calling a student route answers `403 ROLE_REQUIRED` and appends no `PERMISSION_DENIED` row.
5. `GET /v1/admin/audit?action=ACCOUNT_WARNED` and `?action=DATA_EXPORTED` return `200`, not `422`.
6. `grep -c "appendAuditEntry" services/api/src` names the new call sites, and the whole suite is green with the same number of skipped tests as before (zero).

## Risks

- The filter now writes on a refusal path that every admin test exercises; the change to `test/support/api-stack.ts` must pass the writer or the integration tests will assert nothing.
- A denial row could double-count when a route checks the role twice; `grep` shows each route calls `requireRole` once per handler, and a test counts the rows.
