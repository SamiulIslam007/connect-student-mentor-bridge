# Tasks: privacy-export-and-erasure

Ordering note: tests precede implementation in every logic group. Group 2's first task is the delete-with-ledger-intact test, because a wrong pseudonymization is unrecoverable data loss in a live database. "Next free migration number at apply time" means whatever `drizzle-kit generate` emits on the branch; do not hardcode `0016`.

## 1. Schema: the tracking table

- [x] 1.1 Add `privacy_requests` to `services/api/src/db/schema/` (`id uuid pk`, `user_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT`, `kind` enum `EXPORT | DELETE`, `status` enum `COMPLETED | FAILED`, `requested_at`, `completed_at`), export it from the schema index, and add its enums to `enums.ts`.
- [x] 1.2 Generate the migration with `drizzle-kit generate` (next free number at apply time) and append the hand-written `GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "privacy_requests" TO connect_app;`.
- [x] 1.3 Update `services/api/test/database.integration.test.ts`: the test name and assertion move from twenty-eight to twenty-nine tables, the `SET ROLE connect_app` probe covers `privacy_requests`, and `services/api/test/support/database.ts` `truncateAll()` lists it.

## 2. Deletion (test first)

- [x] 2.1 Write `services/api/test/privacy.integration.test.ts` with the first test: seed a user with a reported, confirmed, counted outcome and one message; snapshot `outcomes`, `outcome_events`, `verification_records`, `reputation_events`, `field_impact_snapshots`, `audit_logs`, `consent_records`; delete the account; assert every snapshot row is byte-identical, the snapshot counts are unchanged, and a join from each ledger row to `users` resolves. This test must pass before 2.3 exists (it fails as "route not found" first).
- [x] 2.2 Same file: deletion is one transaction (forced mid-transaction failure leaves the account untouched), identifiers are erased with `NOT NULL` intact, the counterpart's messages and profile are untouched, a deleted mentor is absent from the directory and no request can be created against it, a deleted account cannot sign in and holds no live session, and a second deletion request is a no-op with one audit entry.
- [x] 2.3 Extract the HMAC helper (currently `better-auth-identity.service.ts:997`) into one module taking `(secret, email)`, and use it from both call sites; no behaviour change to `signup_blocks`.
- [x] 2.4 Implement `services/api/src/privacy/drizzle-privacy.service.ts` `deleteAccount({ userId, confirmEmail, requestId })`: one transaction performing the column set in the design (D1 table), deleting sessions and two-factor rows, writing one `ACCOUNT_DELETED`-style audit entry, one `privacy_requests` row, and setting `mentor_profiles.status = REMOVED`.
- [x] 2.5 Implement `POST /v1/privacy/delete` in `services/api/src/privacy/privacy.controller.ts` (session-scoped, `@Throttle({ default: RATE_LIMITS.write })`), registered in `privacy.module.ts` and `app.module.ts` (imports + `RequestIdMiddleware` `forRoutes`).
- [x] 2.6 Contract + registrations: add the path to `packages/contracts/openapi.yaml` with `confirm_email` and the `422`/`403` responses, add `"POST /v1/privacy/delete": ["confirm_email"]` to `ROUTE_BODY_KEYS`, and add the route row to the `authorization-matrix` `MATRIX` (`signed-in`, mutating) plus the controller to that test's stack.
- [x] 2.7 `packages/contracts/test/openapi.test.ts`: cover the new path and its allowlist parity.

## 3. Export (test first)

- [x] 3.1 Same integration file: a two-user fixture; assert the document contains the caller's rows across every allowlisted section, contains no distinctive string belonging to the other user, contains no password hash, TOTP secret, backup code, session token, or OAuth token, and carries `Cache-Control: no-store` and an attachment disposition.
- [x] 3.2 Same file: refusals — `SUSPENDED`, `ANONYMIZED`, `DEACTIVATED`, and no session each answer `403` or `401` and produce no document and no `privacy_requests` row.
- [x] 3.3 Implement `exportAccount({ userId })` as one repeatable-read transaction building the fixed allowlist from the design (D3), and `POST /v1/privacy/export` returning the JSON with the two headers and `@Throttle({ default: RATE_LIMITS.export })`.
- [x] 3.4 Add `RATE_LIMITS.export` to `packages/config/src/index.ts` (a few per hour, commented as a starting value, `SEC-O2` remains Open) and register the route in the contract, `ROUTE_BODY_KEYS` (`[]`), the MATRIX (`signed-in`, mutating), and the module.
- [x] 3.5 One `privacy_requests` row per successful request (kind, status, timestamps) asserted for both routes.

## 4. Web surfaces

- [x] 4.1 Add `/account` controls: "Download my data" and "Delete my account" with a confirmation form that requires typing the account email; catalog strings for both, including the irreversibility warning and the refusal states.
- [x] 4.2 BFF routes `apps/web/app/api/privacy/export/route.ts` (streams the JSON back as an attachment) and `apps/web/app/api/privacy/delete/route.ts`, following `proxyJson` and clearing the session cookie after a successful delete.
- [x] 4.3 Test: `apps/web/test/account-privacy.test.ts` asserts both controls exist, the delete form refuses a mismatched email before the request, and a successful delete signs the page out.

## 5. Documentation

- [x] 5.1 `docs/functional-requirements.md`: FR-PRIV-01 and FR-PRIV-02 marked built, with the narrowed export clause and the placeholders-not-`NULL` note; FR-PRIV-03 stays unbuilt and cross-references its debt row.
- [x] 5.2 `docs/api-contracts.md`: replace the three documented privacy rows with the two built endpoints and one deferred download route; state the `confirm_email` requirement in place of "recent re-authentication"; document the export allowlist and its exclusions.
- [x] 5.3 `docs/data-model.md`: add `privacy_requests`, and document the tombstone as the one sanctioned writer to `thread_messages.body` and `mentor_profiles.status`.
- [x] 5.4 `docs/data-privacy-and-retention.md`: what erasure removes, what it keeps and why (ledger, audit, consent), and that deletion is irreversible.
- [x] 5.5 `docs/known-debt.md`: a row for FR-PRIV-03 (retention sweeper) if not already recorded by `trust-surfaces`, and a row for the deferred signed-URL export depth.
- [x] 5.6 `docs/decision-log.md` (D-84, D-85, D-86 below), `README.md` status, `docs/mvp-build-plan.md` §5, `docs/milestones-and-phases.md`.

## 6. Checks, review gate, handoff

- [x] 6.1 Run `pnpm lint`, `pnpm typecheck`, `pnpm build`, `CI=true pnpm test`; capture each exit code and per-package counts.
- [x] 6.2 Confirm the migration contains the `GRANT`, the probe covers the new table, and `grep -c privacy_requests` matches across schema, migration, service, contract, allowlist, and tests.
- [x] 6.3 Review gate: walk the diff against the design's column table, then hand off with the gate output and any deviation from the owner's "set to NULL" wording (design D1).

## Decision rows to add at apply

- **D-84:** The data export is one synchronous JSON document returned with `Cache-Control: no-store`; no object storage, no signed URL, no S3 client in the pilot. Reason: FR-PRIV-01's "short-lived download link" would add the first object-storage integration, a lifecycle and an expiry job for a document the user can receive directly. Affects `trust/privacy-export-and-erasure`, `docs/api-contracts.md` §5.x, `docs/functional-requirements.md` FR-PRIV-01, `docs/known-debt.md`.
- **D-85:** Deletion is a tombstone that replaces `NOT NULL` personal columns with placeholders (not `NULL`), rewrites the deleted user's message bodies, sets `mentor_profiles.status = REMOVED`, deletes sessions and two-factor rows, and never touches a ledger, verification, reputation, or audit row. Reason: FR-PRIV-02 plus the `RESTRICT` foreign keys; the schema forbids `NULL` on those columns. Affects `trust/privacy-export-and-erasure`, `docs/data-model.md`, `docs/data-privacy-and-retention.md`, `services/api/src/db/schema/`.
- **D-86:** Deletion is confirmed by repeating the account email rather than by recent re-authentication. Reason: no credential-check seam exists that does not create a session, and the confirmation's job is to stop an accidental or cross-site delete. Affects `trust/privacy-export-and-erasure`, `docs/api-contracts.md` §5.x, `docs/auth-and-access-control.md`.
