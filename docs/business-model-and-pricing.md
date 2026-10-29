---
title: Business Model and Pricing
status: Draft
owner: Owner / CTO
date: 2026-10-28
version: 0.1
sources: [README.md (sections 2, 4, 12, 18), connect-research-report.md v1.1 (sections 3, 5.8, 6, 7 doc 6, 10)]
---

# Business Model and Pricing

> **One sentence.** connect earns money from the parties that need *credible evidence* of mentorship outcomes (institutions first, employers and sponsors later), never from selling reputation, never from student fees, and never from user data.

| | |
|---|---|
| **Document role** | Defines who pays, for what, when, and which pricing questions are still open. Feeds `kpis-and-metrics.md` (**Planned, not yet created**), `cost-model-and-infrastructure-budget.md` (**Planned, not yet created**), `payments-and-billing-spec.md` (**Planned, not yet created**), and `pilot-plan.md`. |
| **Authority** | Subordinate to [README.md](../README.md). If this file and the README disagree, resolve it explicitly and update both. |
| **Status of numbers** | **No price in this document is validated.** The only dollar figures are the README's **Illustrative** example in section 5. |

---

## 0. How to read this document

### 0.1 Truth labels

Every number, rule, or claim carries one label. Labels extend the README's list with the two labels used by the research report.

| Label | Meaning |
|---|---|
| **Plan target** | A value from the owner's plan. A goal, not a result. |
| **Owner decision** | A decision the owner has made and recorded. Binding until the owner changes it. |
| **Recommendation** | A reasoned proposal adopted as the draft default. Not policy until approved. |
| **Proposed default** | An editable starting value, not validated. |
| **Illustrative** | Fictional sample data used to explain a concept. Never market data. |
| **Open decision** | Not decided. Must not be treated as policy. |
| **Verified [S#]** | Confirmed in a source listed in research report section 12. Secondary or vendor sources are noted. |
| **Unverified** | Could not be confirmed. Do not treat as fact. |

### 0.2 Rules inherited from the README

- Never invent university names, mentor identities, customer numbers, prices, or validated statistics.
- Never describe a feature as built if it is only designed.
- Platform revenue and money processed are **different numbers**. Always label which one is shown.

---

## 1. The business model on one page

| Question | Answer | Label |
|---|---|---|
| **What is sold?** | Credible, independently audited evidence of mentorship outcomes, plus the tooling to run a structured alumni mentorship program. | README 2, 4 |
| **Who pays first?** | Institutions: universities, bootcamps, training institutes. | **Plan target** (primary stream) |
| **Who never pays?** | Students (free). Mentors are volunteers in the pilot. | **Recommendation** |
| **Who may pay later?** | Employers (analytics), industry sponsors (skill programs), participants of paid office hours. | Proposed, Phase 3 or later |
| **What can money never buy?** | Reputation, badges, audit results, dispute outcomes, or removal of an unfavorable outcome. | **Recommendation** (see section 8) |
| **When does money start?** | Not in the pilot. The pilot is free under a written MoU. Price discovery happens during and after the pilot. | **Recommendation** |
| **How do first invoices work?** | Bank transfer and invoice. No payment code exists in Phase 1 or 2. | **Recommendation** |
| **Which gateways?** | SSLCommerz (Bangladesh entity, BDT) and Stripe (foreign entity). Built in Phase 3 behind one interface. | **Owner decision** (15 Oct 2026) |

**Why institutions pay first.** An institution has a recurring need that a free tool does not solve: showing its stakeholders (leadership, regulators, accreditors, donors, prospective students) that its career support produces outcomes. A confirmed, audited outcome is the one thing connect produces that a chat tool cannot. This is a **hypothesis (A7)** until buyer interviews and letters of intent test it.

---

## 2. Customers, users, and value

### 2.1 Who uses, who pays, who benefits

| Stakeholder | Uses connect | Pays | Benefits | Gives |
|---|---|---|---|---|
| **Student** | Yes (Phase 1) | No | Clarity, mentor access, visible progress | Goals, time, honest outcome reports |
| **Mentor** | Yes (Phase 1) | No. Volunteer in pilot | Structured authority, controlled workload, verified impact profile, recognition | Experience, guidance, outcome confirmation |
| **Institution** | Yes (admin dashboard, Phase 1b basic) | **Yes**, primary stream | Evidence of career outcomes, alumni engagement, impact reporting | Subscription revenue, alumni mentors, affiliation attestation |
| **Employer** | Phase 3 | Yes, later | Talent signal backed by verified progress | Opportunities, analytics revenue |
| **Sponsor** | Phase 3 or later | Yes, later | Visible sponsored development programs | Program funding |
| **Platform Admin (connect staff)** | Yes | n/a | Control of quality and trust | Independent audit and dispute decisions |

### 2.2 Value proposition and its limits

| Stakeholder | Value we can credibly claim | What we do **not** promise |
|---|---|---|
| Institution | Confirmed outcomes by domain, funnel from request to outcome, mentor participation, exportable reports, **independent** audit (the institution does not judge its own outcomes) | That outcomes were caused by connect. That every outcome was independently audited. National unemployment figures [S17] are context, not proof of effect. |
| Mentor | A manageable workload (capacity cap), structured requests, a verified-impact profile, recognition | Payment in the pilot. Success for every mentee. |
| Student | A path from "I need guidance" to a mentor decision, with progress that can be shown | A response within a guaranteed time (48 hours is a **Plan target**, not a guarantee). A job or admission. |
| Employer (later) | A talent signal built on verified progress and mentor-endorsed signals | A global ranking of students. AI-ranked candidates. |

Mentoring effects are positive but modest on average [S9]. Institution-facing copy must not promise outcomes the evidence cannot support.

### 2.3 The institutional buyer (hypotheses to test)

The buyer is a person inside the institution, not "the university". Candidates, all **Unverified** until interviews:

| Candidate buyer | Likely motive | Likely objection |
|---|---|---|
| Career center or placement cell lead | Placement evidence, program reporting | Existing process, limited budget |
| Alumni relations office | Alumni engagement metrics | Alumni data ownership, privacy |
| Program head or department chair (bootcamp or single department) | Outcome proof for enrollment | Small budget, fast decisions |
| Bootcamp Owner or operations lead | Placement claims backed by evidence | Price sensitivity |

**Pilot partner profile is an Open decision (N5).** A bootcamp or a single department may give faster feedback loops and clearer outcomes than a whole university (**Hypothesis**). Private universities depend heavily on tuition [S20], which may limit software budgets. Either way, price must be tested early, not assumed.

### 2.4 Competitive position

| Fact | Source | Implication |
|---|---|---|
| PeopleGrove combines mentoring and alumni management for higher education; pricing is given on request; reviewers note cost can be high for smaller institutions. | **Verified [S12]** (vendor/aggregator, medium confidence) | There is no public price benchmark. |
| Graduway (Gravyty) sells alumni engagement plus mentoring on custom subscriptions; the vendor claims 2,750+ institutions across the Gravyty ecosystem. | **Verified [S12]** (vendor claim) | The market is not vacant. Treat the number as a vendor claim. |

**Differentiators (hypotheses to test, not facts):** confirmed outcomes, field-specific reputation, independent audit by the platform, and fit and price point for emerging markets. A larger incumbent could add outcome tracking; the durable moat is the **audit and verification policy**, not the feature list.

---

## 3. Revenue model

> **Phase-3-only content notice.** Everything about paid office hours (Tier 2, section 3.3) and payment mechanics is **Phase 3 only** and **not part of the MVP or pilot**. Payments are added **last** (owner decision, 2026-10-29). `mentorships.is_paid` is reserved and always `false`. Sections 5, 7 and 11 about payments and entities are design notes for that later phase.

### 3.1 Tiers and status

| Tier | Payer | What is sold | Earliest phase | Status | Blockers |
|---|---|---|---|---|---|
| **1. Institutional subscriptions** | Universities, bootcamps, training institutes | Dashboards, outcome evidence reports, program administration, mentor onboarding support | Free pilot in Phase 1; paid from Phase 2 or 3 | **Primary stream** (Plan target) | Price and metric are **Open decisions**. First paid contract needs the entity decision (OD-5). |
| **2. Paid mentor office hours** | Participants booking paid sessions | Direct access to verified mentors | Phase 3 at the earliest | Revenue split is an **Open decision** | Entities, payouts, FX rules (**Unverified**), paid-relationship verification rule (OD-4) |
| **3. Employer analytics** | Employers | Structured talent and outcome insights | Phase 3 | Proposed | Needs consented student data, no global ranking, no AI ranking |
| **4. Sponsored skill programs** | Industry sponsors | Sponsored development and mentorship programs | Phase 3 or later | Proposed | Sponsor policy (OD-11) |

### 3.2 Tier 1: institutional subscriptions

**Draft package contents (Recommendation):**

- Institution dashboard: verified alumni and mentor participation, requests, match acceptance, first-response time, outcome reporting and confirmation rates, counted outcomes by domain, cohort progress, outcome funnel (README 11.2).
- Exports: CSV in Phase 1 (basic) and PDF in Phase 2 (full).
- Mentor program administration: affiliation attestation queue, mentor approval for the institution's alumni.
- Onboarding support for the first mentor cohort.

**Contract shape (Recommendation):**

1. **MoU** for the pilot: data-use terms, verification roles, no fee. Required before pilot (Gate 2 in the research report).
2. **Letter of intent** after the pilot (Plan target: 3 to 5 institutions).
3. **Paid agreement**: price, metric, term, renewal. All **Open decisions**.

**What the institution cannot buy or do** is defined in section 8. In short: it attests affiliation, and it cannot edit, confirm, or arbitrate outcomes.

### 3.3 Tier 2: paid office hours (**Phase 3 only**; blocked, design constraints only)

**Not in the MVP or pilot.** Nothing here is promised to mentors or participants, and no payment code is written before Phase 3.
`mentorships.is_paid` stays `false` for every mentorship until this phase starts.

- **Blocked by** the legal-entity decision, payout rules, and foreign-exchange questions, not by engineering [S8][S21].
- **Mentor payouts are not promised.** Paying Bangladeshi mentors from a foreign entity raises licensing and foreign-exchange questions that are **Unverified**.
- **Simpler alternative:** sell institutional subscriptions only and skip marketplace payouts. This is far simpler legally (**Recommendation**).
- **Design tension to resolve (OD-4):** the draft conflict-of-interest rule (N9) bars a mentor from confirming outcomes for "paying relationships". A student who pays a mentor for office hours and later reports an outcome creates exactly that relationship. Options:

| Option | Effect | Assessment |
|---|---|---|
| A. Outcomes from paid mentorships are ineligible for reputation | Removes the incentive entirely | Simple, but undermines paid mentors' ability to build reputation |
| B. Allowed, but require evidence Tier 1 or higher, raise audit sampling, and flag `is_paid` on the mentorship | Keeps incentives visible and checked | **Recommended starting point** |
| C. Treat as normal | No extra control | Not recommended: mentors gain money and reputation from the same relationship |

### 3.4 Tier 3: employer analytics (Phase 3)

Allowed: opportunities, mentors available for office hours, candidates with verified progress and consent, domain and skill filters, mentor-endorsed signals (README 11.3).

Not allowed: a global student ranking, an AI-generated candidate score, or student-level data without explicit consent and a stated purpose. An AI ranking for employers would move connect toward the EU's education and employment high-risk category (obligations from 2 December 2027) [S14] and contradicts the README principle "not a global student ranking".

### 3.5 Tier 4: sponsored skill programs

Sponsors fund structured programs. Sponsored programs are labeled as sponsored, sponsors receive aggregates only, and sponsorship never affects mentor reputation, matching order, or verification. Detailed policy is **OD-11**.

### 3.6 Student pricing

**Students are free (owner decision, 2026-10-29).** connect never charges to verify an outcome.

### 3.7 Mentor compensation

**Volunteer in the pilot (Recommendation)**, with recognition: a verified-impact profile and an institution-signed certificate or badge. Stipends or revenue share are revisited after pilot data (README open decision #1, **Open decision**, needed before pilot recruitment).

### 3.8 Monetization the business refuses

From README 4.2, restated as binding rules: no dependence on banner advertising, no selling of user data, no engagement traps built around gamification.

---

## 4. Pricing hypotheses (no numbers until buyer interviews)

### 4.1 Three price-metric hypotheses

| Metric | Definition | Pros | Risks and incentive effects | Evidence needed |
|---|---|---|---|---|
| **H1: per active student** | Fee scales with students active in a period | Tracks value delivered; familiar to buyers of alumni platforms | Penalizes growth. "Active" is gameable and needs a precise definition in `kpis-and-metrics.md` (**Planned, not yet created**). Budget unpredictability for the buyer. | Buyers can forecast cohort size and accept variable bills |
| **H2: per active mentor** | Fee scales with verified, active mentors | Aligns with supply, which is the scarcest side | Could push connect to recruit mentors for revenue rather than quality. Pricing a verified mentor badge dangerously close to selling reputation. | Buyers see mentors, not students, as the scarce asset |
| **H3: flat institution fee** | One fee per institution, optionally tiered by size band | Simplest, predictable, fits bank-transfer invoicing | May underprice large institutions and overprice small ones | Budget owners prefer one predictable line item |

**Hard rule (Recommendation): never price per counted outcome.** Charging per counted outcome would give connect itself a financial incentive to inflate confirmations. This violates the neutrality firewall (BR-05).

### 4.2 Price discovery plan

| Step | Instrument | Output |
|---|---|---|
| 1 | Buyer interviews (Proposed default: at least 5 budget-owner conversations, including the 3 career or alumni staff in the personas interview plan) | Current spend on alumni, mentoring, or placement tools; budget owner; approval path |
| 2 | Show the three metrics (H1 to H3) without numbers; ask which fits their budget process | Preferred metric per buyer type |
| 3 | Ask for a price band the buyer would accept, not a single number | Range per buyer type |
| 4 | Pilot MoU includes a clause scheduling a pricing conversation at pilot end | Commitment to a decision meeting |
| 5 | Letters of intent with a non-binding price band (Plan target: 3 to 5 institutions after pilot) | Willingness-to-pay evidence |

Van Westendorp-style price sensitivity questions are optional, but with a handful of buyers they are weak evidence. Prefer the letter of intent as the real signal.

### 4.3 Packaging dimensions to test

Numbers stay **Open**. Dimensions to vary: dashboard depth (basic vs full), export formats (CSV vs PDF), number of mentor seats, onboarding support, audit report frequency, SSO (SAML) availability, and number of cohorts. A "founding partner" arrangement for the first paying institutions is possible, but its terms are an **Open decision**.

### 4.4 Pilot-to-paid conversion

The pilot is free. Conversion path: pilot report at Gate 3, then letter of intent, then paid agreement. No institution is invoiced before the first paid agreement and the entity decision (OD-5).

---

## 5. Revenue arithmetic

### 5.1 Definitions

| Term | Definition |
|---|---|
| **Platform revenue** | The share of money the platform keeps (README glossary). |
| **Money processed** | All payments passing through the platform, including the mentor's share (README glossary). |
| **MRR** | Monthly recurring revenue from active institutional subscriptions. |
| **ARR (annualized)** | Monthly figure multiplied by 12, as in the README. |
| **Revenue per institution** | MRR divided by active institutions. **Target not set.** |

### 5.2 Symbolic model (inputs are Open decisions)

```
subscription_revenue_month = sum over institutions of fee(institution)          # fee metric is OD-1
office_hour_platform_revenue_month = sessions_sold x price_per_session x platform_share   # Phase 3, OD-4
office_hour_money_processed_month  = sessions_sold x price_per_session
platform_revenue_month = subscription_revenue_month + office_hour_platform_revenue_month + employer_analytics + sponsorships
ARR = platform_revenue_month x 12
```

Revenue is reported **per currency and per merchant entity**. BDT (SSLCommerz, Bangladesh entity) and USD (Stripe, foreign entity) are never summed without stating the exchange rate and date.

### 5.3 Illustrative example from the README (not market data)

> This is a **teaching example**, not a price benchmark and not a forecast. The $5,000 figure has no market validation.

| Line | Calculation | Result |
|---|---|---|
| Institutional subscriptions | 3 institutions x $5,000 per month | $15,000 |
| Office-hour platform revenue | 20 sessions x $50 x 30% platform share | $300 |
| **Total platform revenue per month** | | **$15,300** |
| Office-hour money processed (not revenue) | 20 sessions x $50 | $1,000 |
| Annualized | $15,300 x 12 | $183,600 |

The money-processed row exists to show that **$1,000 processed is not $1,000 earned**. Every investor-facing material must label which number is shown.

---

## 6. Cost structure and unit economics

No monthly cost figures appear here. The owner sets a monthly cost cap (**Open decision**, OD-9), which `system-architecture.md` and `non-functional-requirements.md` (NFR-CST-01) reference.

| Component | Type | Phase | Notes |
|---|---|---|---|
| Containerized PaaS hosting | Mostly fixed | 1 | Singapore or Mumbai region, chosen by a one-day test; AWS path later |
| Managed PostgreSQL with point-in-time recovery | Fixed, grows with data | 1 | |
| Object storage for evidence | Variable | 1 | Evidence files deleted after the retention window |
| Transactional email | Variable | 1 | Primary notification channel |
| LLM provider usage | Variable | 1b | Per-user and global cost caps required (NFR-AI) |
| Error tracking and uptime monitoring | Fixed | 1 | Sentry and an uptime check |
| Domain, CDN | Fixed | 1 | |
| Legal counsel, accounting, tax | Fixed, lumpy | Before pilot | Bangladeshi counsel review before real users; entity advice during pilot |
| Trust-and-safety reviewer (part-time) | Fixed | 1 | Named reviewer is **Open (N7)** |
| Mentor recognition (certificates) | Variable | 1 | Institution-signed |
| Payment gateway fees | Variable | 3 | SSLCommerz and Stripe fee schedules **Unverified** |
| Support tooling | Fixed | 1 | |

**Unit-economics skeleton (formulas only):**

```
contribution_per_institution_month = fee(institution) - variable_cost_per_institution_month
variable_cost_per_institution_month = email + storage + llm + review_hours x reviewer_rate + support_hours x support_rate
gross_margin = (platform_revenue - variable_costs) / platform_revenue
```

Audit and dispute review time is the cost most likely to be underestimated. Disputes escalate when mentors do not respond by day 7, so mentor responsiveness directly drives review workload. This ties business viability to the KPI "mentor response".

---

## 7. Payments and legal entities

### 7.1 Decision recorded

**Owner decision (15 October 2026):** keep both SSLCommerz and Stripe. This document treats that as settled and designs around it.

### 7.2 What the research shows

| Fact | Source | Confidence |
|---|---|---|
| Stripe does not support Bangladesh-registered businesses; PayPal is unavailable to Bangladesh-based accounts; Wise limits Bangladeshi residents | **Verified [S8]** | Commercial sources; confirm in each provider's current terms |
| Local aggregators such as SSLCommerz require a Bangladesh-incorporated entity and settle in BDT | **Verified [S8]** | Same |
| Stripe Atlas forms a Delaware C corporation or LLC, obtains an EIN, helps open a US bank account; approval for payments is **not guaranteed**; a 2026 guide reports a one-time $500 fee | **Verified [S21]** | Fee is from a third-party guide; verify on Stripe's site |
| Foreign incorporation can be treated as a cross-border investment by regulators (Indian Owners were warned) | **Verified [S21]** for India | **Unverified** for Bangladesh. A Bangladeshi lawyer and accountant must answer ownership and revenue-repatriation rules before incorporating abroad. |

### 7.3 Recommended structure (Recommendation, needs counsel)

| Payer | Gateway | Merchant entity | Currency | Typical use |
|---|---|---|---|---|
| Bangladeshi institution or individual | SSLCommerz | Bangladesh entity | BDT | Institution subscriptions, local paid features |
| International institution or individual | Stripe | Foreign entity (for example Delaware) | USD and others | Global institutions, diaspora, paid features |
| Large institutional deals (either side) | Bank transfer and invoice | Whichever entity contracts | Contract currency | **Default for institutions in the pilot and Phase 2** |

So the dual-gateway decision implies a **dual-entity structure**. That is a legal and tax decision (OD-5), not a coding task.

### 7.4 Engineering rules (apply when payments are built, Phase 3)

1. One `PaymentProvider` interface with two adapters (`SslcommerzProvider`, `StripeProvider`). Domain code never imports a gateway SDK.
2. **Hosted checkout only.** Card and wallet details never touch connect servers, keeping PCI scope minimal.
3. Gateway webhooks are verified, idempotent, and written through the outbox. Money state is an append-only ledger **separate from the reputation ledger**.
4. **Payments never influence reputation or verification** (BR-04, BR-09).
5. Routing: payer country and currency choose the gateway; the gateway fixes the contracting entity. Reconciliation and tax reporting are documented per entity.
6. Refund and dispute policy is written **before launch**. Stripe chargebacks and SSLCommerz gateway disputes feed a support runbook.

### 7.5 Timing and gates

| Activity | When |
|---|---|
| Start counsel and accountant conversation on entities | During the pilot (**Recommendation**) |
| Entity decision (OD-5) | **Before the first invoice or paid agreement**, not before Phase 3 code |
| Payment code | Phase 3 only |
| Mentor payouts | Not promised. Pilot mentors are volunteers. |

**Still open:** entity structure and ownership with tax advice; whether to act as a marketplace taking a fee or sell subscriptions only; SSLCommerz onboarding documents and fees (**Unverified**); foreign-exchange rules for resident ownership of a foreign company (**Unverified**).

---

## 8. The neutrality firewall

These rules protect the product's only asset: credible evidence. Each rule is written to be testable in review.

| ID | Rule | How it is checked |
|---|---|---|
| **BR-01** | No payer can buy reputation, badges, audit outcomes, dispute outcomes, or removal of an unfavorable outcome. | Product review of every paid feature; no code path reads payment state in verification or reputation |
| **BR-02** | Institutions see **aggregates** by default. Student-level data requires explicit, revocable consent and a stated purpose. | Permission-matrix tests; consent records |
| **BR-03** | Institutions attest **affiliation only**. They cannot edit, confirm, or arbitrate outcomes or reputation. | Role permission tests (`auth-and-access-control.md`) |
| **BR-04** | Payment state is never an input to matching, discovery order, reputation, or verification. There is no pay-to-rank. | Matching spec review; unit tests on pure match function inputs |
| **BR-05** | The pricing metric never uses reputation or counted-outcome totals. | Pricing review |
| **BR-06** | Employers and sponsors see no student-level data without consent. No global student ranking. No AI-generated candidate ranking. | Employer portal spec review (Phase 3) |
| **BR-07** | No sale of user data. No banner-ad dependence. No engagement traps built around gamification. | Terms, privacy notice, product review |
| **BR-08** | Sponsored content and programs are labeled as sponsored. | UI review |
| **BR-09** | The money ledger and the reputation ledger are separate. No foreign key from reputation tables to payment tables. | Schema review; architecture dependency test (reputation module must not import billing) |
| **BR-10** | Outcomes from paid mentorships get stricter verification (section 3.3, OD-4). | Policy rule in `reputation-and-verification-policy.md` |

This firewall is also a selling point: independent audit is what makes the evidence worth paying for.

---

## 9. Business KPIs and gates

README KPIs (match acceptance above 40%, response time under 48 hours, and the others) are defined in `kpis-and-metrics.md` (**Planned, not yet created**). Business-specific signals tracked here:

| Signal | Definition | Target | Label |
|---|---|---|---|
| Buyer conversations completed | Interviews with budget owners | At least 5 | **Proposed default** |
| Letters of intent | Institutions signing a non-binding LOI after the pilot | 3 to 5 | **Plan target** |
| Budget owner identified | Named role with approval authority, per institution | Yes before LOI | Proposed |
| Institutional renewal | Renewed institutions divided by institutions up for renewal | 90% | **Proposed default** (README) |
| Revenue per institution | MRR divided by active institutions | Not set | Open |
| Pilot-to-paid conversion | Pilot institutions that sign a paid agreement | Not set | Open |

**Gate 3 (continue or stop)** compares pilot KPIs and LOI count with these targets. **Kill or pivot thresholds** (for example, fewer than X letters of intent by a stated date) must be set **before** the pilot launches and recorded in `assumptions-and-open-questions.md`. Their numbers are **Open**.

---

## 10. Business risks

Likelihood and impact ratings are **Proposed**. The full register lives in `risk-register.md` (**Planned, not yet created**).

| Risk | Likelihood / impact | Mitigation |
|---|---|---|
| Institutions will not pay (A7) | Medium to high / high | Price-hypothesis interviews and LOIs as pilot goals; consider a bootcamp or department as first partner |
| No pilot partner, or one that stalls (A1) | High / high | Start partner conversations now |
| Review workload from escalated outcomes overwhelms the reviewer | Medium / high | Mentor reminders at day 3 and 5; staffing decision (N7); audit sampling rate tuned |
| A paid feature erodes trust | Low to medium / very high | Neutrality firewall BR-01 to BR-10 |
| Payment setup delays revenue | Medium / medium | Invoice by bank transfer first; entity advice during pilot |
| Incumbent adds outcome tracking | Medium / medium | Compete on independent audit and policy, not features |
| Weak brand protection (the name "connect" is a very common word) | Medium / medium | Trademark and domain clearance before heavy branding (**Recommendation**, N8) |

---

## 11. Decision register for this document

### 11.1 Decided or adopted as draft default

| # | Decision | Status |
|---|---|---|
| D1 | SSLCommerz and Stripe both kept; built in Phase 3 behind `PaymentProvider` | **Owner decision** |
| D2 | Launch country is Bangladesh; 18+ only in the pilot | **Owner decision** (age); Recommendation (country) |
| D3 | Pilot is free under a written MoU | **Recommendation** |
| D4 | Students are free; no fee to verify outcomes | **Recommendation** |
| D5 | Mentors are volunteers in the pilot, with recognition | **Recommendation** |
| D6 | Institutions invoiced by bank transfer until payments exist | **Recommendation** |
| D7 | Platform trust-and-safety, not the institution, audits outcomes and decides disputes | **Recommendation**, accepted with the research report changes |

### 11.2 Open decisions

| ID | Decision | Needed by | Owner |
|---|---|---|---|
| OD-1 | Institutional price and metric (H1, H2, H3) | Before first institutional contract | Owner, after buyer interviews |
| OD-2 | Contract structure, term, and renewal | Before first paid agreement | Owner, counsel |
| OD-3 | Mentor compensation after the pilot | After pilot data | Owner |
| OD-4 | Office-hour economics, revenue split, refunds, no-shows, and the paid-relationship verification rule | Before paid office hours | Owner, counsel |
| OD-5 | Legal entities for SSLCommerz (Bangladesh) and Stripe (foreign), ownership and tax | Before first invoice | Owner, counsel, accountant |
| OD-6 | Marketplace fee model versus subscription-only | Before Phase 3 design | Owner |
| OD-7 | Employer analytics scope and consent design | Before Phase 3 | Owner, counsel |
| OD-8 | Pilot partner type (university, department, or bootcamp) | Before Phase 1 build | Owner |
| OD-9 | Monthly cost cap for pilot and growth | Before Phase 1 build | Owner |
| OD-10 | Currencies and invoicing details per entity | Before first invoice | Owner, accountant |
| OD-11 | Sponsor policy: eligibility, labeling, data access | Before sponsored programs | Owner |

---

## 12. Acceptance checklist

- [ ] Every number is labeled; no price appears except the README's **Illustrative** example.
- [ ] Platform revenue and money processed are always shown separately.
- [ ] Each neutrality rule BR-01 to BR-10 has a named check.
- [ ] Every README open decision about money (#1, #2, #3, #6) appears in section 11 or is resolved.
- [ ] The three price-metric hypotheses list the evidence each needs.
- [ ] Payment gateways, entities, and the no-payout-promise are stated and consistent with `system-architecture.md` (ADR-015).
- [ ] No claim about a competitor exceeds what [S12] supports.

## 13. Questions for the owner

1. **Pilot partner type (OD-8):** university, a single department, or a bootcamp? This changes price expectations and the interview list most.
2. **Mentor expectations:** are you comfortable promising only recognition (certificate and verified-impact profile) to pilot mentors, with no payment?
3. **Paid-relationship rule (OD-4):** do you prefer Option B in section 3.3 as the starting point, or do you want to defer paid office hours entirely and skip marketplace payouts?
4. **Cost cap (OD-9):** what monthly spend can you carry during the pilot?
5. **Entities (OD-5):** do you already have a Bangladesh entity, or does connect need to be incorporated first?
