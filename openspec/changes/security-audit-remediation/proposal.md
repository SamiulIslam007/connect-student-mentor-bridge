# Proposal: security-audit-remediation

## Why

The 2026-11-22 security audit found 28 issues in the connect repository: 0 Critical, 5 High, 16 Medium and 7 Low. Five are exploitable in the documented browser-to-BFF topology (shared throttle buckets, a 5 MiB unauthenticated body buffer, self-review of an outcome, login CSRF through `text/plain`, and mentor MFA not enforced), and the rest are privacy, logging, local-stack, supply-chain and docs-truth defects. The audit is evidence, not a fix: this change turns it into ten independently applicable phases so a review can approve and merge one phase at a time.

## What Changes

Ten phases, each with its own tasks, tests, docs and hard out-of-scope list:

1. **BFF client identity and rate limits** — a trusted client key reaches the API, so one BFF address no longer collapses every user into one sign-in/registration/write bucket; the per-account bucket stops being a targeted lockout.
2. **Evidence body auth and BFF cap** — authenticate and bound the evidence upload before buffering; the raw 5 MiB parser becomes route-scoped, and the break-glass BFF reads a bounded body.
3. **Admin separation of duties** — a reviewer cannot review an outcome they are a party to; role grants are atomic and attributable; export/delete require recent proof.
4. **Mentor MFA and admin sessions** — mentor routes require an enrolled second factor; admin sessions get a 30-minute idle and 12-hour absolute limit.
5. **BFF write integrity** — the BFF forwards or generates `Idempotency-Key`, every mentorship write uses `csrfFetch`, dynamic ids are encoded, and pre-session writes accept JSON only.
6. **Outcome reporting window** — report only from an active or recently ended mentorship, with `occurred_on` inside the mentorship's dates and a 90-day ending window.
7. **Erasure and evidence retention** — deletion removes non-ledger personal data and evidence objects; an unsettled outcome's evidence has a 90-day maximum; admin evidence reads are case-scoped.
8. **Logging and error redaction** — 500s and Sentry stop carrying SQL, parameters, query strings, tokens and message text; report details are validated; the runbook states the real log behavior.
9. **Secret and local-stack hygiene** — loopback-only local ports, no API-only secret in the web container, TLS-required SMTP in production, a signed sign-up marker, a current consent version, and a nonce-based CSP with HSTS.
10. **Supply chain and doc truth** — SHA-pinned GitHub Actions, pnpm release-age/trust policy, and every audit-relevant doc claim either implemented or marked PARTIAL with a debt row.

## Capabilities

### New Capabilities

- `platform/observability`: one contract for bounded diagnostics — what a 500 response, server log and error report may carry, and how exception values and contexts are scrubbed.

### Modified Capabilities

- `platform/rate-limits`: trusted client identity, target-resistant account throttling and a signed sign-up marker.
- `platform/request-validation`: authenticate before buffering an evidence body; bound report details.
- `mentorship/platform-review`: a reviewer is never a participant in the case.
- `identity/role-authorization`: mentor-route MFA; atomic, attributable role grants and no self-grant of institution scope.
- `identity/session-management`: privileged idle and absolute session limits.
- `mentorship/outcome-verification`: a reporting window and a bounded `occurred_on`.
- `mentorship/outcome-evidence`: case-scoped admin evidence reads.
- `trust/evidence-retention`: a maximum retention for evidence whose outcome never settles.
- `trust/privacy-export-and-erasure`: non-ledger erasure completeness and recent re-authentication.
- `platform/http-security-controls`: JSON-only pre-session writes, HSTS on the web surface, and a nonce-based script policy.
- `platform/idempotency`: the BFF forwards or generates the key the API already supports.
- `platform/local-stack`: loopback-only published ports, API-only secret containment, TLS-required SMTP in production, and a production secret guard.
- `platform/ci-pipeline`: pinned actions and package-release age policy.
- `trust/consent-and-audit-records`: a consent version must be one the product has published.

## Finding-to-phase coverage

Every finding appears exactly once. The phase number is the implementation group in `tasks.md`.

| Finding | Phase | One-line scope |
|---|---|---|
| SEC-AUDIT-001 | 1 | Trusted client key; no shared BFF address bucket |
| SEC-AUDIT-002 | 2 | Auth and bound before buffering the evidence body |
| SEC-AUDIT-003 | 3 | Reviewer cannot be a participant |
| SEC-AUDIT-004 | 5 | JSON-only pre-session BFF writes; no login CSRF |
| SEC-AUDIT-005 | 1 | Account throttle cannot lock a victim out |
| SEC-AUDIT-006 | 4 | Mentor routes require a second factor |
| SEC-AUDIT-007 | 6 | Report window and `occurred_on` bounds |
| SEC-AUDIT-008 | 7 | Case-scoped, reasoned admin evidence reads |
| SEC-AUDIT-009 | 7 | Delete non-ledger personal data and evidence objects |
| SEC-AUDIT-010 | 7 | Maximum retention for unsettled evidence |
| SEC-AUDIT-011 | 8 | No SQL, parameters, tokens or PII in logs/Sentry |
| SEC-AUDIT-012 | 9 | Signed, single-use sign-up intent |
| SEC-AUDIT-013 | 4 | Admin idle 30 minutes, absolute 12 hours |
| SEC-AUDIT-014 | 9 | Loopback-only local ports; no LAN token theft |
| SEC-AUDIT-015 | 5 | BFF forwards or generates `Idempotency-Key` |
| SEC-AUDIT-016 | 3 | Atomic, correctly attributed role grants; no self-grant |
| SEC-AUDIT-017 | 9 | Nonce CSP, HSTS, no `X-Powered-By` |
| SEC-AUDIT-018 | 9 | Remove the Google secret from the web container |
| SEC-AUDIT-019 | 9 | TLS-required SMTP in production |
| SEC-AUDIT-020 | 5 | Encode the institution id in the BFF path |
| SEC-AUDIT-021 | 5 | Six mentorship writes use `csrfFetch` |
| SEC-AUDIT-022 | 9 | Consent version must be published |
| SEC-AUDIT-023 | 8 | Bound report details before the DB check |
| SEC-AUDIT-024 | 10 | SHA-pinned actions; pnpm release-age policy |
| SEC-AUDIT-025 | 8 | Breach, key-rotation and break-glass runbook |
| SEC-AUDIT-026 | 10 | Docs truth: implement or mark PARTIAL with a citation |
| SEC-AUDIT-027 | 9 | Secret-store contract and production guard |
| SEC-AUDIT-028 | 3 | Recent re-authentication for export and delete |

**Count check:** phase 1 has 001 and 005; phase 2 has 002; phase 3 has 003, 016 and 028; phase 4 has 006 and 013; phase 5 has 004, 015, 020 and 021; phase 6 has 007; phase 7 has 008, 009 and 010; phase 8 has 011, 023 and 025; phase 9 has 012, 014, 017, 018, 019, 022 and 027; phase 10 has 024 and 026. The table has 28 rows and no ID repeats.

## Findings re-checked at HEAD

| Finding | Re-check result |
|---|---|
| SEC-AUDIT-003 | The audit's sentence "`review()` never reads the participants" is **wrong at this HEAD**: `drizzle-outcome.service.ts:730` calls `readOutcomeParticipants` for the notification email. The finding still exists: the result is not compared with `input.userId`, so a participant admin can review their own case. The task adds the refusal and an audit row; the report's evidence sentence is corrected here. |
| SEC-AUDIT-009 | The missing evidence and non-ledger PII are real. The audit's recommendation to redact `outcomes.title/description` is **blocked** by the open question in `docs/data-model.md:686` and `AGENTS.local.md` §1.1: erasure versus the append-only ledger is counsel's decision. This change implements only the safe non-ledger subset and records the ledger question as an Open Question; the finding is therefore partially covered by design. |
| SEC-AUDIT-010 | Real, but it **contradicts** `trust/evidence-retention`'s current "a live outcome keeps its file" rule. The change uses a MODIFIED requirement plus a new maximum-retention requirement; the task is a spec change, not a code-only patch. |
| SEC-AUDIT-008 | Real as a policy weakness. The existing `mentorship/outcome-evidence` spec permits any `PLATFORM_ADMIN` with MFA, so this change tightens the spec itself; it is not a code-only mismatch. |
| SEC-AUDIT-005 | Real: `accountTracker` reads the body email first (`services/api/src/http/account-throttler.ts:11-24`), and the account bucket is spent before the credential is checked. |
| SEC-AUDIT-017 | Real: `apps/web/lib/security-headers.ts` still has `'unsafe-inline'` for script and style, sends no HSTS, and `next.config.ts` does not set `poweredByHeader: false`; the live web response advertises `X-Powered-By: Next.js`. |
| SEC-AUDIT-024 | Real: all `uses:` entries in `.github/workflows/ci.yml` use tags, and `pnpm-workspace.yaml` has `minimumReleaseAgeExclude` but no `minimumReleaseAge`, `blockExoticSubdeps` or `trustPolicy`. |
| SEC-AUDIT-026 | Real: the cited docs still say "No route sets that flag yet", "HSTS on both", "evidence files purged" and "logs never carry tokens/message bodies". The tasks change the status or the code, never both silently. |

All other findings were re-opened at their cited files and still behave as the report says. No finding is already fixed at HEAD.

## Impact

- **Code**: `apps/web/lib/bff.ts`, the auth and privacy BFF routes, `apps/web/lib/security-headers.ts`, `apps/web/lib/csrf-client.ts`, `apps/web/lib/sign-up-intent.ts`, `apps/web/app/mentorship/[id]/page.tsx`; `services/api/src/main.ts`, `http/request-body.ts`, `http/account-throttler.ts`, `http/problem-details.filter.ts`, `evidence/*`, `outcomes/*`, `privacy/*`, `identity/*`, `consent/*`, `reports/*`, `email/smtp-email-sender.ts`; `packages/domain/src/observability-scrub.ts`; `packages/config/src/index.ts`; `compose.yaml`, `pnpm-workspace.yaml`, `.github/workflows/ci.yml`.
- **Database**: no new table and no migration. Phase 7 deletes rows/objects in existing tables; phase 3 adds no column. If apply finds a required column, it stops and opens a separate change.
- **Dependencies**: none. Nonce generation uses `node:crypto`; SMTP TLS is a Nodemailer option; pnpm settings are native; the provenance pin is a YAML edit.
- **Docs**: `README.md` status line, `docs/security-requirements.md`, `docs/auth-and-access-control.md`, `docs/data-model.md`, `docs/api-contracts.md`, `docs/functional-requirements.md`, `docs/known-debt.md`, `docs/runbook.md`, `docs/local-setup.md`, `docs/decision-log.md`, `docs/data-privacy-and-retention.md` and `docs/production-requirements.md`, each only in the phase that owns the change.
- **Tests**: targeted API/web/domain tests per phase, plus the existing full gates and `openspec validate --all --strict`.

## Dependencies and order

The ten phases are behaviorally independent and can be reviewed one at a time. Two edits are shared:

- Phases 2 and 5 both edit `apps/web/lib/bff.ts`; land one, then rebase the other.
- Phase 9's CSP work edits `apps/web/lib/security-headers.ts` and its test; it does not depend on phase 8 once the log contract is separate.

Phase 3's recent-reauthentication check needs the session metadata introduced by phase 4 only if apply chooses one shared helper; otherwise it is a standalone guard. Phase 7's deletion uses the evidence storage interface from phase 2 but does not require phase 2's parser change to merge.

## Out of scope

- **A production host, TLS certificate, SMTP provider, secret manager, or managed Postgres.** Phase 9 ships config and guards only; the host-specific values belong to the active `first-deployment-restore-drill-and-observability` change.
- **Redacting ledger rows.** Phase 7 does not alter `outcomes`, `outcome_events`, `verification_records`, `reputation_events`, `consent_records` or `audit_logs`; erasure versus the ledger is an Open Question.
- **A new CAPTCHA, paid bot service, or shared throttle store.** The signed intent and layered limits are the pilot answer.
- **Rewriting the CSP to remove every inline style.** The phase targets script nonces and the HSTS/powered-by/COOP/CORP gaps; a full style refactor is not required to remove the script risk.
- **Changing the active `first-deployment` change or the audit report.** Both are read-only inputs.
- **Running privileged-account, Google OAuth, real clamd, or e2e tests in this propose run.** They are apply-phase checks, and the absence is recorded.

## Risks and rollback

| Risk | Mitigation |
|---|---|
| A shared BFF edit makes phases 2 and 5 conflict | Land them in order; the body reader is the only shared function, and each phase adds a separate test file. |
| An admin session timeout locks out the only pilot admin | The idle and absolute limits are configuration; the rollback is one environment value and a restart. The change records the values in the runbook. |
| Erasure deletes evidence a reviewer still needs | Phase 7 keeps the settled-state rule and deletes only after the maximum unsettled window; a review case holds the clock, and the object deletion is audited. |
| A nonce CSP breaks Next's inline bootstrap | The task enumerates the inline scripts in the built page, adds the nonce through the framework hook, runs the browser checklist, and keeps `WEB_CSP_MODE=report-only` as the one-deploy rollback. |
| Pinning an action SHA blocks a security update | Dependabot/Renovate opens the SHA update; the policy is reviewed quarterly, and the task records the current SHA and version. |
| The docs truth change is mistaken for built work | A `DONE` row needs the cited file or test in the same row; otherwise it becomes `PARTIAL` with a debt ID. No checkbox is ticked from a proposal. |

**Rollback:** each phase is a small commit set with no schema change. Revert the phase; phase 1's trusted key falls back to the existing address key, phase 4's session limits return to 30 days, phase 7's deletions are forward-only (the audit log records them, and a restore is the only recovery), phase 9's headers return to the current set, and phase 10's pins can be reverted without touching runtime code. Phase 7 is the only irreversible one; its tasks require a dry run and a backup check before the first real deletion.

**Traces to** SEC-AUDIT-001 to SEC-AUDIT-028, `SEC-AUTH-2`, `SEC-AUTH-4`, `SEC-API-1`, `SEC-API-4`, `SEC-API-6`, `SEC-API-7`, `SEC-DATA-5`, `SEC-FILE-1`, `SEC-FILE-3`, `SEC-ABUSE-1`, `SEC-SUP-1`, `SEC-SUP-4`, `FR-OUT-01`, `FR-OUT-02`, `FR-OUT-03`, `FR-OUT-06`, `FR-OUT-10`, `FR-PRIV-01`, `FR-PRIV-02`, `FR-PRIV-03`, `FR-CONS-01`, `FR-ADM-01`, `FR-ADM-06`, `D-48`, `D-85`, `D-118`, `D-158`, `D-220`, `D-249`, and the new D-253 to D-262.
