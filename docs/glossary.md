---
title: connect Glossary
status: Approved (MVP baseline, owner decision)
owner: Owner / CTO
date: 2026-10-29
sources: README.md (sections 1.1, 5, 19); connect-research-report.md (Section 7, Doc 1; Section 3.1)
---

# Glossary

**Purpose.** One meaning per term and one name per concept, used identically in documents, UI text, database, and code. If a term is used in any other connect document, it must appear here.

**Language rule (Owner decision, 16 Oct 2026).** All documents and the product UI are in English. There is no Bangla column in this glossary. (This closes README open decision #13 for launch; see `assumptions-and-open-questions.md`, D13.)

---

## 1. Truth labels

Carried over from README section 1.1, with two labels added from the research report.

| Label | Meaning |
|---|---|
| **Plan target** | A value stated in the owner's plan. A goal, not a result. |
| **Proposed default** | An editable starting value or design choice that is not validated. |
| **Illustrative** | Fictional sample data used to explain a concept. Never real data. |
| **Open decision** | Not decided. Must not be treated as policy. |
| **Deferred (owner decision)** | Deliberately postponed to a named later gate. Not a blocker and not an open question. |
| **Verified** | Confirmed by pilot data, a contract, or a primary source. |
| **Recommendation** | A reasoned proposal from the research report. Not policy until the owner approves it. |
| **Unverified** | Could not be confirmed. Do not treat as fact. |

---

## 2. Roles

| Term | Definition | Example | Not this | Code name | Owning document |
|---|---|---|---|---|---|
| **Student** | An adult (18+) using connect to seek guidance in the academic-to-career transition. | A final-year student asking for internship guidance. | "Mentee" (used only when quoting research). | `STUDENT` | personas-and-user-journeys.md |
| **Mentor** | An affiliation-verified adult who gives guidance and confirms outcomes. | An alumnus working in a field the Student targets. | A teacher, employee, or contractor of connect. Mentors are volunteers in the pilot (Recommendation). | `MENTOR` | personas-and-user-journeys.md |
| **Institution Admin** | A person at a partner institution who attests Affiliation and views aggregate dashboards. | A career-office staff member. | An arbiter of outcomes or disputes. | `INSTITUTION_ADMIN` | auth-and-access-control.md (planned) |
| **Employer** | An organization that later receives aggregate talent insight. Not active in Phase 1. | A hiring team in Phase 3. | A Phase 1 user. | `EMPLOYER` | business-model-and-pricing.md (planned) |
| **Platform Admin** | connect staff who run audits, disputes, moderation, and configuration. | The Trust-and-Safety reviewer. | An Institution Admin. | `PLATFORM_ADMIN` | reputation-and-verification-policy.md |
| **Institution** | A partner university, bootcamp, department, or training institute. | The pilot partner (not yet chosen, Open decision N5). | A real institution name. Never name one until it is real. | `institution` | personas-and-user-journeys.md |

A single User may hold more than one role (for example Student and Mentor) through separate profiles (Recommendation N6).

---

## 3. Mentorship workflow

| Term | Definition | Example | Not this | Code name | Owning document |
|---|---|---|---|---|---|
| **Mentorship request** | A Student's structured ask to one Mentor. Fields: specific question, context summary, target outcome, expected timeframe. | "Review my path to a data-analyst internship within 3 months." | A free-form chat message. | `mentorship_request` | functional-requirements.md (planned) |
| **Mentor decision** | The Mentor's response to a request: accept, decline, redirect, or recommend an alternative Mentor. | Redirect to a Mentor in a closer field. | Silence. An expired request is `EXPIRED`, not a decision. | `request_decision` | functional-requirements.md (planned) |
| **Mentorship** | The ongoing relationship created when a request is accepted, with a lightweight agreement (cadence, duration, goal). | Two check-ins per month for 3 months. | A single request, or a single session. | `mentorship` | data-model.md (planned) |
| **Mentorship agreement** | The cadence, duration, and goal both parties acknowledge. | "Monthly, 45 minutes, goal: internship." | A legal contract. | `mentorship_agreement` | functional-requirements.md (planned) |
| **Session** | One guidance interaction: an async exchange or a scheduled call on a mentor-provided meeting link. | A 30-minute call. | A login session (use "auth session"). | `session` | functional-requirements.md (planned) |
| **Thread** | The asynchronous text conversation inside a Mentorship. | Messages exchanged over two weeks. | A public post or feed item. | `thread_message` | data-model.md (planned) |
| **Controlled capacity** | A weekly cap on Mentorship slots set by the Mentor. | A cap of 3 new Students per week. | A target the platform sets. | `weekly_capacity` | personas-and-user-journeys.md |
| **Access state** | A Mentor's availability label: **Available**, **Full**, **Application-only**. | Full when the cap is reached. | Online/offline presence. | `AccessState` | functional-requirements.md (planned) |
| **Match Score** | A rule-based sort aid combining Alumni connection, Field overlap, Goal alignment, Availability match. Never a prediction of success. | A ranked list of suggested Mentors. | A quality score of a Mentor. | `match_score` | matching-algorithm-spec.md (planned) |
| **Alumni connection** | Match factor. **Redefined for a single-institution pilot** as same department, program, or batch band (Recommendation), because plain "alumnus of the partner" is constant. | Same department as the Student. | Social connection or follower relation. | `alumni_connection` | matching-algorithm-spec.md (planned) |
| **Circle** | A structured community space (field, institution, or industry transition). Phase 2. | An "AI" field circle. | A feed or follower group. | `circle` | community-spaces-spec.md (planned) |

---

## 4. Outcomes and reputation

| Term | Definition | Example | Not this | Code name | Owning document |
|---|---|---|---|---|---|
| **Outcome** | A reported result of mentorship. | "I received an internship offer." | Proof that the Mentor caused it (see Contribution). | `outcome` | reputation-and-verification-policy.md |
| **Outcome type** | The category of an Outcome: **Admission**, **Internship**, **Job offer**, **Skill milestone**, **Interview**. Job offer added by Owner decision, 16 Oct 2026; its difficulty weight is an Open decision. | Admission. | Free text. | `OutcomeType` | reputation-and-verification-policy.md |
| **Pending outcome** | Reported but not confirmed. Never contributes to reputation. | Waiting for the Mentor. | A weak or partial result. | `PENDING_CONFIRMATION` | reputation-and-verification-policy.md |
| **Confirmed outcome** | An Outcome the Mentor has confirmed. Replaces the README's "Verified outcome" in public language. | Mentor confirms the offer. | Independently audited (unless an Audit actually occurred). | `CONFIRMED` | reputation-and-verification-policy.md |
| **Counted outcome** | A Confirmed outcome that has passed the cooling period and has not been rejected or reversed. Only Counted outcomes affect reputation. | Confirmed 14+ days ago, no dispute. | Any Confirmed outcome. | `COUNTED` | reputation-and-verification-policy.md |
| **Contribution (level)** | How much the Mentor helped: **Directly enabled**, **Helped**, **Minor**. Stated by the Student, confirmed or amended by the Mentor separately from the outcome fact. | "Helped". | The outcome fact itself. | `ContributionLevel` | reputation-and-verification-policy.md |
| **Evidence** | An optional document or link supporting an Outcome, stored privately. | An offer letter. | A public attachment. | `evidence_items` | data-privacy-and-retention.md (planned) |
| **Evidence tier** | Strength of support: Tier 0 (report plus Mentor confirmation), Tier 1 (plus a document or link), Tier 2 (plus independent third-party confirmation). | Tier 1. | A quality score of the person. | `EvidenceTier` | reputation-and-verification-policy.md |
| **Cooling period** | The delay after confirmation before an Outcome counts fully. Proposed default: 14 days. | Day 1 to 14 after confirmation. | The reminder period (days 3, 5, 7). | `cooling_period_days` | reputation-and-verification-policy.md |
| **Clawback** | Reversal of an Outcome's reputation effect after later disproof, done by a compensating ledger entry. Never by deleting history. | A fabricated claim discovered later. | Editing or deleting the original entry. | `CLAWBACK` | reputation-and-verification-policy.md |
| **Reputation event** | One append-only ledger entry that adds or reverses reputation for a Mentor in a Field. | A positive event after counting. | A mutable score column. | `reputation_event` | reputation-and-verification-policy.md |
| **Ledger** | The append-only record of outcome events and reputation events. Scores are recomputed from it. | Replaying the ledger gives the same scores. | A table that can be edited in place. | `*_event` tables | data-model.md (planned) |
| **Field** | A domain chosen or created by users (for example AI, medicine, finance). Fields are fully dynamic, not a fixed taxonomy: a Student or Mentor picks an existing Field or creates one, and a normalized slug prevents duplicates. Reputation is separate per Field. | "Data Science". | A global category that merges domains. | `field` | data-model.md |
| **Field normalization** | Turning a typed Field name into one canonical row (trim, case-fold, collapse separators) so "Data science" and "data-science" are the same Field. Merging two real Fields is an admin tool in a later phase. | "AI" and "ai" become one Field. | A hard-coded list. | `normalized_slug` | data-model.md |
| **Field-specific impact** | A Mentor's reputation within one Field. Not comparable across Fields. | Strong in AI, nothing in finance. | A global score. | `field_impact_snapshots` | reputation-and-verification-policy.md |
| **Confidence tier** | Public label of how much evidence backs a Mentor's impact in a Field: **Emerging**, **Established**, **Proven**. Sample thresholds are an Open decision. | "Emerging" with 2 counted outcomes. | A precise 0 to 100 number at low volume. | `ConfidenceTier` | reputation-and-verification-policy.md |
| **Response reliability** | An objective measure from timestamps of how reliably a Mentor responds. Timely declines and redirects are not penalized. | Median time to first decision. | A rating given by Students. | `response_reliability` | reputation-and-verification-policy.md |
| **Pair factor** | A multiplier that reduces the contribution of repeated Outcomes between the same Mentor and Student. | The third outcome with the same pair counts less. | A penalty on the person. | `pair_factor` | reputation-and-verification-policy.md |
| **Private feedback** | Session feedback from each party, kept private, with simultaneous reveal. Used for quality operations and matching diagnostics only. | A short post-session form. | A public star rating. | `private_feedback` | reputation-and-verification-policy.md |
| **Simultaneous reveal** | Neither side sees the other's feedback until both submit or a timer ends. | Feedback unlocks after both submit. | Open reciprocal reviews. | `reveal_at` | reputation-and-verification-policy.md |
| **Conflict-of-interest declaration** | A declaration at confirmation of relatives, direct reports, paid relationships, or similar ties. A declared conflict triggers Platform review. | "Student is my relative." | Optional gossip. | `coi_declaration` | reputation-and-verification-policy.md |

---

## 5. Verification, audit, dispute

The word "verification" is split in two, because the README uses it for both.

| Term | Definition | Example | Not this | Code name | Owning document |
|---|---|---|---|---|---|
| **Affiliation verification** | Proof that a person is who they say and belongs where they say (institution or employer). | Institutional email or admin attestation. | Confirming an Outcome. | `affiliation_level` | reputation-and-verification-policy.md |
| **Outcome verification** | The process that moves a reported Outcome to Confirmed and then Counted. | Mentor confirms, then cooling period. | Verifying a person's identity. | `outcome_state` | reputation-and-verification-policy.md |
| **Mentor verification level** | Level 0 email verified. Level 1 affiliation verified. Level 2 employer check for industry Mentors. No government ID. | Level 1. | A quality grade. | `MentorVerificationLevel` | reputation-and-verification-policy.md |
| **Verified badge** | A label meaning the Mentor's affiliation is verified (and, where stated, that evidence supported an Outcome). It does not claim independent audit of every Outcome. | Affiliation-verified Mentor. | An endorsement of quality or an audit. | `badge` | reputation-and-verification-policy.md |
| **Audit** | Platform review of a Confirmed outcome by sampling, difficulty, or anomaly trigger. | Random sample of Confirmed outcomes. | A routine step for every outcome. | `audit_case` | reputation-and-verification-policy.md |
| **Dispute** | A Mentor's challenge to a reported Outcome, or a challenge to a confirmed one. | Mentor disputes the claim. | A complaint about behavior (use Report). | `dispute` | reputation-and-verification-policy.md |
| **Platform review** | The Platform Admin step that resolves Disputes and escalations. Replaces the README's "AdminReview". | Decision with a written reason. | Review by an Institution Admin. | `IN_PLATFORM_REVIEW` | reputation-and-verification-policy.md |
| **Appeal** | One appeal of a Platform decision, decided by a different reviewer. **Deferred (owner decision)** until after a successful pilot: in the MVP a case is decided once. | Student appeals a Rejected outcome. | Unlimited retries. | `appeal` | reputation-and-verification-policy.md |
| **Report (abuse)** | A user report of harassment or misconduct to the moderation queue. | Student reports abusive messages. | A Dispute about an Outcome. | `abuse_report` | moderation-and-trust-safety.md (planned) |
| **Neutrality firewall** | The rule that no payer can buy reputation, badges, audits, or removal of an unfavorable outcome. | Institutions see aggregates only. | A pricing tier. | n/a | business-model-and-pricing.md (planned) |

---

## 6. Business and delivery

| Term | Definition | Example | Not this | Code name | Owning document |
|---|---|---|---|---|---|
| **Platform revenue** | The share of money the platform keeps. | Illustrative: 30% of 20 office hours at $50 = $300. | Money processed. | `platform_revenue` | business-model-and-pricing.md (planned) |
| **Money processed** | Total payments passing through the platform, including the Mentor's share. | Illustrative: $1,000. | Revenue. | `money_processed` | business-model-and-pricing.md (planned) |
| **Pilot** | The controlled first deployment. Plan target: 1 institution, 30 Mentors, 100 Students. | Phase 1. | A public launch. | n/a | pilot-plan.md (planned) |
| **Gate** | An evidence-based checkpoint between phases. | Gate 0: coding may start. | A calendar date. | n/a | milestones-and-phases.md |
| **Approved / Draft** | Document status. Only the owner sets Approved. | `status: Draft`. | Self-approved by an agent. | `status` | AGENTS.md (planned) |

---

## 7. Banned or discouraged terms

| Avoid | Why | Use instead |
|---|---|---|
| Rating, stars, rate a Mentor | Implies public mutual star ratings, which invite reciprocity and retaliation bias. | Confirmed outcome, Field-specific impact, Response reliability, Private feedback |
| Ranking, leaderboard, top Mentor | Implies a global ranking. connect is not a ranking. | Confidence tier, counts by Field |
| Likes, followers, popularity | Never a reputation signal. | Not applicable |
| Verified (alone) | Ambiguous between affiliation and outcome. | Affiliation-verified, or Confirmed outcome |
| Verified outcome (public text) | Overstates audit. | Confirmed outcome, Counted outcome |
| Mentee | Inconsistent role name. | Student |
| AdminReview | Implies Institution Admin judgment. | Platform review |
| Score of a student | connect does not score students. | Not applicable |
| Guaranteed result / proven to work | Mentoring effects are modest on average (Verified, research report [S9]). | Describe the process and show confirmed counts |

---

## 8. Glossary terms mapped to enums and tables (Proposed)

**Case rule.** The database stores `UPPER_SNAKE` values; the API returns the mechanical lowercase form (`lower_snake`). No other difference is allowed. `data-model.md` section 4.1 is the single canonical source; the lists below repeat it and add no values.

| Enum | Values (Proposed) |
|---|---|
| `role` | `STUDENT`, `MENTOR`, `INSTITUTION_ADMIN`, `PLATFORM_ADMIN`, `EMPLOYER` (reserved, Phase 3) |
| `account_status` | `ACTIVE`, `SUSPENDED`, `DEACTIVATED`, `DELETION_PENDING`, `ANONYMIZED` |
| `mentor_onboarding_status` | `APPLIED`, `EMAIL_VERIFIED`, `AFFILIATION_VERIFIED`, `EMPLOYER_CHECKED` |
| `mentor_status` | `DRAFT`, `PENDING`, `ACTIVE`, `SUSPENDED`, `REMOVED` |
| `mentor_access_mode` | `OPEN`, `APPLICATION_ONLY`, `PAUSED` |
| `access_state` | `AVAILABLE`, `FULL`, `APPLICATION_ONLY` |
| `affiliation_level` | `LEVEL_0`, `LEVEL_1`, `LEVEL_2` |
| `affiliation_status` | `PENDING`, `VERIFIED`, `REJECTED`, `REVOKED`, `EXPIRED` |
| `request_status` | `PENDING`, `ACCEPTED`, `DECLINED`, `REDIRECTED`, `EXPIRED`, `WITHDRAWN` |
| `mentorship_status` | `ACTIVE`, `COMPLETED`, `ENDED_EARLY` |
| `session_status` | `SCHEDULED`, `HELD`, `CANCELLED` |
| `outcome_status` | `PENDING_CONFIRMATION`, `CONFIRMED`, `IN_PLATFORM_REVIEW`, `COUNTED`, `REJECTED`, `WITHDRAWN`, `REVERSED` |
| `outcome_type` | `ADMISSION`, `INTERNSHIP`, `JOB_OFFER`, `SKILL_MILESTONE`, `INTERVIEW` |
| `evidence_tier` | `0`, `1`, `2` |
| `contribution_level` | `DIRECTLY_ENABLED`, `HELPED`, `MINOR` |
| `confidence_tier` | `NONE`, `EMERGING`, `ESTABLISHED`, `PROVEN` |
| `consent_purpose` | `TERMS`, `PRIVACY_NOTICE`, `VOLUNTEER_AGREEMENT`, `COMMUNITY_GUIDELINES`, `INSTITUTION_DATA_SHARING`, `AI_ASSIST`, `EMPLOYER_DATA_SHARING`, `RECORDING` |
| `dispute_status` | `OPEN`, `IN_REVIEW`, `RESOLVED`, `WITHDRAWN` |

Append-only tables (Recommendation): `outcome_events`, `verification_records`, `reputation_events`, `consent_records`, `audit_logs`, `config_versions`. Derived and rebuildable: `field_impact_snapshots`.

`DISPUTED`, `ESCALATED`, `UNDER_REVIEW`, `APPEALED`, `AUDITED`, `REPORTED`, and `EVIDENCE_ATTACHED` are **not** outcome states. They are events or transitions recorded in `outcome_events`; an outcome in any of those situations is `IN_PLATFORM_REVIEW` or still `PENDING_CONFIRMATION`.

---

## 9. README glossary reconciliation

| README term | Status here |
|---|---|
| Outcome | Kept. |
| Verified outcome | **Renamed** to Confirmed outcome (public) and Counted outcome (affects reputation). |
| Pending outcome | Kept. |
| Match Score | Kept. Alumni connection factor redefined. |
| Field-specific impact score | Kept as Field-specific impact. A numeric score stays internal until sample thresholds are met. |
| Controlled capacity | Kept. |
| Platform revenue / Money processed | Kept. |
| Circle | Kept (Phase 2). |
| Plan target / Proposed default / Illustrative | Kept. Recommendation and Unverified added. |
| State "AdminReview" | **Renamed** to Platform review (Owner approved platform-owned disputes, 16 Oct 2026). |

---

## Acceptance checklist

- [ ] Every term used in any other connect document appears here.
- [ ] No two terms share a meaning.
- [ ] Every status in the data model maps to a term in this glossary.
- [ ] Every README glossary term is preserved or explicitly renamed (section 9).
- [ ] Banned terms do not appear in UI copy.

## Questions for Owner

1. Should **Mentorship** (the ongoing relationship) be visible to users in the UI, or stay internal? (Open decision)
2. Should Job offer sit in the same difficulty band as Admission, or between Internship and Skill milestone? (Open decision; no numeric weight is set.)

Resolved 2026-10-29: the enum names are fixed by the owner decision recorded in `docs/decision-log.md` (D-02); see `data-model.md` section 4.1.
