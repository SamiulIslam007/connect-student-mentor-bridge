---
title: API Contracts
status: Approved (MVP baseline, owner decision)
owner: Owner
date: 2026-10-29
sources: README.md (sections 5, 7, 9, 14); connect-research-report.md (Doc 7, Doc 14); auth-and-access-control.md; security-requirements.md; architecture-decisions.md (ADR-006, ADR-008, ADR-011)
---

# API Contracts

> **Source of truth:** the OpenAPI file in `packages/contracts/openapi.yaml` (ADR-011). This document explains the conventions and the Phase 1 surface in human terms. If it disagrees with the OpenAPI file, fix both. The web client is **generated** from the OpenAPI file.
>
> All field names, enum values, and numbers below are **Proposed defaults** unless marked otherwise. Example data is **Illustrative** and fictional.

## 1. Conventions

| Topic | Rule |
|---|---|
| Style | REST over HTTPS, JSON bodies, UTF-8 |
| Base path | `/v1`. Breaking changes require `/v2` (section 12) |
| Operational endpoints | `/healthz` and `/readyz`, unversioned, no authentication (used by Docker and uptime checks) |
| Naming | Paths use plural nouns and kebab-case. JSON fields use `snake_case`. Enum values use `snake_case` |
| IDs | UUIDs everywhere. Never sequential integers |
| Time | ISO 8601 in UTC with a `Z` suffix (for example `2026-11-02T09:30:00Z`). Durations in the API are integer seconds or ISO 8601 durations, never free text |
| State changes | **Explicit action endpoints** (`POST /v1/requests/{id}/accept`), never a generic `PATCH` of a status field. Each action has its own permission and audit entry |
| Authentication | **BFF pattern:** the browser talks only to the Next.js app on the same origin (httpOnly, Secure, SameSite cookie at the BFF); the BFF calls this API with `Authorization: Bearer <access token>`. Bearer is also accepted directly for non-browser clients. See `docs/auth-and-access-control.md` section 5 |
| Authorization | Role guard, object policy, state guard (auth document section 8). Missing policy fails CI |
| Language | English only (Owner decision, 16 October 2026) |

### 1.1 Standard headers

| Header | Direction | Meaning |
|---|---|---|
| `X-Request-Id` | Response (and optional request) | Correlates logs, errors, and audit entries. The server generates one if absent |
| `Idempotency-Key` | Request | Required on every retryable `POST` (section 3) |
| `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset` | Response | Current limit window |
| `Retry-After` | Response | Seconds to wait on `429` and `503` |
| `ETag` / `If-Match` | Response / Request | Optimistic concurrency for a future multi-writer resource. **Not used by the profile saves**, which are last write wins (D-39) |

### 1.2 Pagination

- **Cursor pagination** on every list endpoint.
- Request: `?limit=20&cursor=<opaque>`. `limit` defaults to 20 and is capped at 100.
- Response envelope:

```json
{
  "data": [ ],
  "page": { "next_cursor": "opaque-string-or-null", "limit": 20 }
}
```

- Cursors are opaque and may expire. Sort order is stable and documented per endpoint.

### 1.3 Errors (RFC 9457 problem details)

Content type `application/problem+json`. Every error has the same shape:

```json
{
  "type": "https://docs.connect.example/problems/outcome-invalid-state",
  "title": "Outcome is not awaiting confirmation",
  "status": 409,
  "detail": "This outcome is already confirmed.",
  "instance": "/v1/outcomes/6f1d.../confirm",
  "code": "OUTCOME_INVALID_STATE",
  "request_id": "b6a3...",
  "errors": [ { "field": "contribution_level", "code": "REQUIRED", "message": "Required" } ]
}
```

- `errors` is reserved for field-level validation details. The current authentication and profile endpoints do not emit it; they carry `detail` and `code`. Field errors arrive with the SEC-API-1 strict-validation work (owner: Sprint 7).
- An explicit consent acceptance is required where a document is presented: `POST /v1/auth/register` refuses a body without `consent_accepted: true` with `422 VALIDATION_FAILED` whose `detail` names the field, and writes no user and no consent record (D-82). The version stored on the two consent rows is `2026-11`, the same value `/terms` and `/privacy` render.
- `code` is a stable machine-readable value from the error catalog (section 10). Clients branch on `code`, never on `title` or `detail`.
- Errors never contain stack traces, SQL, internal paths, or personal data of other users (security requirement SEC-API-6).
- The `type` URL is a placeholder until a public domain exists (**Open decision**).

### 1.4 Status code usage

| Code | Use |
|---|---|
| `200` | Success with a body |
| `201` | Created. Includes a `Location` header |
| `202` | Accepted for background processing (data export, deletion) |
| `204` | Success without a body |
| `400` | Malformed request |
| `401` | Not authenticated |
| `403` | Authenticated but not allowed, where the object's existence is already known |
| `404` | Not found, **or not visible to the caller** (avoids leaking which IDs exist) |
| `409` | State conflict (the state machine does not allow the action now) or idempotency key reuse with a different body |
| `412` | `If-Match` failed (stale edit). No endpoint emits it yet; profile saves are last write wins (D-39) |
| `413` | Request body too large (the API body limit is enforced by the body parser) |
| `422` | Validation failed |
| `429` | Rate limit exceeded |
| `5xx` | Server fault. Never used for client mistakes |

Malformed JSON returns `400 VALIDATION_FAILED`; an oversized body returns `413 VALIDATION_FAILED`. Both are produced before `RequestIdMiddleware` runs, so their problem body can carry `request_id: "unattributed"`. That is documented behaviour, not a correlation guarantee.

### 1.5 Response headers and the CORS rule

Every API response carries the same set: `Content-Security-Policy` (`default-src 'none'`, with script, frame, form, base and object sources forbidden), `Strict-Transport-Security` (one year, subdomains), `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`, `Cross-Origin-Resource-Policy: same-origin` and `Cross-Origin-Opener-Policy: same-origin`. `X-Powered-By` is not sent. The set is applied before the body parser, so a refused body carries it too (D-131).

There is no CORS allowlist: the browser never calls this origin, because every browser request goes through the web BFF and the BFF calls the API server-side. A response therefore carries no `Access-Control-Allow-Origin`, `-Methods` or `-Credentials` header, and a test fails if CORS is enabled without a new decision (D-132, SEC-API-5).

The web app sends its own set — `Content-Security-Policy-Report-Only` with eight directives, nosniff, `no-referrer`, `DENY` and a `Permissions-Policy` — and enforcement is DEBT-56 (D-133).

## 2. Authentication endpoints

Identity is implemented with better-auth behind `IdentityService` (ADR-003) and exposed as NestJS endpoints under `/v1/auth`. The browser reaches them only through the `apps/web` route handlers, which keep the session token in an httpOnly, SameSite=Lax cookie (Secure outside development); the API accepts `Authorization: Bearer <session token>` from the BFF.

**Implemented in Sprint 1 (change `identity-better-auth`):**

| Method and path | Auth | Purpose | Success | Errors |
|---|---|---|---|---|
| `POST /v1/auth/register` | none | Create an account. A date of birth is accepted **only** to check the 18+ gate and is **not stored**. The response does not reveal whether the address already exists, and no session is returned. An email with a live `signup_blocks` entry is refused before the age gate is evaluated. The body requires `consent_accepted: true` (D-82): absent or `false` is `422 VALIDATION_FAILED` naming the field, creates no user and no consent row, and the accepted document version (`2026-11`) is the one `/terms` and `/privacy` render | `200` `{ "status": "verification_sent" }` | `422 VALIDATION_FAILED`, `422 UNDER_MINIMUM_AGE` |
| `GET /v1/auth/verify?token=` | none | Confirm the email token (24-hour lifetime) and move the account from `pending` to `active`. Opening the link twice succeeds, sends no second email, and records no second activation | `200` `{ "status": "verified" }` | `400 INVALID_VERIFICATION_LINK`, `422 VALIDATION_FAILED` |
| `POST /v1/auth/sign-in` | none | Email and password. A wrong password and an unknown email return the same `401` body; the account status is evaluated only after the password is accepted. The response includes `account_status`, so the client never guesses it | `200` `{ "session_token", "account" }` | `401 UNAUTHENTICATED`, `403 EMAIL_NOT_VERIFIED`, `403 ACCOUNT_SUSPENDED`, `403 FORBIDDEN`, `422 VALIDATION_FAILED` |
| `POST /v1/auth/sign-out` | bearer | Revoke the current session | `200` `{ "status": "signed_out" }` | `401 UNAUTHENTICATED` |
| `POST /v1/auth/sign-out-everywhere` | bearer | Revoke every session for the account | `200` `{ "status": "signed_out_everywhere" }` | `401 UNAUTHENTICATED` |
| `POST /v1/auth/forgot-password` | none | Send a reset link (30-minute lifetime). Same response whether or not the address exists; no email for an unknown address | `200` `{ "status": "reset_email_sent_if_account_exists" }` | `422 VALIDATION_FAILED` |
| `POST /v1/auth/reset-password` | none | Set a new password with a single-use token; every existing session is revoked | `200` `{ "status": "password_reset" }` | `400 INVALID_RESET_TOKEN`, `422 VALIDATION_FAILED` |

**Implemented in change `account-status-lifecycle`:**

| Method and path | Auth | Purpose | Success | Errors |
|---|---|---|---|---|
| `GET /v1/me` | bearer | The signed-in account's own record only: `id`, `display_name`, `email`, `email_verified`, `account_status`, `timezone`, `mfa_enabled`, `roles`. No profile fields and no other user's data. `mfa_enabled` is true when a verified second factor is active; `roles` lists the caller's own active roles in declaration order. The account comes from the session token | `200` account summary | `401 UNAUTHENTICATED` |
| `POST /v1/me/deactivate` | bearer | Set the account to `deactivated` and revoke every session for it, including the caller's. Signing in again with the correct password returns the account to `active` | `200` `{ "status": "deactivated" }` | `401 UNAUTHENTICATED` |
| `POST /v1/me/roles/mentor` | bearer | Grant `MENTOR` to the calling account. Idempotent; one `ROLE_GRANTED` audit entry on an actual grant. The account always comes from the session, so a body cannot name another user. Grants no visibility, activation, or discoverability | `200` `{ "roles": [...] }` | `401 UNAUTHENTICATED` |

`403 ROLE_REQUIRED` means the account is signed in and lacks the role the action needs; `403 MFA_REQUIRED` means it holds the role but has no enrolled second factor. Neither is a sign-in failure; `FORBIDDEN` keeps that meaning.

A `403` on sign-in is returned only after the password was accepted, so it never reveals whether an address exists. `EMAIL_NOT_VERIFIED` means the account has not opened its verification link; `ACCOUNT_SUSPENDED` means a sanction is in force; `FORBIDDEN` covers the remaining non-active states (`deletion_pending`, `anonymized`).

`GET /v1/auth/verify` returns `4xx` only for a missing, invalid, or expired token; an already-verified address is not an error.

**Implemented in change `access-google-mfa-and-sessions` (2026-11-04):**

| Method and path | Auth | Purpose | Success | Errors |
|---|---|---|---|---|
| `POST /v1/auth/sign-in/provider` | none | Start a Google sign-in. Returns the authorization URL and an opaque `state_cookie` the callback must return unaltered. `503 PROVIDER_UNAVAILABLE` means this deployment has no Google credentials; there is no built-in fallback | `200` `{ "authorization_url", "state_cookie" }` | `422 VALIDATION_FAILED`, `503 PROVIDER_UNAVAILABLE` |
| `POST /v1/auth/provider/callback` | none | Exchange the code for a session. The provider email counts as verified, an existing account is linked rather than duplicated, and the password path's status rules apply. An account with an active second factor is refused so MFA cannot be bypassed | `200` `{ "session_token", "account" }` | `401 UNAUTHENTICATED`, `403 ACCOUNT_SUSPENDED`, `403 FORBIDDEN`, `422 VALIDATION_FAILED`, `503 PROVIDER_UNAVAILABLE` |
| `POST /v1/auth/mfa/enroll` | bearer | Start TOTP enrollment. The password is re-checked; the URI and the backup codes are returned once and never again | `200` `{ "totp_uri", "backup_codes" }` | `401 UNAUTHENTICATED`, `422 VALIDATION_FAILED` |
| `POST /v1/auth/mfa/verify` | bearer or challenge | Confirm an enrollment (bearer) or complete a challenged sign-in (`mfa_challenge` from the sign-in response, single-use). The code is 6 digits, or a backup code with `method: "backup_code"` | `200` `{ "session_token", "account_status" }` | `401 UNAUTHENTICATED`, `422 VALIDATION_FAILED` |
| `POST /v1/auth/mfa/disable` | bearer | Remove the factor and its backup codes after the password is confirmed. The session is rotated, so the response carries a new token | `200` `{ "status": "disabled", "session_token" }` | `401 UNAUTHENTICATED`, `422 VALIDATION_FAILED` |
| `GET /v1/me/sessions` | bearer | The caller's own live sessions with safe metadata only (`id`, `created_at`, `updated_at`, `expires_at`, `ip_address`, `user_agent`, `current`); never a token | `200` `{ "data": [...] }` | `401 UNAUTHENTICATED` |
| `DELETE /v1/me/sessions/{id}` | bearer | Revoke one of the caller's own sessions. Idempotent: an already-revoked, expired, or unknown id is a success; another account's id is `404` | `204` | `401 UNAUTHENTICATED`, `404 NOT_FOUND` |

A password sign-in for an account with an active second factor returns `200` `{ "mfa_required": true, "mfa_challenge": "<opaque>" }` instead of a session; no session row exists until `POST /v1/auth/mfa/verify` succeeds. The challenge is the library's own signed value, valid for ten minutes, single-use, and limited to a fixed number of attempts per challenge and per account (D-45).

Still deferred (change `roles-and-profile-visibility`, 4c, D-47): role-based and object-level authorization beyond the session guard, profile visibility, and the admin session timeouts. There is no refresh-token family: the better-auth cookie session replaced the earlier 15-minute access token plus rotating refresh token design (D-31), and HTTP 401 plus session-row revocation are the equivalent guarantees.

## 3. Idempotency

- Every retryable `POST` requires `Idempotency-Key` (a client-generated UUID). Missing key returns `400` with code `IDEMPOTENCY_KEY_REQUIRED`.
- The server stores the key, the request fingerprint, and the response for **48 hours** (**Proposed default**, matching `idempotency_keys.expires_at`).
- Same key and same request: return the stored response (with `Idempotent-Replayed: true`).
- Same key and a different request body: `409` with code `IDEMPOTENCY_KEY_REUSED`.
- Same key while the first request is still running: `409` with code `REQUEST_IN_PROGRESS`.
- State-machine actions are idempotent by nature: repeating `confirm` on an already confirmed outcome returns the current resource with `200` if the same actor made the same decision, otherwise `409`.

## 4. Shared types and enums

All enum values below are the code names. They must match the glossary and the data model.

| Enum | Values |
|---|---|
| `role` | `student`, `mentor`, `institution_admin`, `platform_admin` (`employer` is **Later**) |
| `account_status` | `pending`, `active`, `suspended`, `deactivated`, `deletion_pending`, `anonymized` |
| `mentor_onboarding_status` | `applied`, `email_verified`, `affiliation_verified`, `employer_checked` |
| `mentor_status` | `draft`, `pending`, `active`, `suspended`, `removed` |
| `affiliation_level` | `level_0`, `level_1`, `level_2` |
| `access_state` | `available`, `full`, `application_only` (README 5.5) |
| `request_status` | `pending`, `accepted`, `declined`, `redirected`, `expired`, `withdrawn` |
| `mentorship_status` | `active`, `completed`, `ended_early` |
| `session_status` | `scheduled`, `held`, `cancelled` |
| `outcome_type` | `admission`, `internship`, `job_offer`, `skill_milestone`, `interview` (`job_offer` added by the owner on 16 October 2026; its difficulty weight is an **Open decision**) |
| `contribution_level` | `directly_enabled`, `helped`, `minor` |
| `outcome_status` | `pending_confirmation`, `confirmed`, `in_platform_review`, `counted`, `rejected`, `withdrawn`, `reversed` |
| `evidence_tier` | `0`, `1`, `2` |
| `confidence_tier` | `none`, `emerging`, `established`, `proven` |
| `consent_purpose` | `terms`, `privacy_notice`, `volunteer_agreement`, `community_guidelines`, `institution_data_sharing`, `ai_assist`, `employer_data_sharing`, `recording` |

**Case mapping.** Database values are `UPPER_SNAKE`; the API returns the mechanical lowercase form (`lower_snake`). The lists above are those API values; `data-model.md` section 4.1 is the canonical source and no list adds a value the others lack. `disputed`, `escalated`, `under_review`, `appealed`, and `audited` are **not** statuses; they are observer-facing events.

**Modelling note:** evidence is an **attribute** (`evidence_tier`), not a state, so an outcome can gain evidence without changing state. `confirmed` means the mentor countersigned; `counted` means the cooling period has passed (**Proposed default: 14 days**) and the outcome contributes to reputation. **Unconfirmed and pending outcomes never contribute to reputation.**

### 4.1 Core objects (Illustrative)

```json
// UserSummary
{ "id": "uuid", "display_name": "string", "roles": ["student"] }

// MentorSummary (discovery list item)
{
  "id": "uuid",
  "display_name": "Illustrative Mentor",
  "fields": [{ "id": "uuid", "name": "Software Engineering" }],
  "scope": "Short text",
  "access_state": "available",
  "affiliation_level": "level_1",
  "impact": { "confirmed_outcomes": 4, "confidence_tier": "emerging", "response_reliability": "high" },
  "suggestion": { "rank": 1, "reasons": ["Same field", "Availability matches"] }
}

// Request
{
  "id": "uuid",
  "student_id": "uuid",
  "mentor_id": "uuid",
  "status": "pending",
  "question": "string",
  "context_summary": "string",
  "target_outcome": "string",
  "expected_timeframe": "string",
  "expires_at": "2026-11-05T09:30:00Z",
  "created_at": "2026-11-02T09:30:00Z"
}

// Outcome
{
  "id": "uuid",
  "mentorship_id": "uuid",
  "outcome_type": "internship",
  "status": "pending_confirmation",
  "description": "string",
  "contribution_level_claimed": "helped",
  "contribution_level_confirmed": null,
  "evidence_tier": 0,
  "reported_at": "2026-12-01T10:00:00Z",
  "confirm_by": "2026-12-08T10:00:00Z"
}
```

Reputation numbers are **never** returned to normal users as a 0 to 100 score at low volumes. The API returns counts and a `confidence_tier` (research report 3.1 #4). A numeric score stays internal until sample thresholds are met (**Proposed**).

## 5. Phase 1 endpoint reference

Roles: **S** Student, **M** Mentor, **IA** Institution Admin, **PA** Platform Admin. "Idem" means `Idempotency-Key` is required.

### 5.1 Identity and profile

| Method and path | Roles | Idem | Purpose | Success |
|---|---|---|---|---|
| `GET /v1/me` | all | no | The signed-in account record (id, display name, email, verification state, `account_status`, timezone, `mfa_enabled`, `roles`) plus the caller's own `student_profile` and `mentor_profile`, each nullable. The sign-in response keeps the narrower `AccountSummary` shape | `200` |
| `PUT /v1/me/student-profile` | S | no (last write wins, D-39) | Create or fully replace the caller's student profile: goals, primary field, up to two interest fields, mentoring languages | `200` |
| `PUT /v1/me/mentor-profile` | M | no (last write wins, D-39) | Create or fully replace the caller's mentor profile: headline, bio, expertise summary, scope statement, primary field, additional fields, languages, weekly capacity | `200` |
| `POST /v1/me/mentor-profile/pause` | M | yes | Set access mode to `PAUSED` (hidden from discovery, no new requests). Idempotent; no capacity check until #7. Built in `profile-availability-and-access-mode` | `200` |
| `POST /v1/me/mentor-profile/resume` | M | yes | Clear `PAUSED` to the body's `access_mode` (`OPEN` default). Idempotent; the capacity subjection belongs to #7. Built in `profile-availability-and-access-mode` | `200` |
| `GET /v1/me/availability?context=STUDENT\|MENTOR` | all (MENTOR context: M) | no | The caller's own weekly windows for one context, ordered by weekday, start, end | `200` `{ context, windows: [...] }` | `401`, `403 ROLE_REQUIRED` (mentor context), `422` |
| `PUT /v1/me/availability` | all (MENTOR context: M) | yes | Full replace for the body's `context`. Refused with `422` for a bad bound, overlapping windows, the 21-window cap, or an unknown zone; the stored set is unchanged then | `200` `{ context, windows: [...] }` | `401`, `403 ROLE_REQUIRED` (mentor context), `422` |
| `POST /v1/me/deactivate` | all | yes | Deactivate the account (`account_status = deactivated`); sessions revoked | `200` |
| `GET /v1/me/consents` | all | no | Current consents. **Not built yet** | `200` |
| `PUT /v1/me/consents/{purpose}` | all | yes | Give or withdraw one consent. Appends a ledger record. **Not built yet** | `200` |
| `GET /v1/me/sessions` and `DELETE /v1/me/sessions/{id}` | all | no | List and revoke own sessions. Built in `access-google-mfa-and-sessions`: the list carries no token, and revoking an already-gone id of your own is a success | `200`, `204` |

**Profile saves (`200`, `401`, `422`).** Both `PUT` bodies use snake_case and `additionalProperties: false` in `openapi.yaml`:

```json
// PUT /v1/me/student-profile
{
  "goals": "Become a backend engineer",
  "primary_field": "Data science",
  "interest_fields": ["AI"],
  "languages": ["en"]
}

// PUT /v1/me/mentor-profile
{
  "headline": "Backend engineer at a payments company",
  "bio": "Eight years building APIs.",
  "expertise_summary": "API design, databases",
  "scope_statement": "I can review design docs, not write production code for you.",
  "primary_field": "Software engineering",
  "fields": ["Databases"],
  "languages": ["en"],
  "weekly_capacity": 2
}
```

- Both saves are **full replaces**: interest or additional fields absent from the submission are removed.
- `primary_field`, `fields`, and `interest_fields` carry **display names, not ids**. An unknown name creates exactly one field inside the same transaction; there is no `POST /v1/fields`.
- A mentor profile has at most **5 fields in total** (the primary field plus up to 4 additional fields), and a student or mentor profile has at most **5 languages** after case-folding and de-duplication. A save above either bound is `422` and writes nothing.
- `weekly_capacity` is an integer from 1 to 5 in this change (a **Proposed default**, D-38). `0`, `6`, `2.5`, and `"3"` are refused.
- `200` returns the saved profile. `401 UNAUTHENTICATED` when the session is absent or revoked. `422 VALIDATION_FAILED` for any invalid value, with nothing written (no profile, no join row, no new field).
- `account_status` is the **only** tolerated account-level property: it is accepted and ignored, never applied. Every other undocumented top-level property (`display_name`, `email`, `user_id`, `role`, `field_id`, `nid`, `passport_number`, ...) is refused with `422 VALIDATION_FAILED` whose detail names the first unknown key in sorted order (`SEC-API-1`, built by `request-validation-and-rate-limits`). A body above 100 KiB is `413 PAYLOAD_TOO_LARGE` before any handler runs.
- There is no `If-Match`, no `ETag`, and no version column: one owner edits one profile from one browser (D-39).

`PUT /v1/me/mentor-profile` rejects a capacity cap below the number of active mentorships with code `CAPACITY_BELOW_ACTIVE`. The check shipped with `mentorship-thread-and-sessions` (#8, D-61) and also guards resume.

### 5.2 Affiliation

| Method and path | Roles | Idem | Purpose |
|---|---|---|---|
| `POST /v1/me/affiliations` | S, M | yes | Claim one institution affiliation. Body: `kind` (required), optional `institution_id`, `department`, `program`, `batch_year` |
| `GET /v1/institution/affiliations` | institution admin + MFA | no | **Built** by `institution-admin-attestation` (D-98): the pending claims of the caller's institutions. Only `PENDING` rows whose institution the caller actively administers, ordered by claim id; an organization-only claim (no institution) never appears. An entry carries exactly `id`, `display_name`, `email_domain`, `kind`, `department`, `program`, `batch_year`, `claimed_at` — the **domain only** (computed in SQL), never the local part, a biography, a goal, an availability window, or a capacity number (D-101). `401 UNAUTHENTICATED`, `403 ROLE_REQUIRED` without a scope, `403 MFA_REQUIRED` without an enrolled factor |
| `POST /v1/institution/affiliations/{id}/decide` | institution admin + MFA | yes | **Built** by `institution-admin-attestation` (D-100, D-102): one decision per claim. Body `decision` (`verify` or `reject`) plus a **required** `reason` of at most 1000 characters. Verification sets `status` verified, `level` Level 1, `method` admin attestation, `decided_by_user_id`, `decision_reason` and `verified_at`, revokes any other `VERIFIED` affiliation of that account in the same transaction, appends one `AFFILIATION_GRANTED` audit entry, queues one `affiliation-decided` notice and re-runs the mentor activation sync. Rejection sets `status` rejected with the reason and grants no level. `403 FORBIDDEN` when the claim belongs to the acting account (D-102), `404` when the claim is absent or belongs to another institution, `409 CLAIM_ALREADY_DECIDED` when the update matches no pending row, `422 VALIDATION_FAILED` for a missing or over-long reason or a malformed id |
| `POST /v1/admin/institutions/{id}/admins` | platform admin + MFA | yes | **Built** by `institution-admin-attestation` (D-97): grants `INSTITUTION_ADMIN` for one institution to an account named by `email`, writing one `role_assignments` row carrying the institution and one `ROLE_GRANTED` audit entry. Since 2026-11-13 the caller is the institution's own row on `/admin/institutions` (`POST /api/institutions/{id}/admins` in the BFF), which sends the trimmed lowercase email and names the returned `roles`; an email with no account is `422 VALIDATION_FAILED` with the detail `email must belong to an existing account`, and the page shows that as its own line. A repeat is idempotent (`200`, no second row, no second entry). `403 ROLE_REQUIRED` for a non-platform-admin, `404` for an unknown institution, `422 VALIDATION_FAILED` for an unknown email or a malformed id. **No route grants `PLATFORM_ADMIN`** |

Rules: the level is decided by the **verified** account email's domain against the institution's `institution_domains`. A matching domain stores `level_1` / `verified` / `institutional_email`; anything else stores `level_0` / `pending` and grants nothing. When `institution_id` is absent, the institution registered to the email domain is used. A claim is idempotent per institution, and a claim for a different institution revokes the earlier verified row (`revoked_at` set). The subject is the session only; `user_id` and any identity document (`nid`, `passport_number`) in the body are refused with `422 VALIDATION_FAILED` and never stored. Errors: `422 AFFILIATION_EMAIL_UNVERIFIED` (no verified address), `422 AFFILIATION_INSTITUTION_MISMATCH` (no such institution, or the email domain belongs to none).

A pending claim's decision path is the institution queue above (FR-VER-02, DEBT-19 closed). The pilot's `PLATFORM_ADMIN` still comes from the hand-run `INSERT` in `docs/local-setup.md`; the dev seed creates demo admin accounts on the reserved `example.com` domain only and refuses to run when `NODE_ENV=production` (D-103).

`GET /v1/me` reports the caller's own `affiliations`, and its mentor profile carries the operating `status` and `onboarding_status`.

### 5.3 Discovery

| Method and path | Roles | Purpose |
|---|---|---|
| `GET /v1/mentors?field=&language=&access_state=&cursor=&limit=` | none (public, D-71) | **Built** by `mentor-directory`: the public directory. Only `ACTIVE` profiles appear and a `PAUSED` mentor is hidden from every filter; results are ordered by mentor profile id (no rank, score, or reason) and keyset-paginated (`limit` 1 to 50, default 20; `cursor` is the last id). A card carries exactly `id`, `display_name`, `headline`, `access_mode`, the derived `access_state` (`available`, `application_only`, `full`), `primary_field`, `fields`, and `languages` — never an email, account id, biography, availability window, or capacity. `full` is derived from the request capacity rule. An unknown field id is an empty page (`200`), and a malformed `field`, `access_state`, `cursor`, or `limit` is `422 VALIDATION_FAILED` |
| `GET /v1/mentors/{id}` | all | Public profile |
| `GET /v1/mentors/{id}/impact` | signed-in | **Built** by #10 split: counts of counted outcomes by field and outcome type plus `counted_outcomes`. No score, points, tier, reliability, or ranking key; `404` when the profile is absent or not `ACTIVE`. Response reliability and the confidence tier are not built |
| `GET /v1/me/impact` | signed-in | **Built** by #10 split, extended by `response-reliability` (2026-11-12): the caller's own counts plus `requests_decided_in_time` and `requests_late_or_expired` over every request the mentor has received (D-114 to D-116). The share of requests decided inside the window is derived by the client; no percentage, rate, score or tier is sent. The public mentor read keeps the old shape (D-115). An account without a mentor profile gets zeros and an empty list |
| `GET /v1/suggestions` | student | **Built** by `mentor-suggestions-and-reasons` (D-92): the student's shortlist. At most five `ACTIVE`, `OPEN` mentors with free weekly capacity, at least one shared field, and never the caller's own mentor profile; an `APPLICATION_ONLY`, `PAUSED`, full or unrelated mentor is absent rather than ranked low. Ordered by score descending, then remaining weekly capacity, then fewer requests in the last seven days, then a stable hash of the student id and the mentor profile id — no popularity, follower, or rating key. Each entry is the directory card plus `reasons` (one to three plain-language strings built only from declared profile facts) and `limited_information` (true when a documented factor was excluded for missing data). No entry carries a score, points, tier, rank, email, account id, biography, availability window, or capacity number. `401 UNAUTHENTICATED` without a session, `403 ROLE_REQUIRED` without the student role, `422 STUDENT_PROFILE_REQUIRED` when the student has no profile, and `422 VALIDATION_FAILED` for a malformed query |
| `GET /v1/fields?limit=&cursor=` | all | Field taxonomy: active fields only, ordered by normalized slug, each as `{ id, name }` plus a `next_cursor`. `limit` defaults to 100 (maximum 200) and `cursor` is the last slug of the previous page; `next_cursor` is null on the last page. **Ships with `profiles-and-dynamic-fields`**; the list is created by profile saves and is never seeded |

`GET /v1/suggestions` **is** the ranked read with reasons (FR-DISC-02, D-92); `GET /v1/mentors` deliberately keeps no rank, score, or reason, and neither surface exposes a sensitive attribute.

### 5.4 Requests

| Method and path | Roles | Idem | Purpose |
|---|---|---|---|
| `POST /v1/requests` | S | yes | Create a structured request. Required: `mentor_id` (mentor profile id), `question`, `context_summary`, `target_outcome`, `expected_timeframe`; optional `interaction_type` (default `ASYNC_THREAD`), `application_note` |
| `GET /v1/requests?role=sent\|received&status=&cursor=&limit=` | S, M | no | Own requests, keyset-paged |
| `GET /v1/requests/{id}` | participant | no | One request |
| `POST /v1/requests/{id}/accept` | M (addressee) | yes | Records the decision and creates the mentorship in the same transaction (built by #8, D-60). The response carries `mentorship_id` |
| `POST /v1/requests/{id}/decline` | M (addressee) | yes | Body: optional `reason` |
| `POST /v1/requests/{id}/redirect` | M (addressee) | yes | Body: `alternative_mentor_ids` (1 to 3) and optional `note`. **Phase 1b** (not required for the MVP) |
| `POST /v1/requests/{id}/withdraw` | S (sender) | yes | Only while `pending` |
| `GET /v1/mentors/{id}` | signed-in | no | A requestable mentor's small shape for the request form (ACTIVE only; others `404`) |

Rules and errors: the mentor must be `ACTIVE` with a verified Level 1 affiliation (`MENTOR_NOT_VERIFIED`, `MENTOR_UNAVAILABLE`), self-requests are `422`, and capacity is `pending + accepted decided within the last 7 days` against `weekly_capacity` (`MENTOR_AT_CAPACITY`, D-59). At most one pending request per pair (`DUPLICATE_PENDING_REQUEST`) and three pending per student (`REQUEST_LIMIT_REACHED`). An `APPLICATION_ONLY` mentor requires a non-empty `application_note` (`422`). A decision applies only while `PENDING` (`REQUEST_INVALID_STATE`); a non-participant reads `404`, a non-addressee decision is `403`. Undecided requests get a reminder at **24 hours** and expire at **48 hours** (owner decision); an accept creates one `mentorships` row in the same transaction, and a failed insert rolls the decision back (built by #8, D-60, DEBT-20 closed).

#### Request state transitions

| From | Action | To | Actor |
|---|---|---|---|
| (none) | create | `pending` | Student |
| `pending` | accept | `accepted` | Mentor |
| `pending` | decline | `declined` | Mentor |
| `pending` | redirect (Phase 1b) | `redirected` | Mentor |
| `pending` | withdraw | `withdrawn` | Student |
| `pending` | timer (48 hours) | `expired` | System |

### 5.5 Mentorships, threads, and sessions

Built by `mentorship-thread-and-sessions` (#8). Every row below is a session plus a participant predicate resolved in the repository layer; a non-participant gets `404`, never `403`.

| Method and path | Roles | Idem | Purpose |
|---|---|---|---|
| `GET /v1/mentorships?status=&limit=` | S, M | no | Own mentorships, newest first, capped at 50 |
| `GET /v1/mentorships/{id}` | participant | no | One mentorship, with its `sessions` array |
| `PUT /v1/mentorships/{id}/agreement` | participant | no | Body: optional `cadence` (`WEEKLY`, `BIWEEKLY`, `MONTHLY`, `AD_HOC`), `planned_weeks` (1 to 52), `goal` (2000 characters) |
| `POST /v1/mentorships/{id}/agreement/acknowledge` | participant | yes | Sets the caller's own acknowledgement; a later call never overwrites the first |
| `GET /v1/mentorships/{id}/messages?cursor=&limit=` | participant | no | Thread, oldest first, keyset on (`created_at`, `id`) |
| `POST /v1/mentorships/{id}/messages` | participant | no | Text only, trimmed, 1 to 2000 characters. Queues exactly one email per message on the message id (D-62) |
| `POST /v1/mentorships/{id}/sessions` | participant | no | Body: `scheduled_start`, `duration_minutes` (15 to 240), `meeting_url` (`https://` only) |
| `POST /v1/sessions/{id}/confirm-held` | participant | yes | Sets the caller's own confirmation; `HELD` only when both exist |
| `POST /v1/sessions/{id}/cancel` | participant | no | Body: `reason` (1 to 500 characters); only a `SCHEDULED` session can be cancelled |
| `POST /v1/sessions/{id}/feedback` | participant | yes | Private feedback. Hidden from the other party until both submit or the timer ends (Could, **not built**) |
| `POST /v1/mentorships/{id}/complete` | participant | no | `ACTIVE` to `COMPLETED` once |
| `POST /v1/admin/mentorships/{id}/break-glass-read` | PA + MFA | no | **Built** by `break-glass-thread-read` (D-120 to D-124): a moderation read of one thread, its agreement and its session records. Body: `reason`, required, 1 to 1000 characters (a refusal states the bound). The order is fixed: authorize, validate, resolve, append one `THREAD_BREAK_GLASS_READ` audit row (`break_glass` true, the reason, the actor, the mentorship), then read. A missing reason, a non-admin, an admin without a second factor and an unknown mentorship return no content and write no row. The response is `200` with `mentorship_id`, `status`, `agreement`, `messages` (oldest first) and `sessions`, all through the participant projection, with `Cache-Control: no-store`; it carries no outcome text, no profile text and no email address. Participants are not notified (DEBT-52) |

`meeting_url` must be an `https` URL. Domain allow-listing is an **Open decision**. The stored link is mentor-provided and untrusted: the page labels it as such and opens it outside connect. Messages are immutable (no update or delete route). A retried identical message post creates a second row and a second email; an idempotency-key store is DEBT-21. A transition from a wrong or terminal state is `409 MENTORSHIP_INVALID_STATE`.


### 5.6 Outcomes and verification

Built by `outcomes-and-verification` (#9). Every route is a session plus a participant predicate; a non-participant gets `404`.

| Method and path | Roles | Idem | Purpose |
|---|---|---|---|
| `POST /v1/outcomes` | S (the mentorship's student) | no | Report an outcome. Body: `mentorship_id`, `outcome_type`, `description` (1 to 2000 characters), `contribution_claimed` (`DIRECTLY_ENABLED`, `HELPED`, `MINOR`), optional `title` (200) and `occurred_on`. Creates `pending_confirmation` with a seven-day deadline, one `REPORTED` event, one audit row, and one queued email to the mentor |
| `GET /v1/outcomes/{id}` | participant | no | One outcome |
| `GET /v1/outcomes?mentorship_id=&status=&limit=` | S, M | no | Own outcomes, newest first, capped at 50 |
| `POST /v1/outcomes/{id}/confirm` | M (own mentorship) | no | Confirm the fact and the contribution level separately. Body: `contribution_level_confirmed`, or `coi_declaration` to route the case to platform review |
| `POST /v1/outcomes/{id}/dispute` | M (own mentorship) | no | Dispute with a required `reason` (1 to 1000 characters). Goes to platform review |
| `POST /v1/outcomes/{id}/withdraw` | S (own) | yes | Withdraw while `pending_confirmation`, `confirmed`, or `in_platform_review`. Terminal `withdrawn`; never counts |
| `POST /v1/outcomes/{id}/evidence` | S (own) | - | **Documented but not built** (evidence change, DEBT-22). The contract omits it so it never advertises a `404` |
| `POST /v1/outcomes/{id}/evidence/{evidence_id}/complete` | S (own) | - | **Documented but not built** (DEBT-22) |

Rules:
- `confirm` is allowed only while `pending_confirmation`. A declared conflict of interest routes the case to platform review, sets `coi_declared`, and stores no confirmation (N9, D-63).
- Every transition appends exactly one `outcome_events` row with a gap-free `seq` and one `audit_logs` row (`OUTCOME_REPORTED`, `OUTCOME_CONFIRMED`, `OUTCOME_DISPUTED`, `OUTCOME_COI_DECLARED`, `OUTCOME_ESCALATED`, `OUTCOME_WITHDRAWN`) in the same transaction. `outcome_events` and `verification_records` are insert-and-select only for the application role.
- A move not in the transition table is `409 OUTCOME_INVALID_STATE`. There is no route that sets `counted`, `rejected`, or `reversed`.
- Confirming an outcome and confirming contribution are **separate fields** because "it happened" differs from "the mentor helped" (research report 3.1 #1).
- Reminders on day 3 and day 5 and escalation on day 7 are system jobs, not endpoints.
- No endpoint lets any user set `counted` or edit reputation. Reputation is derived (ADR-008).
- **Later (owner decision):** there is no appeal endpoint in the MVP. When appeals return, they will be added here as a new action with its own permission.

#### Outcome state transitions

| From | Action | To | Actor |
|---|---|---|---|
| (none) | report | `pending_confirmation` | Student |
| `pending_confirmation` | confirm | `confirmed` | Mentor |
| `pending_confirmation` | dispute | `in_platform_review` | Mentor |
| `pending_confirmation` | timer (day 7, no response) | `in_platform_review` | System |
| `pending_confirmation`, `confirmed`, `in_platform_review` | withdraw | `withdrawn` | Student |
| `confirmed` | cooling period ends and no open case | `counted` | System |
| `confirmed` | audit, anomaly flag, or objection | `in_platform_review` | System or Platform Admin |
| `in_platform_review` | decision: outcome valid | `counted` | Platform Admin |
| `in_platform_review` | decision: outcome not valid | `rejected` | Platform Admin |
| `counted` | later disproof (clawback) | `reversed` plus a compensating ledger entry; the outcome record stays | Platform Admin |
| `rejected` or `reversed` | successful appeal (**Later**) | `counted` | Platform Admin (different reviewer) |

Terminal states: `counted`, `rejected`, `reversed`, `withdrawn`. Every transition writes an append-only `OutcomeEvent` and an audit entry. This table is subordinate to `data-model.md` section 4.4; if they differ, the data model wins.

### 5.7 Institution dashboard

| Method and path | Roles | Purpose |
|---|---|---|
| `POST /v1/institutions` | PA + MFA | **Built** by `institution-onboarding`: body `name` (1 to 160 characters), `kind` (`UNIVERSITY`, `BOOTCAMP`, `TRAINING_INSTITUTE`, `OTHER`), `country_code` (two letters, upper-cased), optional `mou_signed_on` (`YYYY-MM-DD`, never in the future) and optional `domains` (up to 20 bare domains, lower-cased). One transaction writes the institution, one `institution_domains` row per domain, one `INSTITUTION_CREATED` and one `INSTITUTION_DOMAIN_REGISTERED` audit row per domain. A domain already registered to any institution, in any letter case, answers `409 INSTITUTION_DOMAIN_TAKEN` and writes nothing. Answers `201` with the institution (`id`, `name`, `kind`, `country_code`, `status`, `mou_signed_on`, `domains`). No pagination; the institution admin is assigned afterwards through `POST /v1/admin/institutions/{id}/admins` (D-109) |
| `GET /v1/institutions` | PA + MFA | **Built** by `institution-onboarding`: every institution ordered by name then id, each with its status, country code, MoU date and its own domains, as `{ data: [...] }`. No pagination in this release (D-112, DEBT-51) |
| `GET /v1/institutions/{id}/dashboard?from=&to=` | IA (own), PA | Aggregates: participation, requests, acceptance rate, first-response time, outcome reporting and confirmation rates, counted outcomes by field, funnel (Phase 1b). Small-cohort suppression hides groups below the threshold |
| `GET /v1/institutions/{id}/reports/export?format=csv` | IA (own), PA | CSV export (PDF is **Later**) |
| `GET /v1/institutions/{id}/students/{studentId}` | IA (own) with consent, PA for support | Student-level view. `403` with code `CONSENT_REQUIRED` if no active consent |

### 5.8 Privacy and data rights

| Method and path | Roles | Idem | Purpose |
|---|---|---|---|
| `POST /v1/privacy/export` | all (own) | no | **Built** by `privacy-export-and-erasure`: one synchronous JSON document of the caller's own rows from a fixed allowlist (D-84), with `Cache-Control: no-store` and `Content-Disposition: attachment`. A `SUSPENDED`, `ANONYMIZED`, or `DEACTIVATED` account is `403 FORBIDDEN`. One `privacy_requests` row of kind `EXPORT` is written in the same transaction. Throttled on its own bucket (3 per hour, a starting value) |
| `POST /v1/privacy/delete` | all (own) | no | **Built** by `privacy-export-and-erasure`: one transaction tombstones the account — status `ANONYMIZED`, keyed email hash, `Deleted user`, empty profile text, mentor profile `REMOVED`, the caller's own message bodies replaced with a tombstone string, every session and second-factor row deleted, one `ACCOUNT_DELETED` audit entry and one `privacy_requests` row — and never touches a ledger, verification, reputation, or audit row (D-85). Body: `confirm_email`, compared case-insensitively (D-86); a mismatch is `422 VALIDATION_FAILED` naming the field. Deletion is immediate and irreversible. A second request finds the account anonymized and changes nothing |
| `GET /v1/privacy/export/{id}/download` | all (own) | no | **Not built.** The synchronous document above replaces it; the signed-URL depth is DEBT-39 |
| `GET /v1/privacy/requests` | all (own) | no | **Not built.** Each request is recorded in `privacy_requests`; no read route exists yet |

There is no export-request id, no `202`, and no completion email: the export is the response (D-84). The statutory time limit for completing requests remains an **Open decision** for counsel.

### 5.9 Consent and agreements

| Method and path | Roles | Idem | Purpose |
|---|---|---|---|
| `GET /v1/me/consents` | all (own) | yes | **Built** by `consent-purposes-and-mentor-agreements`: the five `consent_purposes` with `current_version` (the published `CONSENT_DOCUMENT_VERSION`), `accepted_version` (null when nothing is accepted or the latest action was a withdrawal), `action`, `institution_id`, plus an `institutions` array of the caller's own affiliations so the sharing section can name them |
| `POST /v1/me/consents` | all (own) | no | **Built**: body `purpose`, `action` (`GRANTED` or `WITHDRAWN`), `document_version` (1 to 32 characters) and optional `institution_id`. Appends one `consent_records` row and one audit row (`CONSENT_GRANTED` or `CONSENT_WITHDRAWN`) in one transaction. `institution_id` is required for `INSTITUTION_DATA_SHARING` and resolved to an institution the caller is affiliated with — an unaffiliated one is `404` and writes nothing — and is refused (`422`) on any other purpose. An unknown purpose, a bad action, a missing or over-long version is `422`. A `VOLUNTEER_AGREEMENT` grant also stamps `mentor_profiles.orientation_completed_at` once and writes one `ORIENTATION_COMPLETED` audit row, and re-runs the activation funnel in the same transaction (D-127, D-130) |

No route refuses a request because an accepted document version is stale: the mismatch is reported by the read above and rendered as a header banner (D-129). There is no consent report and no institution read of a student's consent state.

### 5.10 Platform admin and trust and safety

| Method and path | Roles | Idem | Purpose |
|---|---|---|---|
| `GET /v1/review-queue?cursor=&limit=` | PA + MFA | no | **Built** by `platform-review-queue`: open `IN_PLATFORM_REVIEW` cases, oldest `mentor_decision_due_at` first, keyset by the last outcome id (limit 1 to 50, default 20). A row carries the outcome, `case_kind` (`mentor_dispute`, `conflict_of_interest`, `escalated_d7`), `reason`, `opened_at`, and `waiting_days`. No assignment or due date (D-76) |
| `POST /v1/outcomes/{id}/review` | PA + MFA | yes | **Built** by `platform-review-queue`: body `decision` (`valid` or `invalid`) and `reason` (1 to 1000 characters). `valid` moves a review case to `COUNTED` with `counted_basis = platform_decision`; `invalid` moves it to `REJECTED`, or performs the T11 clawback on a `COUNTED` outcome (`REVERSED` plus one `REVERSAL` ledger event). Any other pair is `409 OUTCOME_INVALID_STATE`; one audit row and one queued email per decision |
| `GET /v1/admin/disputes?status=` | PA | no | **Not built.** The review queue above replaces it; this row stays a Phase 1b design note |
| `POST /v1/admin/disputes/{id}/start-review` | PA | yes | Take a case. The admin must not be a party |
| `POST /v1/admin/disputes/{id}/resolve` | PA | yes | Body: `decision` (`outcome_valid` or `outcome_not_valid`), `reason` (required). Decided by a Platform Admin, never an Institution Admin |
| `POST /v1/admin/outcomes/{id}/audit` | PA | yes | Start an audit |
| `POST /v1/admin/break-glass` | PA | yes | Request time-limited access to private content. Body: `case_reference`, `reason`. Returns an expiring grant |
| `GET /v1/admin/audit?actor=&action=&object_type=&object_id=&from=&to=&cursor=&limit=` | PA + MFA | no | **Built** by `audit-log-search` (2026-11-13). Filters are optional and ANDed: `actor` (the account id), `action` (a member of the audit union), `object_type` (a value the writers store, in its real letter case), `object_id` (free text), and `from`/`to` as UTC calendar days, both inclusive. Newest first, keyset on the `(occurred_at, id)` pair; `limit` 1 to 100 (default 50). The projection is `id`, `occurred_at`, `actor_user_id`, `actor_role`, `action`, `object_type`, `object_id`, `request_id`, `break_glass` and `reason` — `metadata`, `prev_hash` and `hash` are never selected (D-136). An unknown `action` or `object_type`, an `actor` value with characters outside `[A-Za-z0-9_-]`, an unparseable date, `from` after `to`, or an out-of-range `limit` is `422` naming the parameter (D-135). The read writes no audit row (D-137). The `action` filter is a scan; DEBT-58 records the bound at which an index is added (D-138) |
| `POST /v1/reports` | all | no | **Built** by `abuse-reports-and-sanctions`: report a `user`, `message`, `profile`, or `outcome` with a fixed `reason` (`harassment`, `spam`, `impersonation`, `misrepresentation`, `other`) and optional `details` (1 to 2000 characters). A target the reporter cannot see is `404`, never `403`; a malformed kind, id, or reason is `422`. `201` with the open report. The reported user is never told who reported them |
| `GET /v1/reports?cursor=&limit=` | PA + MFA | no | **Built**: the open queue, oldest first, keyset on `(created_at, id)`; `limit` 1 to 50 (default 20). `403 ROLE_REQUIRED` / `403 MFA_REQUIRED` Each row also carries `mentorship_id`, the mentorship a reported message belongs to (null for every other target), which the admin page uses to form the break-glass call (design R1 of `break-glass-thread-read`, D-122). |
| `POST /v1/reports/{id}/resolve` | PA + MFA | no | **Built**: body `decision` (`actioned` or `dismissed`) and `reason` (1 to 1000 characters). One conditional update stores the decision, the reason, the resolver, and the time; a second call is `409 REPORT_ALREADY_RESOLVED`. One `REPORT_RESOLVED` audit row and one queued email to the reporter |
| `POST /v1/admin/accounts/{id}/suspend` | PA + MFA | no | **Built**: body `reason` (required, 1 to 1000) and optional `end_date` (`YYYY-MM-DD`). One transaction sets `SUSPENDED`, stores `suspended_until`, deletes every session row, appends one `ACCOUNT_SUSPENDED` audit entry, and queues one notice email; `422` when the reason is missing, and nothing changes. The end date never lifts the suspension automatically (D-88, DEBT-40) |
| `POST /v1/admin/accounts/{id}/reinstate` | PA + MFA | no | **Not built.** Lifting a suspension needs SQL today (DEBT-40) |
| `GET /v1/admin/config` and `PUT /v1/admin/config` | PA | yes | Versioned configuration (weights, thresholds). Every change is audited |

Only the rows marked **Built** exist in this release. The `admin/disputes`, `admin/outcomes/{id}/audit`, break-glass, reinstate and config rows are deferred (Phase 1b or the hardening work); they are not served by the API today.

### 5.11 AI assist (**Later**)

Not in the MVP. AI features and AI models are **Deferred (owner decision)** and return no endpoint until that phase starts. The shape below is kept as a design note; nothing here may be required by a Phase 1 or Phase 1b requirement.

| Method and path | Roles | Idem | Purpose |
|---|---|---|---|
| `POST /v1/ai/request-draft` (**Later**) | S | yes | Turns a vague need into a draft structured request. Output is labelled and **never auto-sent** |
| `GET /v1/requests/{id}/briefing` (**Later**) | M (addressee) | no | AI-drafted briefing for the mentor. Labelled, human-reviewed |

Responses include `"ai_generated": true`. If the AI provider is down, these endpoints return `503` with code `AI_UNAVAILABLE` and the rest of the product is unaffected (ADR-009).

## 6. Worked example (Illustrative)

**Student reports an outcome**

```http
POST /v1/outcomes
Idempotency-Key: <uuid-v4>
Content-Type: application/json

{
  "mentorship_id": "7a1c...",
  "outcome_type": "internship",
  "description": "Accepted for a summer internship.",
  "contribution_level": "helped"
}
```

```http
HTTP/1.1 201 Created
Location: /v1/outcomes/9b2e...
X-Request-Id: b6a3...

{
  "id": "9b2e...",
  "status": "pending_confirmation",
  "evidence_tier": 0,
  "confirm_by": "2026-12-08T10:00:00Z"
}
```

**Mentor confirms with a conflict declaration**

```http
POST /v1/outcomes/9b2e.../confirm
Idempotency-Key: 8d2e...

{
  "contribution_level_confirmed": "helped",
  "conflict_declaration": { "has_conflict": false }
}
```

Response `200` with `"status": "confirmed"`. The outcome becomes `counted` only after the cooling period.

## 7. Real-time and WebSocket (**Later**)

Not part of Phase 1 (ADR-006). When added, a Socket.IO gateway will deliver events such as `request.decided`, `message.created`, and `outcome.status_changed` through the same notification interface. Persistence stays in PostgreSQL; a client that was offline fetches missed items through the REST endpoints above. Events will be documented here with the same envelope and versioning rules.

## 8. Webhooks (**Later**)

Payment gateway webhooks (Phase 3, ADR-015) and meeting-provider webhooks are verified by signature, idempotent, and written through the outbox. They will be documented here when built.

## 9. Rate limits

Default limits are configuration, not code (SEC-ABUSE-4). Concrete values remain an **Open decision** (SEC-O2) and the shipped numbers are **placeholders pending pilot traffic**:

| Route | Limit | Key |
|---|---|---|
| `POST /v1/auth/sign-in` | 5 per minute | client IP |
| `POST /v1/auth/register` | 3 per hour | client IP |
| `POST /v1/auth/forgot-password`, `reset-password` | 3 per hour | client IP |
| `POST /v1/requests`, `POST /v1/mentorships/{id}/messages`, `POST /v1/outcomes`, `:{id}/confirm`, `:{id}/dispute` | 60 per minute | client IP |
| every other route (including the public directory) | 120 per minute | client IP |
| `POST /v1/auth/sign-in` (second bucket) | 10 per hour | account (body email, else session, else client IP) |
| `POST /v1/auth/forgot-password`, `reset-password` (second bucket) | 5 per hour | account (body email, else session, else client IP) |
| every other route (second bucket) | 120 per minute | account (body email, else session, else client IP) |
| `GET /healthz`, `GET /readyz` | unthrottled, both buckets | - |

A refusal is `429 RATE_LIMITED` with a numeric `Retry-After`. The store is in process memory (`@nestjs/throttler`), so the limit is **per instance**: a multi-instance deployment needs a shared store, which ADR-006 defers until after the pilot.

Two buckets apply (`per-account-rate-limit`, 2026-11-12, D-118, D-119). The address bucket is unchanged; the account bucket keys on the normalised body `email` when present, otherwise on a present session credential, otherwise on the client address, and the key is a SHA-256 hash so no email address appears in a key. Registration has no account bucket, because no account exists before the request succeeds. A named bucket answers with `Retry-After-account`, and the refusal's `Retry-After` carries the longest wait of the buckets that blocked.

## 10. Error catalog (initial)

| Code | HTTP | Meaning |
|---|---|---|
| `UNAUTHENTICATED` | 401 | No valid session |
| `INVALID_VERIFICATION_LINK` | 400 | Verification token missing, invalid, or expired |
| `INVALID_RESET_TOKEN` | 400 | Reset token missing, invalid, expired, or already used |
| `FORBIDDEN` | 403 | Role or policy does not allow this |
| `NOT_FOUND` | 404 | Not found or not visible |
| `VALIDATION_FAILED` | 422 | Field errors in `errors`, or an undocumented top-level body property (the detail names it) |
| `PAYLOAD_TOO_LARGE` | 413 | The body is larger than the API accepts (100 KiB) |
| `AFFILIATION_EMAIL_UNVERIFIED` | 422 | A claim needs a verified email address |
| `AFFILIATION_INSTITUTION_MISMATCH` | 422 | No registered institution matches the claim |
| `UNDER_MINIMUM_AGE` | 422 | Under 18 at sign-up |
| `EMAIL_NOT_VERIFIED` | 403 | Verification required for this action |
| `ACCOUNT_SUSPENDED` | 403 | The account is suspended; every session was revoked |
| `MFA_REQUIRED` | 403 | MFA needed for this role or action |
| `PROVIDER_UNAVAILABLE` | 503 | This sign-in provider is not configured in this deployment |
| `REAUTH_REQUIRED` | 403 | Recent re-authentication needed |
| `MENTOR_NOT_VERIFIED` | 409 | Mentor is below affiliation Level 1 |
| `MENTOR_UNAVAILABLE` | 409 | Mentor is paused or not operating |
| `MENTOR_AT_CAPACITY` | 409 | Weekly capacity reached |
| `REQUEST_LIMIT_REACHED` | 409 | The student has three pending requests |
| `CAPACITY_BELOW_ACTIVE` | 409 | Resume refused: live `ACTIVE` mentorships are at or above `weekly_capacity`; the mode stays `PAUSED` |
| `MENTORSHIP_INVALID_STATE` | 409 | Mentorship, agreement, or session cannot take this action now |
| `DUPLICATE_PENDING_REQUEST` | 409 | Already a pending request to this mentor |
| `REQUEST_INVALID_STATE` | 409 | Request cannot take this action now |
| `OUTCOME_INVALID_STATE` | 409 | Outcome cannot take this action now |
| `REPORT_ALREADY_RESOLVED` | 409 | The report was resolved by an earlier request |
| `CONFLICT_DECLARATION_REQUIRED` | 422 | Mentor must declare conflicts |
| `CONSENT_REQUIRED` | 403 | Active consent missing |
| `EVIDENCE_REJECTED` | 422 | File type, size, or scan result not allowed |
| `IDEMPOTENCY_KEY_REQUIRED` | 400 | Header missing |
| `IDEMPOTENCY_KEY_REUSED` | 409 | Same key, different request |
| `REQUEST_IN_PROGRESS` | 409 | Original request still running |
| `PRECONDITION_FAILED` | 412 | Stale `If-Match` |
| `RATE_LIMITED` | 429 | Too many requests |
| `AI_UNAVAILABLE` | 503 | AI assist is down |
| `INTERNAL_ERROR` | 500 | Unexpected fault (details only in logs) |

## 11. Contract workflow

1. Change the OpenAPI file first (contract-first).
2. CI checks the spec, diffs it against the last release for breaking changes, and regenerates the TypeScript client.
3. Contract tests run the API against the spec. A mismatch fails the build.
4. The matrix test checks that each operation's declared roles agree with `docs/auth-and-access-control.md`.
5. NestJS handlers validate the named fields in the schema. An API-wide interceptor refuses every undocumented top-level body key with `422 VALIDATION_FAILED`; `ROUTE_BODY_KEYS` in `packages/contracts/src/body-keys.ts` is the allowlist, and a contract test asserts it equals each OpenAPI request schema's `properties`. `account_status` is the single documented no-op.

## 12. Versioning and deprecation

- **Non-breaking** (allowed in `/v1`): new optional request fields, new response fields, new endpoints, new enum values only where documented as extensible (clients must tolerate unknown enum values).
- **Breaking** (requires `/v2`): removing or renaming fields, changing types or meaning, making an optional field required, changing a state machine so that a previously valid action fails.
- Deprecations are announced with a `Deprecation` header and a date. The support window is an **Open decision**.
- GraphQL is **Later** (ADR-011). If added, it will sit over the same domain services and share these policies.

## 13. Open decisions and questions for the owner

| # | Question | Recommended default |
|---|---|---|
| API-O1 | Treat evidence as an attribute (`evidence_tier`) instead of the README's `EvidenceAttached` state? | **Decided 2026-10-29: yes** (owner decision D-02) |
| API-O2 | Final outcome taxonomy: confirm `job_offer` and its difficulty weight | Weight decided after pilot data |
| API-O3 | Allow-list for meeting URL domains? | Allow any `https` URL in the pilot |
| API-O4 | Public problem `type` URL domain | Decide when a domain exists |
| API-O5 | Statutory time limit for export and deletion | Counsel to advise (Deferred, owner decision) |
| API-O6 | Deprecation support window | 6 months after a `/v2` release |
| API-O7 | Whether the cooling period is 14 days | Accept the default for the pilot |

## 14. Acceptance checklist

- [ ] Every Phase 1 functional requirement in `docs/functional-requirements.md` maps to at least one endpoint here.
- [ ] Every endpoint lists its roles, and these agree with the permission matrix in `docs/auth-and-access-control.md`.
- [ ] Every state machine here matches the status enums in `docs/data-model.md` and the glossary.
- [ ] Every retryable `POST` requires `Idempotency-Key`.
- [ ] No endpoint can edit an outcome record, a ledger row, or reputation directly.
- [ ] The WebSocket, webhook, and GraphQL sections are marked **Later**, and no Phase 1 requirement depends on them.
- [ ] The OpenAPI file builds, the client generates, and the contract tests pass in CI.
