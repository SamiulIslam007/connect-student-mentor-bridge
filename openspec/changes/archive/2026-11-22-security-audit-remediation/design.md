# Design: security-audit-remediation

## Context

See `proposal.md` — Why. Facts and constraints that shape the approach, verified at `main` / `01a916e2283efffa0de5a20df7c9c565ee4bb02c` on 2026-11-22:

- The audit has 28 findings. Five are behaviorally exploitable in the documented browser-to-BFF topology; the rest are privacy, logging, local-stack, supply-chain or docs-truth gaps.
- The browser never calls the API directly. `apps/web/lib/api.ts` is server-side, and `apps/web/lib/bff.ts` forwards only `content-type` and `authorization` today. The API has no `trust proxy` setting and listens on `0.0.0.0`.
- The API is a modular monolith plus a worker. There is no new table needed: the findings use existing rows, middleware, headers and configuration.
- The current specs already cover most objects. The new behavior is additive except for `trust/evidence-retention` (the existing "live outcome keeps its file" rule) and `platform/http-security-controls` (the existing inline CSP allowance). Both are handled with a MODIFIED block that keeps the existing header and every existing scenario name.
- The erasure-versus-ledger question is open in `docs/data-model.md:686` and `AGENTS.local.md` §1.1. This design does not decide it: phase 7 deletes evidence and non-ledger PII and leaves every ledger row byte-identical.
- The active `first-deployment-restore-drill-and-observability` change owns the host, TLS, SMTP provider and Sentry deployment. This design ships config and guard code that is safe without a host, and defers host-specific values to that change or a later deployment change.

## Goals / Non-Goals

**Goals**

- Ten phases that can each be reviewed, applied, tested and merged without waiting for the other nine.
- Every finding has a concrete code path, a test that fails before the fix and passes after it, and a docs update in the same phase.
- The change is safe to apply without a production host, without privileged test accounts and without a new dependency.

**Non-Goals**

- No production host, TLS certificate, SMTP provider, secret manager, managed Postgres or object-store product.
- No ledger-row redaction or hard deletion. The erasure question stays open.
- No CAPTCHA, paid bot service, shared throttle store, Redis or new queue.
- No rewrite of the entire UI, no design-system change and no new dependency.
- No code change outside the named findings; a phase that finds a second bug reports it instead of widening.

## Decisions

### D-253: Trusted client identity at the edge, with the account bucket kept as a second key

- Date: 2026-11-22
- Decision: phase 1 adds an edge or BFF client key derived from the real peer, forwards it only over the trusted BFF-to-API link, and keys anonymous credential and write limits on that key. The API trusts a forwarding header only when the direct peer is the BFF network, and never trusts it from a public caller. The account bucket remains, but its key becomes account plus source, and a correct credential after a challenge is admitted rather than held behind an unconditional hour block.
- Reason: the documented topology makes the BFF the only client, so a per-address bucket currently measures the BFF, not the person. A trusted key restores the spec's "a different caller is unaffected" scenario without adding a shared store or changing the product's no-CORS design.
- Alternatives rejected: exposing the API to the browser so the real address is visible (breaks the bearer-only BFF, adds CORS and a second session surface); adding Redis now (a new dependency and a shared store the MVP has deferred); removing the limits (worse).
- What would change this decision: a deployment where the API is directly public and the edge already enforces per-client limits, in which case the API key can be the edge-supplied identity instead of the BFF key.
- Status: Proposed (owner review required)
- Affects: `apps/web/lib/bff.ts`, `services/api/src/main.ts`, `services/api/src/http/account-throttler.ts`, `packages/config/src/index.ts`, `platform/rate-limits`

### D-254: Authenticate before buffering, and keep the raw parser route-scoped

- Date: 2026-11-22
- Decision: phase 2 puts an authentication and authorization check in front of the evidence body parser, keeps the 5 MiB raw parser scoped to the two evidence routes, and makes the BFF break-glass route read a bounded body instead of cloning and parsing it. A 6 MiB body is refused at the edge with `413`; an anonymous 5 MiB body is refused with `401` before the bytes are held.
- Reason: Express parses the registered body type before Nest's guards. Moving the auth check is smaller and safer than rewriting the upload as a stream in this change, and the route-scoped parser already preserves the 100 KiB JSON bound.
- Alternatives rejected: accepting the buffer and reducing the process heap (does not remove the amplification); a full streaming upload rewrite (a larger change; it remains the preferred follow-up if the object store client supports a stream).
- What would change this decision: a measured need to accept more than 5 MiB or a scanner that must read a stream directly; that becomes its own change.
- Status: Proposed (owner review required)
- Affects: `services/api/src/main.ts`, `services/api/src/http/request-body.ts`, `services/api/src/evidence/evidence.controller.ts`, `apps/web/app/api/admin/mentorships/break-glass/route.ts`, `platform/request-validation`

### D-255: Separation of duties is a service check, and role grants are one transaction

- Date: 2026-11-22
- Decision: phase 3 compares the reviewer with the outcome's student and mentor inside the existing `review()` transaction and refuses a participant with `403 OUTCOME_REVIEW_CONFLICT`, writing one denial row and no fact. A role grant writes the assignment, its audit row and any activation sync in one transaction, records the real acting role, and rejects a platform admin granting institution-admin scope to their own account. Export and delete require a fresh password or TOTP proof within 10 minutes.
- Reason: the audit's original sentence that `review()` never reads the participants is wrong at this HEAD; `readOutcomeParticipants` is called at line 730 for the notification email. The missing check is the comparison, not the read. The role-grant and recent-proof gaps are independent and fit the same phase because they are all "the acting admin is not a normal user" controls.
- Alternatives rejected: a database trigger (harder to test, and the service already owns the transaction); a separate review queue for admins (does not stop self-review); email confirmation as the deletion proof (the attacker with the session can read the email from `/v1/me`).
- What would change this decision: counsel deciding that a platform admin may hold institution scope, in which case only the self-grant check is relaxed and the audit still records it.
- Status: Proposed (owner review required)
- Affects: `services/api/src/outcomes/drizzle-outcome.service.ts`, `services/api/src/outcomes/outcomes.controller.ts`, `services/api/src/identity/better-auth-identity.service.ts`, `services/api/src/institutions/attestation.controller.ts`, `services/api/src/privacy/privacy.controller.ts`, `mentorship/platform-review`, `identity/role-authorization`, `trust/privacy-export-and-erasure`

### D-256: Mentor MFA is a route policy, and admin sessions use 30 minutes idle and 12 hours absolute

- Date: 2026-11-22
- Decision: phase 4 declares the second-factor requirement on every mentor-only state-changing route and keeps the pure role policy as the single source. Admin sessions expire after 30 minutes without a request and never outlive 12 hours; student and mentor sessions keep the existing 30-day policy. Sensitive mentor actions use the same guard rather than a per-route literal.
- Reason: the policy already answers per role, but no mentor route consumes it; adding the flag is the smallest complete change and keeps the existing `MFA_REQUIRED` refusal. The session numbers close the known D-48 gap without inventing a new token format.
- Alternatives rejected: requiring MFA at sign-in for every account (locks out a mentor who has not enrolled, and the product deliberately allows a mentor to browse while unenrolled); a 24-hour admin window (too long for the most privileged role).
- What would change this decision: the pilot having only one admin and no second device, in which case the owner may choose a longer absolute limit; the idle limit remains.
- Status: Proposed (owner review required)
- Affects: `services/api/src/authorization/authorize.ts`, `services/api/src/mentorships/mentorships.controller.ts`, `services/api/src/outcomes/outcomes.controller.ts`, `services/api/src/identity/better-auth.ts`, `identity/role-authorization`, `identity/session-management`

### D-257: The BFF owns the browser contract for CSRF, content type, idempotency and path encoding

- Date: 2026-11-22
- Decision: phase 5 requires `application/json` on the five pre-session writes, generates one idempotency key per user action and forwards it on request create, outcome report and message post, replaces the six bare mentorship `fetch` calls with `csrfFetch`, and encodes the institution id in the admin path. The API contract does not gain a CSRF header; `docs/api-contracts.md` documents the BFF behavior instead.
- Reason: the API never reads a session cookie and never reads a CSRF token, so adding either to `openapi.yaml` would be a contract lie. The idempotency header already exists on the API and is optional; the BFF is the missing carrier. The page's bare `fetch` is why six actions answer 403 under enforcement.
- Alternatives rejected: disabling CSRF for the mentorship routes (weakens the control); generating the key in the API on every call (cannot distinguish a retry from a new action); trusting the browser to send a key (the UI can double-submit before a key is set).
- What would change this decision: a browser client that must call the API directly; that would need its own CSRF decision and a CORS allowlist, both out of scope.
- Status: Proposed (owner review required)
- Affects: `apps/web/lib/bff.ts`, `apps/web/lib/csrf-client.ts`, `apps/web/app/mentorship/[id]/page.tsx`, `apps/web/app/api/institutions/[id]/admins/route.ts`, `apps/web/app/api/auth/*`, `platform/http-security-controls`, `platform/idempotency`

### D-258: The outcome reporting window is 90 days from mentorship end, with dates bounded to the mentorship

- Date: 2026-11-22
- Decision: phase 6 allows a report only while the mentorship is `ACTIVE` or `COMPLETED`, and for a completed mentorship only within 90 days of its ending instant. `occurred_on` must be between the mentorship start date and today. The window is a named constant in `@connect/config`; rate limits, crons and timings stay code by D-184, so no new config table is added.
- Reason: FR-MEN-02 leaves the window Open, and FR-OUT-01's Given clause already says "Active or recently ended", so the code is the mismatch. A constant is the smallest complete answer and keeps the change free of schema work.
- Alternatives rejected: a database-backed policy (turns a product constant into a new config surface); allowing any `occurred_on` and relying on review (the audit shows the review path can be self-dealt).
- What would change this decision: pilot evidence that 90 days is too short; the constant is then tuned in a one-line change and the docs record the date.
- Status: Proposed (owner review required)
- Affects: `services/api/src/outcomes/drizzle-outcome.service.ts`, `packages/config/src/index.ts`, `docs/functional-requirements.md`, `mentorship/outcome-verification`

### D-259: Erase the non-ledger subset, keep the ledger untouched, and bound unsettled evidence

- Date: 2026-11-22
- Decision: phase 7 deletes evidence rows and objects, affiliations, abuse reports, verification rows for the old email, outbox payloads addressed to the user and idempotency responses; it leaves every ledger row and every outcome free-text field byte-identical. It deletes unattached evidence 90 days after upload when the outcome never settles, and it restricts an admin evidence read to an open review case with a written reason.
- Reason: `docs/data-model.md:686` and `AGENTS.local.md` §1.1 reserve the erasure-versus-ledger decision to counsel. Deleting the non-ledger rows satisfies the concrete gaps without deciding the reserved question; the evidence maximum is the same 90-day privacy promise the retention spec already uses for settled files.
- Alternatives rejected: deleting evidence only when the outcome settles (leaves a pending file forever); redacting outcome text now (decides the ledger question); deleting the whole outcome (breaks the reputation audit).
- What would change this decision: counsel's written answer on ledger exceptions; that answer becomes a later change that may add redaction or a tombstone to the ledger.
- Status: Proposed (owner review required)
- Affects: `services/api/src/privacy/drizzle-privacy.service.ts`, `services/api/src/evidence/retention.ts`, `services/api/src/evidence/drizzle-evidence.service.ts`, `docs/data-model.md`, `docs/data-privacy-and-retention.md`, `trust/privacy-export-and-erasure`, `trust/evidence-retention`, `mentorship/outcome-evidence`

### D-260: Log a bounded error class, scrub exception values, and make the runbook tell the truth

- Date: 2026-11-22
- Decision: phase 8 stops logging raw exception messages and query parameters, logs the route, method, request id and a bounded error class, strips query strings from paths and `instance`, bounds `reports.details` at 2,000 characters before the DB check, and extends the Sentry scrubber to exception values, stack-frame variables, contexts, tags and `user.username`. The runbook's log claim is rewritten to match the code.
- Reason: the test log shows a Drizzle failure carrying the full SQL and its `params` array, and a verification token travels in a URL. The scrubber's current type has no `exception` field, so it cannot remove the most likely carrier. These are the same defect class and belong in one phase.
- Alternatives rejected: adding a log-shipper redaction rule only (the local log and Sentry still carry the data); turning off error reporting (loses the pilot's only visibility); logging nothing (makes an incident blind).
- What would change this decision: a log platform with a tested redaction pipeline that can prove the same result; the code-level scrub still stays as the first boundary.
- Status: Proposed (owner review required)
- Affects: `services/api/src/http/problem-details.filter.ts`, `apps/web/lib/api.ts`, `packages/domain/src/observability-scrub.ts`, `services/api/src/platform/observability.ts`, `services/api/src/reports/reports.controller.ts`, `docs/runbook.md`, `platform/observability`

### D-261: Host-independent secret and local-stack hygiene, with a signed marker and a nonce policy

- Date: 2026-11-22
- Decision: phase 9 binds every published local port to `127.0.0.1`, removes API-only secrets from the web container, requires TLS for SMTP in production, rejects development secret values at production startup, signs and single-uses the sign-up intent, accepts only a published consent version, removes script `unsafe-inline` and adds HSTS, COOP and CORP on the web surface. The host-specific TLS certificate, provider, bucket and secret store are deferred to the deployment change.
- Reason: the repository can ship all of these as config and guard code without choosing a host. The local-stack leak is especially concrete: Mailpit shows verification and reset tokens to any LAN peer. The signed marker closes a forgeable cookie without a new service.
- Alternatives rejected: a paid CAPTCHA (cost and privacy); binding all ports to a Docker network only (a contributor on the host still needs the ports); keeping `unsafe-inline` because there is no current sink (the audit's point is that a future sink loses the main mitigation).
- What would change this decision: the owner's pilot does not expose the local stack on a shared network, in which case the loopback default is still harmless; or the deployment's TLS terminator cannot pass the nonce header, in which case the CSP uses hashes.
- Status: Proposed (owner review required)
- Affects: `compose.yaml`, `.env.example`, `services/api/src/email/smtp-email-sender.ts`, `apps/web/lib/sign-up-intent.ts`, `apps/web/lib/security-headers.ts`, `apps/web/next.config.ts`, `services/api/src/consent/drizzle-consent.service.ts`, `platform/local-stack`, `platform/http-security-controls`, `platform/rate-limits`, `trust/consent-and-audit-records`

### D-262: Pin the supply chain and make every audit-relevant doc claim earn its status

- Date: 2026-11-22
- Decision: phase 10 pins every GitHub Action to a full commit SHA with a version comment, sets a 7-day minimum package release age, blocks exotic subdependencies and records the trust policy (or the pnpm equivalent), and changes every false `DONE` claim named by the audit to `PARTIAL` with a debt row, a test or a dated citation. A status changes only with evidence in the same row.
- Reason: the current mutable tags and `minimumReleaseAgeExclude`-only config leave a compromised tag or a fresh malicious version able to run in CI. The docs are the other half of the same trust problem: a `DONE` row that hides an unimplemented control is worse than an honest `PARTIAL`.
- Alternatives rejected: Dependabot alone (does not pin the current tag); a full lockfile policy platform (a new dependency and a process the one-person team cannot maintain); leaving docs for archive (the audit found them now).
- What would change this decision: a repository ruleset that already pins actions centrally, which would make the SHA task a verification rather than a write.
- Status: Proposed (owner review required)
- Affects: `.github/workflows/ci.yml`, `pnpm-workspace.yaml`, `docs/functional-requirements.md`, `docs/security-requirements.md`, `docs/known-debt.md`, `docs/runbook.md`, `docs/api-contracts.md`, `docs/auth-and-access-control.md`, `docs/data-model.md`, `platform/ci-pipeline`

## Risks / Trade-offs

- **A trusted client key can be spoofed if the trust boundary is wrong.** Mitigation: the API accepts the key only from the BFF network and ignores the header from a public peer; the test sends a spoofed header and asserts it changes nothing.
- **Auth before body parsing can break a legitimate upload if the middleware runs before the route matcher.** Mitigation: scope the middleware to the two evidence paths, keep the existing route body allowlist, and assert a valid upload still reaches the scanner.
- **Deleting evidence is irreversible.** Mitigation: phase 7 requires a dry run, a backup check and a recorded list before the first real sweep; the settled-state rule stays and the new maximum only applies to a never-settled outcome.
- **A nonce CSP can break the Next bootstrap.** Mitigation: enumerate the inline scripts in the built page, add the nonce in the framework hook, run the five-flow browser checklist, and keep `WEB_CSP_MODE=report-only` as a one-deploy rollback.
- **The role-grant check could block a legitimate self-grant used for dogfooding.** Mitigation: only institution-admin self-grant is refused; self-grant of `MENTOR` remains allowed, and the audit records it.
- **The docs truth phase may be seen as paperwork.** Mitigation: each changed row names the code or test that justifies it; a claim with no evidence becomes `PARTIAL`, never a silent `DONE`.
- **Phase 7 and phase 3 both touch the privacy service's session checks.** Mitigation: phase 3 adds the re-authentication guard; phase 7 adds deletion completeness; both have separate tests and the merge order is phase 3 then phase 7.

## Migration Plan

1. There is no schema migration. Apply phases in numeric order on one branch per phase; each phase can merge alone, subject to the two shared-file notes in the proposal.
2. Phase 1 deploys with the existing 30-day session policy and no data change.
3. Phase 2 changes only middleware and the BFF cap; no stored object changes.
4. Phase 3 and 4 change guards and config; rollback is the previous image, with no data change.
5. Phase 5 changes the browser/BFF contract; the API header remains optional, so an older client still works.
6. Phase 6 changes only the report predicate; existing outcomes are not rewritten.
7. Phase 7 is the only irreversible phase. Before the first real deletion: run the sweep with the dry-run switch, export the list to the operator, confirm a backup, then flip the switch for one run. The rollback is a restore, not a code revert.
8. Phase 8 changes logs and Sentry; rollback is the previous image, and the old log line is not restored as a permanent state.
9. Phase 9's local changes are Compose and guard code; the production values are deferred. The CSP rollback is `WEB_CSP_MODE=report-only`.
10. Phase 10 changes CI and docs; rollback is the previous workflow, and a pinned SHA can be updated through a normal PR.

## Open Questions

1. **How is the client key trusted at the edge?** Safe default: the BFF derives it from the transport peer and forwards it on the internal hop; the API trusts the header only from the BFF network. If the deployment adds a reverse proxy, the proxy must overwrite the header, never append to a client value.
2. **What idle and absolute values do admins get?** Safe default: 30 minutes idle and 12 hours absolute, as requested; the values are configuration and can change without code.
3. **May a platform admin hold institution-admin scope?** Safe default: no self-grant; the owner may allow it explicitly, with an audit row. This is a separation-of-duties decision, not a security bypass.
4. **How long after a mentorship ends can an outcome be reported?** Safe default: 90 days from the ending instant; a constant in `@connect/config` until pilot data justifies a config version.
5. **How long is evidence for a never-settled outcome kept?** Safe default: 90 days from upload, with the settled-state rule still earlier when it applies.
6. **Is an unreachable HIBP provider allowed to accept the password?** Safe default: keep D-249's fail-open behavior unchanged; this change does not touch the breach check.
7. **When must SMTP require TLS?** Safe default: production only; local Mailpit remains plaintext by explicit development configuration. The provider and port stay deferred.
8. **Where do production secrets live?** Safe default: the host's secret store; phase 9 adds the startup guard and the rotation table, not a Vault or a paid service.
9. **Does erasure require ledger redaction?** Safe default: no ledger change in this proposal; phase 7 deletes the non-ledger subset and leaves the question to counsel. This is the one Open Question that blocks full closure of SEC-AUDIT-009.
10. **Should the sign-up intent use a CAPTCHA?** Safe default: no; a signed single-use marker plus the existing rate limits and email verification are the pilot answer.
11. **Which CSP form is used for styles?** Safe default: nonce for scripts; nonce or hash for the inline styles the built page actually uses. If the framework cannot nonce a style, that residual is recorded as a separate low finding, not hidden.
12. **Which doc claims become PARTIAL?** Safe default: any claim whose cited code or test does not exist; a `DONE` row is changed only with a citation and a debt ID, never by rewording alone.
