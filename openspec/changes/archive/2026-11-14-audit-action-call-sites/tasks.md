# Tasks: audit-action-call-sites

## 0. Preconditions

- [x] 0.1 Re-check the snapshot in `design.md`: `git log --oneline -1` (expect `24ca085`), `grep -rn "appendAuditEntry" --include=*.ts services/api/src`, `sed -n '60,230p' services/api/src/privacy/drizzle-privacy.service.ts`, `sed -n '55,95p' services/api/src/authorization/authorize.ts`, `sed -n '50,90p' services/api/src/http/problem-details.filter.ts`, `sed -n '1,40p' services/api/src/audit/audit.service.ts`. Verify: every claim confirmed or listed as a mismatch.
- [x] 0.2 Build the documented-list table from `docs/auth-and-access-control.md` section 12 and record, in this file, one line per documented action: the writing call site, or "no code path" with the requirement that will build it.

## Documented list against the code (task 0.2)

| Documented event | Call site, or why none |
|---|---|
| Sign-in success and failure | `better-auth-identity.service.ts` `SIGN_IN_SUCCEEDED`, `SIGN_IN_FAILED` |
| MFA enrolled or removed | `MFA_ENROLLED`, `MFA_DISABLED`, plus `MFA_VERIFIED`, `MFA_VERIFICATION_FAILED` |
| Password change | no change-password route in the product |
| Password reset request and completion | `PASSWORD_RESET_REQUESTED`, `PASSWORD_RESET_COMPLETED` |
| Session revoked | `SESSION_REVOKED` on the revoke route, `SIGNED_OUT`, `SIGNED_OUT_EVERYWHERE` |
| Lockout | no lockout mechanism; throttling answers `429` |
| Role granted or revoked | `ROLE_GRANTED`; no revocation route exists |
| Permission denied on a sensitive action | **added here**: `PERMISSION_DENIED` (D-152) |
| Affiliation approved, rejected, overridden | `AFFILIATION_GRANTED`, `AFFILIATION_REJECTED`, `AFFILIATION_REVOKED`; no override route |
| Outcome confirmed, disputed, escalated, reviewed, withdrawn, clawed back | the six `OUTCOME_*` actions in their transitions |
| Consent given or withdrawn | `CONSENT_GRANTED`, `CONSENT_WITHDRAWN`, `ORIENTATION_COMPLETED` |
| Data export | **added here**: `DATA_EXPORTED` (D-151) |
| Deletion request and completion | `ACCOUNT_DELETED` plus one `privacy_requests` row |
| Break-glass access | `THREAD_BREAK_GLASS_READ` |
| Suspension, warning, lift | `ACCOUNT_SUSPENDED`, `ACCOUNT_WARNED`, `ACCOUNT_REINSTATED` |
| Admin removal | out of the MVP (D-142) |
| Configuration change | `FR-ADM-07` is not started; no configuration table |
| Evidence file viewed | no evidence file exists (`DEBT-22`) |
| Student-level data viewed by an institution admin | no such route |

## 1. The data export entry

- [x] 1.1 Add `auditWriter` to `PrivacyOptions` (defaulting to `appendAuditEntry`) and use it for the existing `ACCOUNT_DELETED` write and the new one. Verify: `deleteAccount` keeps its behaviour and the option is optional.
- [x] 1.2 Append `DATA_EXPORTED` after the `privacy_requests` insert inside `exportAccount`, with the caller as actor and object, the request id, and no metadata. Verify: the document's `audit_entries` is read before the insert, so the row is not inside it.
- [x] 1.3 Tests in `services/api/test/privacy.integration.test.ts`: one row per export with the request id and the caller; the document does not contain its own row; a failing writer (the new seam) leaves no `privacy_requests` row and no audit row.

## 2. The denial entry

- [x] 2.1 Extend `RequestWithId` with the optional actor note and denial note; set the actor in `actingAccountWithRoles`.
- [x] 2.2 Note a sensitive denial in `requireRole` for a missing role and for a missing second factor, and in `requireInstitutionAdmin` for an empty scope, only when the required role is `PLATFORM_ADMIN` or `INSTITUTION_ADMIN`.
- [x] 2.3 Add the optional writer to `ProblemDetailsFilter` and the `PERMISSION_DENIED` branch for a `ROLE_REQUIRED` or `MFA_REQUIRED` error carrying the note; catch and log a failure without touching the response.
- [x] 2.4 Provide the writer in `app.module.ts` through a factory with `DATABASE`, and in `test/support/api-stack.ts` with the stack's own database.
- [x] 2.5 Tests: one denial on an admin route with and without a second factor writes one row naming the caller; a mentor on a student route writes none; a failing writer leaves the `403` unchanged.

## 3. The action list

- [x] 3.1 Add `DATA_EXPORTED`, `PERMISSION_DENIED`, `ACCOUNT_WARNED` and `ACCOUNT_REINSTATED` to `AUDIT_ACTIONS`. Verify: the filter accepts all four and still refuses an unknown value.

## 4. Docs and register

- [x] 4.1 `docs/auth-and-access-control.md` section 12: add the not-applicable-yet paragraph naming each documented action with no code path and the requirement that owns it.
- [x] 4.2 `docs/functional-requirements.md`: `FR-AUD-01` becomes Done with the evidence, and section 2.16 recomputes (register 54.0 / 64, code-only 53.0 / 64 — confirm by counting, do not assume).
- [x] 4.3 `docs/data-model.md`: the authentication-events line names the two new actions. `docs/known-debt.md`: no new row unless the work opens one; state the outcome in the report.
- [x] 4.4 Decision rows `D-151` to `D-153` (full text at the end of this file), `docs/mvp-build-plan.md` section 5 and `docs/milestones-and-phases.md`.

## 5. Gates, review and handoff

- [x] 5.1 `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm exec openspec validate --all --strict`, and `CI=true pnpm test` (background, polled), each with its exit code. Record per-package totals including skipped.
- [x] 5.2 Mutation check: remove the `DATA_EXPORTED` write and confirm the export test fails; remove the denial branch and confirm the denial test fails. Restore both.
- [x] 5.3 Review gate: line-by-line pass on the diff, then an independent adversarial pass (a filter that writes on a refusal path is the specific risk).

## Decision rows to add at apply

**D rows (numbers assigned at apply: D-151 to D-153)**

- Decision: a data export appends one `DATA_EXPORTED` row inside its own transaction, after the export document is read and beside the `privacy_requests` row, so the two succeed or fail together.
- Decision: a refusal on a platform-admin or institution-admin route appends one `PERMISSION_DENIED` row from the exception filter, naming the caller, the route and the required role; an ordinary role refusal writes none, and a failed write never changes the response.
- Decision: the documented audit list marks the events that no code path emits yet, and `FR-AUD-01` reads Done when every documented action with a code path writes its row; the admin filter accepts every action the writers use.
- Affects: `trust/privacy-export-and-erasure`, `trust/consent-and-audit-records`, `docs/auth-and-access-control.md`, `docs/functional-requirements.md`
