---
title: connect Assumptions and Open Questions Register
status: Approved (MVP baseline, owner decision)
owner: Owner / CTO
date: 2026-10-29
sources: README.md (sections 1.1, 4.3, 4.5, 5.2, 5.3, 13, 18); connect-research-report.md (Sections 3, 6, 7 Doc 2, 9, 10, 11)
---

# Assumptions and Open Questions

**Purpose.** Make every unvalidated belief and every undecided question visible, owned, and tied to a validation gate. Nothing in this file is written as fact. Terms follow `glossary.md`.

**Review cadence.** Weekly during the pilot (Recommendation). Before the pilot, review at each Gate.

**Owner column.** "Owner" means the Owner / CTO. Roles that do not exist yet are written as "Unassigned".

---

## 1. Assumptions register

All assumptions start as **Unverified**. Status values: `Open`, `Testing`, `Validated`, `Invalidated`, `Deferred (owner decision)`, `Not applicable`.

| ID | Assumption | Label | Risk if false | What it blocks | How to validate | By when (gate) | Owner | Status |
|---|---|---|---|---|---|---|---|---|
| A1 | A pilot partner (university or bootcamp) will sign an MoU. | Unverified | No real-world validation of any KPI. | Pilot | Partner conversations (already running) | Before Gate 2 | Owner | Open |
| A2 | At least 30 alumni or professionals will volunteer as Mentors. | Unverified | Students have nobody to ask; marketplace fails. | Pilot cohort | Recruitment during pilot onboarding | Before Gate 2 | Owner | Open |
| A3 | Mentors respond within 48 hours often enough to reach the target. | Plan target (decided within 48h) | Low match acceptance; Students churn. | KPI: response-time share | Pilot data | Gate 3 | Owner | Open |
| A4 | Mentors will confirm Outcomes within 7 days. | Proposed default | Pending outcomes pile up; reputation never builds. | Reputation system value | Pilot data | Gate 3 | Owner | Open |
| A5 | Students report Outcomes honestly and completely. | Unverified | Fabricated or missing outcomes; weak evidence. | Credibility of the evidence layer | Pilot plus audit sample | Gate 3 | Owner | Open |
| A6 | Match acceptance can exceed 40%. | Plan target (>40%) | Matching rules need rework. | KPI: match acceptance rate | Pilot data | Gate 3 | Owner | Open |
| A7 | Institutions will pay for outcome evidence. | Unverified | No revenue model. | Business model | **Deferred (owner decision):** buyer interviews after the pilot | After the pilot | Owner | Deferred (owner decision) |
| A8 | Students use mobile browsers more than desktops. | Unverified (national data supports it, report [S18]) | PWA-first assumption weakens. | Phase 1 design priority | Pilot analytics | Gate 3 | Owner | Open |
| A9 | Google sign-in plus email-domain verification and institution attestation covers affiliation needs. | Unverified | SAML needed earlier than planned. | Auth design | Partner IT conversations | During the pilot | Owner | Open |
| A10 | An 18+ cohort is large enough for the pilot. | Unverified | Cannot reach 100 Students. | Pilot cohort size | Partner enrollment data | Before Gate 2 | Owner | Open |
| A11 | PDPA 2026 obligations are met by the planned consent and retention design. | Unverified | Legal exposure before real users. | Pilot launch | **Deferred (owner decision):** counsel review after the pilot | After the pilot | Owner | Deferred (owner decision) |
| A12 | Mentor-provided meeting links are acceptable to Mentors and Students. | Unverified | Friction; need for an integration earlier. | Session design | Pilot feedback | Gate 3 | Owner | Open |
| A13 | AI-assisted request drafting increases Mentor acceptance. | Unverified | AI assist adds cost without benefit. | Later AI scope | **Deferred (owner decision):** AI is Later | After the pilot | Owner | Deferred (owner decision) |
| A14 | Students can use an English-only UI comfortably. | Unverified (owner chose English-only) | Lower sign-up, request quality, and outcome reporting. | Student adoption | Student interviews; pilot observation | During the pilot | Owner | Open |
| A15 | A mentor-confirmed Outcome with a 14-day cooling period is not too slow to feel rewarding. | Proposed default | Mentors lose motivation. | Reputation design | Mentor interviews; pilot data | Gate 3 | Owner | Open |
| A16 | Contribution level is something Students and Mentors will state honestly and consistently. | Unverified | Contribution weighting becomes noise. | Reputation weighting | Pilot data; audit sample | Gate 3 | Owner | Open |

---

## 2. Decision register

### 2.1 README open decisions 1 to 14 (15 to 18 are tracked as N5, N7, N2, N3)

Status values: `Decided` (owner), `Deferred (owner decision)` (postponed to a named later gate, not a blocker), `Proposed default` (a cautious starting value, tuned later), `Open`.

| # | Decision | Status | Current position | Label | Needed by | Owner |
|---|---|---|---|---|---|---|
| 1 | Mentor compensation | **Decided** | Volunteers in the pilot, with recognition: a verified-impact profile and an **institution-signed certificate**. No payment. | Owner decision (29 Oct 2026) | Closed for the MVP | Owner |
| 2 | Office-hour payments | **Deferred (owner decision)** | Payments are added **last**; Tier 2 and paid office hours stay Later. `mentorships.is_paid` is reserved and always false. | Deferred | After the pilot | Owner |
| 3 | Student pricing | **Decided** | Free for Students. Never charge to verify an Outcome. | Owner decision | Closed | Owner |
| 4 | Verification responsibilities | **Decided** | Platform Admin audits Outcomes and decides Disputes with a written reason. Institution Admin attests Affiliation only. | Owner decision | Closed | Owner |
| 5 | Score calibration | **Proposed default** (display decided) | Confirmed counts and confidence tiers shown; numeric score internal. Reputation weights, difficulty weights, audit sampling, and confidence tiers start as cautious Proposed defaults and are tuned from pilot data. | Owner decision (display); values Proposed | After pilot data | Owner |
| 6 | Institutional pricing | **Deferred (owner decision)** | Pilot free under a written MoU; no price numbers until after the pilot. | Deferred | After the pilot | Owner |
| 7 | Outcome evidence requirements | **Decided** | Three evidence tiers; files deleted after the window; hashes kept. | Owner decision | Closed | Owner |
| 8 | Identity provider | **Decided** | **better-auth** embedded behind `IdentityService`. Keycloak or WorkOS only if SAML is ever needed. | Owner decision (ADR-003) | Closed | Owner |
| 9 | Zoom account model | **Decided** | Mentors paste their own meeting link. No Zoom API integration in the MVP. | Owner decision | Closed for the MVP | Owner |
| 10 | NestJS only, FastAPI later | **Decided** | NestJS only through the pilot. | Owner decision | Closed | Owner |
| 11 | Mentor identity verification level | **Decided** | Level 1 for all Mentors; Level 2 for industry Mentors; no government ID. Students get Level 1 via institution attestation. | Owner decision | Closed | Owner |
| 12 | Launch country | **Decided** | **Bangladesh only** for the first MVP. | Owner decision | Closed | Owner |
| 13 | Languages | **Decided** | **English only** for documents and product UI; the string catalog is kept. | Owner decision | Closed | Owner |
| 14 | Hosting provider and region | **Deferred (owner decision)** | Heroku, Render, or Azure; chosen after the MVP. **Not a Gate 0 blocker.** | Deferred | After the MVP | Owner |

### 2.2 Decisions added by the research report

| # | Decision | Status | Current position | Label | Needed by | Owner |
|---|---|---|---|---|---|---|
| N1 | Age policy | **Decided** | **18+ only** in the pilot. No minors until parental-consent flows and counsel exist. | Owner decision (rationale: PDPA 2026, Verified, report [S1], secondary source) | Closed for pilot | Owner |
| N2 | Legal entities for SSLCommerz (Bangladesh) and Stripe (foreign) | **Deferred (owner decision)** | Decide with counsel and an accountant before any monetization. | Deferred | After the pilot | Owner |
| N3 | Data-residency interpretation | **Deferred (owner decision)** | Read the primary PDPA text after the pilot; store no government ID numbers meanwhile. Sources conflict (Unverified). | Deferred | After the pilot | Owner |
| N4 | AI boundary | **Deferred (owner decision)** | No AI feature or model in the MVP. If added later: AI assists; humans attest. | Deferred | Later | Owner |
| N5 | Pilot partner profile | **Open (left open by owner)** | University, bootcamp, or small department. Partner talks are already happening. **Not a Gate 0 blocker.** | Open | Before Gate 2 | Owner |
| N6 | Dual roles (Student and Mentor) | **Decided** | Allowed through separate profiles on one User. | Owner decision | Closed | Owner |
| N7 | Trust-and-Safety operator | **Deferred (owner decision)** | Owner covers it in the MVP; a named part-time reviewer is revisited after the pilot. | Deferred | After the pilot | Owner |
| N8 | Brand and trademark clearance | **Deferred (owner decision)** | Run before heavy branding; "connect" is a common word. | Deferred | Before public branding | Owner |
| N9 | Mentor conflict-of-interest rule | **Decided** | Mentors cannot confirm Outcomes for relatives, direct reports, or paying relationships; declared at confirmation. | Owner decision | Closed | Owner |
| N10 | Final outcome taxonomy | **Decided** (types); weight Proposed | Admission, Internship, Job offer, Skill milestone, Interview. Job offer's difficulty weight is a cautious Proposed default, tuned after pilot data. | Owner decision; weight Proposed | Before reputation config | Owner |
| N11 | Agent git permissions | **Decided** | Agents branch and commit only; never push or merge to `main`, never force-push, never touch secrets or `.env`. Stated in `AGENTS.md`. | Owner decision | Closed | Owner |
| N12 | Free-model usage | **Deferred (owner decision)** | No AI in the MVP, so no model receives user data. The rule applies if AI is added. | Deferred | Later | Owner |

### 2.3 Open policy parameters (reputation and verification)

These were deliberately left open by the owner on 16 Oct 2026 ("decide later, as demand dictates").

| ID | Question | Options | Status | Needed by | Owner |
|---|---|---|---|---|---|
| P1 | Audit sampling rate | A high rate during the pilot because volumes are small, lowered later; or a fixed rate. Start with a cautious **Proposed default** and tune from pilot data. | Proposed default | Before the first audit | Owner |
| P2 | Is Tier 2 (independent confirmation) required for Admission Outcomes? | Required for Admission; required for Admission and Job offer; not required. | Open | Before reputation config | Owner |
| P3 | Who staffs Trust-and-Safety (same as N7) | Owner only in the MVP; a named part-time reviewer later. | **Deferred (owner decision)** | After the pilot | Owner |
| P4 | Confidence tier thresholds (Emerging, Established, Proven) | Counts of Counted outcomes per Field, possibly weighted by evidence tier. Start cautious and tune from pilot data. | Proposed default | After pilot data | Owner |
| P5 | Difficulty weight of Job offer relative to other types | Same band as Admission; between Internship and Skill milestone; other. | Open | Before reputation config | Owner |
| P6 | Platform review, appeal window, and appeal decision time limits | Review limit is a Proposed default (7 days). Appeals are **Later**. | **Deferred (owner decision)** for appeals | After the pilot | Owner |

---

## 3. Blocking questions

| Blocking question | Consequence if unanswered |
|---|---|
| No pilot partner (A1, N5) | No real-world validation of any KPI. Blocks Gate 2, not Gate 0. |
| No counsel review (A11, N3) | **Deferred (owner decision).** Terms and Privacy Notice are owner drafts until counsel is engaged; not a Gate 0 or Gate 1 blocker. |

Not blockers: hosting (#14), trust-and-safety staffing (N7/P3), legal entity (N2), data residency (N3), pricing (#2, #6), brand clearance (N8), buyer interviews (A7), AI (N4).

---

## 4. Kill or pivot criteria

To be confirmed **before the pilot starts** (not before coding). Values below are **Proposed defaults**; the structure is an owner decision.

| Trigger | Threshold | Response |
|---|---|---|
| Mentors recruited after a fixed recruitment window | fewer than X Mentors after Y weeks (X and Y Proposed) | Narrow the partner (single department or bootcamp) or change recruitment channel. |
| Mentor confirmation of Outcomes | below an agreed rate after Z weeks (Proposed) | Revisit reminder design, cooling period, or workload. |
| Match acceptance | far below the 40% Plan target after enough requests | Revisit matching rules or Mentor capacity. |
| Institution willingness to pay | no letters of intent after the pilot | Revisit price hypotheses or buyer. |
| Evidence integrity | audit sample finds a high share of unsupported claims | Tighten evidence tiers before continuing. |

---

## 5. Gate 0 readiness

Gate 0 (coding may start) is **lightweight** and passes when:

1. The contradictions fixed on 2026-10-29 stay fixed (`docs/audit/08-resolution-report.md`).
2. `AGENTS.md` exists.
3. `docs/decision-log.md` exists with this run's decisions.
4. `docs/mvp-build-plan.md` exists.
5. The MVP baseline documents are marked **Approved (MVP baseline, owner decision)**.

Current state on 2026-10-29: **items 1 to 5 are satisfied by this run.** Hosting (#14), partner type (N5), pricing, legal entity, counsel, data residency, and trust-and-safety staffing are explicitly **not** Gate 0 conditions.

---

## Acceptance checklist

- [ ] Every Proposed default and Open decision in the README appears here with an owner and a due gate.
- [ ] Nothing here is written as fact.
- [ ] Every status change is mirrored in `docs/decision-log.md`.
- [ ] README section 18 is updated to match this register.

## Questions for Owner

1. Do you want to set an owner other than yourself for any assumption (for example a partner contact for A9 or A10)?
2. When do you want to set the kill or pivot values (X, Y, Z)? They are needed before the pilot starts, not before coding.
3. Is the pilot partner type still intentionally open, or do you want to record a preference now?
