---
title: Legal and Compliance Checklist
status: Draft
owner: Owner / CTO (counsel to be named)
date: 2026-10-29
sources: [README.md section 12 and 17.5, connect-research-report.md (Sections 4.7, 5.7, 5.8, 7 doc 18, 11)]
---

# connect: Legal and Compliance Checklist

> **This is an engineering and planning checklist. It is not legal advice.** Every item marked for counsel must be reviewed by a qualified Bangladeshi lawyer before real users are onboarded. Statements about law come from secondary summaries (research report S1 to S4, S19) and are **not verified against the primary text**.

## 1. How to use this checklist

- Each row has an **owner**, a **gate** (when it must be done), and a **status**.
- Status values: `Not started`, `In progress`, `Drafted`, `Counsel reviewed`, `Done`, `Blocked`, `Deferred (owner decision)`.
- **Gate 2** means "before real pilot users are onboarded" (see `production-requirements.md`).
- **Owner decision, 2026-10-29:** Gate 2 keeps **only** five conditions: Terms, Privacy Notice, consent screens, a backup-restore test, and a runbook. Every other row below marked "Gate 2" is **Deferred (owner decision)**: it stays on the list but is **not** a blocker for the MVP, Gate 1, or Gate 2. That includes counsel engagement, data residency, legal entity, DPIA, processor contracts, and the full contract set.
- **Gate 1** rows remain engineering conditions for the MVP.

## 2. Legal snapshot (what the research found)

| Topic | Finding | Label |
|---|---|---|
| Bangladesh data law | Personal Data Protection Act, 2026 (Law 63 of 2026), passed April 2026 | **Verified [S1][S2]** (secondary; read primary text) |
| Reach | Applies also to entities outside Bangladesh that offer services to people in Bangladesh | **Verified [S1]** |
| Children | A child is anyone under 18; processing a child's data needs verifiable parental consent | **Verified [S1]** |
| Rights | Access, rectification, erasure, consent withdrawal, portability; rights cannot be waived by contract | **Verified [S1]** |
| Records | Controllers keep a register of processing records for at least five years | **Verified [S1]** |
| Breach | Notify the authority when a breach is likely to cause significant damage | **Verified [S1]** |
| Officer | "Significant" controllers must appoint a Chief Data Officer (threshold unknown) | **Verified [S1]**, threshold **Unverified** |
| Penalties | Administrative fines reported up to 25 lakh Taka, and up to 50 lakh for significant controllers | **Verified [S1]** |
| Automated decisions | People can restrict automated decisions made with their data | **Verified [S19]** |
| Data localization | Sources conflict (in-country copy for "restricted" data vs removal of localization concerns) | **Unverified (conflicting)** |
| EU AI Act | High-risk obligations for education and employment uses deferred to 2 December 2027; transparency duties not deferred | **Verified [S14]** |

## 3. Owner decisions already made that affect compliance

| Decision | Effect |
|---|---|
| **18+ only** in the pilot (Owner decision) | No parental-consent flows are built; under-18 sign-up is blocked |
| No government ID numbers collected (Recommendation, ADR-010) | Lowers breach impact and residency exposure |
| Pilot mentors are **volunteers** (Recommendation) | Needs a volunteer agreement, not an employment contract |
| Platform owns outcome audits and disputes; institution admin only attests affiliation (accepted) | Must be reflected in the institution MoU and terms |
| No payments in Phase 1 and 2 (Recommendation) | Payment compliance deferred to Phase 3 |
| Launch country: Bangladesh; no active EU or US marketing until counsel advises | Limits foreign legal exposure |
| English-only UI and documents (Owner decision) | Notices and consent text are drafted in English; counsel should say if a Bangla version is required for valid consent (see C-04) |

## 4. Checklist

### A. Applicability, entity, and governance

| ID | Item | Why it matters | Owner | Gate | Status |
|---|---|---|---|---|---|
| A-01 | Confirm PDPA 2026 applies to connect and which role connect has (controller, processor, or both) | Determines most duties | Counsel | Gate 2 | Not started |
| A-02 | Read the **primary text** of PDPA 2026 and amendments; resolve the data-localization conflict | Secondary sources disagree | Counsel | Gate 2 | Not started |
| A-03 | Determine whether connect is a "significant" controller and whether a Chief Data Officer is needed | Possible mandatory role | Counsel | Gate 2 | Not started |
| A-04 | Decide who is the data protection contact (Owner for the pilot) and publish a rights-request contact | Rights process needs an owner | Owner | Gate 2 | Not started |
| A-05 | Decide the legal entity that contracts with the pilot partner (Bangladesh entity or Owner-owned arrangement before incorporation) | Contracts, liability, data responsibility | Owner + counsel | Before MoU | Not started |
| A-06 | Maintain a **register of processing records** (retain at least five years) | Verified duty [S1] | Owner | Gate 2 | Not started |

### B. Age policy

| ID | Item | Why it matters | Owner | Gate | Status |
|---|---|---|---|---|---|
| B-01 | Enforce **18+** at sign-up (date of birth checked once and **not stored**; institution attestation where available) | Under-18 means parental consent [S1] | Owner | Gate 1 | Not started |
| B-02 | Define what is kept when an under-18 attempt is blocked (minimum to prevent re-registration) | Data minimization | Owner + counsel | Gate 2 | Not started |
| B-03 | Confirm with the partner that the pilot cohort is all 18+ (assumption A10) | A school-age cohort would break the policy | Owner | Before MoU | Not started |
| B-04 | Terms state that the service is for adults only | Contractual backstop | Counsel | Gate 2 | Not started |

### C. Consent and notices

| ID | Item | Why it matters | Owner | Gate | Status |
|---|---|---|---|---|---|
| C-01 | Separate consents: (1) core processing, (2) sharing student-level data with institution, (3) sharing with employers (Phase 3), (4) AI-assisted features, (5) optional recording (off by default) | Specific, revocable consent | Owner + counsel | Gate 2 | Not started |
| C-02 | Consent records are **append-only**, versioned, timestamped, and queryable (CONS-1) | Proof of consent | Owner | Gate 1 | Not started |
| C-03 | Privacy notice: purposes, categories, retention, processors, cross-border transfers, rights, contact [S1] | Transparency duty | Counsel | Gate 2 | Not started |
| C-04 | Confirm English-only notices and consent are valid for the pilot audience | Understandable consent | Counsel | Gate 2 | Not started |
| C-05 | Consent withdrawal flow works and takes effect for future processing | Verified right [S1] | Owner | Gate 1 | Not started |
| C-06 | Short **data protection impact assessment (DPIA)** before the pilot | Regulator procedures contemplate it [S1] | Owner + counsel | Gate 2 | Not started |

### D. Rights requests and retention

| ID | Item | Why it matters | Owner | Gate | Status |
|---|---|---|---|---|---|
| D-01 | Access, rectification, erasure, portability, and withdrawal requests tracked in the system (PRIV-1) | Verified rights [S1] | Owner | Gate 1 | Not started |
| D-02 | Define time limits for responding (rectification: inform concerned parties within 30 days [S1]; other limits to be confirmed) | Statutory timing | Counsel | Gate 2 | Not started |
| D-03 | Reconcile **erasure with the append-only reputation ledger** (pseudonymize identifiers, delete evidence files, keep ledger structure) | Design risk flagged in research | Owner + counsel | Gate 2 | Not started |
| D-04 | Approve retention periods in `data-privacy-and-retention.md` | Proposed defaults are not validated | Counsel | Gate 2 | Not started |

### E. Processors, transfers, and residency

| ID | Item | Why it matters | Owner | Gate | Status |
|---|---|---|---|---|---|
| E-01 | List all processors (host, database, object storage, email, error tracking, LLM provider if used) | Processor actions are attributed to the controller [S1] | Owner | Gate 2 | Not started |
| E-02 | Sign or accept data processing terms with each processor | Contractual duty | Owner + counsel | Gate 2 | Not started |
| E-03 | Describe cross-border transfers (hosting in Singapore or Mumbai, email, error tracking, LLM) in the notice | Transparency | Counsel | Gate 2 | Not started |
| E-04 | Decide whether any data is "restricted" and needs an in-country copy | **Unverified (conflicting)** | Counsel | Gate 2 | Not started |
| E-05 | Keep the rule "collect no NID, passport, driver's license, tax ID" | Avoids most residency exposure | Owner | Always | Done (design rule) |

### F. Security and incident response

| ID | Item | Why it matters | Owner | Gate | Status |
|---|---|---|---|---|---|
| F-01 | Security baseline from `security-requirements.md` implemented (OWASP ASVS direction, MFA for mentors and admins, rate limits, signed URLs) | Reasonable security duty | Owner | Gate 2 | Not started |
| F-02 | Written **breach response runbook**; counsel confirms notification timing and recipient authority | Verified duty to notify [S1] | Owner + counsel | Gate 2 | Not started |
| F-03 | Audit log for verification, disputes, admin actions, exports (AUD-1) | Accountability | Owner | Gate 1 | Not started |
| F-04 | Break-glass access for platform admins is logged and reviewed | Limits staff access to threads | Owner | Gate 2 | Not started |

### G. Contracts and policies

| ID | Item | Why it matters | Owner | Gate | Status |
|---|---|---|---|---|---|
| G-01 | Terms of use | Baseline contract | Counsel | Gate 2 | Not started |
| G-02 | Community guidelines (anti-harassment, anti-exploitation, reporting) | README section 12.3 | Owner + counsel | Gate 2 | Not started |
| G-03 | **Volunteer mentor agreement** (not employment; confidentiality; conflict-of-interest declaration; no off-platform payment for confirmations) | Mentors are unpaid in the pilot | Counsel | Gate 2 | Not started |
| G-04 | **Institution MoU**: data use, roles (platform decides disputes, institution attests affiliation), aggregates by default, consent for student-level data, no outcome editing by institution | Protects neutrality and data | Counsel | Before pilot | Not started |
| G-05 | Student terms: honest outcome reporting, consequences of false claims, evidence handling | Anti-fabrication policy | Counsel | Gate 2 | Not started |
| G-06 | Takedown, suspension, and appeal terms for users | Fair process | Counsel | Gate 2 | Not started |

### H. Outcome verification and marketing claims

| ID | Item | Why it matters | Owner | Gate | Status |
|---|---|---|---|---|---|
| H-01 | Publish the **verified-badge disclaimer**: connect confirms that a mentor countersigned and, where stated, that evidence or a third party supported it; it does not claim every outcome was independently audited | README 12.3, research Doc 4 G | Counsel | Gate 2 | Drafted (text from research) |
| H-02 | Marketing claims discipline: no unvalidated statistics, no invented partners, no guaranteed outcomes | README rules and mentoring research [S9] | Owner | Always | Not started |
| H-03 | Do not use the word "ranking" or imply a global student ranking | Principle and regulatory risk | Owner | Always | Done (design rule) |
| H-04 | Evidence files may contain sensitive documents; handling rules in `data-privacy-and-retention.md` | Sensitive data | Owner | Gate 2 | Not started |

### I. AI usage

| ID | Item | Why it matters | Owner | Gate | Status |
|---|---|---|---|---|---|
| I-01 | AI **assists, never decides**: it cannot confirm outcomes, change reputation, or take privileged actions | ADR-009; automated-decision right [S19] | Owner | Always | Done (design rule) |
| I-02 | Label all AI-generated text in the UI | Transparency [S14] | Owner | Later (AI is not in the MVP) | Not started |
| I-03 | Redact personal identifiers before sending text to an external model; log every AI call | Privacy and accountability | Owner | Later (AI is not in the MVP) | Not started |
| I-04 | Disclose the LLM provider as a processor and cross-border transfer | Transparency | Counsel | Later (AI is not in the MVP) | Not started |
| I-05 | Free or possibly retained models get **no real user data and no secrets** | N12 | Owner | Always | Not started |
| I-06 | Do not use AI to rank candidates for employers | Avoids high-risk category | Owner | Always | Done (design rule) |

### J. Money, entities, and trademark (mostly later)

| ID | Item | Why it matters | Owner | Gate | Status |
|---|---|---|---|---|---|
| J-01 | Entity structure for SSLCommerz (Bangladesh entity, BDT) and Stripe (foreign entity) | Dual-entity implication [S8][S21] | Owner + counsel + accountant | Before Phase 3 | Not started |
| J-02 | Whether a Bangladesh resident may own a foreign company and repatriate revenue | **Unverified** | Counsel | Before incorporating abroad | Not started |
| J-03 | Mentor payouts: licensing and foreign-exchange questions | **Unverified**; do not promise paid mentoring | Counsel | Before paid mentoring | Blocked |
| J-04 | Hosted checkout only; no card data on connect servers | Keeps PCI scope small | Owner | Phase 3 | Not started |
| J-05 | Refund and dispute policy before launching payments | Consumer protection | Counsel | Phase 3 | Not started |
| J-06 | Trademark and domain clearance for "connect" (generic word) | Brand protection (my reasoning, not a verified finding) | Owner | Before heavy branding | Not started |
| J-07 | Tax registration and invoicing for institution subscriptions | Needed when invoicing | Accountant | Before first invoice | Not started |

### K. Other jurisdictions

| ID | Item | Why it matters | Owner | Gate | Status |
|---|---|---|---|---|---|
| K-01 | No active marketing to EU or US users until counsel advises | Avoids GDPR, COPPA, and AI Act exposure | Owner | Always | Not started |
| K-02 | If diaspora mentors outside Bangladesh participate, ask counsel whether any foreign law applies to their data | Mentors may live abroad | Counsel | Gate 2 | Not started |

## 5. Questions to bring to counsel (first meeting)

1. Does PDPA 2026 make connect a controller, a processor, or both for institution-provided cohorts?
2. What does the primary text say about data localization, and does connect hold any "restricted" data?
3. Is English-only consent acceptable for adult university students?
4. How should an append-only ledger be reconciled with the right to erasure?
5. What is the breach notification deadline and to whom?
6. Is a Chief Data Officer needed at pilot scale?
7. What must the volunteer mentor agreement and the institution MoU contain?
8. Is any licence or registration needed to run a mentorship platform in Bangladesh?
9. When we add payments, what entity structure do you recommend, and what are the foreign-exchange limits?

## 6. Review log

| Date | Reviewer | Scope | Result |
|---|---|---|---|
| | | | |

## 7. Acceptance checklist for this document

- [ ] Every item has an owner, a gate, and a status.
- [ ] No row states an Unverified claim as fact.
- [ ] Counsel has reviewed all rows marked Counsel or Owner + counsel before Gate 2.
- [ ] The privacy notice, terms, volunteer agreement, and MoU drafts exist and match this checklist.
- [ ] Status column is current.

## 8. Questions for Owner

1. Who will be your counsel, and when is the first meeting?
2. Do you already have a registered entity, or will the first MoU be signed by you personally?
3. Who is the single contact for rights requests during the pilot?
