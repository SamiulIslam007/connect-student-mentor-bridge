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
| `ETag` / `If-Match` | Response / Request | Optimistic concurrency on editable resources (profiles) |

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

- `errors` appears only on validation failures (`422`).
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
| `412` | `If-Match` failed (stale edit) |
| `422` | Validation failed |
| `429` | Rate limit exceeded |
| `5xx` | Server fault. Never used for client mistakes |

## 2. Authentication endpoints

`POST /v1/auth/*` is **delegated to the auth library** behind `IdentityService` (ADR-003). The endpoints are documented in OpenAPI but not custom-built.

| Method and path | Purpose |
|---|---|
| `POST /v1/auth/register` | Create an account. A date of birth is accepted **only** to check the 18+ gate and is **not stored**; an under-18 attempt returns `422` with code `UNDER_MINIMUM_AGE` |
| `POST /v1/auth/verify-email` | Confirm the email token |
| `POST /v1/auth/sign-in` | Email and password; may return `mfa_required` |
| `POST /v1/auth/sign-in/provider` | Google in the MVP. Facebook and LinkedIn are **Later**; Microsoft is not supported |
| `POST /v1/auth/mfa/verify` | Complete TOTP |
| `POST /v1/auth/mfa/enroll` | Start TOTP enrollment |
| `POST /v1/auth/refresh` | Rotate the refresh token (library endpoint) |
| `POST /v1/auth/sign-out` | Revoke the current session (library endpoint) |
| `POST /v1/auth/forgot-password` and `/reset-password` | Reset flow (same response whether or not the email exists) |

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
| `account_status` | `active`, `suspended`, `deactivated`, `deletion_pending`, `anonymized` |
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
| `GET /v1/me` | all | no | Current user, roles, consent state, mentor status | `200` |
| `PUT /v1/me/student-profile` | S | no (uses `If-Match`) | Goals, field, availability | `200` |
| `PUT /v1/me/mentor-profile` | M | no (uses `If-Match`) | Fields, scope, weekly capacity cap, availability | `200` |
| `POST /v1/me/mentor-profile/pause` | M | yes | Set access mode to `PAUSED` (hidden from discovery, no new requests) | `200` |
| `POST /v1/me/mentor-profile/resume` | M | yes | Clear `PAUSED`, subject to capacity | `200` |
| `POST /v1/me/deactivate` | all | yes | Deactivate the account (`account_status = deactivated`); sessions revoked | `200` |
| `GET /v1/me/consents` | all | no | Current consents | `200` |
| `PUT /v1/me/consents/{purpose}` | all | yes | Give or withdraw one consent. Appends a ledger record | `200` |
| `GET /v1/me/sessions` and `DELETE /v1/me/sessions/{id}` | all | no | List and revoke own sessions | `200`, `204` |

`PUT /v1/me/mentor-profile` rejects a capacity cap below the number of active mentorships with code `CAPACITY_BELOW_ACTIVE`.

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
| `GET /v1/fields` | all | Field taxonomy |

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
| `FORBIDDEN` | 403 | Role or policy does not allow this |
| `NOT_FOUND` | 404 | Not found or not visible |
| `VALIDATION_FAILED` | 422 | Field errors in `errors` |
| `UNDER_MINIMUM_AGE` | 422 | Under 18 at sign-up |
| `EMAIL_NOT_VERIFIED` | 403 | Verification required for this action |
| `MFA_REQUIRED` | 403 | MFA needed for this role or action |
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
5. NestJS handlers validate input against the schema and reject unknown fields.

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
