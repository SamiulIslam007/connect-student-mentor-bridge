---
title: Authentication and Access Control
status: Approved (MVP baseline, owner decision)
owner: Owner
date: 2026-10-29
sources: README.md (sections 8, 12.1); connect-research-report.md (Sections 5.4, 5.7, 6, Doc 12, Doc 4 E); ADR-003, ADR-008, ADR-010 in architecture-decisions.md
---

# Authentication and Access Control

> **Scope.** Who can sign in, how sessions work, which roles exist, and exactly what each role may do. This document defines the rules; `docs/security-requirements.md` defines how they are hardened and tested; `docs/api-contracts.md` shows where they appear in the API.
>
> Labels used: **Plan target**, **Proposed default**, **Recommendation**, **Open decision**, **Verified [S#]**, **Unverified** (see README section 1.1).

## 1. Principles

1. **Authentication is not authorization.** The auth library proves who someone is. Our own policies decide what they may do (README 8.3).
2. **Deny by default.** Every endpoint declares the policy that protects it. An endpoint without a declared policy fails CI.
3. **Object-level checks everywhere.** A role is never enough. A mentor acts only on their own mentorships and outcomes.
4. **Collect less.** No government ID, no card data (ADR-010).
5. **Platform decides trust.** Institution admins attest *affiliation* only. They never edit outcomes, reputation, or disputes (research report 3.1 #3).
6. **Wrap the provider.** All identity operations go through an `IdentityService` interface so the vendor can change (ADR-003).

## 2. Roles

| Role | Code name | Phase | Purpose |
|---|---|---|---|
| Student | `student` | 1 | Requests guidance, reports outcomes |
| Mentor | `mentor` | 1 | Guides students, confirms or disputes outcomes |
| Institution Admin | `institution_admin` | 1 (minimal) | Approves mentor affiliation, views aggregates for their own institution |
| Platform Admin | `platform_admin` | 1 | Owns disputes, audits, moderation, configuration |
| Employer | `employer` | 3 (**Later**) | Defined in Phase 3. No Phase 1 permissions |

**Dual roles (Recommendation, N6):** one `User` can hold several roles through `RoleAssignment`. A person can be both a Student and a Mentor via separate profiles. Rules:

- A user can never act on a mentorship in which they are both parties.
- Roles that are scoped (for example `institution_admin`) carry an `institution_id`.
- Roles are resolved on the server from the database on each request, **not** trusted from token contents, so a revoked role takes effect immediately.

## 3. Identity model

| Entity | Key facts |
|---|---|
| `User` | UUID primary key. This UUID is the stable `sub` for every token and never changes across identity providers (ADR-003). |
| `AuthAccount` | Links a user to a sign-in method (password, Google) |
| `RoleAssignment` | `user_id`, `role`, optional `institution_id`, `granted_by`, `granted_at`, `revoked_at`. Read from the table on every request, never trusted from a token (**built** by `roles-and-profile-visibility`, 4c) |
| `Affiliation` | `user_id`, `institution_id`, `level` (0, 1, 2), evidence method, `verified_by`, `verified_at` |
| `ConsentRecord` | Append-only record of each consent given or withdrawn |
| `AuditLog` | Append-only record of security-relevant actions (section 12) |

## 4. Registration and sign-in

### 4.1 Methods

| Method | Phase | Notes |
|---|---|---|
| Email and password with email verification | 1 | Required before any request can be sent. Forgot-password flow included |
| Google sign-in (OIDC) | 1 | Email must be verified by the provider |
| Facebook and LinkedIn sign-in | **Later** | Only after a successful pilot |
| Phone OTP | **Not in the MVP** (owner decision) | SMS cost and deliverability unverified; not built |
| Microsoft sign-in | **Not supported** (owner decision) | Removed entirely. Google plus institutional email checks cover the pilot |
| Institution SSO (SAML or OIDC) | **Later** | Added when the first university requires it (section 11) |

### 4.2 Age rule (Recommendation, N1)

- **18+ only in the pilot.** Bangladesh's PDPA 2026 defines a child as under 18 and requires verifiable parental consent **[S1, secondary source; counsel to read the primary text]**.
- Sign-up asks for a date of birth **only** to enforce the gate. The value is checked in the request and is **not stored**; the record keeps `age_18_plus = true` and `age_gate_passed_at`. Under-18 attempts are blocked with a clear message.
- For a blocked attempt, keep only what is needed to stop immediate re-registration (a salted hash of the email and a timestamp, **Proposed default**; confirm with counsel). Do not keep the date of birth or profile data.
- Where an institution can attest enrollment or alumni status, record that attestation (section 7).

### 4.3 Passwords (Proposed defaults)

- Minimum length 12 characters; allow long passphrases (at least 64 characters); no forced composition rules and no scheduled rotation; reject passwords found in known breach lists. This follows the direction of current NIST guidance (**Unverified in this session**; confirm against the current text before approval).
- Store only salted hashes using a modern password hashing algorithm (Argon2id or scrypt, per the library's secure default). Never log or return passwords or hashes.
- Password reset links are single-use, expire in a short time (**Proposed default: 30 minutes**), and invalidate all existing sessions when used.

### 4.4 Email verification

- A verification link or code is required for every account. An unverified account **cannot sign in and cannot complete a profile**: opening the verification link is the only path from `PENDING` to `ACTIVE`, and only an `ACTIVE` account holds a session (FR-AUTH-08, `identity/account-status-lifecycle`). Until then the account cannot send requests, receive requests, or report outcomes (requirement AUTH-1).
- Verification links are single-use and expire (**Proposed default: 24 hours**).

### 4.5 Multi-factor authentication

| Role | MFA | Method |
|---|---|---|
| Mentor | **Required** (README 8.1) | TOTP first |
| Institution Admin | **Required** | TOTP first |
| Platform Admin | **Required** | TOTP first; hardware key later (Open decision) |
| Student | Available, optional | TOTP |

- Recovery codes are issued at enrollment (single-use, shown once).
- Lost-device recovery for admins requires a second platform admin or a documented identity check. **Open decision:** the recovery procedure while there is only one platform admin.
- Sensitive actions (change email, change password, disable MFA, export data) require recent re-authentication (**Proposed default: within 10 minutes**).
- **Implemented 2026-11-04** (`access-google-mfa-and-sessions`): TOTP enrollment, verification at sign-in and during enrollment, backup codes, password-confirmed disable, per-challenge attempt limits and account lockout (D-45). A sign-in for an account with an active factor returns `mfa_required` and no session. Provider sign-in is refused for such an account so the factor cannot be bypassed (D-46). Enforcement keyed on `role_assignments` (mentor and admin roles) arrives with 4c.
- **Implemented 2026-11-05** (`account-access-ui`): enrollment and disable happen in the web app at `/account/security`, and `GET /v1/me` reports `mfa_enabled` so the page can tell an enrolled account from an unenrolled one. The secret and the backup codes are shown once, in page state only. Signing out of the current session (the app header) is separate from signing out of every session (`/account/sessions`) (D-48).

## 5. Sessions and tokens

| Item | Implemented (2026-11-03) |
|---|---|
| Session model | Postgres-backed cookie session held by better-auth; the session row is the source of truth. No access/refresh token pair (D-31) |
| Session lifetime | 30 days, refreshed at most once a day (`updateAge` 1 day). A revoked row fails the next request immediately. Admin idle and absolute timeouts arrive in Sprint 7 with the admin surface (D-48) |
| Web storage | **httpOnly, Secure outside development, SameSite=Lax cookie** set by the `apps/web` route handlers. No token in `localStorage`, `sessionStorage`, or any response body the browser can read |
| CSRF | Next.js same-origin form handling plus SameSite=Lax during the pilot; a dedicated token is a Sprint 7 hardening item |
| Idle timeout | 30 minutes (admin) and 8 hours (privileged roles) are **deferred to Sprint 7** with the admin surface (D-48); Student and Mentor have no shorter idle timeout in Sprint 1 |
| Absolute lifetime | 30 days for every role in Sprint 1; the admin 8-hour absolute lifetime arrives in Sprint 7 with the admin surface (D-48) |
| Revocation | Sign-out, sign-out-everywhere, and password reset delete session rows. Password reset revokes every session for the account (SEC-AUTH-5 maps to session-row revocation, not a refresh-token family) |
| Concurrent sessions | Allowed. `GET /v1/me/sessions` lists the caller's live sessions with safe metadata only (no token), and `DELETE /v1/me/sessions/{id}` is idempotent for the caller's own ids and `404` for another account's id (implemented 2026-11-04, `access-google-mfa-and-sessions`) |

**Session content.** The API resolves the account from the session row on every request; roles and permissions are read from the database and never trusted from a token.

**Transport rule (owner decision, 2026-10-29).** The browser never calls the API directly. The Next.js app is the backend-for-frontend on the same origin and holds the session cookie; it forwards requests to NestJS with `Authorization: Bearer <session token>`. The API accepts Bearer for non-browser clients and does not set browser cookies itself. This keeps CSRF handling in one place and avoids cross-origin cookie configuration between the `web` and `api` containers.

## 6. The `IdentityService` seam

Domain code depends only on this interface (TypeScript sketch, **Recommendation**):

```ts
interface IdentityService {
  register(input: RegisterAccountInput): Promise<{ status: 'VERIFICATION_SENT' }>; // dateOfBirth is checked, never persisted
  verifyEmail(input: VerifyEmailInput): Promise<void>;
  signIn(input: SignInInput): Promise<SignInResult>;
  signOut(input: SessionInput): Promise<void>;
  signOutEverywhere(input: SessionInput): Promise<void>;
  requestPasswordReset(input: PasswordResetRequestInput): Promise<void>; // always returns the same response
  resetPassword(input: PasswordResetInput): Promise<void>;
  getSession(input: SessionLookupInput): Promise<AccountSummary | null>;
}
```

The implemented interface lives in `packages/domain/src/identity.ts`. It gained `enrollMfa`, `verifyMfa`, `disableMfa`, `listSessions`, `revokeSession`, `startProviderSignIn`, and `completeProviderSignIn` with the Sprint 2 change `access-google-mfa-and-sessions`.

Rules: the interface returns domain types, never library types. A user ID returned by any implementation is the same UUID. Swapping to Keycloak, Auth0, or WorkOS means writing a new implementation of this interface.

## 7. Mentor and affiliation verification

Affiliation verification (is this person who they say and where they say) is separate from outcome verification (was this result confirmed). See the glossary.

| Level | Meaning | How (no government ID) | Effect |
|---|---|---|---|
| 0 | Email verified | Verification link | Can build a profile. **Cannot receive requests** |
| 1 | Affiliation verified | Institutional email domain check, or institution admin attestation | **Required to receive requests and build reputation** |
| 2 | Employer check | Employer email verification for industry mentors, optional professional profile link | Adds a visible badge. Does not claim every outcome was audited (README 5.5) |

- Students are affiliated the same way where possible (institutional email or attestation). **Owner decision: students get Level 1 through institution attestation**, so a student with no institutional email is still matched to their institution and counted in aggregates. This closes AUTH-O3.
- Level 1 attestation has two sanctioned paths. The **checked-in seed** (`services/api/src/db/seed/affiliations.ts`, D-56) grants named accounts `VERIFIED` / `ADMIN_ATTESTATION` rows with a stated reason and one audit entry each, and the **institution-admin decision** (`institution-admin-attestation`, 2026-11-11) decides a pending claim: `GET /v1/institution/affiliations` reads the caller's own institutions' queue and `POST /v1/institution/affiliations/{id}/decide` verifies or rejects it. A self-service claim whose domain is not registered therefore waits for its institution's admin instead of forever (DEBT-19 and DEBT-35 closed).
- **Scope rule (D-98).** `requireInstitutionAdmin(identity, request)` in `services/api/src/authorization/authorize.ts` is the only place the institution scope is decided: it reads the roles from the database on every request, needs at least one active `INSTITUTION_ADMIN` row (an empty scope is `403 ROLE_REQUIRED`), and requires an enrolled second factor (`403 MFA_REQUIRED`). `IdentityService.listInstitutionAdminScopes(userId)` returns the institution ids, so no other module reads `role_assignments`.
- **A reviewer cannot decide their own claim** (`403 FORBIDDEN`, claim stays `PENDING`, no audit entry, D-102), and a claim outside the caller's scope answers `404` rather than `403` so the queue never discloses another institution's existence.
- **A thread is readable outside the pair only through audited break-glass** (`POST /v1/admin/mentorships/{id}/break-glass-read`, `break-glass-thread-read` 2026-11-12). `PLATFORM_ADMIN` with an enrolled second factor and a stated reason of 1 to 1000 characters; one audit row (`THREAD_BREAK_GLASS_READ`, `break_glass` true, the reason, the actor, the mentorship) is written before any content, the response is the participant projection with `Cache-Control: no-store`, and it carries no outcome, profile or email text. The participant routes are unchanged, and their `404` for a third account stays. Participants are not notified (D-123, DEBT-52).
- **Institution onboarding is platform-admin only** (`POST /v1/institutions`, `GET /v1/institutions`, `PLATFORM_ADMIN` + MFA, `institution-onboarding` 2026-11-12). Creation registers the name, kind, country code, optional MoU date and the email domains in one transaction with one audit row per fact, and stops there: the institution admin is still granted with `POST /v1/admin/institutions/{id}/admins` (D-109, D-111).
- **The grant is platform-admin only** (`POST /v1/admin/institutions/{id}/admins`, `PLATFORM_ADMIN` + MFA, D-97). No route grants `PLATFORM_ADMIN`: the pilot's platform admin still comes from the hand-run `INSERT` in `docs/local-setup.md`, while the dev seed creates one demo platform admin and one demo institution admin on the reserved `example.com` domain and refuses to run when `NODE_ENV=production` (D-103).
- The platform admin can override and every override is audited (future admin surface; not built in this release).

### 7.1 Mentor onboarding progress and operating status

Two separate enums (never one mixed status):

- **Onboarding progress** (`mentor_onboarding_status`): `applied` -> `email_verified` -> `affiliation_verified` -> (`employer_checked`). This records verification only.
- **Operating status** (`mentor_status`): `draft`, `pending`, `active`, `suspended`, `removed`. A mentor becomes `active` when the stored onboarding status reaches `affiliation_verified` **and** an enrolled second factor holds; `suspended` and `active` toggle by sanction; `removed` is final. **Built by #5:** the decision lives in one pure function and one `syncMentorActivation` call, invoked by the affiliation claim, the second-factor path, and the mentor-role grant. Agreements and orientation are **not** activation conditions yet (DEBT-18), so `orientation_completed_at` and the agreement consents are never written.

Only `active` mentors may receive requests. A `suspended` mentor receives no new requests; existing mentorships follow the suspension rules in the reputation and verification policy.

## 8. Authorization model

### 8.1 Layers (checked in this order on every request)

1. **Authentication guard:** valid, unexpired, unrevoked session. Otherwise `401`.
2. **Role guard:** the user holds an active `RoleAssignment` for the required role (with the right `institution_id` where scoped). Otherwise `403`.
3. **Object policy:** a pure function in `packages/domain` decides whether this actor may perform this action on this object (ownership, participation, consent, conflict of interest). Otherwise `404` for objects the actor may not even know exist, `403` where existence is already known (**Proposed default**, avoids leaking which IDs exist).
4. **State guard:** the object's state machine allows the action now. Otherwise `409`.
5. **Audit:** security-relevant actions write an `AuditLog` entry (section 12).

**Implemented (`roles-and-profile-visibility`, 4c):** layers 1 and 2 live in `services/api/src/authorization/authorize.ts`. `requireRole` resolves the session, reads the account's active assignments from `role_assignments`, and refuses with `403 ROLE_REQUIRED` (an empty role set is a refusal). `PUT /v1/me/mentor-profile` is its first consumer. The MFA branch refuses with `403 MFA_REQUIRED` when a route declares `requiresMfa` and `users.two_factor_enabled` is false; no route sets that flag in 4c.

### 8.2 Policy rules (examples written as testable predicates)

| Policy | Rule |
|---|---|
| `canSendRequest` | Actor is a verified student; target mentor is Level 1 or above, not suspended, and has capacity; actor is not the mentor |
| `canDecideRequest` | Actor is the mentor the request is addressed to; request is `pending` |
| `canReadThread` | Actor is a participant of that mentorship |
| `canReportOutcome` | Actor is the student of that mentorship |
| `canConfirmOutcome` | Actor is the mentor of that mentorship; the outcome is `pending_confirmation`; actor has made the conflict-of-interest declaration; **no declared conflict**, or the case goes to platform review (N9) |
| `canResolveDispute` | Actor is `platform_admin`, and is **not** a party to the case |
| `canApproveAffiliation` | Actor is `institution_admin` of the same institution, or `platform_admin` |
| `canViewInstitutionAggregates` | Actor is `institution_admin` of that institution, or `platform_admin`; small-cohort suppression applies |
| `canViewStudentLevelData` | For institution admins: an active student consent for that institution and purpose exists. For platform admins: a dispute or support case reference and an audit entry |
| `canViewEvidenceFile` | Participants of that outcome, and the platform reviewer on a dispute or audit; via short-lived signed URL only |

All predicates are **pure functions** with unit tests (ADR-012).

**Implemented so far:** `canViewProfile` in `packages/domain/src/visibility.ts` encodes the FR-PROF-04 profile-visibility matrix (`VISIBLE` / `HIDDEN`), with the documented nine rows plus the exhaustive cross-product asserted in `packages/domain/test/visibility.test.ts`. A `HIDDEN` answer means the caller answers `404`, as section 8.1 requires. No read endpoint consumes it yet; discovery (#6) and mentor onboarding (#5) are its first callers.

## 9. Permission matrix

Legend: **Y** allowed, **-** not allowed, **own** only for their own records, **BG** break-glass (section 10).

| Action | Student | Mentor | Institution Admin | Platform Admin |
|---|---|---|---|---|
| View own profile and data | Y | Y | Y | Y |
| Edit own profile | own | own | own | own |
| View a mentor's public profile and impact | Y | Y | Y | Y |
| Send a request | Y | - | - | - |
| Cancel own pending request | own | - | - | - |
| Decide on a request addressed to them | - | own | - | - |
| Read a mentorship thread | participant | participant | - | BG |
| Post in a thread | participant | participant | - | - |
| Record a session and confirm it was held | participant | participant | - | - |
| Report an outcome | own | - | - | - |
| Upload outcome evidence | own | - | - | - |
| View outcome evidence | participant | participant | - | dispute or audit only, audited |
| Confirm, amend contribution, or dispute an outcome | - | own, no declared conflict | - | - |
| Resolve a dispute or run an audit | - | - | - | Y (not as a party) |
| Appeal a dispute decision | participant | participant | - | reviewed by a different admin |
| Approve mentor or student affiliation | - | - | own institution | Y |
| View institution aggregates | - | - | own institution, suppression applied | Y |
| View student-level data for an institution | - | - | only with the student's consent | only for support or a dispute, audited |
| Submit a private session feedback form | participant | participant | - | - |
| File an abuse report | Y | Y | Y | Y |
| Review the moderation queue | - | - | - | Y |
| Suspend or remove a user | - | - | - | Y (audited, reason required) |
| Edit outcomes or reputation | - | - | **never** | **never directly**; only through audited compensating entries (clawback) |
| Change system configuration (weights, thresholds) | - | - | - | Y (audited, versioned) |
| Request own data export or deletion | own | own | own | own |
| View audit log | - | - | - | Y |

**Notes**
- Nobody, including the platform admin, edits ledger rows. Corrections are compensating entries (ADR-008).
- Employer permissions are not defined for Phase 1 (**Later**, Phase 3).

## 10. Platform admin access and break-glass

- No shared admin accounts. Each platform admin has a personal account with MFA.
- The shipped admin surface (2026-11-10, `abuse-reports-and-sanctions`) is the outcome review queue (`/v1/review-queue`, `/v1/outcomes/{id}/review`), the abuse report queue (`GET /v1/reports`), one resolution per report (`POST /v1/reports/{id}/resolve`), and one suspension (`POST /v1/admin/accounts/{id}/suspend`). Every one of them calls `requireRole(..., "PLATFORM_ADMIN", { requiresMfa: true })`, so a password alone is never enough, and every action appends one audit row and queues one notice (D-90).
- A suspension revokes every session and stores an optional end date, but nothing lifts it automatically and no route lifts it: an early lift is SQL until DEBT-40 lands (D-88).
- Reading private content (threads, evidence, student-level data) requires a **break-glass** action: a mandatory reason, a linked dispute or support case, and a time limit (**Proposed default: 60 minutes**). Every access is logged with who, what, why, and when. This is **not built** (FR-ADM-06, DEBT-30), so a moderator acting on a report sees the report's target id and the reporter's written details, not the thread.
- Break-glass entries are reviewed weekly. With one operator today (N7 is an **Open decision**), a second reviewer should be added before the pilot where possible.
- Whether and when the affected user is notified of a break-glass access is an **Open decision** for counsel.
- Production database access for engineers is separate from application access, logged, and limited to named people.

## 11. Institution tenancy and consent-gated data

- Records that belong to an institution carry `institution_id`. Every query by an institution-scoped role is filtered by it in application code. Postgres row-level security as a second layer is an **Open decision**.
- Institution admins see **aggregates by default**. Student-level data requires an active, specific, revocable `ConsentRecord` (purpose and scope stated). Consent is checked at read time, not cached across sessions.
- **Small-cohort suppression:** aggregates below **5** individuals are hidden (owner decision). The KPI definitions that apply suppression live in `docs/kpis-and-metrics.md` (**Planned, not yet created**).
- Institution admins are created by the platform (invitation only), never by self-registration, and must complete MFA enrollment before first use.

### 11.1 Consent at registration is an explicit act the API enforces

- `POST /v1/auth/register` refuses a body without `consent_accepted: true` with `422 VALIDATION_FAILED` naming the field, before any user, session, or consent row is written (D-82, `trust-surfaces`). The browser checkbox is a convenience; the API is the trust boundary, so a direct client cannot create an account with consent records for a document nobody opened.
- The terms of service (`/terms`) and the privacy notice (`/privacy`) are session-free pages that render `CONSENT_DOCUMENT_VERSION` (`2026-11`), the same string stored as `document_version` on the two `GRANTED` rows (`TERMS`, `PRIVACY_NOTICE`).
- Withdrawing or changing a consent is not built yet: `GET /v1/me/consents` and `PUT /v1/me/consents/{purpose}` remain documented but unbuilt (`FR-CONS-02`, DEBT-36).

### 11.2 Account data rights

- `POST /v1/privacy/export` and `POST /v1/privacy/delete` act on the caller's own record only; the account id comes from the session, never the body. The export refuses a `SUSPENDED`, `ANONYMIZED`, or `DEACTIVATED` account with `403 FORBIDDEN`; deletion is confirmed by repeating the account email (D-86) because no credential check exists that does not create a session.
- Deletion revokes every session and second-factor row, so a deleted account authenticates nothing afterwards, and the deletion is recorded in `privacy_requests` plus one `ACCOUNT_DELETED` audit entry. No admin route can delete or restore an account (D-85).

### 11.3 Institution SSO (Later)

- Trigger: the first university that requires SAML or SCIM.
- Path: connect the institution through an identity broker (WorkOS for SSO only, or Keycloak). The `IdentityService` seam and the stable user UUID keep this a configuration and adapter change.
- SSO sign-in proves email and domain; it does **not** replace affiliation attestation for mentors.

## 12. Audit events

Written to the append-only `AuditLog` (who, role, action, object, result, time, request ID, IP address class). Never write passwords, tokens, or message bodies.

| Category | Events |
|---|---|
| Authentication | Sign-in success and failure, MFA enrolled or removed, password change, password reset, session revoked, lockout |
| Authorization | Role granted or revoked, permission denied on a sensitive action |
| Affiliation | Approved, rejected, overridden |
| Verification | Outcome confirmed, disputed, sent to platform review, resolved with a written reason, withdrawn, clawed back |
| Privacy | Consent given or withdrawn, data export, deletion request and completion |
| Admin | Break-glass access, suspension, removal, configuration change |
| Data access | Evidence file viewed by a reviewer; student-level data viewed by an institution admin |

## 13. Account lifecycle

`pending` -> `active` -> (`suspended` | `deactivated`) -> `deletion_pending` -> `anonymized`, using the `account_status` enum.

```
                  open the verification link
   pending -----------------------------------> active
                                                  |
                        +-------------------------+-------------------------+
                        |                                                   |
                sanction (admin)                                    self-deactivation
                        v                                                   v
                    suspended                                          deactivated
                        |                                                   |
        only an admin can reinstate                     signing in with the correct
        (no user-side exit)                              password returns to `active`
                        |                                                   |
                        +-------------------------+-------------------------+
                                                  |
                                           deletion request
                                                  v
                                   deletion_pending -> anonymized
```

- **Activation:** opening the verification link moves `pending` to `active`, and only an `active` account can sign in. Registration writes the email as unverified, so "pending" and "unverified" are the same condition by construction (FR-AUTH-08). Google sign-in is not gated by the email/password verification rule, so the provider path in Sprint 2 activates through the same transition.
- **Suspension:** every session is revoked in the same transaction, no new requests, sign-in refused. Reason and reviewer recorded (FR-AUTH-10; the sanction workflow itself is FR-ADM-05).
- **Deactivation:** the user can pause their own account; sessions are revoked and the profile is hidden. Reversible by signing in again with the correct password (owner decision D-36; FR-AUTH-09).
- **Deletion:** identifiers removed or pseudonymized, evidence files deleted, the ledger structure kept with pseudonymous references so counted outcomes remain auditable. This must be confirmed with counsel against the erasure right and its exceptions **[S1]** (see `docs/data-privacy-and-retention.md`).

Email verification and the age gate are separate fields (`email_verified`, `age_gate_passed_at`, `age_18_plus`), not account states.

## 14. Abuse controls (summary; details in security-requirements.md)

Rate limits and lockouts on sign-in, sign-up, password reset, and request creation; generic responses that do not reveal whether an email exists; bot protection on sign-up; email-domain checks and device or network signals as inputs to human review (never automatic reputation changes).

## 15. Later (not Phase 1)

| Item | Trigger |
|---|---|
| Native mobile sign-in (Authorization Code flow with PKCE, tokens in the OS secure store) | Flutter client approved (ADR-005) |
| Employer role and permissions | Phase 3 |
| SAML or SCIM | First university requirement |
| Hardware security keys for admins | Admin team grows or a partner requires it |

## 16. Testing requirements

1. **Matrix test:** the permission matrix in section 9 is expressed as data, and a test calls every endpoint as every role and checks the result.
2. **Negative tests:** unauthenticated (`401`), wrong role (`403`), wrong owner or another institution's object (`404` or `403`), wrong state (`409`).
3. **IDOR tests:** substituting another user's ID in every path and body field is rejected.
4. **Policy unit tests:** every predicate in section 8.2 has tests for each branch, including the conflict-of-interest rule and dual-role cases.
5. **Session tests:** sign-out, sign-out-everywhere, password reset, suspension, and deactivation revoke the session row and the next request fails immediately; admin timeouts arrive with `access-google-mfa-and-sessions`.
6. **CI gate:** a route without a declared policy fails the build.

## 17. Open decisions

| # | Decision | Status / default |
|---|---|---|
| AUTH-O1 | Phone OTP in the pilot | **Decided: no.** Not in the MVP (owner decision) |
| AUTH-O2 | Microsoft sign-in in Phase 1 | **Decided: no.** Removed entirely (owner decision) |
| AUTH-O3 | Level 1 mandatory for students | **Decided: yes** via institution attestation (owner decision) |
| AUTH-O4 | Postgres row-level security for institution data | Evaluate before the institution dashboard is built |
| AUTH-O5 | Break-glass user notification | Counsel to advise (**Deferred, owner decision**) |
| AUTH-O6 | Admin MFA recovery with a single admin | Documented identity check plus a delay |
| AUTH-O7 | Session lifetimes in section 5 | Accept the proposed defaults for the pilot |
| AUTH-O8 | Optional MFA for students | Offer it, do not require it |

## 18. Acceptance checklist

- [ ] Every role in the README (Student, Mentor, Institution Admin, Employer, Platform Admin) appears here, with Employer marked Later.
- [ ] Every action in the permission matrix has a named policy and a test.
- [ ] No role can edit outcomes or reputation directly.
- [ ] The institution admin cannot resolve disputes or read threads.
- [ ] The under-18 block and the data kept for it are described.
- [ ] The `IdentityService` interface covers every flow in section 4, and the user UUID stays stable across providers.
- [ ] The permission matrix agrees with `docs/functional-requirements.md` and the endpoint table in `docs/api-contracts.md`.
- [ ] Items marked **Unverified** or **Open decision** are listed in `docs/assumptions-and-open-questions.md`.
