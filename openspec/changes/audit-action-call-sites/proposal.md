# Proposal: audit-action-call-sites

## Why

`FR-AUD-01` asks for an append-only, searchable entry for every listed action, and `docs/auth-and-access-control.md` section 12 is the list. The register calls the row Partial for one reason: the documented list is still ahead of its call sites. Comparing the two, most actions are written from the transaction that records the fact, three documented actions have no code path at all, and two have a real path and no audit row: a data export, and a permission denial on a sensitive action. A third gap turned up while comparing: the read filter's closed action list omits `ACCOUNT_WARNED` and `ACCOUNT_REINSTATED`, which two writers already emit, so the admin page refuses those filters with `422`.

## What Changes

- `POST /v1/privacy/export` appends one `DATA_EXPORTED` row inside the export's own transaction, after the `privacy_requests` row, so a failed export leaves neither.
- A denial on a sensitive action (a platform-admin or institution-admin route) appends one `PERMISSION_DENIED` row from the exception filter, naming the caller, the route and the required role. A denial on an ordinary role route writes nothing.
- `AUDIT_ACTIONS` gains `DATA_EXPORTED`, `PERMISSION_DENIED`, `ACCOUNT_WARNED` and `ACCOUNT_REINSTATED`, so the admin filter accepts every action a writer emits.
- Section 12 marks the documented actions that have no code path yet as not applicable, each with the requirement that will build it, and `FR-AUD-01` moves to Done because every documented action with a code path now writes its row.
- No migration, no new route, no new column.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. Both deltas are added requirements in the capability that owns the surface: `trust/privacy-export-and-erasure` for the export entry, `trust/consent-and-audit-records` for the denial and for the list-versus-code rule.

## Impact

- **Code**: `services/api/src/privacy/drizzle-privacy.service.ts` (the export entry and the fault-injection seam), `services/api/src/http/problem-details.filter.ts` (the denial branch), `services/api/src/http/request-id.middleware.ts` (two optional request fields), `services/api/src/authorization/authorize.ts` (the note), `services/api/src/app.module.ts` (the filter's writer), `services/api/src/audit/audit.service.ts` (the action list).
- **Tests**: `services/api/test/privacy.integration.test.ts` (the row and its rollback), `services/api/test/reports.integration.test.ts` (a denial is recorded), `services/api/test/requests.integration.test.ts` (an ordinary role denial is not), `services/api/test/support/api-stack.ts` (the filter's writer in the test stack).
- **API/contract**: no route or body change. `GET /v1/admin/audit` accepts four more action values.
- **Data**: none.
- **Docs**: `docs/auth-and-access-control.md` section 12, `docs/functional-requirements.md` (`FR-AUD-01`, section 2.16), `docs/data-model.md` (the authentication-events line), `docs/decision-log.md`, `docs/mvp-build-plan.md`, `docs/milestones-and-phases.md`.

## Depends on

- `audit-log-search` (archived 2026-11-13): the read and its closed action list.
- `privacy-export-and-erasure` (archived 2026-11-10): the export transaction this change writes into.
- `sanction-lifecycle-warn-and-lift` (archived 2026-11-13): the two actions the read list is missing.
- `role-authorization` (archived 2026-11-05): `requireRole` and `requireInstitutionAdmin`, the refusal path this change records.

## Out of scope

- Building any action that has no code path: no password-change route, no lockout, no role revocation, no affiliation override, no admin removal, no configuration table, no evidence upload, no institution-level student-data view.
- Recording a denial on an ordinary role route (a mentor calling a student route), which is not a sensitive action and would flood the log.
- A hash chain (FR-AUD-02), retention, or a new index (`DEBT-58` stays open).
- Notifying anyone about a denial.

## Risks and rollback

| Risk | Mitigation |
|---|---|
| An audit write on the refusal path turns a `403` into a `500` | The filter writes after the response is determined, catches its own failure and logs it; the status and body are unchanged either way, which a test pins |
| The export entry could appear inside the exported document | The document reads `audit_logs` before the entry is appended, and a test asserts the export's own row is absent from it |
| A denial row could disclose which role a caller lacks | The row is admin-only and names the required role, which is the same fact the `403` body already carries |
| Every denial on every admin route doubles the rows in the log | Only the two admin roles are recorded; the volume is bounded by real denials, and a test asserts an ordinary role refusal writes nothing |

Rollback: remove the two call sites and the four action values. No data changes.
