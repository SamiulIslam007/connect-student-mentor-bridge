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

## 2. Authentication endpoints

Identity is implemented with better-auth behind `IdentityService` (ADR-003) and exposed as NestJS endpoints under `/v1/auth`. The browser reaches them only through the `apps/web` route handlers, which keep the session token in an httpOnly, SameSite=Lax cookie (Secure outside development); the API accepts `Authorization: Bearer <session token>` from the BFF.

**Implemented in Sprint 1 (change `identity-better-auth`):**

| Method and path | Auth | Purpose | Success | Errors |
|---|---|---|---|---|
| `POST /v1/auth/register` | none | Create an account. A date of birth is accepted **only** to check the 18+ gate and is **not stored**. The response does not reveal whether the address already exists, and no session is returned. An email with a live `signup_blocks` entry is refused before the age gate is evaluated | `200` `{ "status": "verification_sent" }` | `422 VALIDATION_FAILED`, `422 UNDER_MINIMUM_AGE` |
| `GET /v1/auth/verify?token=` | none | Confirm the email token (24-hour lifetime) and move the account from `pending` to `active`. Opening the link twice succeeds, sends no second email, and records no second activation | `200` `{ "status": "verified" }` | `400 INVALID_VERIFICATION_LINK`, `422 VALIDATION_FAILED` |
| `POST /v1/auth/sign-in` | none | Email and password. A wrong password and an unknown email return the same `401` body; the account status is evaluated only after the password is accepted. The response includes `account_status`, so the client never guesses it | `200` `{ "session_token", "account" }` | `401 UNAUTHENTICATED`, `403 EMAIL_NOT_VERIFIED`, `403 ACCOUNT_SUSPENDED`, `403 FORBIDDEN`, `422 VALIDATION_FAILED` |
| `POST /v1/auth/sign-out` | bearer | Revoke the current session | `200` `{ "status": "signed_out" }` | `401 UNAUTHENTICATED` |
| `POST /v1/auth/sign-out-everywhere` | bearer | Revoke every session for the account | `200` `{ "status": "signed_out_everywhere" }` | `401 UNAUTHENTICATED` |
| `POST /v1/auth/forgot-password` | none | Send a reset link (30-minute lifetime). Same response whether or not the address exists; no email for an unknown address | `200` `{ "status": "reset_email_sent_if_account_exists" }` | `422 VALIDATION_FAILED` |
| `POST /v1/auth/reset-password` | none | Set a new password with a single-use token; every existing session is revoked | `200` `{ "status": "password_reset" }` | `400 INVALID_RESET_TOKEN`, `422 VALIDATION_FAILED` |

**Implemented in change `account-status-lifecycle`:**

| Method and path | Auth | Purpose | Success | Errors |
|---|---|---|---|---|
| `GET /v1/me` | bearer | The signed-in account's own record only: `id`, `display_name`, `email`, `email_verified`, `account_status`, `timezone`, `mfa_enabled`. No profile fields and no other user's data. `mfa_enabled` is true when a verified second factor is active. The account comes from the session token | `200` account summary | `401 UNAUTHENTICATED` |
| `POST /v1/me/deactivate` | bearer | Set the account to `deactivated` and revoke every session for it, including the caller's. Signing in again with the correct password returns the account to `active` | `200` `{ "status": "deactivated" }` | `401 UNAUTHENTICATED` |

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
| `GET /v1/me` | all | no | The signed-in account record (id, display name, email, verification state, `account_status`, timezone) plus the caller's own `student_profile` and `mentor_profile`, each nullable. The sign-in response keeps the narrower `AccountSummary` shape | `200` |
| `PUT /v1/me/student-profile` | S | no (last write wins, D-39) | Create or fully replace the caller's student profile: goals, primary field, up to two interest fields, mentoring languages | `200` |
| `PUT /v1/me/mentor-profile` | M | no (last write wins, D-39) | Create or fully replace the caller's mentor profile: headline, bio, expertise summary, scope statement, primary field, additional fields, languages, weekly capacity | `200` |
| `POST /v1/me/mentor-profile/pause` | M | yes | Set access mode to `PAUSED` (hidden from discovery, no new requests). **Not built yet** (`profile-availability-and-access-mode`) | `200` |
| `POST /v1/me/mentor-profile/resume` | M | yes | Clear `PAUSED`, subject to capacity. **Not built yet** | `200` |
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
- `account_status`, `display_name`, `email`, and any other account-level property in the body are **accepted and ignored**, never applied to the account. Strict unknown-key rejection is a pre-existing API-wide gap (`SEC-API-1`, owner: Sprint 7 hardening), not added here.
- There is no `If-Match`, no `ETag`, and no version column: one owner edits one profile from one browser (D-39).

`PUT /v1/me/mentor-profile` rejects a capacity cap below the number of active mentorships with code `CAPACITY_BELOW_ACTIVE`. **That check belongs to change #7** and does not ship with this version of the endpoint.

### 5.2 Affiliation

| Method and path | Roles | Idem | Purpose |
|---|---|---|---|
| `POST /v1/me/affiliations` | S, M | yes | Claim affiliation with an institution (email domain check or request for attestation) |
| `GET /v1/institutions/{id}/affiliations?status=pending` | IA (own), PA | no | Pending affiliation claims |
| `POST /v1/institutions/{id}/affiliations/{aid}/approve` | IA (own), PA | yes | Attest Level 1 |
| `POST /v1/institutions/{id}/affiliations/{aid}/reject` | IA (own), PA | yes | Reject, with reason |

### 5.3 Discovery

| Method and path | Roles | Purpose |
|---|---|---|
| `GET /v1/mentors?field=&language=&access_state=&cursor=&limit=` | S | Mentor discovery with rule-based suggestions and a plain-language reason. Full mentors appear with the request action disabled; paused mentors are hidden. Sort by suggestion rank, ties broken by mentor ID for stable pages |
| `GET /v1/mentors/{id}` | all | Public profile |
| `GET /v1/mentors/{id}/impact` | all | Counted outcomes by field and difficulty, response reliability, confidence tier. Only **counted** outcomes appear |
| `GET /v1/fields?limit=&cursor=` | all | Field taxonomy: active fields only, ordered by normalized slug, each as `{ id, name }` plus a `next_cursor`. `limit` defaults to 100 (maximum 200) and `cursor` is the last slug of the previous page; `next_cursor` is null on the last page. **Ships with `profiles-and-dynamic-fields`**; the list is created by profile saves and is never seeded |

The Match Score is a **sort aid, never a predictor of success** (README 5.2). The response exposes `reasons` as text and never exposes sensitive attributes.

### 5.4 Requests

| Method and path | Roles | Idem | Purpose |
|---|---|---|---|
| `POST /v1/requests` | S | yes | Create a structured request. Required: `mentor_id`, `question`, `context_summary`, `target_outcome`, `expected_timeframe` |
| `GET /v1/requests?role=sent\|received&status=&cursor=` | S, M | no | Own requests |
| `GET /v1/requests/{id}` | participant | no | One request |
| `POST /v1/requests/{id}/accept` | M (addressee) | yes | Creates a `Mentorship` |
| `POST /v1/requests/{id}/decline` | M (addressee) | yes | Body: optional `reason` |
| `POST /v1/requests/{id}/redirect` | M (addressee) | yes | Body: `alternative_mentor_ids` (1 to 3) and optional `note`. **Phase 1b** (not required for the MVP) |
| `POST /v1/requests/{id}/withdraw` | S (sender) | yes | Only while `pending` |

Rules and errors: mentor must be Level 1 or above (`MENTOR_NOT_VERIFIED`), not suspended, and have capacity (`MENTOR_AT_CAPACITY`). Duplicate pending requests to the same mentor are rejected (`DUPLICATE_PENDING_REQUEST`). Undecided requests expire at **48 hours** with a reminder at **24 hours** (owner decision).

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

| Method and path | Roles | Idem | Purpose |
|---|---|---|---|
| `GET /v1/mentorships?status=` | S, M | no | Own mentorships |
| `GET /v1/mentorships/{id}` | participant | no | One mentorship |
| `PUT /v1/mentorships/{id}/agreement` | participant | yes | Propose cadence, duration, goal (Should) |
| `POST /v1/mentorships/{id}/agreement/acknowledge` | participant | yes | Each party acknowledges |
| `GET /v1/mentorships/{id}/messages?cursor=` | participant | no | Thread, oldest first |
| `POST /v1/mentorships/{id}/messages` | participant | yes | Text only. Body size is limited. Triggers an email notification |
| `POST /v1/mentorships/{id}/sessions` | participant | yes | Record a planned session with `starts_at` and a mentor-provided `meeting_url` (ADR-007) |
| `POST /v1/sessions/{id}/confirm-held` | participant | yes | Each party confirms the session happened |
| `POST /v1/sessions/{id}/feedback` | participant | yes | Private feedback. Hidden from the other party until both submit or the timer ends (Could) |
| `POST /v1/mentorships/{id}/complete` | participant | yes | Mark the mentorship completed |

`meeting_url` must be an `https` URL. Domain allow-listing is an **Open decision**.

### 5.6 Outcomes and verification

| Method and path | Roles | Idem | Purpose |
|---|---|---|---|
| `POST /v1/outcomes` | S | yes | Report an outcome. Body: `mentorship_id`, `outcome_type`, `description`, `contribution_level`. Creates `pending_confirmation`; notifies the mentor |
| `GET /v1/outcomes/{id}` | participant, PA | no | One outcome |
| `GET /v1/outcomes?mentorship_id=&status=` | S, M | no | Own outcomes |
| `POST /v1/outcomes/{id}/evidence` | S (own) | yes | Start an evidence upload; returns a short-lived signed upload URL and `evidence_id` |
| `POST /v1/outcomes/{id}/evidence/{evidence_id}/complete` | S (own) | yes | Finish the upload. The file is scanned before it can be viewed. A hash is recorded |
| `POST /v1/outcomes/{id}/confirm` | M (own mentorship) | yes | Confirm the fact and the contribution level separately. Body: `contribution_level_confirmed`, `conflict_declaration` (required) |
| `POST /v1/outcomes/{id}/dispute` | M (own mentorship) | yes | Dispute with a reason. Goes to platform review |
| `POST /v1/outcomes/{id}/withdraw` | S (own) | yes | Withdraw while `pending_confirmation`, `confirmed`, or `in_platform_review`. Terminal `withdrawn`; never counts |

Rules:
- `confirm` is allowed only while `pending_confirmation`. A declared conflict of interest (relative, direct report, paid relationship) routes the case to platform review instead of counting it (N9).
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
| `GET /v1/institutions/{id}/dashboard?from=&to=` | IA (own), PA | Aggregates: participation, requests, acceptance rate, first-response time, outcome reporting and confirmation rates, counted outcomes by field, funnel (Phase 1b). Small-cohort suppression hides groups below the threshold |
| `GET /v1/institutions/{id}/reports/export?format=csv` | IA (own), PA | CSV export (PDF is **Later**) |
| `GET /v1/institutions/{id}/students/{studentId}` | IA (own) with consent, PA for support | Student-level view. `403` with code `CONSENT_REQUIRED` if no active consent |

### 5.8 Privacy and data rights

| Method and path | Roles | Idem | Purpose |
|---|---|---|---|
| `POST /v1/privacy/export` | all (own) | yes | Request a data export. `202`; the user is emailed when it is ready |
| `GET /v1/privacy/export/{id}/download` | all (own) | no | Download a completed export through a short-lived signed URL |
| `POST /v1/privacy/delete` | all (own) | yes | Request deletion. `202`. Requires recent re-authentication |
| `GET /v1/privacy/requests` | all (own) | no | Status of own requests |

The statutory time limit for completing requests is an **Open decision** for counsel.

### 5.9 Platform admin and trust and safety

| Method and path | Roles | Idem | Purpose |
|---|---|---|---|
| `GET /v1/admin/disputes?status=` | PA | no | Dispute and audit queue |
| `POST /v1/admin/disputes/{id}/start-review` | PA | yes | Take a case. The admin must not be a party |
| `POST /v1/admin/disputes/{id}/resolve` | PA | yes | Body: `decision` (`outcome_valid` or `outcome_not_valid`), `reason` (required). Decided by a Platform Admin, never an Institution Admin |
| `POST /v1/admin/outcomes/{id}/audit` | PA | yes | Start an audit |
| `POST /v1/admin/break-glass` | PA | yes | Request time-limited access to private content. Body: `case_reference`, `reason`. Returns an expiring grant |
| `GET /v1/admin/audit-log?actor=&object=&from=&to=` | PA | no | Search the audit log |
| `POST /v1/reports` | all | yes | File an abuse report (any user) |
| `GET /v1/admin/reports?status=` and `POST /v1/admin/reports/{id}/resolve` | PA | yes | Moderation queue |
| `POST /v1/admin/users/{id}/suspend` and `/reinstate` | PA | yes | Reason required |
| `GET /v1/admin/config` and `PUT /v1/admin/config` | PA | yes | Versioned configuration (weights, thresholds). Every change is audited |

### 5.10 AI assist (**Later**)

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

Default limits are configuration, not code (SEC-ABUSE-4). Endpoints with stricter limits: sign-in, sign-up, password reset, `POST /v1/requests`, `POST /v1/outcomes`, evidence upload, `POST /v1/ai/*`, `POST /v1/reports`. Concrete values are an **Open decision** (SEC-O2).

## 10. Error catalog (initial)

| Code | HTTP | Meaning |
|---|---|---|
| `UNAUTHENTICATED` | 401 | No valid session |
| `INVALID_VERIFICATION_LINK` | 400 | Verification token missing, invalid, or expired |
| `INVALID_RESET_TOKEN` | 400 | Reset token missing, invalid, expired, or already used |
| `FORBIDDEN` | 403 | Role or policy does not allow this |
| `NOT_FOUND` | 404 | Not found or not visible |
| `VALIDATION_FAILED` | 422 | Field errors in `errors` |
| `UNDER_MINIMUM_AGE` | 422 | Under 18 at sign-up |
| `EMAIL_NOT_VERIFIED` | 403 | Verification required for this action |
| `ACCOUNT_SUSPENDED` | 403 | The account is suspended; every session was revoked |
| `MFA_REQUIRED` | 403 | MFA needed for this role or action |
| `PROVIDER_UNAVAILABLE` | 503 | This sign-in provider is not configured in this deployment |
| `REAUTH_REQUIRED` | 403 | Recent re-authentication needed |
| `MENTOR_NOT_VERIFIED` | 409 | Mentor is below affiliation Level 1 |
| `MENTOR_AT_CAPACITY` | 409 | Weekly capacity reached |
| `CAPACITY_BELOW_ACTIVE` | 422 | Cap lower than active mentorships |
| `DUPLICATE_PENDING_REQUEST` | 409 | Already a pending request to this mentor |
| `REQUEST_INVALID_STATE` | 409 | Request cannot take this action now |
| `OUTCOME_INVALID_STATE` | 409 | Outcome cannot take this action now |
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
5. NestJS handlers validate the named fields in the schema. Unknown-key rejection is **not implemented** (SEC-API-1, owner: Sprint 7 hardening); the `account_status` no-op in the profile body depends on this leniency.

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
