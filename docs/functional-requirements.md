---
title: Functional Requirements
status: Approved (MVP baseline, owner decision)
owner: Owner / CTO
date: 2026-10-29
version: 1.0
sources: [README.md (sections 3, 5, 6, 8, 11, 12, 15), connect-research-report.md v1.1 (sections 3, 5, 6, 7 docs 3, 4, 7, 12)]
---

# Functional Requirements

> **Purpose.** The exact feature set of the Phase 1 pilot product, written as numbered, testable requirements, plus what is deliberately excluded. If a feature is not here, it is not in Phase 1.

| | |
|---|---|
| **Authority** | Subordinate to [README.md](../README.md). Behavior of reputation and verification is governed by `reputation-and-verification-policy.md`; if this file differs from that policy, **the policy wins** and this file must be updated. |
| **Companion documents** | [non-functional-requirements.md](non-functional-requirements.md), [data-model.md](data-model.md), [system-architecture.md](system-architecture.md), `auth-and-access-control.md` (permission matrix), `api-contracts.md` |
| **Definition of done** | Each requirement below is "done" when its **Acceptance** (Given / When / Then) passes as an automated test or a recorded manual check. |

---

## 0. How to read this document

### 0.1 Labels

| Label | Meaning |
|---|---|
| **Plan target** | A goal from the owner's plan, not a result. |
| **Owner decision** | Decided and recorded by the owner. |
| **Recommendation** | A reasoned proposal adopted as the draft default. |
| **Proposed default** | An editable starting value, not validated. Lives in the shared configuration. |
| **Open decision** | Not decided. Must not be treated as policy. |
| **Status: DONE / PARTIAL / NOT STARTED** | One current status per Must row, at the end of its feedback cell. **DONE** means the Then clause is observable in the code path cited and a test fails without it; **PARTIAL** means part of it works and the gap is named in one line; **NOT STARTED** means nothing implements it. Scores and their convention live in [2.16](#216-must-score-2026-11-13). |

### 0.2 Requirement IDs and columns

IDs follow `FR-<AREA>-<NN>`. Once published, an ID is never reused.

| Column | Meaning |
|---|---|
| **Pri** | MoSCoW priority: **Must** (pilot cannot start without it), **Should**, **Could** |
| **Phase** | `1` required for the pilot; `1b` pilot enhancement after the pilot starts; `2` and `3` later phases (README section 15) |
| **Actor** | Student, Mentor, Institution Admin, Platform Admin, or System |

### 0.3 Scope decisions that shape this list

The Phase 1 scope is the README's product model with the research report's trimmed technical surface. Changes relative to the README's section 6.1:

| README | This document | Reason |
|---|---|---|
| Flutter mobile app in Phase 1 | **Installable PWA** (mobile-first web). Flutter in Phase 2 | One engineer; about 89% of internet subscriptions in Bangladesh are mobile [S18] |
| WebSocket real-time messaging | Async threads with email notifications and refetch | Mentorship is asynchronous by design (README 5.1) |
| Zoom API sessions | Mentor-provided meeting link | Zoom integration is not built; the licensing question is closed for the MVP |
| Separate admin console | Route group inside the web app | README already allows it |
| Bangla language open | **English only** for documents and UI | **Owner decision** (16 Oct 2026, confirmed 29 Oct 2026) |
| Likes, stars | None. Reputation is outcome-based only | README principle 2 |
| AI request drafting, briefing, AI matching | **Later**. No AI features or models in the MVP | Owner decision, 29 Oct 2026 |
| Payments and paid office hours | **Later**. `mentorships.is_paid` reserved, always false | Owner decision; README Phase 3 |
| Phone OTP, Microsoft login | **Not in the MVP** | Owner decision |

### 0.4 Roles in scope for Phase 1

**Student, Mentor, Institution Admin, Platform Admin.** The **Employer** role exists in the data model but has no Phase 1 features (Phase 3). **Age:** 18+ only in the pilot (**Owner decision**).

### 0.5 Shared vocabulary (summary)

Definitions live in `glossary.md`. Used here:

- **Outcome types:** Admission, Internship, Job offer, Skill milestone, Interview. "Job offer" was added by the owner; its difficulty weight is **Open**.
- **Contribution level:** how much the mentor helped: *Directly enabled*, *Helped*, *Minor*.
- **Evidence tier:** Tier 0 (student report plus mentor confirmation), Tier 1 (plus a document or link), Tier 2 (plus independent third-party confirmation).
- **Confidence tier:** *Emerging*, *Established*, *Proven*, shown instead of a precise 0 to 100 number at low volume.
- **Affiliation verification** (who you are and where you belong) is distinct from **Outcome verification** (a reported result was confirmed).
- **Cooling period:** a delay before a confirmed outcome fully counts. **Clawback:** a later disproof reverses its effect with a compensating ledger entry.

---

## 1. Mentorship lifecycle coverage

The README's nine-step lifecycle (section 5.1) maps to requirements as follows. Every Phase 1 requirement traces to at least one step or to a cross-cutting concern.

| README step | Requirements |
|---|---|
| 1. Student onboarding | FR-AUTH-01 to 03, FR-CONS-01, FR-UX-06, FR-REQ-09 |
| 2. Profile creation | FR-PROF-01, FR-PROF-04 |
| 3. Mentor matching | FR-DISC-01 to 06 |
| 4. Structured mentorship request | FR-REQ-01, 02, 06, 07, 08, 05 |
| 5. Mentor decision | FR-REQ-03, FR-REQ-04 |
| 6. Session or asynchronous guidance | FR-MEN-01, 02, FR-THR-01 to 03, FR-SES-01 to 03 |
| 7. Student reports an outcome | FR-OUT-01, 02, 07, 11 |
| 8. Mentor confirms or disputes | FR-OUT-03 to 06, 08 to 10, FR-ADM-01 |
| 9. Reputation updated | FR-REP-01 to 07 |
| Mentor side: apply, verify, activate | FR-PROF-02, 03, FR-VER-01 to 05 |
| Institution side | FR-INST-01 to 04, FR-VER-02 |
| Trust, safety, privacy | FR-ADM-03 to 07, FR-CONS-01, 02, FR-PRIV-01 to 03, FR-AUD-01, 02 |

---

## 2. Requirements

### 2.1 Authentication and access (AUTH)

| ID | Requirement | Actor | Pri | Phase | Acceptance |
|---|---|---|---|---|---|
| FR-AUTH-01 | Email and password sign-up and sign-in with email verification | All | Must | 1 | **Given** a new user submits a valid email and password, **When** they open the verification link, **Then** the account is verified. An unverified user cannot send requests, apply as a mentor, or report outcomes. **Status: DONE** — `services/api/src/identity/better-auth.ts` verifies the link and flips the row to `ACTIVE`; `services/api/test/identity.integration.test.ts` covers the happy path and the unverified refusal. |
| FR-AUTH-02 | Google sign-in. Facebook and LinkedIn sign-in are **Later**; Microsoft sign-in is not supported (owner decision) | All | Must | 1 | **Given** a user with a Google account, **When** they choose Google sign-in, **Then** the account is created or linked by verified email and the 18+ gate (FR-AUTH-03) still applies. **Status: PARTIAL** — the Google provider is configured in `services/api/src/identity/identity.config.ts`; gap: the authorization leg is verified live to Google's consent screen, but the token exchange needs a real Google login and a reachable provider, so the session-and-DB leg is still unverified by test (DEBT-15). |
| FR-AUTH-03 | 18+ gate at sign-up; under-18 sign-ups are blocked. The date of birth is used once for the check and is **not stored** | Student, Mentor | Must | 1 | **Given** a user enters a date of birth under 18, **When** they submit, **Then** sign-up is blocked with a clear message, no profile is created, and only a hashed block entry is kept to prevent immediate re-registration. On success the record stores `age_18_plus` and `age_gate_passed_at`; the date of birth itself is never persisted. **Status: DONE** — `packages/domain/src/age-gate.ts` decides the gate, sign-up stores `age_18_plus` and `age_gate_passed_at` only, and an under-18 attempt keeps one hashed block entry (`services/api/src/identity/email-hash.ts`). |
| FR-AUTH-04 | MFA (TOTP) is required for Mentors, Institution Admins, and Platform Admins | Mentor, Institution Admin, Platform Admin | Must | 1 | **Given** a user is granted one of these roles, **When** they sign in without an enrolled second factor, **Then** they must enroll before any role-specific action. A Platform Admin request without MFA is rejected. **Status: DONE** — `requiresMfa` guards every privileged route (`services/api/src/authorization/authorize.ts`) and `services/api/test/mfa-routes.test.ts` refuses an unenrolled admin. |
| FR-AUTH-05 | Password reset, view active sessions, sign out of all sessions | All | Must | 1 | **Given** a signed-in user, **When** they choose "sign out everywhere", **Then** every session row for that user is revoked and other sessions fail on their next request. **Status: DONE** — `revokeAll` in `services/api/src/identity/auth.controller.ts`; `services/api/test/auth-routes.test.ts` asserts the other sessions fail on their next request. |
| FR-AUTH-06 | One user can hold both a Student profile and a Mentor profile | All | Must | 1 | **Given** a user holds both profiles, **When** they use the app, **Then** they can switch context. **And** a user can never be both parties of the same mentorship (no self-mentoring). **Status: DONE** — `GET /v1/me` returns both profiles, and "a self-request is refused" in `services/api/test/requests.integration.test.ts` (also `packages/domain/test/request.test.ts`). |
| FR-AUTH-07 | Role-based and object-level authorization on every endpoint | System | Must | 1 | **Given** any endpoint, **When** an actor without permission for that object calls it, **Then** it returns a problem-details error and writes no data. Verified by a permission-matrix test generated from `auth-and-access-control.md`. **Status: DONE** — `services/api/test/authorization-matrix.test.ts` walks every route against every role and expects a problem-details refusal. |
| FR-AUTH-08 | Account activation on email verification; only an `ACTIVE` account can sign in | All | Must | 1 | **Given** a registered account with `account_status = PENDING`, **When** the verification link is opened, **Then** the status becomes `ACTIVE`. **And** a sign-in attempt by an account that is not `ACTIVE` is refused after the password is verified: `PENDING` returns `403 EMAIL_NOT_VERIFIED` and `SUSPENDED` returns `403 ACCOUNT_SUSPENDED`. Credentials are checked first, so a refusal never reveals whether an email exists. **Status: DONE** — `403 EMAIL_NOT_VERIFIED` and `403 ACCOUNT_SUSPENDED` are returned after the password check, in `services/api/test/identity.integration.test.ts`. |
| FR-AUTH-09 | Self-deactivation and its reversal | All | Must | 1 | **Given** a signed-in user, **When** they call `POST /v1/me/deactivate`, **Then** `account_status` becomes `DEACTIVATED`, every session row for that account fails on its next request, and the profile is hidden. Deactivation is reversible (owner decision D-36): a later sign-in with the correct password returns the account to `ACTIVE` and records one activation audit entry. **Status: DONE** — `resumeDeactivatedAccount` in `services/api/src/identity/account-activation.ts` flips only a still-\`DEACTIVATED\` row and writes one audit entry (DEBT-50 closed). |
| FR-AUTH-10 | Account suspension revokes every session immediately | Platform Admin | Must | 1 | **Given** an account is suspended as a sanction, **When** the suspension is applied, **Then** `account_status` becomes `SUSPENDED`, every session row for that account is revoked in the same transaction, and sign-in is refused with `403 ACCOUNT_SUSPENDED`. The sanction workflow, its reason, end date, and user notification belong to FR-ADM-05. **Status: DONE** — `POST /v1/admin/accounts/{id}/suspend` runs the status change, session revocation, audit row and notice in one transaction, and sign-in re-checks the status (D-89). |

### 2.2 Profiles and onboarding (PROF)

| ID | Requirement | Actor | Pri | Phase | Acceptance |
|---|---|---|---|---|---|
| FR-PROF-01 | Student profile: display name, goals, primary field and interest fields, mentoring languages, availability windows, optional institution affiliation with program, department, and batch year | Student | Must | 1 | **Given** valid input, **When** the student saves, **Then** the profile persists and feeds suggestions. Names in Unicode (including Bangla script) are accepted and displayed correctly. **Status: DONE** — the profile read and write routes plus weekly availability windows per context, validated in `packages/domain` and covered by `services/api/test/profiles.integration.test.ts`. |
| FR-PROF-02 | Mentor profile: headline, bio, expertise, scope ("what I can and cannot help with"), fields, languages, availability windows, **weekly capacity cap**, and access mode (Open, Application-only, Paused) | Mentor | Must | 1 | **Given** a mentor sets a capacity cap, **When** it is saved, **Then** it is within the configured bounds and is enforced by FR-REQ-06. A Paused mentor is hidden from discovery. **Status: DONE** — a capacity cap is stored and bounded, enforced at request creation and acceptance (FR-REQ-06), and enforced when resuming from `PAUSED`: the resume path counts live `ACTIVE` mentorships under the mentor row lock and refuses at capacity with `409 CAPACITY_BELOW_ACTIVE` (`services/api/src/profiles/drizzle-profiles.service.ts`, mapped in `services/api/src/http/problem-details.filter.ts`), asserted by `services/api/test/profiles.integration.test.ts`. A `PAUSED` mentor is hidden from discovery. `DEBT-17` closed 2026-11-08. |
| FR-PROF-03 | Mentor application and onboarding: accept the volunteer agreement, conflict-of-interest policy, and community guidelines; complete a short orientation | Mentor | Must | 1 | **Given** a mentor applicant, **When** they have Level 1 affiliation (FR-VER-04), MFA (FR-AUTH-04), and all agreements consented (FR-CONS-01), **Then** their status becomes Active. Otherwise they stay Pending. **Status: DONE** — `syncMentorActivation` in `services/api/src/onboarding/mentor-activation.ts` requires Level 1, the second factor and all three agreements, and returns a lapsed profile to `PENDING` on its next re-evaluation (D-130). |
| FR-PROF-04 | Profile visibility rules: a Mentor's public profile is visible to signed-in users; a Student profile is visible only to a mentor who received a request from that student; Institution Admins see aggregates only unless the student has consented | All | Must | 1 | **Given** each role, **When** it requests another user's profile, **Then** visibility follows the matrix; a test covers every role pair. **Status: DONE** — one matrix in `packages/domain/src/visibility.ts` and `packages/domain/test/visibility.test.ts` covering every role pair. |
| FR-PROF-05 | Profile edit and rectification. Changing a mentor's affiliation fields re-triggers affiliation verification | Student, Mentor | Must | 1 | **Given** a mentor edits their affiliation, **When** they save, **Then** Level 1 is suspended until re-verified and new requests are blocked until then. **Status: DONE** — claiming a different institution revokes the earlier `VERIFIED` row in the same transaction and the activation sync returns an active mentor to `PENDING`. |

### 2.3 Affiliation verification (VER)

"Verified badge" means affiliation verification only. It never implies that outcomes were independently audited.

| ID | Requirement | Actor | Pri | Phase | Acceptance |
|---|---|---|---|---|---|
| FR-VER-01 | Affiliation claim with automatic institutional-email-domain check (Level 1) where the institution has registered email domains | Mentor, Student | Must | 1 | **Given** a user verifies an email whose domain is registered for an institution, **When** the claim is submitted, **Then** Level 1 affiliation is granted automatically with method "institutional email". **Status: DONE** — `POST /v1/me/affiliations` grants `LEVEL_1`/`VERIFIED`/`INSTITUTIONAL_EMAIL` only from a verified address and answers `422 AFFILIATION_EMAIL_UNVERIFIED` otherwise. |
| FR-VER-02 | Institution Admin attestation queue for claims without a domain match | Institution Admin | Must | 1 | **Given** a pending claim for their institution, **When** the admin approves or rejects with a reason, **Then** the decision is recorded and audited. An admin cannot act on another institution's claims. **Status: DONE** — the attestation decision route with a required reason, one audit row and one notice, plus `/institution/attestations` (DEBT-19 and DEBT-35 closed). |
| FR-VER-03 | Level 2 employer-email check for industry mentors | Mentor | Should | 1 | **Given** an industry mentor verifies an employer email, **When** the check passes, **Then** Level 2 is recorded. **No government ID, passport, tax ID, or NID is ever requested.** |
| FR-VER-04 | Gate: a mentor below Level 1 cannot appear in discovery, receive requests, or earn reputation events | System | Must | 1 | **Given** a mentor with Level 0, **When** a student searches or requests, **Then** the mentor is absent or unrequestable. **When** Level 1 is revoked, **Then** pending requests expire with notice and no new requests arrive; existing outcomes are not altered unless platform review decides (Open: revocation effects). **Status: PARTIAL** — the gate is `status = 'ACTIVE'` plus a verified Level 1, enforced at request creation; gap: revoking Level 1 does not yet expire pending requests with notice. |
| FR-VER-05 | Verified-badge disclaimer is shown wherever a badge or impact summary appears | System | Must | 1 | **Given** a mentor profile with a badge, **When** it renders, **Then** the disclaimer states that a mentor countersigned and, where stated, that evidence or a third party supported it, and that not every outcome was independently audited. **Status: DONE** — one catalog string (`strings.disclaimer.verified`, D-83) on every directory card and beside the impact summary, asserted in `apps/web/test/mentor-directory.test.ts` and `apps/web/test/impact-section.test.ts`. |

### 2.4 Discovery and matching (DISC)

| ID | Requirement | Actor | Pri | Phase | Acceptance |
|---|---|---|---|---|---|
| FR-DISC-01 | Mentor discovery list limited to Active mentors, with filters (field, language, access state, availability) and cursor pagination | Student | Must | 1 | **Given** filters, **When** the student searches, **Then** only Active, non-Paused mentors matching all filters are returned; an empty result shows a helpful empty state. **Status: DONE** — the four availability parameters, all four or `422`, converted to UTC on the request's own week and matched by overlap (`services/api/test/directory-availability.integration.test.ts`, D-143 to D-145). A mentor whose **account** is not `ACTIVE` is absent from the list and from the ranked suggestions, derived from `users.status` on every read with no profile write (D-147). |
| FR-DISC-02 | Rule-based suggestions per `matching-algorithm-spec.md`, each with a plain-language reason built from the rule factors | Student | Must | 1 | **Given** a student profile, **When** suggestions are requested, **Then** results are sorted by Match Score with normalized weights, ties, zero weights, and all-zero weights handled safely, and each result shows its reason. The score is never presented as a prediction of success. **Status: PARTIAL** — five ordered suggestions with one to three reasons each and no score leaving the server (`services/api/test/matching.integration.test.ts`); gap: GoalAlignment has no data source (DEBT-41). |
| FR-DISC-03 | Access states are shown: **Available**, **Full**, **Application-only** | Student | Must | 1 | **Given** a Full mentor, **When** the student views them, **Then** the request action is disabled with an explanation. An Application-only mentor requires a short application note. **Status: DONE** — Available, Full and Application-only on the card, a Full card disables the request action with its reason, and `APPLICATION_ONLY` requires a note (D-59). |
| FR-DISC-04 | Log suggestions shown, chosen, and accepted, with the configuration version used | System | Should | 1 | **Given** a suggestion list is shown, **When** a student requests a mentor, **Then** the log links the suggestion to the resulting request for evaluation of acceptance rate. |
| FR-DISC-05 | Concierge assist: a Platform Admin can propose a mentor to a student | Platform Admin | Should | 1 | **Given** a student and a mentor, **When** the admin proposes, **Then** the student sees a suggestion with a note. It does **not** create a request on the student's behalf. |
| FR-DISC-06 | No pay-to-rank and no sensitive attributes in matching | System | Must | 1 | **Given** the match function, **Then** its inputs exclude payment state, religion, ethnicity, and other sensitive attributes. A unit test fixes the input list. **Status: DONE** — `MatchStudent` and `MatchCandidate` carry fields, affiliation, availability, capacity and request count only, and a payload test freezes the key set (`packages/domain/test/match.test.ts`). |

### 2.5 Mentorship requests (REQ)

| ID | Requirement | Actor | Pri | Phase | Acceptance |
|---|---|---|---|---|---|
| FR-REQ-01 | Structured request: **specific question, context summary, target outcome, expected timeframe**, plus interaction type (async thread or one-to-one session; group office hours is Later) | Student | Must | 1 | **Given** a missing required field or an over-length field, **When** the student submits, **Then** the request is rejected with field-level errors; valid input creates a Pending request and emails the mentor. **Status: DONE** — field bounds and field-level `422`s in `services/api/test/request-validation.integration.test.ts`, with the mentor notice as an outbox event. |
| FR-REQ-02 | Draft autosave and safe retry | Student | Must | 1 | **Given** connectivity drops mid-form, **When** it returns, **Then** the draft is restored and submitting twice creates exactly one request (idempotency key). **Status: DONE** — the form keeps the typed text on the device, keyed per mentor and cleared on success, and a partial unique index refuses the second request (`DUPLICATE_PENDING_REQUEST`); the on-device scope and its limits are DEBT-48 and DEBT-49. |
| FR-REQ-03 | Mentor decision: **accept** or **decline** (optionally recommending alternative mentors). Redirect is a separate Phase 1b requirement (FR-REQ-04) | Mentor | Must | 1 | **Given** a Pending request, **When** the mentor decides, **Then** the decision and timestamp are recorded, the student is emailed, and the request leaves Pending exactly once. **Status: DONE** — a conditional `UPDATE … WHERE status = 'PENDING'` makes the decision exactly-once, one outbox email per request, and an accept creates one mentorship row in the same transaction. |
| FR-REQ-04 | A redirect requires the student's one-tap approval before their request content is shared with the proposed mentor; redirect chain length is limited (**Proposed default**: 2). **Phase 1b** (not required for the MVP) | Student, Mentor | Should | 1b | **Given** a redirect, **When** the student approves, **Then** a new Pending request is created for the proposed mentor linked to the original. If the student ignores it, nothing is shared. |
| FR-REQ-05 | Expiry and reminders: undecided requests get a reminder at **24 hours** and expire at **48 hours** (owner decision). Expiry counts as a non-response and lowers response reliability; declining within 48 hours is **not** penalized | System | Must | 1 | **Given** an undecided request, **When** the configured times pass, **Then** the reminder is sent once and the request expires; the student sees next suggestions. Jobs are idempotent. **Status: DONE** — one five-minute sweeper does a conditional reminder at 24 h and a conditional expiry at 48 h, each writing one email event, so a rerun changes nothing. |
| FR-REQ-06 | Capacity enforcement. A mentor's slots in use = requests accepted in the current week plus Pending requests (**Proposed definition**); the cap cannot be exceeded | System | Must | 1 | **Given** slots in use equal the cap, **When** a student submits or a mentor accepts, **Then** the action is refused and the mentor shows as Full. Concurrent submissions cannot overshoot the cap (race-safe). **Status: DONE** — slots in use = pending + accepted in the last 7 days, counted under `SELECT … FOR UPDATE` on the mentor row; a concurrent-create test asserts one `201` and one `MENTOR_AT_CAPACITY`. |
| FR-REQ-07 | Abuse limits: at most one Pending request per student and mentor pair; a cap on concurrent Pending requests per student (**Proposed default**: 3) | System | Must | 1 | **Given** the limit is reached, **When** the student submits, **Then** the request is refused with an explanation. **Status: DONE** — the pair rule is a partial unique index, the per-student cap is three, and both are checked under the mentor row lock. |
| FR-REQ-08 | A student can withdraw a Pending request (`POST /v1/requests/{id}/withdraw`) | Student | Must | 1 | **Given** a Pending request, **When** withdrawn, **Then** it becomes Withdrawn and the mentor's slot is freed. **Status: DONE** — a conditional update on the sender's own `PENDING` row; a freed slot is reusable immediately, asserted in `services/api/test/requests.integration.test.ts`. |
| FR-REQ-09 | First-request nudge: a student with no request 48 hours after onboarding gets one email nudge (README **Proposed onboarding rule**; not a response-time guarantee) | System | Could | 1b | **Given** a student without a request, **When** 48 hours pass since onboarding, **Then** exactly one nudge is sent. |

### 2.6 Mentorship, threads, and sessions (MEN, THR, SES)

| ID | Requirement | Actor | Pri | Phase | Acceptance |
|---|---|---|---|---|---|
| FR-MEN-01 | On acceptance, a **Mentorship** is created with a lightweight agreement (cadence, duration, goal) that both parties acknowledge | Student, Mentor | Should | 1 | **Given** an accepted request, **When** both parties acknowledge the agreement, **Then** it is recorded. Rationale: structure (frequency, duration) is associated with better mentoring results [S9]. **Built** by `mentorship-thread-and-sessions` (#8, 2026-11-08): one mentorship per accept in the request transaction, per-party acknowledgement timestamps |
| FR-MEN-02 | Either party can mark a mentorship complete or ended early | Student, Mentor | Should | 1 | **Given** an Active mentorship, **When** a party ends it, **Then** the status changes, the other party is notified, and reporting an outcome remains possible for a defined window (Open: window length). **Partially built** by #8 (2026-11-08): either participant completes once (`ACTIVE` to `COMPLETED`); `ENDED_EARLY` is stored but has no route, the completion email is not sent, and the reporting window stays Open |
| FR-THR-01 | Async text-only thread inside a mentorship | Student, Mentor | Must | 1 | **Given** two participants, **When** one posts a message within the length limit, **Then** it persists and appears for the other after refetch. No attachments in Phase 1. **Status: DONE** — a participant-only thread, oldest first, 1 to 2000 characters, immutable (`services/api/test/mentorship.integration.test.ts`). |
| FR-THR-02 | Email notification on new message and per-user read state | Student, Mentor | Must | 1 | **Given** a new message, **When** the recipient has not read it, **Then** one notification is queued for the other participant. **Status: PARTIAL** — one outbox email per message, keyed on the message id (D-62); gap: per-user read state needs `thread_read_states` and is not built. |
| FR-THR-03 | Thread access is limited to participants; a Platform Admin can read only through audited break-glass access with a stated reason | Platform Admin | Must | 1 | **Given** a non-participant, **When** they request a thread, **Then** access is denied. **Given** a break-glass read, **Then** an audit entry with reason is written before content is returned. **Status: DONE** — `/v1/admin/mentorships/{id}/break-glass-read` writes one `THREAD_BREAK_GLASS_READ` row with the reason before it reads and returns `Cache-Control: no-store`; every refusal writes nothing. |
| FR-SES-01 | Session record with a mentor-provided meeting link (any provider), date and time | Student, Mentor | Should | 1 | **Given** a mentor adds an https meeting link and time, **When** saved, **Then** both participants see it. Non-https links are rejected. No video SDK, no recording, no transcription. **Built** by #8 (2026-11-08), with a 15 to 240 minute duration bound |
| FR-SES-02 | Both parties confirm a session was held | Student, Mentor | Should | 1 | **Given** a past session, **When** both confirm, **Then** it appears as Held in history. **Built** by #8 (2026-11-08): one confirmation timestamp per party, `HELD` written only when both exist; either party can cancel a scheduled session with a reason |
| FR-SES-03 | Session reminder email | System | Could | 1b | **Given** an upcoming session, **When** the lead time passes, **Then** one reminder is sent per participant. |

### 2.7 Outcomes and verification (OUT)

States and transitions are defined in [data-model.md](data-model.md#44-outcome-state-machine) and the policy document. **Unconfirmed outcomes never contribute to reputation.**

| ID | Requirement | Actor | Pri | Phase | Acceptance |
|---|---|---|---|---|---|
| FR-OUT-01 | Report an outcome: type (Admission, Internship, Job offer, Skill milestone, Interview), description, date it happened, and the student's stated **contribution level** | Student | Must | 1 | **Given** a student with an Active or recently ended mentorship, **When** they report, **Then** a Pending Confirmation outcome is created and the mentor is notified. A student cannot report on a mentorship they are not part of. **Status: DONE** — the report route copies the field, sets a seven-day deadline and writes one `REPORTED` event, one audit row and one queued email; only the mentorship's student reports. |
| FR-OUT-02 | Optional evidence: a file (PDF, PNG, or JPEG within the size limit) or a link, stored privately, with a SHA-256 hash recorded | Student | Should | 1 | **Given** a valid file, **When** uploaded, **Then** it is quarantined, scanned for malware, then made available through short-lived signed URLs. A file that fails the scan is never available. |
| FR-OUT-03 | Mentor actions on a pending outcome: **confirm**, **amend contribution**, or **dispute**. The outcome fact and the contribution level are confirmed **separately** | Mentor | Must | 1 | **Given** a Pending outcome on their mentorship, **When** the mentor confirms, **Then** a verification record captures the decision and contribution level; **When** they dispute, **Then** the outcome goes to platform review. **Status: DONE** — a `MENTOR_CONFIRMATION` record carries the confirmed contribution and a `MENTOR_DISPUTE` record carries its reason and routes the outcome to review. |
| FR-OUT-04 | Conflict-of-interest declaration at confirmation: relative, direct report, or paying relationship (draft rule N9) | Mentor | Must | 1 | **Given** a mentor declares a conflict, **When** they submit, **Then** the outcome goes to platform review instead of counting. **Status: DONE** — `coi_declared` plus a `CONFLICT_OF_INTEREST` record sends the outcome to platform review and stores no confirmation. |
| FR-OUT-05 | Reminders on day 3 and day 5, and escalation on day 7 after reporting (**Proposed defaults**) | System | Should | 1 | **Given** a Pending outcome with no mentor response, **When** day 3, 5, and 7 pass, **Then** each reminder or escalation happens exactly once, even if the job runs twice. **Built** by #9 (2026-11-08): the outcome pass rides the five-minute sweeper; a partial unique index per timer type is the guarantee. The 3/5/7 days are the documented timings. |
| FR-OUT-06 | The state machine is enforced; no path counts an unconfirmed outcome | System | Must | 1 | **Given** any outcome, **When** any actor or job attempts an invalid transition, **Then** it is rejected. A property test asserts that no event sequence reaches Counted without mentor confirmation or a platform decision. **Status: DONE** — one pure transition function refuses every illegal pair, and `packages/domain/test/outcome-property.test.ts` compares all 42 (state, action) pairs and walks every two- and three-step trace, asserting no trace reaches `COUNTED` without a confirmation or a review decision. |
| FR-OUT-07 | Evidence tier is computed from attached evidence and third-party confirmation, and is shown on the outcome | System | Must | 1 | **Given** an outcome, **Then** tier = 0, 1, or 2, and Admission, Internship and Job offer need at least Tier 1 to count fully (**amended: every MVP outcome is Tier 0**, D-64). **Status: DONE** — Tier 0 only for the MVP (D-64): `outcomes.evidence_tier` defaults to 0 with a 0-to-2 check and `tierFor` in `services/api/src/reputation/counting-job.ts` selects the multiplier, so every pilot outcome counts at Tier 0. Evidence upload, the Tier 1 and Tier 2 multipliers and the evidence-file route are post-pilot (DEBT-22); that deferral is why this row reaches Done by amendment rather than by built work (D-156). |
| FR-OUT-08 | Third-party confirmation (Tier 2): a one-time email link sent to the employer, program, or institution | System | Could | 1b | **Given** a student supplies a confirmer email, **When** the confirmer opens the link, **Then** their confirmation is recorded and the tier rises. Whether Tier 2 is required for Admission is an **Open decision**. |
| FR-OUT-09 | Cooling period and counting: a confirmed outcome counts only after a delay (**Proposed default**: 14 days) and only if no dispute or audit hold exists | System | Must | 1 | **Given** a confirmed outcome, **When** the cooling period elapses with no hold, **Then** it becomes Counted and a reputation event is written once. **Status: DONE** — `countDueOutcomes` in `services/api/src/reputation/counting-job.ts` re-reads each row under a lock, skips a moved deadline or a changed status, and writes the ledger event once on the ten-minute queue. |
| FR-OUT-10 | Clawback: a Platform Admin can reverse a counted outcome with a reason; the effect is a compensating reputation event, never a deletion | Platform Admin | Must | 1 | **Given** a counted outcome later disproved, **When** reversed, **Then** a compensating event is appended and the original event remains visible in the ledger. **Status: DONE** — the review route's `REVERSED` path writes the `OUTCOME_REVERSED` audit row, appends one compensating `REVERSAL` event and decrements the snapshot, leaving the original event untouched. |
| FR-OUT-11 | A student can withdraw an outcome while it is Pending or in review | Student | Should | 1 | **Given** a Pending outcome, **When** withdrawn, **Then** it becomes Withdrawn and never counts. **Built** by #9 (2026-11-08) from `pending_confirmation`, `confirmed`, and `in_platform_review` |

**Decided (D-63):** a platform-decided outcome may count for the student's progress and institution aggregates, labeled "platform-decided", but never contributes reputation to the mentor, whatever a reviewer decides. The `counted_basis` column records the difference, and `earnsMentorReputation` in `packages/domain` encodes the rule.

### 2.8 Reputation (REP)

| ID | Requirement | Actor | Pri | Phase | Acceptance |
|---|---|---|---|---|---|
| FR-REP-01 | Reputation is derived from an append-only ledger of events written when outcomes count or are reversed | System | Must | 1 | **Given** counted outcomes, **When** the snapshot is recomputed from the ledger, **Then** it equals the stored snapshot (deterministic). **Status: DONE** — a replay from `reputation_events` reproduces `field_impact_snapshots` exactly, and the test fails if a stored total is perturbed (`services/api/test/reputation.integration.test.ts`). |
| FR-REP-02 | Mentor impact view: counts of counted outcomes by field and difficulty, response reliability, and a confidence tier. Only counted outcomes appear | All | Must | 1 | **Given** a mentor with Pending outcomes, **When** their impact view renders, **Then** the Pending outcomes are absent (**amended: counts plus response reliability**, D-67, DEBT-24). **Status: PARTIAL** — counts by field and outcome type, plus `requests_decided_in_time` and `requests_late_or_expired` on the own read, and Pending outcomes never appear; gap: the confidence tier is Phase 1b and its weights are 1.0 placeholders. |
| FR-REP-03 | Reputation computation applies difficulty weight, evidence-tier multiplier, contribution multiplier, and a **pair factor** `1 / (1 + n)` where `n` is the number of earlier counted outcomes between the same mentor and the same student (configurable) | System | Must | 1 | **Given** repeated outcomes from the same pair, **Then** each contributes less than the first; two outcomes can never outrank twenty after shrinkage. Values come from one configuration file, labeled **Status: PARTIAL** — the shrinkage formula and the pair factor are implemented and tested (`packages/domain/test/reputation.test.ts`); gap: every weight ships as a 1.0 placeholder pending pilot data, so the points are uncalibrated and exposed nowhere (D-67). |
| FR-REP-04 | Response reliability is computed from request timestamps. Timely declines are not penalized. The **response-time KPI is the share of requests decided within 48 hours** | System | Must | 1 | **Given** a mentor who declines within 48 hours, **Then** reliability is not reduced. **Given** a request that expires undecided, **Then** it counts as a non-response in the KPI and lowers reliability. **Status: DONE** — `responseReliability` in `packages/domain` with the API aggregate asserted against it, derived from the pair and sending no percentage or rate (D-114 to D-116). |
| FR-REP-05 | No likes, stars, or follower counts anywhere; scores are never shown or combined across fields | System | Must | 1 | **Given** any API response or screen, **Then** no cross-field aggregate or like-style field exists. A schema test fails the build if one is added. **Status: DONE** — a contract and schema scan for the twelve forbidden key families fails `pnpm test` and with it the build (`packages/contracts/test/openapi.test.ts`). |
| FR-REP-06 | Recalibration tool: replay under a chosen configuration version, producing a diff and, only on explicit approval, compensating events | Platform Admin | Should | 1 | **Given** a new configuration version, **When** a replay runs, **Then** nothing changes until an admin approves; approved changes are new events. |
| FR-REP-07 | A numeric 0 to 100 score is internal-only until sample thresholds are met; users see counts and the confidence tier | System | Must | 1 | **Given** a mentor below thresholds, **Then** no number is exposed through the API to non-admin roles. **Status: DONE** — no endpoint returns `score`, `points`, `tier` or `ranking`, and `points_total` never leaves the server (DEBT-24). |

### 2.9 Private session feedback (FBK)

| ID | Requirement | Actor | Pri | Phase | Acceptance |
|---|---|---|---|---|---|
| FR-FBK-01 | Private feedback after a Held session with **simultaneous reveal**: neither side sees the other's feedback until both submit or a timer ends. Used for quality operations and matching diagnostics, **never as public stars** | Student, Mentor | Could | 1b | **Given** one party submits, **Then** the other cannot see it; **When** both submit or the timer ends, **Then** the reveal happens once. Feedback never enters reputation or public views. |

**Open question (FBK-Q1):** after reveal, is feedback text visible to the counterpart or to the platform only? The research report's acceptance wording implies the counterpart sees it; platform-only is lower risk of friction. **Recommendation:** platform-only until pilot feedback shows value in sharing.

### 2.10 Institutions (INST)

| ID | Requirement | Actor | Pri | Phase | Acceptance |
|---|---|---|---|---|---|
| FR-INST-01 | Institution onboarding by a Platform Admin: name, kind, registered email domains, MoU date, Institution Admin users | Platform Admin | Must | 1 | **Given** a signed MoU, **When** the admin creates the institution, **Then** its admins can sign in and see only their institution (**amended: creation and admin assignment are two audited calls**, D-109). **Status: PARTIAL** — `POST /v1/institutions` stores name, kind, registered domains and MoU date in one audited transaction (`409 INSTITUTION_DOMAIN_TAKEN` on a duplicate), `GET /v1/institutions` lists them, and `/admin/institutions` assigns admins through `POST /v1/admin/institutions/{id}/admins`; gap: status transitions, editing, domain verification and pagination are out of scope (DEBT-51). |
| FR-INST-02 | Dashboard of aggregates: verified alumni and mentor participation, requests, match acceptance, first-response time, outcome reporting and confirmation rates, counted outcomes by domain. Funnel detail is **Phase 1b** | Institution Admin | Should | 1 (basic), 1b (funnel) | **Given** fewer than the minimum cohort size (**5**, owner decision) in a slice, **Then** that slice is suppressed. |
| FR-INST-03 | CSV export of the dashboard aggregates (PDF in Phase 2) | Institution Admin | Should | 1 (CSV), 2 (PDF) | **Given** an export, **Then** small-cohort suppression applies and an audit entry records who exported what. |
| FR-INST-04 | Student-level data is visible to an Institution Admin only with the student's explicit, revocable consent and a stated purpose | Student, Institution Admin | Could | 1b | **Given** no consent, **Then** the admin sees aggregates only; **When** consent is withdrawn, **Then** access ends immediately. |

### 2.11 Platform administration, trust, and safety (ADM)

Platform Admin owns outcome audits and disputes; the Institution Admin only attests affiliation. This avoids the conflict where the buyer of "evidence" is also its judge.

| ID | Requirement | Actor | Pri | Phase | Acceptance |
|---|---|---|---|---|---|
| FR-ADM-01 | Review queue for disputes, escalations, conflict-of-interest flags, and audits, with assignment, due dates, resolution, and reason | Platform Admin | Must | 1 | **Given** a case, **When** a reviewer resolves it as "outcome valid" or "outcome not valid" with a reason, **Then** the outcome moves to Counted (valid) or Rejected (not valid) and all parties are notified. **Status: DONE** — the queue read, `POST /v1/outcomes/{id}/review` with a written reason, one audit row, one queued email, the participant-visible decision and the T11 clawback; assignment and SLAs are excluded (D-76). |
| FR-ADM-02 | One appeal, decided by a different reviewer, within stated time limits | Student, Mentor, Platform Admin | Could | **Later** | **Deferred (owner decision)** until after a successful pilot. In the MVP a Platform Admin decides each case once, with a written reason. |
| FR-ADM-03 | Audit sampling: random sampling of confirmed outcomes, plus all high-difficulty outcomes, plus anomaly-triggered cases. Sampling rate is configuration (**Open**; start high in the pilot because volume is small) | System | Must | 1 | **Given** a confirmed outcome, **When** it is selected, **Then** it is held from counting until the audit result is recorded. **Status: NOT STARTED** — nothing selects a confirmed outcome for audit or holds it from counting. DEBT-55 records why the hold cannot exist yet: `CONFIRMED` to `IN_PLATFORM_REVIEW` (T6) is unreachable in the transition function, so an audit hold has no state to occupy. |
| FR-ADM-04 | Abuse reporting by any user and a moderation queue | All, Platform Admin | Must | 1 | **Given** a report on a user, message, profile, or outcome, **Then** it reaches a reviewer with a visible status. **Status: DONE** — all four target kinds (`USER`, `MESSAGE`, `PROFILE`, `OUTCOME`), `GET /v1/reports` as a keyset queue, `POST /v1/reports/{id}/resolve` with a reason, one audit row and one email (`409 REPORT_ALREADY_RESOLVED` on a repeat); assignment, SLAs and appeals are excluded (DEBT-28). |
| FR-ADM-05 | Account sanctions: warn, suspend, lift, with reason and end date | Platform Admin | Must | 1 | **Given** a sanction, **Then** it takes effect immediately, is audited, and notifies the user with the reason (**amended: warn, suspend and lift; removal is out of the MVP**, D-142). **Status: DONE** — `POST /v1/admin/accounts/{id}/suspend` (D-88); `/warn` appends one `ACCOUNT_WARNED` entry and one notice and changes no status (D-139); `/reinstate` lifts any suspension with a reason in one transaction (D-140); a fifteen-minute job lifts a suspension whose end date has passed and never one without an end date (D-141). A suspension also reaches discovery: the mentor leaves the directory, the suggestions, the mentor context read and the public impact read, and a new request is refused as `MENTOR_UNAVAILABLE`, all derived from `users.status` so both lifts restore the listing with no profile write (D-147, D-148). |
| FR-ADM-06 | Break-glass access to a mentorship thread or evidence file | Platform Admin | Must | 1 | See FR-THR-03. Every access is logged with reason; no shared admin accounts. **Status: DONE** — the thread read is the audited route FR-THR-03 describes, with one platform admin per access, a recorded reason and no shared account (FR-THR-03, `services/api/src/admin-thread/`). An evidence file has no route because upload is not built (DEBT-22), so the evidence-file half is post-pilot and this row reaches Done for the pilot scope by amendment, not by built work (D-156); the disclosure gap stays its own line (D-123, DEBT-52). |
| FR-ADM-07 | Configuration management: weights, thresholds, timings, and limits are versioned, changed only by Platform Admin, and audited | Platform Admin | Must | 1 | **Given** a configuration change, **Then** a new immutable version is created and every ledger event records the version it used. **Status: NOT STARTED** — there is no configuration version table: weights, thresholds, timings and limits are constants in the code, so a ledger event cannot record a version it used. |
| FR-ADM-08 | Field taxonomy and institution settings management. Fields are user-created in the MVP; this admin merge/rename tool is **Phase 1b** | Platform Admin | Should | 1b | **Given** two duplicate fields, **When** an admin merges them, **Then** profiles and reputation keep one `field_id`; retiring a field never deletes history. |
| FR-ADM-09 | Operations view: queue ages, overdue reviews, job backlog, email failures (**Phase 1b**) | Platform Admin | Should | 1b | **Given** an overdue review, **Then** it is highlighted. |

### 2.12 Notifications (NOT)

| ID | Requirement | Actor | Pri | Phase | Acceptance |
|---|---|---|---|---|---|
| FR-NOT-01 | Transactional email for every state change that needs attention (request received, decision, message, outcome reported, confirmation reminder, review result) | System | Must | 1 | **Given** a triggering event, **Then** exactly one email is queued with a de-duplication key; provider outages queue retries. **Status: DONE** — 18 named templates in `services/api/src/email/email-sender.ts`, one dedupe key per fact, and a retry that stops at the budget before marking the row failed. |
| FR-NOT-02 | In-app notification list | All | Should | 1 | **Given** a notification, **Then** it appears in the list with read state. |
| FR-NOT-03 | Notification preferences; legally or safety-relevant notices cannot be turned off | All | Should | 1 | **Given** a user opts out of reminders, **Then** security and dispute notices still send. |
| FR-NOT-04 | Bounce and complaint handling suppresses further email to the address and surfaces it to the user | System | Should | 1 | **Given** a hard bounce, **Then** future sends are suppressed and the user sees a prompt to fix the address. |

### 2.13 Consent, privacy, and audit (CONS, PRIV, AUD)

| ID | Requirement | Actor | Pri | Phase | Acceptance |
|---|---|---|---|---|---|
| FR-CONS-01 | Consent capture for terms, privacy notice, volunteer agreement, community guidelines, and institution data sharing, stored as append-only records with document versions. Values follow `data-model.md` (`TERMS`, `PRIVACY_NOTICE`, `VOLUNTEER_AGREEMENT`, `COMMUNITY_GUIDELINES`, `INSTITUTION_DATA_SHARING`) | All | Must | 1 | **Given** a user accepts, **Then** a record with purpose and version is appended; a new document version prompts re-acceptance. **Status: DONE** — `GET` and `POST /v1/me/consents` record all five purposes with the published `CONSENT_DOCUMENT_VERSION` and one audit row each, and the read reports the published version beside the accepted one so the banner can show (D-129). |
| FR-CONS-02 | Separate, revocable consent for sharing student-level data with institutions (and with employers in Phase 3) | Student | Must | 1 | **Given** a withdrawal, **Then** a withdrawal record is appended and sharing stops. History is never edited. **Status: DONE** — `POST /v1/me/consents` with `INSTITUTION_DATA_SHARING` requires an affiliated institution, appends one `WITHDRAWN` row and touches no affiliation row. |
| FR-PRIV-01 | Data export request for a user's own data, with a short-lived download link | All | Must | 1 | **Given** a request, **Then** it is tracked and the export is produced as one synchronous JSON document (**amended: no signed URL and no object storage**, D-84). **Status: PARTIAL** — `POST /v1/privacy/export` builds the versioned `PRIVACY_EXPORT_VERSION` document with `Cache-Control: no-store`; gap: there is no expiring download link by decision (DEBT-39) and the retention period is still Open pending counsel. | **Built by `privacy-export-and-erasure` (archived 2026-11-10), narrowed:** `POST /v1/privacy/export` returns one synchronous JSON document of the caller's own rows from a fixed allowlist, with `Cache-Control: no-store` and an attachment disposition, and records one `privacy_requests` row (D-84). The short-lived signed URL, object storage, and a background job are not built (DEBT-39), so the download-link clause is narrowed rather than met. |
| FR-PRIV-02 | Account deletion: identifiers are removed or pseudonymized, evidence files deleted, and ledger structure kept with pseudonymous references so counted outcomes stay auditable | All | Must | 1 | **Given** a deletion request, **Then** personal fields are erased, evidence files purged, and the ledger remains consistent. The design needs counsel review against the erasure right and its exceptions [S1]. **Status: DONE** — `deleteAccount` in `services/api/src/privacy/drizzle-privacy.service.ts` hashes the email and deletes sessions, second factors and availability windows in one transaction while the ledger keeps its history; counsel review of the erasure exceptions is still outstanding. | **Built by `privacy-export-and-erasure` (archived 2026-11-10):** one transaction tombstones the account (status `ANONYMIZED`, keyed email hash, `Deleted user`, empty profile text, mentor profile `REMOVED`, the caller's own message bodies replaced with a tombstone string, every session and second-factor row deleted, one `ACCOUNT_DELETED` audit entry and one `privacy_requests` row) and never touches an outcome, ledger, verification, reputation, or audit row; a test snapshots the ledger before and after and asserts every row is byte-identical (D-85). Evidence-file purging is vacuous until an evidence file exists (DEBT-22). |
| FR-PRIV-03 | Automated retention: evidence files deleted a set time after an outcome counts or is rejected (**Proposed default**: 90 days); other retention per `data-privacy-and-retention.md` | System | Must | 1 | **Given** the retention date passes, **Then** the file is deleted and only its hash and metadata remain. **Status: NOT STARTED** — no retention sweeper exists and no evidence file exists to sweep (DEBT-22). |
| FR-AUD-01 | Audit log of verification, disputes, admin actions, break-glass access, configuration changes, and data exports | System | Must | 1 | **Given** any listed action, **Then** an immutable, searchable entry is written in the same transaction. **Status: DONE** — every documented action that has a code path appends one row: the authentication, affiliation, verification, consent, privacy, report and institution routes through `appendAuditEntry` in their own transaction, the data export through `DATA_EXPORTED` inside the export transaction (D-151), and a refusal on an admin route through `PERMISSION_DENIED` from the exception filter (D-152). `GET /v1/admin/audit` reads it with six filters and a keyset cursor and accepts every action a writer emits (D-153). The documented actions with no code path are marked not applicable in `docs/auth-and-access-control.md` section 12. |
| FR-AUD-02 | Tamper evidence for the audit log (hash chain) | System | Could | 1b | **Given** the log, **Then** a verifier detects any altered or removed entry. |

### 2.14 AI assistance (AI) — **Deferred (owner decision)**

AI features and AI models are **Later**, after a successful pilot. FR-AI-01 to FR-AI-04 are removed from Phase 1 and Phase 1b; they are kept here as a design note only and must not be required by any MVP or pilot-readiness criterion.

AI **assists humans; humans attest.** AI never confirms an outcome, writes an outcome claim, scores reputation, decides a match, or ranks candidates.

| ID | Requirement | Actor | Pri | Phase | Acceptance |
|---|---|---|---|---|---|
| FR-AI-01 | Request-drafting assistant: turns a vague need into a structured request draft | Student | Could | Later | **Given** a vague need, **Then** a labeled draft is offered that the student must edit and submit; it is never auto-sent. |
| FR-AI-02 | Mentor briefing summary of an incoming request | Mentor | Could | Later | **Given** a request, **Then** a labeled summary is shown beside the original text, which always remains visible. |
| FR-AI-03 | AI-phrased "why this match" text based only on the rule factors (the template-based reason in FR-DISC-02 ships first) | Student | Could | Later | **Given** a suggestion, **Then** wording changes but the factors and the order do not. |
| FR-AI-04 | AI controls: label all AI output, redact personal identifiers before external calls, treat user text as untrusted input, log every call, enforce cost caps, provide a kill switch | System | Could | Later | **Given** a model outage or the kill switch, **Then** assist features disappear without blocking core flows. |

### 2.15 Client experience (UX)

| ID | Requirement | Actor | Pri | Phase | Acceptance |
|---|---|---|---|---|---|
| FR-UX-01 | Installable, mobile-first PWA with responsive layouts for student, mentor, institution, and admin routes | All | Must | 1 | **Given** a supported mobile browser, **Then** the app can be installed and all Phase 1 flows are usable at a narrow viewport. **Status: PARTIAL** — the manifest, the three icons, the installation metadata and their test are in place (`apps/web/test/manifest.test.ts`); gap: no install on a real device and no narrow-viewport sweep (DEBT-38). |
| FR-UX-02 | Resilient forms: autosave drafts locally, retry failed writes safely, and show clear offline and error states | All | Must | 1 | **Given** a failed write, **Then** the user's input is preserved and a retry does not duplicate data. **Status: PARTIAL** — the request form keeps its input on the device and a retry cannot duplicate the request; gap: there is no offline state and no other form keeps a draft (DEBT-37). |
| FR-UX-03 | Every UI string is externalized. The UI is **English only** (**Owner decision**); this requirement avoids hard-coded text but adds no languages | All | Should | 1 | **Given** a lint rule, **Then** no user-facing string is hard-coded in components. |
| FR-UX-04 | Accessibility: all Phase 1 flows meet WCAG 2.1 AA (see NFR-ACC-01) | All | Must | 1 | **Given** an automated and a manual keyboard and screen-reader check, **Then** no AA failures remain on core flows. **Status: PARTIAL** — semantic roles, labelled controls and one alert line per surface are asserted in the web tests; gap: no automated AA run and no manual screen-reader pass has been recorded. |
| FR-UX-05 | Designed empty, loading, and error states for every list and form | All | Must | 1 | **Given** each state, **Then** a screen exists and is tested. **Status: DONE** — ten surfaces carry loading, alert and empty states through one pure module (`apps/web/lib/page-state.ts`), and `apps/web/test/page-states-wiring.test.ts` fails if any listed page loses its handling. |
| FR-UX-06 | Role-aware onboarding checklist that guides a new Student or Mentor to their first request or first activation | Student, Mentor | Should | 1 | **Given** a new user, **Then** the checklist shows only steps they can complete. |

### 2.16 Must score (2026-11-14)

Every Must row above ends in one `**Status:**` marker. This section counts them, so the number quoted at a gate is a sum a reader can check rather than a memory.

Convention: **DONE** 1.0, **PARTIAL** 0.5, **NOT STARTED** 0.0, over the 64 Must rows. The **code-only** figure additionally scores at 0.0 any row that reached Done only through an amendment to this register rather than through code — today that is three rows: `FR-ADM-05` (amended to warn/suspend/lift by D-142), and `FR-OUT-07` and `FR-ADM-06` (amended to the pilot's Tier 0 and no-evidence-file scope by D-156). A reader can recompute both figures from the table below: the register total is the sum of the Points column, and the code-only total subtracts those three rows from it.

| Area | Must rows | DONE | PARTIAL | NOT STARTED | Points |
|---|---|---|---|---|---|
| AUTH — Authentication and access | 10 | 9 | 1 | 0 | 9.5 / 10 |
| PROF — Profiles and onboarding | 5 | 5 | 0 | 0 | 5 / 5 |
| VER — Affiliation verification | 4 | 3 | 1 | 0 | 3.5 / 4 |
| DISC — Discovery and matching | 4 | 3 | 1 | 0 | 3.5 / 4 |
| REQ — Mentorship requests | 7 | 7 | 0 | 0 | 7 / 7 |
| THR — Threads | 3 | 2 | 1 | 0 | 2.5 / 3 |
| OUT — Outcomes and verification | 7 | 7 | 0 | 0 | 7 / 7 |
| REP — Reputation | 6 | 4 | 2 | 0 | 5 / 6 |
| INST — Institutions | 1 | 0 | 1 | 0 | 0.5 / 1 |
| ADM — Platform administration | 6 | 4 | 0 | 2 | 4 / 6 |
| NOT — Notifications | 1 | 1 | 0 | 0 | 1 / 1 |
| CONS — Consent | 2 | 2 | 0 | 0 | 2 / 2 |
| PRIV — Privacy | 3 | 1 | 1 | 1 | 1.5 / 3 |
| AUD — Audit | 1 | 1 | 0 | 0 | 1 / 1 |
| UX — Client experience | 4 | 1 | 3 | 0 | 2.5 / 4 |

**Register basis: 55.5 / 64 = 86.7%.** **Code-only basis: 52.5 / 64 = 82.0%.** The code-only figure is *lower* than the register's because the two rows this change amended (`FR-OUT-07`, `FR-ADM-06`) were each worth 0.5 of built work before the amendment and score 0.0 on the code-only basis after it; `FR-ADM-05` is the third exclusion. The register's rise of 1.5 points is one built row (`FR-PROF-02`) plus two amendments, not three rows of code.

What the remaining 14 rows need, in the order that buys the most:

- `FR-ADM-03` (Not started, 1.0): the audit hold has no state to occupy while `CONFIRMED` → `IN_PLATFORM_REVIEW` is unreachable (T6, DEBT-55). This is the only Not started row that is blocked by a design gap rather than by missing work.
- `FR-ADM-07` (Not started, 1.0): a configuration version table, then recording the version on every ledger event.
- `FR-PRIV-03` (Not started, 1.0): a retention sweeper. It has nothing to sweep until evidence files exist (DEBT-22).
- `FR-REP-03` and `FR-REP-02` (Partial, 1.0 together): both turn on calibrated weights and the confidence tier, which need pilot data (D-67, DEBT-24).
- `FR-UX-04` (Partial, 0.5): an automated AA run plus one recorded manual pass.
- `FR-UX-01`, `FR-UX-02` (Partial, 1.0 together): a device install, a narrow-viewport sweep and an offline state (DEBT-38, DEBT-37).
- The rest are narrower: `FR-AUTH-02` (live Google account, DEBT-15), `FR-VER-04` (revocation edges), `FR-DISC-02` (DEBT-41), `FR-THR-02` (read state), `FR-INST-01` (DEBT-51), `FR-PRIV-01` (counsel).

---

## 3. Role capability summary (Phase 1)

A quick reference. The full permission matrix lives in `auth-and-access-control.md` and is authoritative.

| Capability | Student | Mentor | Institution Admin | Platform Admin |
|---|---|---|---|---|
| Own profile and data | Yes | Yes | Yes | Yes |
| Browse mentors | Yes | Yes | Yes | Yes |
| Send a request | Yes | No | No | No |
| Decide on a request | No | Yes (own) | No | No |
| Read a thread | Participant | Participant | No | Break-glass, audited |
| Report an outcome | Yes (own) | No | No | No |
| Confirm or dispute an outcome | No | Yes (own, no declared conflict) | No | No |
| Approve mentor affiliation | No | No | Yes (own institution) | Yes |
| Resolve disputes and audits | No | No | **No** | Yes |
| View institution aggregates | No | No | Yes (own, suppression applied) | Yes |
| View student-level data | Own only | Own mentorships | Only with consent | Support or dispute only, audited |
| Change configuration | No | No | No | Yes, audited |

---

## 4. Excluded from Phase 1

None of the following may be built or required by a Phase 1 requirement.

| Excluded | Phase | Trigger to reconsider |
|---|---|---|
| Payments, paid office hours, billing | 3 | Entity decision (OD-5) and counsel review |
| Employer portal and analytics | 3 | Renewal signals; consent design |
| Structured community circles | 2 | Pilot demand |
| Group office hours | 2 | Pilot demand |
| Native mobile app (Flutter) | Later (decision in Phase 2) | Measured need: push reliability, store presence, institution request |
| In-house audio and video | 4 | Meeting-link friction or cost justifies it |
| Zoom API integration | Later | Licensing verified; mentors paste their own link in the MVP |
| WebSocket real-time messaging | Later | Presence or typing demand; multi-instance scaling |
| AI request drafting, mentor briefing, AI matching, embeddings | Later | Offline evaluation on real acceptance data; owner decision 29 Oct 2026 |
| Phone OTP and Microsoft sign-in | Never in the current plan | Owner decision 29 Oct 2026 |
| Facebook and LinkedIn sign-in | Later (after a successful pilot) | Owner decision 29 Oct 2026 |
| Appeals and a second reviewer | Later | Owner decision; MVP decides each case once |
| SAML and SCIM institutional SSO | 3 | First institution that requires it |
| Anomaly triage tooling (device and network signals) | 2 | Enough volume; privacy notice updated |
| Verifiable credential export of confirmed outcomes | 3 | Institution or employer demand |
| Public star ratings, likes, followers, leaderboards | Never | Contradicts README principles |
| Collection of government ID numbers | Never | Collect less (research report 5.7) |
| Under-18 users | After parental-consent design | Counsel scoping |

---

## 5. Acceptance checklist for this document

- [ ] Every requirement has a testable Given / When / Then.
- [ ] Every Phase 1 requirement traces to a lifecycle step or a cross-cutting concern (section 1).
- [ ] No Phase 1 requirement depends on an excluded item in section 4.
- [ ] Role permissions here agree with `auth-and-access-control.md`.
- [ ] Every status referenced exists as an enum in [data-model.md](data-model.md).
- [ ] No requirement presents a Proposed default as validated.
- [ ] Open items (FBK-Q1, revocation effects, mentorship end window, sampling rate, the cooling-period value) are tracked in `assumptions-and-open-questions.md`.

## 6. Questions for the owner

1. **Platform-decided outcomes:** decided by D-63 - no mentor reputation, labeled "platform-decided".
2. **FBK-Q1:** should private feedback be visible to the counterpart after the reveal, or to the platform only?
3. **Staffing (N7):** a named part-time trust-and-safety reviewer is **Deferred (owner decision)**; the owner covers disputes in the MVP. When do you want to revisit it?
4. **Mentorship end window:** for how long after a mentorship ends may a student still report an outcome? (Outcomes such as admissions can arrive months later.)
5. **Group office hours:** README lists them as an interaction type; do you accept excluding them from Phase 1?
