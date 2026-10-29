---
title: Pilot Plan
status: Draft
owner: Owner
date: 2026-10-28
sources: README.md (sections 4.3, 4.5, 4.6, 5, 15); connect-research-report.md (Sections 3, 4, 6, 9, 10, Doc 17, Doc 2); architecture-decisions.md (ADR-016, ADR-017); security-requirements.md; auth-and-access-control.md
---

# Pilot Plan

> **Purpose.** Define how the first controlled pilot runs, how we decide whether it worked, and what we do if it did not. The pilot exists to **test assumptions**, not to prove them. Every number here is either a **Plan target** from the README or a **Proposed default** awaiting the owner's approval.
>
> **Rule carried from the README:** never invent real university names, mentor identities, customer numbers, or validated statistics. Placeholders in square brackets are filled only with real data.

## 1. Pilot at a glance

| Item | Value | Label |
|---|---|---|
| Partner | 1 institution: **[partner name, to be filled when real]**. University versus bootcamp or single department is an **Open decision** (N5) | Plan target (1 partner) |
| Mentors | 30 | **Plan target** |
| Students | 100, all aged 18 or older | **Plan target**; 18+ is a **Owner decision** (16 October 2026) |
| Duration | 12 to 16 weeks of live use | **Proposed default** |
| Match acceptance rate | Greater than 40% | **Plan target** |
| Response-time KPI | Share of requests decided within 48 hours | **Plan target** |
| Outcome conversion | 15% of active mentees over 90 days | **Proposed default** |
| Letters of intent | 3 to 5 institutions, sought after the pilot | **Plan target** |
| Mentors | Volunteers, no payment | **Recommendation** |
| Students | Free | **Recommendation** |
| Pilot cost to the partner | Free under a written MoU | **Recommendation** |
| Language | English only | **Owner decision** |
| Not in the pilot | Payments, employer portal, community circles, group office hours, native mobile app, in-house calls, real-time WebSocket, AI features and AI models | README phases, ADR-005, ADR-006, owner decision 29 Oct 2026 |

**Why 12 to 16 weeks:** outcome conversion is measured over 90 days (README 4.5). A pilot shorter than about 90 days cannot show that KPI. The duration is the owner's decision.

## 2. Goals and learning questions

The pilot has five learning goals, ordered by importance.

| # | Learning goal | Assumption tested (see `docs/assumptions-and-open-questions.md`) |
|---|---|---|
| 1 | Will mentors respond and decide fast enough? | A3 (response under 48 hours), A6 (acceptance above 40%) |
| 2 | Will mentors confirm outcomes, and quickly? | A4 (confirm within 7 days) |
| 3 | Will students report outcomes honestly and completely? | A5 (audit sample checks this) |
| 4 | Does the mentor-provided link and mobile web experience work for users? | A8, A12 |
| 5 | Who would pay, and how much? (a learning goal, not an assumption) | A7 (buyer interviews and letters of intent) |

Secondary question: does an AI-assisted request draft improve mentor acceptance (A13)? **Not tested in the MVP or pilot**; AI is **Deferred (owner decision)**

## 3. Phases and gates

The pilot follows the Agile iteration rhythm (ADR-017). Work is grouped by gates.

| Stage | What happens | Exit evidence |
|---|---|---|
| **Phase 0.5: validation** (runs in parallel with documentation) | Partner conversations; 10 to 15 interviews (section 4); counsel introduction | Partner decision-maker identified; interview notes; counsel booked |
| **Gate 0: coding may start** | MVP baseline documents Approved; `AGENTS.md`, `docs/decision-log.md`, and `docs/mvp-build-plan.md` exist | Approved docs and decision log |
| **Gate 1: MVP acceptance** | Sign-in, profile, field, request, decision, thread, outcome, reputation, and admin review work; Docker Compose; CI green | Demo and test run |
| **Gate 2: pilot readiness** (section 5) | Terms, Privacy Notice, consent screens, backup-restore test, runbook | Checklist with owners |
| **Pilot run** (section 7) | Live use with the partner | Weekly metrics and notes |
| **Gate 3: continue or stop** (section 10) | Compare results with targets | Pilot report |

## 4. Phase 0.5: partner and interview plan

### 4.1 Partner criteria (Recommendation)

The partner should have: an accessible decision-maker (career center, alumni office, or program head); at least 30 reachable potential mentors (alumni, including those abroad); a cohort of at least 100 adult students; willingness to sign an MoU covering data use and verification roles; and an outcome the partner already cares about (placement, internships, or admissions).

**Hypothesis (to test):** a bootcamp or a single department may give faster feedback and clearer outcomes than a whole university. Private universities depend heavily on tuition **[S20]**, which may limit software budgets, so test price willingness early.

### 4.2 Interviews (**Proposed**)

| Group | Count | Topics |
|---|---|---|
| Students | 5 | How they find help today, what blocked them, mobile usage, what would make them report an outcome |
| Alumni or professional mentors | 5 | Time available, what would make them confirm outcomes, harassment and liability worries, recognition they value |
| Career-office or alumni staff | 3 | Current outcome tracking, budget owner, sign-in systems (Google Workspace versus Microsoft 365: A9), what evidence they would pay for |
| Employers | 2 | What signal they trust; employers are not in the pilot, so this is learning only |

Record notes in `research-log.md` (Planned, not yet created). Do not publish invented personas as facts; personas stay **Illustrative** until these interviews are done.

## 5. Gate 2: pilot readiness checklist

Only the items truly required before a real user is onboarded. Deferred items are listed in section 5.2 and are **not** blockers.

| Area | Must be true | Owner |
|---|---|---|
| Terms | Terms of use published | Owner |
| Privacy | Privacy Notice published and matching `data-privacy-and-retention.md` | Owner |
| Consent | Consent screens live for the five MVP purposes; append-only records verified | Owner |
| Recovery | A backup **restore performed and recorded** | Owner |
| Operations | One-page runbook (deploy, rollback, rotate keys, handle a dispute backlog, breach response) written and rehearsed | Owner |
| Product | Phase 1 Must requirements working from the Docker stack | Owner |
| Docker | The same images run locally and on the chosen host, once chosen | Owner |

### 5.2 Recommended but not blocking

Institution MoU, mentor Level 1 verification operating, accessibility pass, kill-criteria values confirmed, support inbox published, KPI events verified, owner sign-off in `docs/decision-log.md`.

**Deferred (owner decision), not Gate 2 conditions:** counsel engagement as a blocker, DPIA, data-residency answer, legal entity, trust-and-safety reviewer hire, pilot partner type, willingness-to-pay work, brand clearance.

## 6. Recruitment and onboarding

### 6.1 Mentors (target 30)

- **Source:** the partner's alumni office and professional contacts, including alumni who live abroad.
- **Entry offer:** a short, bounded commitment (for example a weekly capacity cap the mentor chooses, README 5.5), a verified-impact profile, and an institution-signed certificate or badge (**Recommendation**; the certificate design is an **Open decision**).
- **Funnel to track:** invited, applied, email verified, affiliation verified (Level 1), profile complete, first request received, first decision made.
- **Mentor agreement:** a volunteer mentor agreement (not employment) accepted at sign-up. Drafted for counsel (see the legal checklist).
- **Mentor onboarding:** a short guide covering how decisions work, how to confirm outcomes, the conflict-of-interest rule (N9), harassment reporting, and capacity controls.
- **Assumption A2:** at least 30 volunteers can be recruited. If recruitment stalls, the kill criteria in section 9 apply.

### 6.2 Students (target 100)

- **Source:** the partner's cohort, adults only (18+ declaration, institution attestation where available).
- **Onboarding steps:** sign up and verify email; confirm 18+; affiliation check; profile; guidance on writing a structured request. The README's proposed rule is that the first request is made within 48 hours of onboarding. This is a proposed rule, not a response guarantee.
- **Concierge assist:** during the pilot the owner (or a coordinator) may manually suggest matches while the rule-based suggestions learn from acceptance data. Log every manual suggestion so it does not contaminate the acceptance-rate measurement (section 8.2).
- **Staggered start (Recommendation):** onboard students in cohorts of about 25 over the first 4 weeks, so a problem found in cohort 1 can be fixed before cohort 4. Keep the first cohort small enough that the owner can personally help.

### 6.3 Institution admin

One named admin at the partner, created by invitation only, with MFA, who approves mentor affiliation and sees aggregate dashboards. The admin cannot see individual student data without consent (auth document section 11).

## 7. Pilot run

### 7.1 Suggested timeline (Proposed, 14 weeks as an example; set the real length yourself)

| Weeks | Focus | Activities |
|---|---|---|
| 0 | Launch preparation | Gate 2 passed; mentors onboarded; first student cohort invited |
| 1 to 4 | Staggered student onboarding, config frozen | Cohorts of about 25; daily check of requests and decisions; fix blockers only |
| 5 to 8 | Steady state | Weekly pulse; first outcomes reported; first audit sample; first confirmation reminders exercised |
| 9 to 12 | Outcome window | Focus on outcome reporting and confirmation; first dispute cases; mid-pilot review |
| 13 to 14 | Close-out | Final metrics; exit interviews; letters of intent conversations; pilot report |

### 7.2 Weekly rhythm (Agile, ADR-017)

1. **Metrics review** (30 minutes): the dashboard in section 8.
2. **Support and moderation review:** open reports, disputes, and break-glass entries.
3. **Pulse:** a short weekly pulse to students and mentors (3 to 5 questions, section 11).
4. **Planning:** choose the next iteration's work from the findings. Changes to Approved documents get one entry in `docs/decision-log.md`.
5. **Demo and retrospective** of what shipped.

### 7.3 Support and operations

- Support inbox with a stated response target (**Proposed default: within 1 business day**).
- On-call is honest: the owner, business hours, unless coverage is added (research report Doc 15).
- Severity levels follow `docs/security-requirements.md` section 5.13.
- Communicate status to the partner admin for any SEV-1 or SEV-2 incident.

### 7.4 Change freeze rule

For the first 4 weeks, matching weights, reputation thresholds, reminder timings, and the cooling period stay fixed so that results are comparable. Bug fixes and usability fixes are allowed. After week 4, configuration changes are allowed only through the versioned admin configuration, each with a decision-log entry. Any change that affects reputation is marked in the metrics so that before-and-after data stays separate.

### 7.5 Environment and data handling

- **Production** runs real users. **Staging** contains **no real user data** (SEC-INF-5).
- Evidence files are deleted after the retention window (**Proposed default: 90 days after the outcome is counted**) and a hash is kept.
- The partner receives **aggregates only**. Student-level data goes to the partner only with explicit, revocable consent.
- No real user data goes to free-tier or possibly retained AI models (N12).

## 8. Metrics

Full definitions, windows, and denominators belong in `kpis-and-metrics.md` (Planned, not yet created). The table below is the pilot subset.

### 8.1 README KPIs

| KPI | Definition (README 4.5) | Pilot target | Label |
|---|---|---|---|
| Match acceptance rate | Accepted requests ÷ requests sent to mentors, per period | Greater than 40% | **Plan target** |
| Response-time KPI | Share of requests decided within 48 hours (report the mean and median beside it) | Plan target: a decision within 48 hours | **Plan target** |
| Outcome conversion rate | Counted outcomes ÷ active mentees over 90 days | 15% | **Proposed default** |
| Mentor retention | Mentors active this quarter ÷ mentors active last quarter | 80% quarterly | **Proposed default** |
| Outcome reporting rate | Mentorships with an outcome reported ÷ completed mentorships | Not set | Set before the pilot |

Notes:
- "Verified" here means **counted** after the cooling period. Report both `confirmed` and `counted` counts so the delay is visible.
- "Active mentee" is not yet defined (**Open decision**). A proposed definition: a student with at least one accepted request and at least one thread message or held session in the period.
- Report the **median** response time next to the mean, because a few very late decisions distort a mean.
- Mentor retention over a pilot shorter than a quarter is measured **monthly** as an approximation, and labelled so.
- Revenue per institution and institutional renewal are **not** measurable in a free pilot. Their replacement is the letters-of-intent count.

### 8.2 Leading indicators (**Proposed**)

| Indicator | Why it matters |
|---|---|
| Mentor funnel: invited, verified, profile complete, first decision | Tests assumption A2 |
| Student activation: first request within 48 hours of onboarding | README proposed rule |
| Request expiry rate and redirect rate | Shows ghosting and fit problems |
| Share of decisions within 48 hours | A3 detail, beyond the mean |
| Share of outcomes confirmed within 7 days | A4 |
| Reminder effectiveness (confirmations after day 3 and day 5 reminders) | Tests the reminder design |
| Outcomes by type, evidence tier, and contribution level | Tests honesty and attribution design |
| Audit sample findings (confirmed outcomes found false or unsupported) | A5 |
| Dispute count and time to resolution | Operational load on trust and safety |
| Share of sessions held with both-sided confirmation | A12 |
| Mobile share of sessions and slow-connection failures | A8 |
| Weekly pulse scores | User sentiment |
| Support tickets per week by category | Operational load |

Manual concierge suggestions are logged separately so the acceptance rate for **rule-based** suggestions can be reported on its own.

### 8.3 Honest reporting rules

- Report counts with the denominator. With 100 students, percentages move a lot with a few people.
- Show confidence-tier language, not false precision, when a number is small.
- Do not claim that outcomes were **caused** by connect. The pilot shows association and mentor-attested contribution, not proof of causation.
- Downloads, impressions, and follower counts are **not** KPIs (README 4.5).

## 9. Exit criteria and kill or pivot criteria

The README requires a plan for failure. The values below are **Proposed defaults** and need the owner's approval **before launch**, so decisions are not rationalized afterward.

| Signal | Proposed trigger | Action |
|---|---|---|
| Mentor recruitment | Fewer than 15 verified mentors after 4 weeks of recruitment | Extend recruitment with a second source or a different partner; do not start student onboarding at full scale |
| Student participation | Fewer than 50 active students after week 6 | Review onboarding and partner promotion; consider a smaller cohort with deeper support |
| Response time | Median decision time above 96 hours for 3 consecutive weeks | Review mentor load and capacity caps; test shorter expiry and reminder timing |
| Acceptance | Rule-based acceptance below 20% after week 6 | Review matching inputs and request quality; test the AI drafting assist; interview rejecting mentors |
| Outcome confirmation | Fewer than half of reported outcomes confirmed within 14 days | Review reminder design, mentor workload, and the confirmation experience |
| Integrity | Audit sample finds a material share of confirmed outcomes unsupported | Pause outcome counting for affected cases, strengthen evidence tiers, review before continuing |
| Safety | A serious harassment or safeguarding incident | Follow the incident process; suspend as needed; review before continuing |
| Security or privacy | A SEV-1 incident | Follow the incident process and notify the partner and, where required, the authority (counsel to advise) |
| Partner | The partner withdraws or stops participating | Move to the alternate partner profile if one exists |

"Material share" and the other thresholds are **Open decisions** until set.

## 10. Gate 3: continue, adjust, or stop

After the pilot, compare results with the README targets and write a pilot report.

| Result | Decision |
|---|---|
| **Plan targets met** (acceptance above 40%, response under 48 hours) and outcomes are being confirmed, and audits support their honesty | Proceed to Phase 2: measurement and validation, structured community, full institution reports; seek letters of intent from 3 to 5 institutions |
| **Targets partly met**, with clear causes | Run a second, adjusted pilot cohort after fixes |
| **Targets not met**, with no clear cause or no willing buyers | Stop or pivot the model; use the research log to document why |

The pilot report must include: counts and denominators, KPI results against targets, audit findings, dispute and moderation summary, user feedback themes, cost and effort actually spent, what assumptions changed, and recommended next steps.

## 11. Feedback loops

| Loop | Frequency | Content |
|---|---|---|
| Weekly pulse (students) | Weekly | 3 to 5 questions: was your request answered, was it useful, what blocked you |
| Weekly pulse (mentors) | Weekly | Workload, clarity of requests, confirmation experience, harassment or safety concerns |
| Partner check-in | Every 2 weeks | Aggregates, issues, partner needs |
| Mid-pilot review | Around week 8 | Compare early metrics with targets; adjust within the rules in section 7.4 |
| Exit interviews | Final 2 weeks | 5 students, 5 mentors, the partner admin |
| Private session feedback | Per session (Could) | Quality operations only, never shown as stars |

## 12. Ethics and safeguarding

- Adults only (18+). No minors in the pilot until parental-consent flows and counsel exist (N1).
- Informed consent at sign-up in plain English, with separate, revocable consent for sharing with the institution.
- Mentors are volunteers, not employees, with a volunteer agreement drafted for counsel.
- Harassment and exploitation rules, an abuse-report button on every mentorship, and a moderation queue run by the owner (a named reviewer is **Deferred**, N7).
- No mentor identity documents are collected (ADR-010).
- Outcome claims are described honestly: the badge means a mentor countersigned (and where stated, that evidence or a third party supported it); it does **not** claim independent audit of every outcome (README 12.3).
- A mentor who decides within 48 hours is not penalized for declining; an ignored request expires and counts as a non-response.
- Participants can leave at any time and request export or deletion of their data.
- Pilot findings are shared with the partner as aggregates, never as a ranking of students.

## 13. Roles and responsibilities

| Role | Person | Responsibilities |
|---|---|---|
| Owner and CTO | **[name]** | Product, engineering, pilot operations, support, approvals |
| Partner coordinator | **[to be named by the partner]** | Promotion to students, mentor introductions, institution admin account |
| Trust and safety reviewer | **[Deferred (owner decision)]**; the owner covers disputes in the pilot | Disputes, audits, and moderation during the pilot |
| Counsel | **[Bangladeshi counsel, to be engaged]** | Legal and privacy review, data-residency advice |
| Institution admin (partner) | **[to be named]** | Affiliation attestation and dashboard access |

## 14. Budget and effort

Cost components are listed without invented numbers. The owner sets the cap (**Open decision**):

hosting (PaaS and managed PostgreSQL), object storage, transactional email, error tracking, an AI provider (only if assist ships), domain and brand clearance, counsel fees, the optional external penetration test, partner and mentor recognition materials (certificates), and the owner's own time.

Effort is tracked per iteration from the first documents onward. Dates are set only after timing the first few iterations (research report 9.3).

## 15. Risks specific to the pilot

| Risk | Likelihood and impact | Mitigation |
|---|---|---|
| No partner, or a partner that stalls | High, high | Start partner conversations now; allow a bootcamp or department as a smaller first partner |
| Too few mentors, or mentors who do not confirm outcomes | Medium to high, high | Alumni office recruitment, small bounded commitments, recognition, reminders; test A2 and A4 early |
| Outcome gaming | Medium, very high | Evidence tiers, audits at a high sampling rate while volume is small, platform-owned disputes |
| Solo-Owner overload | High, high | Phase 1 is trimmed; staggered student cohorts; support and on-call limits stated honestly |
| Poor connectivity for students | Medium, medium | Mobile-first design, autosave, email fallback |
| Data-law misreading | Medium, high | 18+ only, no government IDs, counsel review before real users |
| Pilot too short to measure outcomes | Medium, medium | 12 to 16 weeks; report leading indicators; label conversion as preliminary |
| Institutions will not pay | Medium to high, high | Price-hypothesis interviews and letters of intent as pilot goals |

## 16. Letters of intent (Plan target: 3 to 5 institutions)

- Start conversations in the final weeks of the pilot with the aggregate results.
- Show evidence, not claims: the dashboard, the audit findings, and the reporting definitions.
- Test the three price hypotheses from the business model document (per active student, per active mentor, flat institution fee) and record the buyer's budget owner.
- Count letters of intent as signed documents only. Verbal interest is recorded separately.

## 17. Open decisions and questions for the owner

| # | Decision | Status / default |
|---|---|---|
| PIL-O1 | Partner type: university versus bootcamp or department (N5) | **Open**, not a Gate 0 blocker |
| PIL-O2 | Pilot duration | 12 to 16 weeks (Proposed default) |
| PIL-O3 | Definition of "active mentee" | Accepted request plus activity in the period (Proposed default) |
| PIL-O4 | Kill and pivot thresholds in section 9 | Confirm before launch |
| PIL-O5 | Staggered student cohorts of about 25 | Yes (Proposed default) |
| PIL-O6 | Trust and safety reviewer (N7) | **Deferred (owner decision)** until after the pilot |
| PIL-O7 | Mentor recognition: certificate or badge design | **Decided:** institution-signed certificate |
| PIL-O8 | Whether an AI drafting assist ships in the pilot | **Decided:** no AI in the pilot |
| PIL-O9 | Budget cap | Owner sets; Open |
| PIL-O10 | Support response target | 1 business day (Proposed default) |

## 18. Acceptance checklist

- [ ] The cohort (1 partner, 30 mentors, 100 students) and the targets (above 40% acceptance, under 48 hours response) match the README and carry the **Plan target** label.
- [ ] Every KPI has a definition, a denominator, and a measurement window in `kpis-and-metrics.md` (Planned, not yet created).
- [ ] Exit and kill criteria are approved before launch.
- [ ] The pilot duration is long enough to observe the 90-day outcome conversion KPI, or the KPI is labelled preliminary.
- [ ] Gate 2 items each have an owner and a recorded status, including a performed backup restore and counsel review.
- [ ] Ethics and safeguarding section matches the legal checklist and the privacy document.
- [ ] No real university, mentor, customer, or statistic is invented. Placeholders are marked.
- [ ] Every assumption tested in section 2 appears in `docs/assumptions-and-open-questions.md`.
