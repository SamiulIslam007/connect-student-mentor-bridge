# Proposal: privacy-export-and-erasure

## Why

`FR-PRIV-01` (export) and `FR-PRIV-02` (deletion) are both Must and both unbuilt: the API has no privacy route, no privacy table, and the account page has no control. `docs/api-contracts.md` lines 406–408 document three endpoints that do not exist, and `packages/contracts/openapi.yaml` deliberately omits them. The schema already constrains the answer in one direction — `audit_logs` and `consent_records` reference `users` with `ON DELETE RESTRICT` (migration `0004_audit_fk_restrict.sql`), and `trust/consent-and-audit-records` states that user deletion "SHALL be implemented as pseudonymization in the privacy change" — so account deletion must be a tombstone, not a delete. A pilot partner's data-protection review asks for exactly these two capabilities before any real student registers.

## What Changes

- Add `POST /v1/privacy/export`: a signed-in user receives their own data as one JSON document, returned synchronously with `Cache-Control: no-store` and `Content-Disposition: attachment`. No object storage, no signed URL, no S3 client (owner decision D2). Secrets and credentials are excluded; other people's rows are excluded.
- Add `POST /v1/privacy/delete`: a signed-in user tombstones their own account in one transaction (owner decision D1) — the `users` row keeps its id, the email is replaced with the existing HMAC-SHA256 hash, display and profile personal columns are replaced with neutral placeholders, the user's message bodies are replaced with a fixed tombstone string, every session row is deleted, `account_status` becomes `ANONYMIZED`, one audit entry is appended, and **no ledger, verification, reputation, or audit row is updated or deleted**.
- Add a `privacy_requests` tracking table (kind, status, requested and completed timestamps) so a request is a record and not only a response — the second table in this release to need a hand-written `GRANT` to `connect_app` and a `database-probe` row.
- Add two controls to `/account` with their BFF routes, the strings, and the refusal states.
- Reconcile `docs/api-contracts.md`: the three documented privacy endpoints become one built export, one built delete, and one deferred download route with the reason.
- Rate-limit the export route with its own bucket (`SEC-ABUSE-2`, bulk collection) rather than sharing the generic write bucket.
- No new dependency. One migration.

## Capabilities

### New Capabilities

- `trust/privacy-export-and-erasure`: the shape of the exported document, what deletion erases and what it must never touch, the tracking record, and the refusals for a suspended or already-deleted account.

### Modified Capabilities

None. No existing requirement contradicts a tombstone: `trust/consent-and-audit-records` already requires `ON DELETE RESTRICT` and names pseudonymization as the deletion mechanism, and `identity/account-status-lifecycle` already refuses sign-in for `ANONYMIZED`. The one interaction needing a written interpretation — `mentorship/thread-and-sessions` says a message "SHALL NOT accept … edits", which this change reads as *no participant edit route*, not as a ban on erasure — is stated in the design and is not a requirement change.

## Impact

- **Code**: new `services/api/src/privacy/` (controller, service, tokens, module), `services/api/src/db/schema/trust.ts` or a new `privacy.ts` (the `privacy_requests` table), `services/api/src/app.module.ts` (module registration, request-id middleware), `services/api/src/identity/better-auth-identity.service.ts` (the email-hash helper becomes shared, currently `:997`), `packages/config/src/index.ts` (the export bucket), `apps/web/app/account/page.tsx`, two new BFF routes under `apps/web/app/api/privacy/`, `apps/web/lib/strings.ts`.
- **Tests**: a new `services/api/test/privacy.integration.test.ts` whose first test is delete-with-ledger-intact, `services/api/test/database.integration.test.ts` (the table count in the test name, the probe row, and `truncateAll`), `services/api/test/authorization-matrix.test.ts` (two rows), `packages/contracts/test/openapi.test.ts` (the two paths and their body keys).
- **API/contract**: `packages/contracts/openapi.yaml` gains `POST /v1/privacy/export` and `POST /v1/privacy/delete`; `packages/contracts/src/body-keys.ts` gains `POST /v1/privacy/delete` (`confirm_email`) and `POST /v1/privacy/export` (empty).
- **Data**: one migration adding `privacy_requests` plus the hand-written `GRANT SELECT, INSERT, UPDATE, DELETE ON "privacy_requests" TO connect_app` and the probe row. No existing table changes. `database.integration.test.ts` asserts the total table count, so its name and assertion move from twenty-eight to twenty-nine.
- **Docs**: `docs/functional-requirements.md` (FR-PRIV-01, FR-PRIV-02), `docs/api-contracts.md` §5.x privacy rows, `docs/data-model.md` (the `privacy_requests` table and the tombstone column set), `docs/data-privacy-and-retention.md` (what erasure does and does not remove), `docs/known-debt.md` (a row for the deferred signed-URL download and for the retention sweeper), `docs/decision-log.md` (three rows), `README.md`, `docs/mvp-build-plan.md` §5, `docs/milestones-and-phases.md`.
- **Dependencies**: none added. Reuses the existing HMAC helper and the existing outbox only if a completion email is added (it is not, in this change).

## Depends on

- `trust/consent-and-audit-records` (archived): the `RESTRICT` foreign keys and the pseudonymization mandate this change implements.
- `identity/account-status-lifecycle` (archived): the `ANONYMIZED` status and its sign-in refusal.
- Nothing from `trust-surfaces` or `abuse-reports-and-sanctions`. This change applies second in the announced order and needs neither.

## Out of scope

- Object storage, signed URLs, and a background export job (`FR-PRIV-01`'s "short-lived download link": narrowed by an owner decision, recorded as a debt row).
- The retention sweeper (`FR-PRIV-03`), which is a separate debt row.
- Evidence-file purging: no evidence file exists in the MVP (`FR-OUT-02` is unbuilt, DEBT-22), so there is nothing to purge and the requirement's file clause is vacuous until that change lands.
- Revocable institution data-sharing consent (`FR-CONS-02`).
- A deletion hold, a cooling window, or an admin-approved deletion queue. Deletion is immediate and irreversible.
- Removing the *counterpart's* rows: their messages, their profile, their outcomes stay as they are.

## Risks and rollback

| Risk | Mitigation |
|---|---|
| Wrong pseudonymization is unrecoverable data loss in a live database | The delete test that proves ledger-and-audit intact runs first in the file, is written before the service, and asserts row counts and foreign-key resolution; the tombstone is one transaction, so a partial erase cannot commit |
| The export leaks another user's data or a secret | The export is a fixed allowlist of tables and columns, built per table from the caller's id; password hashes, TOTP secrets, session tokens, and OAuth tokens are never selected; a scenario asserts a second user's rows are absent |
| The export leaks through a cache or a proxy log | `Cache-Control: no-store`, `Content-Disposition: attachment`, and the existing `X-Request-Id` logging carries no body |
| A tombstoned row breaks a query that assumed a display name | Personal columns keep their `NOT NULL` contract and receive a neutral placeholder, so every existing read still works; the profile reads are already owner-scoped |
| The heavy export route is used for bulk collection | Its own bucket (`RATE_LIMITS.export`, a few per hour), `SEC-ABUSE-2` cited in the contract |
| Deletion is triggered by a cross-site request | The cookie is `SameSite=Lax`, the request must be a `POST`, and the body must repeat the account's email; the mutation is not reachable by a link |

Rollback: revert the commit and, if the migration already ran, the table is inert and empty — no existing table was altered, so a rollback restores the previous schema without data loss. Accounts already tombstoned cannot be restored by a rollback; that is inherent to erasure and is stated in the docs.

**Traces to** FR-PRIV-01 (export), FR-PRIV-02 (erasure with ledger intact), FR-AUD-01 (the deletion audit entry), FR-PRIV-03 (explicitly out of scope, recorded as debt), SEC-ABUSE-2 (export throttled), SEC-DATA-* (no secret in an export); ADR-008 (append-only ledger), ADR-018 (Drizzle); D-84, D-85 and D-86 (this change's decisions); DEBT-22 (no evidence file to purge yet).
