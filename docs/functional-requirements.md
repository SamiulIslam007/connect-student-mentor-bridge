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
| FR-AUTH-01 | Email and password sign-up and sign-in with email verification | All | Must | 1 | **Given** a new user submits a valid email and password, **When** they open the verification link, **Then** the account is verified. An unverified user cannot send requests, apply as a mentor, or report outcomes. |
| FR-AUTH-02 | Google sign-in. Facebook and LinkedIn sign-in are **Later**; Microsoft sign-in is not supported (owner decision) | All | Must | 1 | **Given** a user with a Google account, **When** they choose Google sign-in, **Then** the account is created or linked by verified email and the 18+ gate (FR-AUTH-03) still applies. |
| FR-AUTH-03 | 18+ gate at sign-up; under-18 sign-ups are blocked. The date of birth is used once for the check and is **not stored** | Student, Mentor | Must | 1 | **Given** a user enters a date of birth under 18, **When** they submit, **Then** sign-up is blocked with a clear message, no profile is created, and only a hashed block entry is kept to prevent immediate re-registration. On success the record stores `age_18_plus` and `age_gate_passed_at`; the date of birth itself is never persisted. |
| FR-AUTH-04 | MFA (TOTP) is required for Mentors, Institution Admins, and Platform Admins | Mentor, Institution Admin, Platform Admin | Must | 1 | **Given** a user is granted one of these roles, **When** they sign in without an enrolled second factor, **Then** they must enroll before any role-specific action. A Platform Admin request without MFA is rejected. |
| FR-AUTH-05 | Password reset, view active sessions, sign out of all sessions | All | Must | 1 | **Given** a signed-in user, **When** they choose "sign out everywhere", **Then** all refresh tokens are revoked and other sessions fail on their next request. |
| FR-AUTH-06 | One user can hold both a Student profile and a Mentor profile | All | Must | 1 | **Given** a user holds both profiles, **When** they use the app, **Then** they can switch context. **And** a user can never be both parties of the same mentorship (no self-mentoring). |
| FR-AUTH-07 | Role-based and object-level authorization on every endpoint | System | Must | 1 | **Given** any endpoint, **When** an actor without permission for that object calls it, **Then** it returns a problem-details error and writes no data. Verified by a permission-matrix test generated from `auth-and-access-control.md`. |

### 2.2 Profiles and onboarding (PROF)

| ID | Requirement | Actor | Pri | Phase | Acceptance |
|---|---|---|---|---|---|
| FR-PROF-01 | Student profile: display name, goals, primary field and interest fields, mentoring languages, availability windows, optional institution affiliation with program, department, and batch year | Student | Must | 1 | **Given** valid input, **When** the student saves, **Then** the profile persists and feeds suggestions. Names in Unicode (including Bangla script) are accepted and displayed correctly. |
| FR-PROF-02 | Mentor profile: headline, bio, expertise, scope ("what I can and cannot help with"), fields, languages, availability windows, **weekly capacity cap**, and access mode (Open, Application-only, Paused) | Mentor | Must | 1 | **Given** a mentor sets a capacity cap, **When** it is saved, **Then** it is within the configured bounds and is enforced by FR-REQ-06. A Paused mentor is hidden from discovery. |
| FR-PROF-03 | Mentor application and onboarding: accept the volunteer agreement, conflict-of-interest policy, and community guidelines; complete a short orientation | Mentor | Must | 1 | **Given** a mentor applicant, **When** they have Level 1 affiliation (FR-VER-04), MFA (FR-AUTH-04), and all agreements consented (FR-CONS-01), **Then** their status becomes Active. Otherwise they stay Pending. |
| FR-PROF-04 | Profile visibility rules: a Mentor's public profile is visible to signed-in users; a Student profile is visible only to a mentor who received a request from that student; Institution Admins see aggregates only unless the student has consented | All | Must | 1 | **Given** each role, **When** it requests another user's profile, **Then** visibility follows the matrix; a test covers every role pair. |
| FR-PROF-05 | Profile edit and rectification. Changing a mentor's affiliation fields re-triggers affiliation verification | Student, Mentor | Must | 1 | **Given** a mentor edits their affiliation, **When** they save, **Then** Level 1 is suspended until re-verified and new requests are blocked until then. |

### 2.3 Affiliation verification (VER)

"Verified badge" means affiliation verification only. It never implies that outcomes were independently audited.

| ID | Requirement | Actor | Pri | Phase | Acceptance |
|---|---|---|---|---|---|
| FR-VER-01 | Affiliation claim with automatic institutional-email-domain check (Level 1) where the institution has registered email domains | Mentor, Student | Must | 1 | **Given** a user verifies an email whose domain is registered for an institution, **When** the claim is submitted, **Then** Level 1 affiliation is granted automatically with method "institutional email". |
| FR-VER-02 | Institution Admin attestation queue for claims without a domain match | Institution Admin | Must | 1 | **Given** a pending claim for their institution, **When** the admin approves or rejects with a reason, **Then** the decision is recorded and audited. An admin cannot act on another institution's claims. |
| FR-VER-03 | Level 2 employer-email check for industry mentors | Mentor | Should | 1 | **Given** an industry mentor verifies an employer email, **When** the check passes, **Then** Level 2 is recorded. **No government ID, passport, tax ID, or NID is ever requested.** |
| FR-VER-04 | Gate: a mentor below Level 1 cannot appear in discovery, receive requests, or earn reputation events | System | Must | 1 | **Given** a mentor with Level 0, **When** a student searches or requests, **Then** the mentor is absent or unrequestable. **When** Level 1 is revoked, **Then** pending requests expire with notice and no new requests arrive; existing outcomes are not altered unless platform review decides (Open: revocation effects). |
| FR-VER-05 | Verified-badge disclaimer is shown wherever a badge or impact summary appears | System | Must | 1 | **Given** a mentor profile with a badge, **When** it renders, **Then** the disclaimer states that a mentor countersigned and, where stated, that evidence or a third party supported it, and that not every outcome was independently audited. |

### 2.4 Discovery and matching (DISC)

| ID | Requirement | Actor | Pri | Phase | Acceptance |
|---|---|---|---|---|---|
| FR-DISC-01 | Mentor discovery list limited to Active mentors, with filters (field, language, access state, availability) and cursor pagination | Student | Must | 1 | **Given** filters, **When** the student searches, **Then** only Active, non-Paused mentors matching all filters are returned; an empty result shows a helpful empty state. |
| FR-DISC-02 | Rule-based suggestions per `matching-algorithm-spec.md`, each with a plain-language reason built from the rule factors | Student | Must | 1 | **Given** a student profile, **When** suggestions are requested, **Then** results are sorted by Match Score with normalized weights, ties, zero weights, and all-zero weights handled safely, and each result shows its reason. The score is never presented as a prediction of success. |
| FR-DISC-03 | Access states are shown: **Available**, **Full**, **Application-only** | Student | Must | 1 | **Given** a Full mentor, **When** the student views them, **Then** the request action is disabled with an explanation. An Application-only mentor requires a short application note. |
| FR-DISC-04 | Log suggestions shown, chosen, and accepted, with the configuration version used | System | Should | 1 | **Given** a suggestion list is shown, **When** a student requests a mentor, **Then** the log links the suggestion to the resulting request for evaluation of acceptance rate. |
| FR-DISC-05 | Concierge assist: a Platform Admin can propose a mentor to a student | Platform Admin | Should | 1 | **Given** a student and a mentor, **When** the admin proposes, **Then** the student sees a suggestion with a note. It does **not** create a request on the student's behalf. |
| FR-DISC-06 | No pay-to-rank and no sensitive attributes in matching | System | Must | 1 | **Given** the match function, **Then** its inputs exclude payment state, religion, ethnicity, and other sensitive attributes. A unit test fixes the input list. |

### 2.5 Mentorship requests (REQ)

| ID | Requirement | Actor | Pri | Phase | Acceptance |
|---|---|---|---|---|---|
| FR-REQ-01 | Structured request: **specific question, context summary, target outcome, expected timeframe**, plus interaction type (async thread or one-to-one session; group office hours is Later) | Student | Must | 1 | **Given** a missing required field or an over-length field, **When** the student submits, **Then** the request is rejected with field-level errors; valid input creates a Pending request and emails the mentor. |
| FR-REQ-02 | Draft autosave and safe retry | Student | Must | 1 | **Given** connectivity drops mid-form, **When** it returns, **Then** the draft is restored and submitting twice creates exactly one request (idempotency key). |
| FR-REQ-03 | Mentor decision: **accept** or **decline** (optionally recommending alternative mentors). Redirect is a separate Phase 1b requirement (FR-REQ-04) | Mentor | Must | 1 | **Given** a Pending request, **When** the mentor decides, **Then** the decision and timestamp are recorded, the student is emailed, and the request leaves Pending exactly once. |
| FR-REQ-04 | A redirect requires the student's one-tap approval before their request content is shared with the proposed mentor; redirect chain length is limited (**Proposed default**: 2). **Phase 1b** (not required for the MVP) | Student, Mentor | Should | 1b | **Given** a redirect, **When** the student approves, **Then** a new Pending request is created for the proposed mentor linked to the original. If the student ignores it, nothing is shared. |
| FR-REQ-05 | Expiry and reminders: undecided requests get a reminder at **24 hours** and expire at **48 hours** (owner decision). Expiry counts as a non-response and lowers response reliability; declining within 48 hours is **not** penalized | System | Must | 1 | **Given** an undecided request, **When** the configured times pass, **Then** the reminder is sent once and the request expires; the student sees next suggestions. Jobs are idempotent. |
| FR-REQ-06 | Capacity enforcement. A mentor's slots in use = requests accepted in the current week plus Pending requests (**Proposed definition**); the cap cannot be exceeded | System | Must | 1 | **Given** slots in use equal the cap, **When** a student submits or a mentor accepts, **Then** the action is refused and the mentor shows as Full. Concurrent submissions cannot overshoot the cap (race-safe). |
| FR-REQ-07 | Abuse limits: at most one Pending request per student and mentor pair; a cap on concurrent Pending requests per student (**Proposed default**: 3) | System | Must | 1 | **Given** the limit is reached, **When** the student submits, **Then** the request is refused with an explanation. |
| FR-REQ-08 | A student can withdraw a Pending request (`POST /v1/requests/{id}/withdraw`) | Student | Must | 1 | **Given** a Pending request, **When** withdrawn, **Then** it becomes Withdrawn and the mentor's slot is freed. |
| FR-REQ-09 | First-request nudge: a student with no request 48 hours after onboarding gets one email nudge (README **Proposed onboarding rule**; not a response-time guarantee) | System | Could | 1b | **Given** a student without a request, **When** 48 hours pass since onboarding, **Then** exactly one nudge is sent. |

### 2.6 Mentorship, threads, and sessions (MEN, THR, SES)

| ID | Requirement | Actor | Pri | Phase | Acceptance |
|---|---|---|---|---|---|
| FR-MEN-01 | On acceptance, a **Mentorship** is created with a lightweight agreement (cadence, duration, goal) that both parties acknowledge | Student, Mentor | Should | 1 | **Given** an accepted request, **When** both parties acknowledge the agreement, **Then** it is recorded. Rationale: structure (frequency, duration) is associated with better mentoring results [S9]. |
| FR-MEN-02 | Either party can mark a mentorship complete or ended early | Student, Mentor | Should | 1 | **Given** an Active mentorship, **When** a party ends it, **Then** the status changes, the other party is notified, and reporting an outcome remains possible for a defined window (Open: window length). |
| FR-THR-01 | Async text-only thread inside a mentorship | Student, Mentor | Must | 1 | **Given** two participants, **When** one posts a message within the length limit, **Then** it persists and appears for the other after refetch. No attachments in Phase 1. |
| FR-THR-02 | Email notification on new message and per-user read state | Student, Mentor | Must | 1 | **Given** a new message, **When** the recipient has not read it, **Then** one email is sent, batched so rapid messages do not each trigger an email. |
| FR-THR-03 | Thread access is limited to participants; a Platform Admin can read only through audited break-glass access with a stated reason | Platform Admin | Must | 1 | **Given** a non-participant, **When** they request a thread, **Then** access is denied. **Given** a break-glass read, **Then** an audit entry with reason is written before content is returned. |
| FR-SES-01 | Session record with a mentor-provided meeting link (any provider), date and time | Student, Mentor | Should | 1 | **Given** a mentor adds an https meeting link and time, **When** saved, **Then** both participants see it. Non-https links are rejected. No video SDK, no recording, no transcription. |
| FR-SES-02 | Both parties confirm a session was held | Student, Mentor | Should | 1 | **Given** a past session, **When** both confirm, **Then** it appears as Held in history. |
| FR-SES-03 | Session reminder email | System | Could | 1b | **Given** an upcoming session, **When** the lead time passes, **Then** one reminder is sent per participant. |

### 2.7 Outcomes and verification (OUT)

States and transitions are defined in [data-model.md](data-model.md#44-outcome-state-machine) and the policy document. **Unconfirmed outcomes never contribute to reputation.**

| ID | Requirement | Actor | Pri | Phase | Acceptance |
|---|---|---|---|---|---|
| FR-OUT-01 | Report an outcome: type (Admission, Internship, Job offer, Skill milestone, Interview), description, date it happened, and the student's stated **contribution level** | Student | Must | 1 | **Given** a student with an Active or recently ended mentorship, **When** they report, **Then** a Pending Confirmation outcome is created and the mentor is notified. A student cannot report on a mentorship they are not part of. |
| FR-OUT-02 | Optional evidence: a file (PDF, PNG, or JPEG within the size limit) or a link, stored privately, with a SHA-256 hash recorded | Student | Should | 1 | **Given** a valid file, **When** uploaded, **Then** it is quarantined, scanned for malware, then made available through short-lived signed URLs. A file that fails the scan is never available. |
| FR-OUT-03 | Mentor actions on a pending outcome: **confirm**, **amend contribution**, or **dispute**. The outcome fact and the contribution level are confirmed **separately** | Mentor | Must | 1 | **Given** a Pending outcome on their mentorship, **When** the mentor confirms, **Then** a verification record captures the decision and contribution level; **When** they dispute, **Then** the outcome goes to platform review. |
| FR-OUT-04 | Conflict-of-interest declaration at confirmation: relative, direct report, or paying relationship (draft rule N9) | Mentor | Must | 1 | **Given** a mentor declares a conflict, **When** they submit, **Then** the outcome goes to platform review instead of counting. |
| FR-OUT-05 | Reminders on day 3 and day 5, and escalation on day 7 after reporting (**Proposed defaults**) | System | Should | 1 | **Given** a Pending outcome with no mentor response, **When** day 3, 5, and 7 pass, **Then** each reminder or escalation happens exactly once, even if the job runs twice. |
| FR-OUT-06 | The state machine is enforced; no path counts an unconfirmed outcome | System | Must | 1 | **Given** any outcome, **When** any actor or job attempts an invalid transition, **Then** it is rejected. A property test asserts that no event sequence reaches Counted without mentor confirmation or a platform decision. |
| FR-OUT-07 | Evidence tier is computed from attached evidence and third-party confirmation, and is shown on the outcome | System | Must | 1 | **Given** an outcome, **Then** tier = 0, 1, or 2 per policy. Admission, Internship, and Job offer need at least Tier 1 to count fully; Skill milestone and Interview may count at Tier 0 with lower weight (**Proposed**, policy document governs). |
| FR-OUT-08 | Third-party confirmation (Tier 2): a one-time email link sent to the employer, program, or institution | System | Could | 1b | **Given** a student supplies a confirmer email, **When** the confirmer opens the link, **Then** their confirmation is recorded and the tier rises. Whether Tier 2 is required for Admission is an **Open decision**. |
| FR-OUT-09 | Cooling period and counting: a confirmed outcome counts only after a delay (**Proposed default**: 14 days) and only if no dispute or audit hold exists | System | Must | 1 | **Given** a confirmed outcome, **When** the cooling period elapses with no hold, **Then** it becomes Counted and a reputation event is written once. |
| FR-OUT-10 | Clawback: a Platform Admin can reverse a counted outcome with a reason; the effect is a compensating reputation event, never a deletion | Platform Admin | Must | 1 | **Given** a counted outcome later disproved, **When** reversed, **Then** a compensating event is appended and the original event remains visible in the ledger. |
| FR-OUT-11 | A student can withdraw an outcome while it is Pending or in review | Student | Should | 1 | **Given** a Pending outcome, **When** withdrawn, **Then** it becomes Withdrawn and never counts. |

**Open question (OUT-Q1):** the README state machine lets platform review count an outcome that the mentor never confirmed (non-response after day 7). The principle "unconfirmed means uncounted" and the draft rule that mentors should not gain reputation from outcomes they never confirmed are in tension. **Recommendation:** such an outcome may count for the student's progress and institution aggregates, labeled "platform-decided", but contributes **no reputation to the mentor** unless the mentor later confirms. The data model records the basis (`counted_basis`) so either choice can be implemented. Final rule belongs to `reputation-and-verification-policy.md`.

### 2.8 Reputation (REP)

| ID | Requirement | Actor | Pri | Phase | Acceptance |
|---|---|---|---|---|---|
| FR-REP-01 | Reputation is derived from an append-only ledger of events written when outcomes count or are reversed | System | Must | 1 | **Given** counted outcomes, **When** the snapshot is recomputed from the ledger, **Then** it equals the stored snapshot (deterministic). |
| FR-REP-02 | Mentor impact view: counts of counted outcomes by field and difficulty, response reliability, and a confidence tier. Only counted outcomes appear | All | Must | 1 | **Given** a mentor with Pending outcomes, **When** their impact view renders, **Then** the Pending outcomes are absent. |
| FR-REP-03 | Reputation computation applies difficulty weight, evidence-tier multiplier, contribution multiplier, and a **pair factor** `1 / (1 + n)` where `n` is the number of earlier counted outcomes between the same mentor and the same student (configurable) | System | Must | 1 | **Given** repeated outcomes from the same pair, **Then** each contributes less than the first; two outcomes can never outrank twenty after shrinkage. Values come from one configuration file, labeled **Proposed defaults**. |
| FR-REP-04 | Response reliability is computed from request timestamps. Timely declines are not penalized. The **response-time KPI is the share of requests decided within 48 hours** | System | Must | 1 | **Given** a mentor who declines within 48 hours, **Then** reliability is not reduced. **Given** a request that expires undecided, **Then** it counts as a non-response in the KPI and lowers reliability. |
| FR-REP-05 | No likes, stars, or follower counts anywhere; scores are never shown or combined across fields | System | Must | 1 | **Given** any API response or screen, **Then** no cross-field aggregate or like-style field exists. A schema test fails the build if one is added. |
| FR-REP-06 | Recalibration tool: replay under a chosen configuration version, producing a diff and, only on explicit approval, compensating events | Platform Admin | Should | 1 | **Given** a new configuration version, **When** a replay runs, **Then** nothing changes until an admin approves; approved changes are new events. |
| FR-REP-07 | A numeric 0 to 100 score is internal-only until sample thresholds are met; users see counts and the confidence tier | System | Must | 1 | **Given** a mentor below thresholds, **Then** no number is exposed through the API to non-admin roles. |

### 2.9 Private session feedback (FBK)

| ID | Requirement | Actor | Pri | Phase | Acceptance |
|---|---|---|---|---|---|
| FR-FBK-01 | Private feedback after a Held session with **simultaneous reveal**: neither side sees the other's feedback until both submit or a timer ends. Used for quality operations and matching diagnostics, **never as public stars** | Student, Mentor | Could | 1b | **Given** one party submits, **Then** the other cannot see it; **When** both submit or the timer ends, **Then** the reveal happens once. Feedback never enters reputation or public views. |

**Open question (FBK-Q1):** after reveal, is feedback text visible to the counterpart or to the platform only? The research report's acceptance wording implies the counterpart sees it; platform-only is lower risk of friction. **Recommendation:** platform-only until pilot feedback shows value in sharing.

### 2.10 Institutions (INST)

| ID | Requirement | Actor | Pri | Phase | Acceptance |
|---|---|---|---|---|---|
| FR-INST-01 | Institution onboarding by a Platform Admin: name, kind, registered email domains, MoU date, Institution Admin users | Platform Admin | Must | 1 | **Given** a signed MoU, **When** the admin creates the institution, **Then** Institution Admins can sign in and see only their institution. |
| FR-INST-02 | Dashboard of aggregates: verified alumni and mentor participation, requests, match acceptance, first-response time, outcome reporting and confirmation rates, counted outcomes by domain. Funnel detail is **Phase 1b** | Institution Admin | Should | 1 (basic), 1b (funnel) | **Given** fewer than the minimum cohort size (**5**, owner decision) in a slice, **Then** that slice is suppressed. |
| FR-INST-03 | CSV export of the dashboard aggregates (PDF in Phase 2) | Institution Admin | Should | 1 (CSV), 2 (PDF) | **Given** an export, **Then** small-cohort suppression applies and an audit entry records who exported what. |
| FR-INST-04 | Student-level data is visible to an Institution Admin only with the student's explicit, revocable consent and a stated purpose | Student, Institution Admin | Could | 1b | **Given** no consent, **Then** the admin sees aggregates only; **When** consent is withdrawn, **Then** access ends immediately. |

### 2.11 Platform administration, trust, and safety (ADM)

Platform Admin owns outcome audits and disputes; the Institution Admin only attests affiliation. This avoids the conflict where the buyer of "evidence" is also its judge.

| ID | Requirement | Actor | Pri | Phase | Acceptance |
|---|---|---|---|---|---|
| FR-ADM-01 | Review queue for disputes, escalations, conflict-of-interest flags, and audits, with assignment, due dates, resolution, and reason | Platform Admin | Must | 1 | **Given** a case, **When** a reviewer resolves it as "outcome valid" or "outcome not valid" with a reason, **Then** the outcome moves to Counted (valid) or Rejected (not valid) and all parties are notified. |
| FR-ADM-02 | One appeal, decided by a different reviewer, within stated time limits | Student, Mentor, Platform Admin | Could | **Later** | **Deferred (owner decision)** until after a successful pilot. In the MVP a Platform Admin decides each case once, with a written reason. |
| FR-ADM-03 | Audit sampling: random sampling of confirmed outcomes, plus all high-difficulty outcomes, plus anomaly-triggered cases. Sampling rate is configuration (**Open**; start high in the pilot because volume is small) | System | Must | 1 | **Given** a confirmed outcome, **When** it is selected, **Then** it is held from counting until the audit result is recorded. |
| FR-ADM-04 | Abuse reporting by any user and a moderation queue | All, Platform Admin | Must | 1 | **Given** a report on a user, message, profile, or outcome, **Then** it reaches a reviewer with a visible status. |
| FR-ADM-05 | Account sanctions: warn, suspend, remove, with reason and end date | Platform Admin | Must | 1 | **Given** a sanction, **Then** it takes effect immediately, is audited, and notifies the user with the reason. |
| FR-ADM-06 | Break-glass access to a mentorship thread or evidence file | Platform Admin | Must | 1 | See FR-THR-03. Every access is logged with reason; no shared admin accounts. |
| FR-ADM-07 | Configuration management: weights, thresholds, timings, and limits are versioned, changed only by Platform Admin, and audited | Platform Admin | Must | 1 | **Given** a configuration change, **Then** a new immutable version is created and every ledger event records the version it used. |
| FR-ADM-08 | Field taxonomy and institution settings management. Fields are user-created in the MVP; this admin merge/rename tool is **Phase 1b** | Platform Admin | Should | 1b | **Given** two duplicate fields, **When** an admin merges them, **Then** profiles and reputation keep one `field_id`; retiring a field never deletes history. |
| FR-ADM-09 | Operations view: queue ages, overdue reviews, job backlog, email failures (**Phase 1b**) | Platform Admin | Should | 1b | **Given** an overdue review, **Then** it is highlighted. |

### 2.12 Notifications (NOT)

| ID | Requirement | Actor | Pri | Phase | Acceptance |
|---|---|---|---|---|---|
| FR-NOT-01 | Transactional email for every state change that needs attention (request received, decision, message, outcome reported, confirmation reminder, review result) | System | Must | 1 | **Given** a triggering event, **Then** exactly one email is queued with a de-duplication key; provider outages queue retries. |
| FR-NOT-02 | In-app notification list | All | Should | 1 | **Given** a notification, **Then** it appears in the list with read state. |
| FR-NOT-03 | Notification preferences; legally or safety-relevant notices cannot be turned off | All | Should | 1 | **Given** a user opts out of reminders, **Then** security and dispute notices still send. |
| FR-NOT-04 | Bounce and complaint handling suppresses further email to the address and surfaces it to the user | System | Should | 1 | **Given** a hard bounce, **Then** future sends are suppressed and the user sees a prompt to fix the address. |

### 2.13 Consent, privacy, and audit (CONS, PRIV, AUD)

| ID | Requirement | Actor | Pri | Phase | Acceptance |
|---|---|---|---|---|---|
| FR-CONS-01 | Consent capture for terms, privacy notice, volunteer agreement, community guidelines, and institution data sharing, stored as append-only records with document versions. Values follow `data-model.md` (`TERMS`, `PRIVACY_NOTICE`, `VOLUNTEER_AGREEMENT`, `COMMUNITY_GUIDELINES`, `INSTITUTION_DATA_SHARING`) | All | Must | 1 | **Given** a user accepts, **Then** a record with purpose and version is appended; a new document version prompts re-acceptance. |
| FR-CONS-02 | Separate, revocable consent for sharing student-level data with institutions (and with employers in Phase 3) | Student | Must | 1 | **Given** a withdrawal, **Then** a withdrawal record is appended and sharing stops. History is never edited. |
| FR-PRIV-01 | Data export request for a user's own data, with a short-lived download link | All | Must | 1 | **Given** a request, **Then** it is tracked, the export is produced, and the user downloads it through an expiring signed URL. Period **Open**, counsel to confirm. |
| FR-PRIV-02 | Account deletion: identifiers are removed or pseudonymized, evidence files deleted, and ledger structure kept with pseudonymous references so counted outcomes stay auditable | All | Must | 1 | **Given** a deletion request, **Then** personal fields are erased, evidence files purged, and the ledger remains consistent. The design needs counsel review against the erasure right and its exceptions [S1]. |
| FR-PRIV-03 | Automated retention: evidence files deleted a set time after an outcome counts or is rejected (**Proposed default**: 90 days); other retention per `data-privacy-and-retention.md` | System | Must | 1 | **Given** the retention date passes, **Then** the file is deleted and only its hash and metadata remain. |
| FR-AUD-01 | Audit log of verification, disputes, admin actions, break-glass access, configuration changes, and data exports | System | Must | 1 | **Given** any listed action, **Then** an immutable, searchable entry is written in the same transaction. |
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
| FR-UX-01 | Installable, mobile-first PWA with responsive layouts for student, mentor, institution, and admin routes | All | Must | 1 | **Given** a supported mobile browser, **Then** the app can be installed and all Phase 1 flows are usable at a narrow viewport. |
| FR-UX-02 | Resilient forms: autosave drafts locally, retry failed writes safely, and show clear offline and error states | All | Must | 1 | **Given** a failed write, **Then** the user's input is preserved and a retry does not duplicate data. |
| FR-UX-03 | Every UI string is externalized. The UI is **English only** (**Owner decision**); this requirement avoids hard-coded text but adds no languages | All | Should | 1 | **Given** a lint rule, **Then** no user-facing string is hard-coded in components. |
| FR-UX-04 | Accessibility: all Phase 1 flows meet WCAG 2.1 AA (see NFR-ACC-01) | All | Must | 1 | **Given** an automated and a manual keyboard and screen-reader check, **Then** no AA failures remain on core flows. |
| FR-UX-05 | Designed empty, loading, and error states for every list and form | All | Must | 1 | **Given** each state, **Then** a screen exists and is tested. |
| FR-UX-06 | Role-aware onboarding checklist that guides a new Student or Mentor to their first request or first activation | Student, Mentor | Should | 1 | **Given** a new user, **Then** the checklist shows only steps they can complete. |

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
- [ ] Open items (OUT-Q1, FBK-Q1, revocation effects, mentorship end window, sampling rate) are tracked in `assumptions-and-open-questions.md`.

## 6. Questions for the owner

1. **OUT-Q1:** if a mentor never responds and platform review accepts the outcome, should the mentor still gain reputation? Recommendation: no, label it "platform-decided".
2. **FBK-Q1:** should private feedback be visible to the counterpart after the reveal, or to the platform only?
3. **Staffing (N7):** a named part-time trust-and-safety reviewer is **Deferred (owner decision)**; the owner covers disputes in the MVP. When do you want to revisit it?
4. **Mentorship end window:** for how long after a mentorship ends may a student still report an outcome? (Outcomes such as admissions can arrive months later.)
5. **Group office hours:** README lists them as an interaction type; do you accept excluding them from Phase 1?
