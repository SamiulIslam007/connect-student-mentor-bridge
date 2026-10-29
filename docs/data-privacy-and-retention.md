---
title: Data Privacy and Retention
status: Draft
owner: Owner / CTO
date: 2026-10-29
sources: [README.md sections 10, 11.4, 12.2, 17.5, connect-research-report.md (Sections 4.7, 5.6, 5.7, 7 docs 9 and 19)]
---

# connect: Data Privacy and Retention

> Engineering policy draft, **not legal advice**. All retention periods are **Proposed defaults** and must be confirmed by counsel (see `legal-and-compliance-checklist.md`, D-04). Law references come from secondary summaries (research S1, S19) and are not verified against primary text.

## 1. Purpose

Define what personal data connect collects, why, where it lives, who can see it, how long it is kept, and how it is deleted. This document must stay consistent with `data-model.md` (every entity and field appears here) and with the append-only ledger design.

## 2. Principles

1. **Collect less.** The cheapest compliance is not holding the data.
2. **Purpose limitation.** Each data item has a stated purpose. No reuse for other purposes without new consent.
3. **No sale of user data.** Stated business principle (README 4.2).
4. **Aggregates by default.** Institutions and employers see aggregates; student-level data only with explicit, revocable consent.
5. **Adults only in the pilot.** No data of minors (18+ policy, Owner decision).
6. **AI assists, humans attest.** Personal data sent to an AI provider is minimized, redacted, logged, and disclosed.
7. **Trust data is auditable.** Reputation inputs are kept in append-only history; deletion is designed around this (section 9).

## 3. Roles

| Party | Role (to be confirmed by counsel, item A-01) |
|---|---|
| connect (platform) | Controller for account, mentorship, outcome, and reputation data |
| Pilot institution | Likely a separate controller for its own student records; shares only what the MoU permits |
| Hosting, database, storage, email, error tracking, LLM provider | Processors; each listed in section 10 |

## 4. Data inventory

Sensitivity classes: **High**, **Medium**, **Low** (from `data-model.md`). Lawful basis shown is the working assumption: **Consent** or **Contract** (terms of use). Counsel confirms.

| # | Data item | Purpose | Basis | Sensitivity | Stored in | Visible to |
|---|---|---|---|---|---|---|
| 1 | Name, email, password hash or social-login ID | Account and sign-in | Contract | Medium | PostgreSQL (identity layer) | Owner; platform admin (support) |
| 2 | 18+ gate result: `age_18_plus` boolean and `age_gate_passed_at`. The date of birth is used once for the check and **not stored** | Age gate | Contract | Low | PostgreSQL | Owner; platform admin |
| 3 | Role assignments (Student, Mentor, Institution Admin, Platform Admin) | Access control | Contract | Low | PostgreSQL | System; platform admin |
| 4 | Institution affiliation and attestation | Affiliation verification | Contract + Consent | Medium | PostgreSQL | Owner; institution admin (own institution); platform admin |
| 5 | Student profile (goals, field, language, availability) | Matching and requests | Contract | Medium | PostgreSQL | Owner; mentors only after a request is sent |
| 6 | Mentor profile (fields, scope, capacity, bio) | Discovery | Contract | Medium | PostgreSQL | Verified users (public to signed-in users) |
| 7 | Mentorship requests (question, context, target outcome, timeframe) | Mentor decision | Contract | High | PostgreSQL | Student; addressed mentor; platform admin only for dispute or support (audited) |
| 8 | Thread messages | Guidance | Contract | High | PostgreSQL | Participants only; platform admin break-glass (audited) |
| 9 | Session records (time, meeting link, held confirmations) | Session history | Contract | Medium | PostgreSQL | Participants |
| 10 | Outcomes (type, description, contribution level, state) | Verification and reputation | Contract + Consent | Medium | PostgreSQL (append-only events) | Student; mentor; platform admin; aggregates to institution |
| 11 | Evidence files (offer letter, admission letter) | Verification Tier 1 and above | Consent | **High** | Private object storage; hash and metadata in PostgreSQL | Student; mentor; platform admin (signed URL, audited) |
| 12 | Disputes and reviewer notes | Dispute resolution | Contract | High | PostgreSQL | Parties; platform admin |
| 13 | Reputation events and impact snapshots | Reputation | Contract | Medium | PostgreSQL (events append-only; snapshots derived) | Mentor; other verified users see counts and confidence tier |
| 14 | Private session feedback | Quality operations | Consent | Medium | PostgreSQL | Platform admin; revealed to parties only under simultaneous-reveal rule (Phase 1b, optional) |
| 15 | Consent records | Proof of consent | Legal duty | High | PostgreSQL (append-only) | Owner (own); platform admin |
| 16 | Audit log (who did what) | Accountability and security | Legal duty / Legitimate need | High | PostgreSQL (append-only) | Platform admin |
| 17 | Security and access logs (IP, user agent, request ID) | Security, abuse detection | Legitimate need | Medium | Log service | Owner / platform admin |
| 18 | Analytics events (page and feature use, no message text) | Product improvement | Consent where required | Low to Medium | Internal events table | Owner; aggregated only |
| 19 | AI interaction log (purpose, model, input class, output ID) | Accountability for AI use | Contract | Medium | PostgreSQL | Platform admin |
| 20 | Deletion and export requests | Rights handling | Legal duty | Medium | PostgreSQL | Owner; platform admin |
| 21 | Notification and email delivery records | Operations | Contract | Low | PostgreSQL and email provider | System |

## 5. Never collected

These are not stored in any system, log, prompt, or analytics event.

- Government ID numbers (NID, passport, driver's license, tax ID).
- Payment card data and bank account details (payments are not built before Phase 3; hosted checkout only).
- Precise location (city or country level at most, only if needed).
- Health data, religion, political opinions, ethnicity, sexual orientation.
- Biometric data.
- Any data about people under 18.
- Raw video or audio (no recording in the MVP).

Users may type sensitive details into free-text fields. The terms and UI hint tell users not to. Moderation and reports can remove such content.

## 6. Retention schedule

All values are **Proposed defaults**, to be confirmed by counsel.

| Data | Retention | Trigger and notes |
|---|---|---|
| Account and profile | Life of the account; deleted or pseudonymized within 30 days of a deletion request (period to be confirmed) | Subject to legal holds and ledger design (section 9) |
| Age-gate blocked attempts | Minimum needed to prevent re-registration (for example a salted hash of the email), 12 months | Counsel to confirm |
| Mentorship requests and threads | Life of the mentorship plus 12 months, then deleted or archived without message text | **Open decision**: whether threads are retained after a mentorship ends |
| Session records | Life of the mentorship plus 12 months | Meeting links removed earlier (30 days after the session) |
| Outcome events, verification records, reputation events | Life of the account; after deletion kept only with **pseudonymous references** (section 9) | Needed for auditability and clawback |
| Evidence files | **Deleted 90 days after the outcome is counted**; hash and metadata kept | Proposed default from research 5.7; faster if the user withdraws consent |
| Disputes | 24 months after resolution, then deleted or reduced to the decision and reason | Counsel to confirm |
| Consent records | Life of the account plus the legal limitation period (to be confirmed) | Proof of consent |
| Audit log | 24 months online, then archived or deleted per counsel | Admin actions, exports, break-glass |
| Security and access logs | 90 days | IP addresses minimized |
| Analytics events | 12 months, then aggregated | No message text |
| AI interaction log | 12 months | Metadata only; raw sensitive text not retained longer than needed |
| Backups | 30 days of backups; point-in-time recovery window 7 days (**Proposed**) | Deleted data may remain in backups until they expire; this is stated in the notice |
| Register of processing records | **At least 5 years** | Legal duty [S1]; this is the register, not the underlying personal data |
| Institution aggregates | Without personal data; kept while the institution is a customer | Small-cohort suppression applies |

## 7. Consent model

Consents are **separate, specific, versioned, timestamped, and revocable**. Withdrawal affects future processing and is as easy as giving consent.

| Consent purpose (`consent_purpose`) | Required for | Default | Phase |
|---|---|---|---|
| `TERMS` | Using the service (core processing and terms) | Required to sign up | 1 |
| `PRIVACY_NOTICE` | Acknowledging the privacy notice | Required to sign up | 1 |
| `VOLUNTEER_AGREEMENT` | Mentor participation as a volunteer | Required for mentors | 1 |
| `COMMUNITY_GUIDELINES` | Community conduct and moderation rules | Required to sign up | 1 |
| `INSTITUTION_DATA_SHARING` | Institution seeing named student data | **Off** | 1 |
| `AI_ASSIST` | AI-assisted features | **Off**; reserved, not requested (AI is Later) | Later |
| `EMPLOYER_DATA_SHARING` | Employer portal | **Off**; reserved | 3 |
| `RECORDING` | Session recording or transcription | **Off**; reserved, all participants must agree | Later |

Rules: consent text is plain English (owner decision), no pre-ticked boxes, every change is a new consent record, institutions never see who declined. These eight values are the same list as `data-model.md` section 4.1; no document adds a ninth.

## 8. Sharing with institutions and employers

- **Institution admin** sees aggregates for their own institution only: counts, rates, funnels, outcomes by field (README 11.2).
- **Small-cohort suppression:** aggregates below a threshold (**5**, owner decision) are hidden so individuals cannot be identified.
- **Student-level data** reaches an institution only with `INSTITUTION_DATA_SHARING` consent and a stated purpose. Institution admins **cannot edit** outcomes or reputation.
- **Employers** (Phase 3): see mentor-endorsed signals only with `EMPLOYER_DATA_SHARING` consent. No global ranking, no AI scoring of candidates.
- Every export of student-level data is audit-logged.

## 9. Deletion and the append-only ledger

The reputation ledger is append-only so that reputation can be recomputed and audited. Erasure rights must still work.

**Design (Recommendation, needs counsel):**

1. On a verified deletion request, remove or pseudonymize direct identifiers: name, email, profile text, thread text, free-text descriptions.
2. Delete evidence files immediately.
3. Keep ledger rows with **pseudonymous references** (random IDs with no link to a person once the mapping is removed) so counted outcomes remain auditable and mentor reputation does not change unfairly.
4. Keep only aggregated institution metrics.
5. Write a `DeletionRequest` record (what was requested, when, what was done). This record contains no deleted content.
6. Tell the user in plain words what is kept and why. Counsel confirms this satisfies erasure rights and exceptions [S1] (checklist D-03).

**Mentor edge case:** if a mentor deletes their account, their counted outcomes remain in the ledger as pseudonymous history; their public profile is removed.

## 10. Processors and transfers

List is a **template**; fill in when providers are chosen (checklist E-01 to E-03).

| Processor | Purpose | Data involved | Location | Agreement | Status |
|---|---|---|---|---|---|
| Hosting platform (containerized PaaS, region Singapore or Mumbai) | Run the application | All application data in transit | Decided by one-day test | Required | Not started |
| Managed PostgreSQL | Database | All database data | Same region | Required | Not started |
| Object storage | Evidence files | Evidence files | Same region | Required | Not started |
| Transactional email | Notifications | Name, email, notification content | Provider-dependent | Required | Not started |
| Error tracking (Sentry) | Debugging | Technical errors; personal data must be scrubbed | Provider-dependent | Required | Not started |
| LLM provider (**Later**; no AI in the MVP) | Drafting and summaries | Redacted request text | Provider-dependent | Required before use | Not started |

Rules: no real user data goes to free-tier or possibly retained models (N12); error reports and logs strip tokens, message bodies, and evidence content.

## 11. AI data handling

- AI features are off and **not built in the MVP** (owner decision). If they are added later, consent `AI_ASSIST` and the retention rules above apply first.
- Redact names, emails, phone numbers, and institution names where not needed before any external call.
- Treat all user text as untrusted input (prompt injection). Model output never triggers privileged actions.
- Log purpose, model, input class, and output ID. Do not log raw text longer than needed.
- Show an AI label on generated text. A human sends or approves it; nothing is auto-sent.

## 12. Rights process

| Right | How it works in connect | Tracking |
|---|---|---|
| Access and portability | User requests an export in settings (`POST /v1/privacy/export`); system produces a machine-readable file | `DeletionRequest` / export record |
| Rectification | User edits their profile; for outcome or ledger data, submits a correction request reviewed by platform admin | Audit log |
| Erasure | User requests deletion; identity verified; process in section 9 | `DeletionRequest` |
| Consent withdrawal | Toggle in settings; effective immediately for future processing | `ConsentRecord` |
| Restrict automated decisions | No automated decision affects reputation, verification, or access; AI is assist-only | Design rule |
| Complaint or question | Contact address in the privacy notice | Support inbox |

Response time limits are set after counsel review (checklist D-02).

## 13. Breach handling (summary)

If personal data is exposed: contain, assess, log in the incident record, notify the authority when the breach is likely to cause significant damage [S1], and tell affected users. Counsel confirms timing. Full steps live in the runbook (`production-requirements.md`).

## 14. DPIA outline (to complete before the pilot)

1. Describe processing (sections 4 and 5).
2. Assess necessity and proportionality (collect-less choices, 18+ only, aggregates by default).
3. List risks: evidence leakage, thread leakage, collusion-driven false outcomes, re-identification in small cohorts, AI misuse.
4. List mitigations: private storage with signed URLs, object-level authorization, break-glass auditing, small-cohort suppression, AI boundary.
5. Residual risk and approval by Owner and counsel.

## 15. Open decisions

| # | Decision | Needed by |
|---|---|---|
| 1 | Are threads retained after a mentorship ends? | Before Gate 2 |
| 2 | Final retention periods (section 6) | Counsel review |
| 3 | Small-cohort suppression threshold (5 proposed) | Before institution dashboard |
| 4 | Whether analytics need consent (C6) | Counsel |
| 5 | Data residency interpretation | Counsel (A-02, E-04) |
| 6 | Backup retention window | Before production |
| 7 | Whether phone numbers are ever collected (OTP login is an Open decision) | Before auth ADR is final |

## 16. Acceptance checklist

- [ ] Every field in `data-model.md` appears in the inventory with sensitivity, retention, and deletion behavior.
- [ ] The deletion design is reconciled with the append-only ledger and approved by counsel.
- [ ] Consent purposes `TERMS`, `PRIVACY_NOTICE`, `VOLUNTEER_AGREEMENT`, `COMMUNITY_GUIDELINES`, and `INSTITUTION_DATA_SHARING` are implemented and tested in Gate 1. `AI_ASSIST`, `EMPLOYER_DATA_SHARING`, and `RECORDING` stay reserved.
- [ ] The privacy notice matches sections 4 to 10.
- [ ] Processor list is complete and agreements are accepted.
- [ ] DPIA is complete.

## 17. Questions for Owner

1. Do you want to keep thread text after a mentorship ends, or delete it?
2. Are you comfortable with a 90-day evidence file retention, or do you want shorter?
3. Will analytics be internal only (a table in PostgreSQL) in the MVP?
