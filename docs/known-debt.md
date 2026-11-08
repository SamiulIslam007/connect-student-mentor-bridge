---
title: Known Debt and Owners
status: Draft
owner: Owner / CTO
date: 2026-11-03
sources: [docs/milestones-and-phases.md, docs/decision-log.md, docs/security-requirements.md]
---

# Known Debt and Owners

> Accepted, tracked debt. A row is closed only when the owning change lands and its verification is recorded. This file does not replace the OpenSpec change that fixes an item; it says who owns it and where it is scheduled.

## 1. Debt register

| ID | Debt | Impact | Owner / target | Status |
|---|---|---|---|---|
| DEBT-01 | `SEC-API-1`: unknown request fields are accepted and ignored by the API | A Must security requirement is unmet; clients can send unintended account-level keys (they are ignored today) | Sprint 7 hardening (D-41) | Open |
| DEBT-02 | No rate limiting on sign-up, sign-in, password reset, or field creation | Credential stuffing, audit/signup-block flooding, and taxonomy spam are unthrottled | Sprint 7 hardening | Open |
| DEBT-03 | No CSRF token on cookie-authenticated writes | SameSite=Lax is the pilot boundary; a dedicated token is not implemented | Sprint 7 hardening | Open |
| DEBT-04 | Audit insert after the library created a session can leave a live session with a 500 | Orphan session row for up to 30 days; the client does not receive the token | `sprint1-hardening-and-plan-closure` (fail closed) | Closed 2026-11-03: the session is revoked when the success audit fails; fault-injection test asserts zero sessions and a generic 500 |
| DEBT-05 | `readJson` tolerates a non-JSON upstream body and returns `{}` | A malformed upstream response can be shown as an empty success/error | `sprint1-hardening-and-plan-closure` | Closed 2026-11-03: `forwardUpstream` maps a non-JSON body to a `502` problem; web route test asserts the HTML is not passed through |
| DEBT-06 | Dev-only advisories: `esbuild@0.18.20` (via drizzle-kit's loader) and `minimatch@10.2.6` (via ESLint) | Dev-time ReDoS/dev-server exposure only; `pnpm audit --audit-level high` passes | Tooling owner; upgrade with the parent tool | Open |
| DEBT-07 | Cross-script confusable field names are not folded | Two lookalike fields can split matching/reputation keys | Phase 1b field curation (D-43) | Open |
| DEBT-08 | Under-18 signup block can be used to pre-block an arbitrary email | A victim cannot register a new account with that address for 12 months; an existing account can still sign in | Revisit before the pilot; D-40; Sprint 7 rate limit reduces volume | Accepted risk |
| DEBT-09 | Status read and session insert are not one transaction | A narrow race can leave one live session for a suspended account | `FR-ADM-05` / Sprint 7 administration work | Open |
| DEBT-10 | `0001_backfill_active_verified.sql` writes no audit rows | The backfilled status changes have no audit trail | Audit owner; fold into the first audit-repair change | Open |
| DEBT-11 | SMTP has no retry and no provider failover | A failed verification/reset email is only logged; the user can request another link | `outbox-and-job-runner` (6a, Sprint 3) | Open |
| DEBT-12 | A `429` from the identity library is not translated to a rate-limit response; it surfaces as a generic `500` | A throttled client sees "unexpected error", not "try again later". The library's own limiter is the only throttle today | Sprint 7 rate limiting | Open |
| DEBT-13 | `database-probe` swallows a pool-close error (`client.end().catch(() => undefined)`) | A cleanup failure is invisible; the probe result is unaffected | Sprint 7 observability pass | Open |
| DEBT-14 | Profile visibility is not wired to a read endpoint, the MFA-by-role guard has no route that sets the flag, and the admin idle/absolute session timeouts are not implemented | The policy and the guard exist and are tested, but discovery (#6) is the first read consumer; nothing yet forces a mentor to enroll before acting | `#6` for the consumer; Sprint 7 with the admin surface for the timeouts (D-48, D-49) | Narrowed 2026-11-05: `roles-and-profile-visibility` (4c) shipped the role model, the role guard, `requiresMfa`, the permission-matrix test, and `canViewProfile`. Narrowed 2026-11-08: #5 shipped mentor activation and the first MFA-gated state |
| DEBT-15 | The provider sign-in success path is not exercised end to end by a test | The state, refusal, and unconfigured paths are covered; the token exchange needs real Google credentials and a reachable provider | Owner supplies `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`; manual acceptance before Gate 2 | Narrowed 2026-11-04: verified live to Google's consent screen (authorization URL accepted, `client_id` and `redirect_uri` registered correctly); completing the exchange still needs a real Google account login + consent, so the session/DB/outcome leg of the success path remains unverified by test |
| DEBT-16 | The session cookie is `Secure` when `NODE_ENV=production`, so a plain-`http` LAN address (for example `http://192.168.1.10:3000`) loses the session | The page loads but every authenticated call answers `401`, so a device on the LAN cannot stay signed in | Owner; before any LAN or device testing | Open |
| DEBT-17 | `APPLICATION_ONLY` is stored and validated but no route or list is gated by it, and resume runs no capacity check | A mentor can choose a mode whose effect is not built, and a paused mentor with active mentorships resumes without the `CAPACITY_BELOW_ACTIVE` check | `requests-and-capacity` (#7) adds the gate and the capacity check to the resume handler; the UI states that applications are not built | Open |
| DEBT-18 | A mentor becomes `ACTIVE` without accepting the volunteer agreement or community guidelines, and no orientation is recorded | FR-PROF-03 is only half enforced: Level 1 plus a second factor is enough. `VOLUNTEER_AGREEMENT`/`COMMUNITY_GUIDELINES` consents are still never written, and `orientation_completed_at` is not created | `mentor-agreements-and-orientation` (unscheduled; needs a consent-policy decision). The activation predicate is one pure function, so adding the clause is one line plus its tests | Open |
| DEBT-19 | No institution-admin affiliation surface: a `PENDING` claim has no approve or reject path, and the pilot's Level 1 comes from the checked-in seed | A non-institutional-email user cannot be verified without a code change and a redeploy; the deferred rows of `docs/api-contracts.md` §5.2 do not exist | Sprint 7 administration work (D-56) | Open |

## 2. Not debt

- **`@types/nodemailer` stays.** `nodemailer@10.3.1` ships no bundled type declarations, so the package is required for `tsc`.
- **Outbox and pg-boss are not debt.** They are scheduled as `outbox-and-job-runner` (6a, Sprint 3) in `docs/mvp-build-plan.md`.
- **Availability and access mode are not debt.** Delivered by `profile-availability-and-access-mode` (4b, archived 2026-11-05); the inert `APPLICATION_ONLY` and the missing capacity check are DEBT-17.
- **Google, MFA, and the session list are not debt.** Delivered by `access-google-mfa-and-sessions` (4a, archived 2026-11-04); the web surfaces that reach them ship with `account-access-ui`.

## 3. Rules

1. A debt row names one owner and one target, and the target is a sprint or a named change.
2. A debt row is removed only with evidence (a test, a contract update, or a migration) recorded in the owning change.
3. A debt row that becomes a blocker for a sprint moves to the front of that sprint; it is not silently carried.