# Proposal: audit-log-search

## Why

`FR-AUD-01` is Must and says "an immutable, searchable entry is written in the same transaction". The write half is built and enforced by grant: `audit_logs` is insert-and-select only for the application role, and every state change appends one row inside its transaction. The read half does not exist at all: no route reads `audit_logs`, so "searchable" is currently false, and an incident review has to open a SQL console. The pilot gate and `SEC-AC-4` both assume a reviewer can answer "who did what, when, and why" without one.

## What Changes

- Add `GET /v1/admin/audit`: a platform-admin read with an enrolled second factor, keyset-paginated, filtered by actor, action, object type, object id, and an occurrence date range.
- Fix the projection to ids and the reason text: audit id, occurrence time, actor user id, actor role, action, object type, object id, request id, break-glass flag and reason. `metadata` is never returned, because it can hold free text and no requirement authorises disclosing it.
- Add `/admin/audit` with the filters, the result table and the same state pattern the other admin pages use, plus its BFF route.
- Do not audit the read itself: no `AUDIT_LOG_READ` row (decided; see design R4).
- No migration: the two existing indexes cover the actor and object filters, and the identifier is the primary key.
- One new capability, because the append-only rule and the audit-write requirements live in `trust/consent-and-audit-records` and are not changing.

## Capabilities

### New Capabilities

- `trust/audit-log-inspection`: the read contract over the audit log — who may read, what projection, which filters, and what is deliberately excluded.

### Modified Capabilities

None. `trust/consent-and-audit-records` keeps its append-only and write-time requirements unchanged; no requirement there states that the log is unreadable.

## Impact

- **Code**: `services/api/src/audit/` (new: controller, service interface, drizzle service, tokens, module) following the `reports/admin.controller.ts` split; `apps/web/app/admin/audit/page.tsx` (new), `apps/web/app/api/admin/audit/route.ts` (new), `apps/web/lib/audit.ts` (new), `apps/web/lib/strings.ts`, `apps/web/app/session-nav.tsx` (one admin link, gated the way the other admin links are).
- **Tests**: new `services/api/test/audit-read.integration.test.ts`; edited `services/api/test/authorization-matrix.test.ts` and `request-validation.integration.test.ts` (controller and provider lists), `apps/web/test/audit-page.test.ts` (new helper and wiring).
- **API/contract**: one path and one schema in `packages/contracts/openapi.yaml`; no body key (a GET has no body).
- **Data**: none. `audit_logs` already carries every returned column and the two indexes the filters need.
- **Docs**: `docs/functional-requirements.md` (`FR-AUD-01` complete for the read half), `docs/api-contracts.md` (the route and its projection), `docs/auth-and-access-control.md` (who may read the log), `docs/security-requirements.md` (`SEC-AC-4`'s review loop points at the page), `docs/known-debt.md` (no row today records this gap — one is opened for the missing action filter index if the reviewer wants it, see design R5), `docs/decision-log.md`, `docs/mvp-build-plan.md`, `docs/milestones-and-phases.md`.

## Depends on

- `trust/consent-and-audit-records` (archived 2026-11-10): the append-only audit log and its columns.
- `identity/role-authorization` (archived 2026-11-05): `requireRole` with `requiresMfa` and the admin-page pattern.
- `trust/break-glass-thread-read` (`break-glass-thread-read`, archived 2026-11-12): the `break_glass` and `reason` values this read surfaces.

## Out of scope

- Full-text search over `metadata`, reason or any free text.
- Export, retention, or deletion of audit rows (append-only; retention is `DEBT-32`).
- A per-object timeline embedded in other admin pages.
- Auditing the audit read (decision R4).
- Any change to what is written, or to the append-only grants.

## Risks and rollback

| Risk | Mitigation |
|---|---|
| The read becomes a way to harvest personal data | The projection excludes `metadata` and any free-text column other than `reason`, which is already the audit row's own stated purpose; a test freezes the key set |
| A filter enables an unbounded scan | Keyset pagination with a 100-row cap and a default of 50, and a date range is optional but bounded when present |
| An action filter has no index and a pilot-size table makes it moot | Recorded as `R5`: measured, and a debt row states the bound rather than adding an index the pilot does not need |
| The admin page implies a search it does not do | The page says "filters", not "search"; the strings are checked in the page test |
| Reason text leaks a reporter's identity | Reasons are written by admins and already stated not to name a reporter; the test asserts a queue-free row renders its reason and no email |

Rollback: delete the module, the page and the BFF route; drop the contract path. No data changes.

**Traces to** FR-AUD-01, FR-ADM-01 (the review loop this serves), FR-THR-03 and FR-ADM-06 (break-glass rows now readable); SEC-AC-4, SEC-AC-6; D-89 (the actor and request id on each row).
