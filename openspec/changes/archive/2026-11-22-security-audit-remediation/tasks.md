# Tasks: security-audit-remediation

Decision rows to add at apply, one per phase: **D-253** trusted client key, **D-254** auth before evidence buffering, **D-255** separation of duties, **D-256** mentor MFA and admin session limits, **D-257** BFF write contract, **D-258** reporting window, **D-259** non-ledger erasure and evidence maximum, **D-260** bounded logs and scrubbed reports, **D-261** host-independent secret and local-stack hygiene, **D-262** pinned supply chain and doc truth.

Each phase is independently applicable and mergeable. The two shared-file cases are named in the phase Out lists.

## Phase 1 — bff-client-identity-and-rate-limits

**Findings:** SEC-AUDIT-001, SEC-AUDIT-005. **Decision:** D-253.

**Out:** no shared throttle store, no Redis, no CORS, no public API, no new dependency, no change to the per-account bucket's documented purpose.

- [x] 1.1 Add `apps/web/lib/client-key.ts`: derive a client key from the transport peer at the edge/BFF, accept a forwarded key only on the trusted internal hop, and reject a client-supplied value on the public side. Verify: `pnpm --filter web exec node --import tsx --test test/client-key.test.ts` passes with two peers, a spoofed header and a missing key.
- [x] 1.2 Forward the trusted key from `proxyJson` to the API and set `main.ts` to trust that hop only. Verify: `pnpm --filter web exec node --import tsx --test test/bff-forwarding.test.ts` shows the upstream request carries the key and a foreign forwarding header is stripped.
- [x] 1.3 Add the API trust-boundary test: a peer outside the BFF network cannot select a bucket with a forwarding header. Verify: `pnpm --filter api exec node --import tsx --test --test-concurrency=1 test/rate-limits.integration.test.ts` includes the spoofed-header case and passes.
- [x] 1.4 Change `accountTracker` and `RATE_LIMITS` so the account bucket combines the account with a source signal and a correct credential after a challenge is not held behind an unconditional hour block. Verify: the same test file proves an attacker from one source cannot lock a victim's correct credential from another source.
- [x] 1.5 Add the two-client regression: two browsers through one BFF address have separate sign-in buckets; the sixth attempt from a different client is not `429` while the first remains limited. Verify: the targeted `rate-limits.integration.test.ts` run passes.
- [x] 1.6 Update `docs/security-requirements.md` (SEC-ABUSE-1), `docs/api-contracts.md` (the BFF forwarding note) and `docs/decision-log.md` (D-253). Verify: `grep -n 'trusted client\|D-253' docs/security-requirements.md docs/api-contracts.md docs/decision-log.md` names the new text; no status is ticked without the test name.
- [x] 1.7 Run `pnpm --filter api exec node --import tsx --test --test-concurrency=1 test/rate-limits.integration.test.ts` and `pnpm --filter web exec node --import tsx --test test/client-key.test.ts test/bff-forwarding.test.ts`; record both exit codes.

## Phase 2 — evidence-body-auth-and-bff-cap

**Findings:** SEC-AUDIT-002. **Decision:** D-254.

**Out:** no streaming-upload rewrite, no object-store change, no change to the 5 MiB product limit, no change to the 100 KiB JSON bound.

- [x] 2.1 Put an authentication and authorization middleware in front of the raw evidence parser for the two evidence routes only. Verify: `pnpm --filter api exec node --import tsx --test --test-concurrency=1 test/evidence.integration.test.ts` proves an anonymous 5 MiB request is `401` without a stored object.
- [x] 2.2 Keep the raw parser content-type scoped and add a test that a 6 MiB body is `413` before a controller runs. Verify: the same targeted test file passes the oversize case and the valid 5 MiB case.
- [x] 2.3 Replace the break-glass route's clone-and-parse with a bounded read that refuses above 128 KiB. Verify: `pnpm --filter web exec node --import tsx --test test/break-glass-route.test.ts` passes the bound and the valid reason case.
- [x] 2.4 Add the regression that the JSON cap is unchanged on a non-evidence route. Verify: `pnpm --filter api exec node --import tsx --test --test-concurrency=1 test/request-validation.integration.test.ts` passes the 100 KiB refusal.
- [x] 2.5 Update `docs/security-requirements.md` (SEC-API-1), `docs/api-contracts.md` (evidence body order and the break-glass bound) and `docs/decision-log.md` (D-254). Verify: the doc lines name the test file and the 5 MiB and 128 KiB bounds; no status is raised without that citation.
- [x] 2.6 Run the three targeted tests from 2.1, 2.3 and 2.4 and record each exit code.

## Phase 3 — admin-separation-of-duties

**Findings:** SEC-AUDIT-003, SEC-AUDIT-016, SEC-AUDIT-028. **Decision:** D-255.

**Out:** no database trigger, no new review queue, no change to the ledger transition table, no change to the existing self-service mentor grant.

- [x] 3.1 In `DrizzleOutcomeService.review`, compare the acting admin with the locked outcome's student and mentor and refuse a participant with `403 OUTCOME_REVIEW_CONFLICT`. Verify: `pnpm --filter api exec node --import tsx --test --test-concurrency=1 test/outcomes.integration.test.ts` proves student, mentor, unrelated-admin and no-write cases.
- [x] 3.2 Write exactly one `PERMISSION_DENIED` audit row for the refusal and none for an unrelated admin. Verify: the same test file asserts one denial row and no `OUTCOME_REVIEWED` row.
- [x] 3.3 Wrap `grantRole`'s assignment, audit and activation sync in one transaction and record the real acting role. Verify: `pnpm --filter api exec node --import tsx --test --test-concurrency=1 test/roles.integration.test.ts` proves a forced audit failure rolls the grant back and a platform-admin grant carries `PLATFORM_ADMIN`.
- [x] 3.4 Refuse a platform admin granting institution-admin scope to their own account with `403 SELF_GRANT_FORBIDDEN`; keep the mentor self-grant allowed and audited. Verify: `pnpm --filter api exec node --import tsx --test --test-concurrency=1 test/attestation.integration.test.ts` passes.
- [x] 3.5 Add the recent-proof guard for export and delete: password or TOTP within 10 minutes, `403 REAUTH_REQUIRED` otherwise, email confirmation alone not accepted. Verify: `pnpm --filter api exec node --import tsx --test --test-concurrency=1 test/privacy.integration.test.ts` passes the stale, fresh and email-only cases.
- [x] 3.6 Update `docs/auth-and-access-control.md` (reviewer and role-grant rules), `docs/functional-requirements.md` (FR-ADM-01, FR-ADM-06, FR-PRIV-01/02) and `docs/decision-log.md` (D-255). Verify: every changed status names the test file; no row is ticked without it.
- [x] 3.7 Run the four targeted tests from 3.1 to 3.5 and record each exit code.

## Phase 4 — mentor-mfa-and-admin-session-policy

**Findings:** SEC-AUDIT-006, SEC-AUDIT-013. **Decision:** D-256.

**Out:** no sign-in MFA requirement for every account, no new token format, no change to the student or mentor 30-day policy, no auth-library replacement.

- [x] 4.1 Declare the second-factor requirement on every mentor-only state-changing route: message, agreement, accept/decline, session create/cancel, complete, confirm, dispute and evidence decisions. Verify: `pnpm --filter api exec node --import tsx --test --test-concurrency=1 test/roles.integration.test.ts` proves an unenrolled mentor gets `403 MFA_REQUIRED` and an enrolled one proceeds.
- [x] 4.2 Add the route-inventory test that fails when a new mentor write omits the flag. Verify: the same test file fails when one flag is removed, then passes restored.
- [x] 4.3 Implement admin idle 30 minutes and absolute 12 hours in the session guard, with the values in `@connect/config`; revoke on either breach. Verify: `pnpm --filter api exec node --import tsx --test --test-concurrency=1 test/access.integration.test.ts` passes idle, absolute, fresh and student/mentor cases.
- [x] 4.4 Update `docs/security-requirements.md` (SEC-AUTH-2), `docs/auth-and-access-control.md` (§4 and §10), `docs/known-debt.md` (DEBT-74) and `docs/decision-log.md` (D-256). Verify: DEBT-74 is closed or narrowed only with the test name and command; the stale "no route sets the flag" sentence is gone.
- [x] 4.5 Run `pnpm --filter api exec node --import tsx --test --test-concurrency=1 test/roles.integration.test.ts test/access.integration.test.ts` and record the exit code.

## Phase 5 — bff-write-integrity

**Findings:** SEC-AUDIT-004, SEC-AUDIT-015, SEC-AUDIT-020, SEC-AUDIT-021. **Decision:** D-257.

**Out:** no CSRF token in `openapi.yaml`, no API cookie session, no broad CSRF exemption, no new client dependency.

- [x] 5.1 Require `application/json` on the five pre-session BFF writes and answer `415` for `text/plain` before any upstream call. Verify: `pnpm --filter web exec node --import tsx --test test/auth-routes.test.ts test/bff-content-type.test.ts` passes the five-route matrix.
- [x] 5.2 Add a per-action idempotency key in the browser helper, forward it in `proxyJson`, and keep it stable across a retry. Verify: `pnpm --filter web exec node --import tsx --test test/idempotency-wiring.test.ts` proves the header reaches the API and a double submit replays.
- [x] 5.3 Replace the six mentorship bare `fetch` calls with `csrfFetch`: complete, agreement save, agreement acknowledge, session create, confirm-held and cancel. Verify: `pnpm --filter web exec node --import tsx --test test/csrf-wiring.test.ts test/mentorship-page.test.ts` passes a source scan and the six action names.
- [x] 5.4 Encode the institution id with `encodeURIComponent` in `apps/web/app/api/institutions/[id]/admins/route.ts`. Verify: `pnpm --filter web exec node --import tsx --test test/bff-path-encoding.test.ts` passes an encoded traversal-shaped segment.
- [x] 5.5 Add the BFF route test that each of the six routes answers `403 CSRF_INVALID` without a token and reaches upstream with one. Verify: `pnpm --filter web exec node --import tsx --test test/csrf-wiring.test.ts` passes.
- [x] 5.6 Update `docs/api-contracts.md` (BFF-only CSRF and idempotency behavior), `docs/auth-and-access-control.md` (the five exempt writes) and `docs/decision-log.md` (D-257). Verify: no OpenAPI header is added and `pnpm --filter contracts test` still passes.
- [x] 5.7 Run the targeted web tests from 5.1 to 5.5 and `pnpm --filter contracts test`; record each exit code.

## Phase 6 — outcome-reporting-window

**Findings:** SEC-AUDIT-007. **Decision:** D-258.

**Out:** no config-table migration, no rewrite of existing outcomes, no change to the review state machine, no new outcome status.

- [x] 6.1 Add the named 90-day ending window and the date bounds to `@connect/config` and the outcome report path. Verify: `pnpm --filter @connect/domain exec node --import tsx --test test/outcome.test.ts` passes the pure window cases.
- [x] 6.2 Enforce the mentorship status and ending instant inside the report transaction. Verify: `pnpm --filter api exec node --import tsx --test --test-concurrency=1 test/outcomes.integration.test.ts` proves active, recent, old and no-write cases.
- [x] 6.3 Refuse `occurred_on` before the mentorship start or after today with `422 OCCURRED_ON_OUT_OF_RANGE`, and keep the boundary dates valid. Verify: the same targeted test file passes before-start, today, tomorrow and exact-boundary cases.
- [x] 6.4 Update `docs/functional-requirements.md` (FR-OUT-01 and FR-MEN-02), `docs/reputation-and-verification-policy.md` (the window) and `docs/decision-log.md` (D-258). Verify: the changed status names the test and the 90-day constant; no claim is ticked without the citation.
- [x] 6.5 Run `pnpm --filter api exec node --import tsx --test --test-concurrency=1 test/outcomes.integration.test.ts` and record the exit code.

## Phase 7 — erasure-and-evidence-retention-complete

**Findings:** SEC-AUDIT-008, SEC-AUDIT-009, SEC-AUDIT-010. **Decision:** D-259.

**Out:** no ledger-row change, no outcome free-text redaction, no hard delete of the user row, no new table, no retention for messages, requests or audit rows beyond the documented scope.

- [x] 7.1 Extend `deleteAccount` to delete the user's evidence rows and stored objects, affiliations, abuse reports, old-email verification rows, outbox payloads addressed to the user and idempotency keys, while leaving every ledger row byte-identical. Verify: `pnpm --filter api exec node --import tsx --test --test-concurrency=1 test/privacy.integration.test.ts` passes the table/object snapshot.
- [x] 7.2 Make the object-store cleanup retryable: a failed delete records the evidence id for a later sweep and never reports the account fully erased. Verify: the same test file passes a storage failure and a retry.
- [x] 7.3 Require an open review case and a written reason for an admin evidence read; answer `403 EVIDENCE_ACCESS_DENIED` for a counted or pending outcome with no case. Verify: `pnpm --filter api exec node --import tsx --test --test-concurrency=1 test/evidence.integration.test.ts` passes unrelated, case-linked, missing-reason and participant cases.
- [x] 7.4 Add the maximum 90-day unsettled retention to `sweepExpiredEvidence`, keep the settled-state clocks earlier when they apply, and preserve the dry-run switch. Verify: `pnpm --filter api exec node --import tsx --test --test-concurrency=1 test/evidence-retention-job.test.ts` passes old-pending, young, dry-run and settled-earlier cases.
- [x] 7.5 Add the deletion dry-run and backup check: write the candidate list, require a confirmed backup, then perform one real sweep. Verify: the run prints the candidate count and the operator record names the backup and the date.
- [x] 7.6 Update `docs/data-model.md` (the tombstone table list), `docs/data-privacy-and-retention.md` (evidence and non-ledger rows), `docs/functional-requirements.md` (FR-PRIV-02/03), `docs/known-debt.md` (DEBT-78 for the ledger question if still open) and `docs/decision-log.md` (D-259). Verify: every changed row names the test or the remaining Open Question; no ledger claim is widened.
- [x] 7.7 Run the three targeted tests from 7.1, 7.3 and 7.4 and record each exit code.

## Phase 8 — logging-and-error-redaction

**Findings:** SEC-AUDIT-011, SEC-AUDIT-023, SEC-AUDIT-025. **Decision:** D-260.

**Out:** no new log platform, no new Sentry tier, no raw exception message in the general log, no change to the evidence body path, no change to the audit log's action list beyond the existing writer.

- [x] 8.1 Replace the 500 log's raw `exception.message` and `originalUrl` with a bounded error class, the route, method and request id; strip the query string from the response `instance` and the log. Verify: `pnpm --filter api exec node --import tsx --test --test-concurrency=1 test/observability.test.ts` passes a Drizzle-shaped error and a token URL.
- [x] 8.2 Redact the web `callApi` failure path: log the route path without a query string and never the raw upstream detail. Verify: `pnpm --filter web exec node --import tsx --test test/api-log-redaction.test.ts` passes a token-bearing path and a normal path.
- [x] 8.3 Extend `ScrubbableEvent` and `scrubEvent` to exception values, stack-frame vars, contexts, tags and `user.username`; keep the existing header, cookie, request-data and query rules. Verify: `pnpm --filter api exec node --import tsx --test --test-concurrency=1 test/observability.test.ts` passes the full event fixture and fails when one field is removed.
- [x] 8.4 Bound `reports.details` at 2,000 characters in the controller, returning `422` naming the field before the DB check. Verify: `pnpm --filter api exec node --import tsx --test --test-concurrency=1 test/reports.integration.test.ts` passes 2,001, 2,000 and no-500 cases.
- [x] 8.5 Correct `docs/runbook.md` §5's log claim to the real behavior, add the breach/containment, key-rotation, break-glass review and audit-review procedures, and name the log redaction. Verify: `grep -n 'Breach\|Key rotation\|Break-glass review\|Audit review' docs/runbook.md` prints each heading; the old false sentence is gone.
- [x] 8.6 Update `docs/security-requirements.md` (SEC-DATA-5), `docs/known-debt.md` (DEBT-75 if the deployed half remains) and `docs/decision-log.md` (D-260). Verify: each change names the test or the remaining host dependency.
- [x] 8.7 Run the two API tests from 8.1 and 8.4 and the web redaction test from 8.2; record each exit code.

## Phase 9 — secret-and-local-stack-hygiene

**Findings:** SEC-AUDIT-012, SEC-AUDIT-014, SEC-AUDIT-017, SEC-AUDIT-018, SEC-AUDIT-019, SEC-AUDIT-022, SEC-AUDIT-027. **Decision:** D-261.

**Out:** no host choice, no TLS certificate, no paid CAPTCHA, no Vault, no secret value in a file, no full UI redesign.

- [x] 9.1 Bind every published Compose port to `127.0.0.1` by default and add a separate opt-in LAN override only if the owner asks. Verify: `pnpm --filter web exec node --import tsx --test test/compose-ports.test.ts` passes a config parse and fails a `0.0.0.0` entry.
- [x] 9.2 Remove `GOOGLE_CLIENT_SECRET` and the other API-only secrets from the web service block; keep the API as the only provider owner. Verify: `pnpm --filter web exec node --import tsx --test test/compose-secrets.test.ts` passes and names no value.
- [x] 9.3 Require TLS for SMTP in production while keeping Mailpit plaintext only in local development. Verify: `pnpm --filter api exec node --import tsx --test --test-concurrency=1 test/email-sender.test.ts` passes the TLS-required and local-only cases.
- [x] 9.4 Add the production secret guard: an empty or documented development placeholder fails startup with the variable name and no value. Verify: `pnpm --filter api exec node --import tsx --test --test-concurrency=1 test/config.integration.test.ts` passes the refusal and the valid case.
- [x] 9.5 Sign the sign-up intent with a server secret, include a nonce, consume it once and reject forged or replayed values before the upstream call. Verify: `pnpm --filter web exec node --import tsx --test test/sign-up-intent.test.ts test/sign-up-bot-protection.test.ts` passes forged, replay, valid and honeypot cases.
- [x] 9.6 Accept only a published consent version; refuse an unknown or future version with `422` naming `document_version`. Verify: `pnpm --filter api exec node --import tsx --test --test-concurrency=1 test/consent.integration.test.ts` passes current, future and historical cases.
- [x] 9.7 Replace script `unsafe-inline` with a nonce, use nonce or hash for the inline styles the built page actually uses, add HSTS in production, hide `X-Powered-By`, and add COOP/CORP. Verify: `pnpm --filter web exec node --import tsx --test test/security-headers.test.ts` passes the header matrix, and the browser checklist covers the five flows.
- [x] 9.8 Update `docs/local-setup.md` (ports and opt-in), `.env.example` (names only), `docs/security-requirements.md` (SEC-AUTH-4, SEC-API-3/4, SEC-INF-3/4), `docs/known-debt.md` (DEBT-60 only with the new test), `docs/data-privacy-and-retention.md` (the signed marker's data) and `docs/decision-log.md` (D-261). Verify: no value is written; the changed status names the test; the CSP residual is either absent or has a new debt row.
- [x] 9.9 Run the six targeted tests from 9.1 to 9.7 and record each exit code.

## Phase 10 — supply-chain-and-doc-truth

**Findings:** SEC-AUDIT-024, SEC-AUDIT-026. **Decision:** D-262.

**Out:** no dependency major jump, no ruleset change, no Dependabot policy beyond the named settings, no rewrite of history, no status change without a citation.

- [x] 10.1 Pin every `uses:` in `.github/workflows/ci.yml` to a full commit SHA with a version comment; set `persist-credentials: false` unless a step needs it. Verify: `pnpm --filter web exec node --import tsx --test test/ci-pins.test.ts` fails on a tag and passes on a SHA.
- [x] 10.2 Set `minimumReleaseAge: 10080`, `blockExoticSubdeps: true` and the documented trust policy (or the pnpm equivalent), and review the Sentry exclusion list. Verify: `pnpm install --frozen-lockfile` succeeds and the policy test names all three settings.
- [x] 10.3 Change every audit-relevant false `DONE` claim to `PARTIAL` or to the implemented truth, with a cited file or test in the same row: FR-OUT-01, FR-PRIV-02, SEC-AUTH-2, SEC-API-4, the runbook log sentence, `data-model.md`'s "nothing else" list and the `api-contracts.md` idempotency contradiction. Verify: `grep -n 'No route sets that flag yet\|HSTS on both\|evidence files purged\|never tokens'` returns nothing, and each changed row names its evidence.
- [x] 10.4 Add or narrow debt rows: `DEBT-60` (CSP) only if a residual remains, a new row for the erasure-versus-ledger question if it is still open, and a row for the deployment-owned host/SMTP/secret work. Verify: every new ID is the next free number from `grep -oE 'DEBT-[0-9]+' docs/known-debt.md | sort -n | tail -1`; no invented ID.
- [x] 10.5 Add the docs truth gate: a checklist item on the review gate that a `DONE` change names the command/test/commit, and correct `README.md` and `docs/milestones-and-phases.md` status lines if they repeat a false claim. Verify: a reviewer can trace each changed row to a file or test in the same row.
- [x] 10.6 Run `pnpm --filter web exec node --import tsx --test test/ci-pins.test.ts` and `openspec validate --all --strict`; record both exit codes.

## Final gates and handoff

This group runs after every phase that is being handed off. It adds no finding and changes no code.

- [x] 11.1 Confirm the checkout on a clean checkout of the phase branch: `git log --oneline -1`, `git status --short`, and that only the change directory plus the pre-existing audit files are untracked. Verify: the commit is the intended HEAD and no application file is staged.
- [x] 11.2 Run `pnpm lint`; record the exit code.
- [x] 11.3 Run `pnpm typecheck`; record the exit code.
- [x] 11.4 Run `CI=true pnpm test` once, sequentially; record the per-package tests, pass, fail and skipped totals. Verify: no `ELIFECYCLE` or `ERR_PNPM`; do not run a second heavy suite concurrently.
- [x] 11.5 Run `pnpm build` twice on a clean `.next`; record both exit codes. Verify: a first-run Next security nudge that clears on the retry is reported as such, not hidden.
- [x] 11.6 Run `openspec validate --all --strict`; record the result. Verify: zero errors, and this change is valid.
- [x] 11.7 Run `openspec list --json`; confirm the active changes are exactly `first-deployment-restore-drill-and-observability` and `security-audit-remediation`. Verify: no third active change and no archived duplicate.
- [x] 11.8 Write the handoff: phase commits, exit codes, any `PARTIAL` finding, the Open Questions from `design.md`, and the files that still need a host or an owner decision. Verify: every claim in the handoff has the command output beside it.
