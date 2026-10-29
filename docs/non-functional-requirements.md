---
title: Non-Functional Requirements
status: Draft
owner: Owner / CTO
date: 2026-10-28
version: 0.1
sources: [README.md (sections 11, 12, 13, 14), connect-research-report.md v1.1 (sections 4.6, 4.7, 5, 7 docs 8, 13, 15, 19)]
---

# Non-Functional Requirements

> **Purpose.** How well connect must work, not what it does: performance, availability, durability, integrity, security, privacy, accessibility, usability, maintainability, operability, and cost. Every target is sized for the **pilot** (1 university, 30 mentors, 100 students, a **Plan target**) with headroom, not for hypothetical scale.

| | |
|---|---|
| **Authority** | Subordinate to [README.md](../README.md) section 13. Where this file changes a README target, section 11 lists the deviation so both can be updated. |
| **Companion documents** | [functional-requirements.md](functional-requirements.md), [system-architecture.md](system-architecture.md), [data-model.md](data-model.md), `security-requirements.md`, `data-privacy-and-retention.md` |
| **Status of numbers** | **Every number is a Proposed default** unless labeled otherwise. None is validated. They exist so the team can test against something and change it with evidence. |

---

## 0. How to read this document

### 0.1 Labels

| Label | Meaning |
|---|---|
| **Plan target** | A goal from the owner's plan. |
| **Owner decision** | Decided and recorded. |
| **Proposed default** | Editable starting value, not validated. |
| **Recommendation** | Reasoned proposal adopted as the draft default. |
| **Illustrative** | Fictional data used to explain a calculation. |
| **Open decision** | Not decided. Not policy. |
| **Verified [S#]** | Confirmed in a source in research report section 12. |

### 0.2 Requirement format

`NFR-<AREA>-<NN>`. Each row has a **target**, a **label**, and a **verification** method. A requirement without a way to verify it is not accepted into this file.

### 0.3 Design stance

1. **Pilot-sized, scale-ready.** A tiny load is a given. Optimize for correctness, auditability, and speed of change. Keep boundaries clean so scaling is a redeployment, not a rewrite.
2. **Mobile conditions are the baseline.** About 89% of Bangladesh's internet subscriptions are mobile (120.84M of 135.94M, June 2026) and household smartphone ownership is 73.4% [S18]. Measurement differs across sources, so use ranges. Subscriptions also fell during late 2024 and much of 2025 amid unrest and mobile internet disruptions before recovering in 2026 [S18]. Slow networks and outages are normal conditions, not edge cases.
3. **One operator.** Availability, support, and on-call targets are honest targets for a single Owner working business hours, not contractual SLAs.
4. **Trust is the product.** Integrity of the outcome and reputation ledger outranks features and speed.

---

## 1. Capacity and scale (SCA)

| ID | Requirement | Target | Label | Verification |
|---|---|---|---|---|
| NFR-SCA-01 | Pilot capacity | 1 institution, 30 mentors, 100 students | **Plan target** | Seed and load test at this size |
| NFR-SCA-02 | Headroom without redesign | 10x pilot size: 300 mentors, 1,000 students | **Proposed default** | Load test at 10x data volume |
| NFR-SCA-03 | Sustained concurrency | 50 concurrent virtual users for 10 minutes within the performance targets | **Proposed default** | k6 or equivalent scripted core flows |

**Illustrative sizing (not forecast).** At pilot size there are 130 users. If 10% are active at peak, that is about 13 concurrent users. At 10x headroom, 1,300 users and about 130 concurrent users. A single small API instance plus a worker and a managed PostgreSQL is sufficient at this scale; the architecture avoids Redis and WebSocket for this reason (see `system-architecture.md`).

---

## 2. Performance (PERF)

| ID | Requirement | Target | Label | Verification |
|---|---|---|---|---|
| NFR-PERF-01 | API read latency | p95 under 500 ms for standard reads | README, **Proposed default** | Load test; production metrics |
| NFR-PERF-02 | API write latency | p95 under 1 s for writes | README, **Proposed default** | Load test; production metrics |
| NFR-PERF-03 | Slow-network usability | Core screens usable on the Lighthouse mobile throttling profile (about 1.6 Mbps down, 150 ms round trip) on a defined low-end Android device | **Proposed default** | Lighthouse and a manual run on the reference device; device model is **Open** |
| NFR-PERF-04 | Web vitals on the slow profile | Largest Contentful Paint at most 2.5 s, Interaction to Next Paint at most 200 ms, Cumulative Layout Shift at most 0.1 (aligned with the published "good" thresholds) | **Proposed default** | Lighthouse in CI on core routes |
| NFR-PERF-05 | Payload budget | Initial JavaScript per route at most 170 KB compressed; no image over 200 KB on core screens | **Proposed default** | Bundle-size check in CI |
| NFR-PERF-06 | Notification freshness (replaces the README's WebSocket target for Phase 1) | New thread message visible within 30 seconds on an open thread through refetch; email handed to the provider within 5 minutes at p95 | **Proposed default** | Synthetic test; queue timestamps |
| NFR-PERF-07 | Background job lateness | Timed jobs (reminders, expiry, cooling-period counting) run within 15 minutes of their due time | **Proposed default** | Job-lag metric and alert |
| NFR-PERF-08 | Dashboard freshness | Institution dashboards at most 1 hour stale | **Proposed default** | Refresh job timestamp shown on the dashboard |

---

## 3. Availability and resilience (AVL, REL)

| ID | Requirement | Target | Label | Verification |
|---|---|---|---|---|
| NFR-AVL-01 | Core API availability | 99.5% monthly, about 3.6 hours of allowed downtime in a 30-day month (720 h x 0.5%) | README, **Proposed default**. **A target, not an SLA**, with one operator | Uptime monitor |
| NFR-AVL-02 | Planned maintenance | Announced in advance; outside partner peak hours where possible | **Proposed default** | Runbook |
| NFR-REL-01 | Idempotent writes | Every retryable POST accepts an `Idempotency-Key`; a replay returns the original result and creates no duplicate | **Recommendation** | Contract test per endpoint |
| NFR-REL-02 | Form resilience | Drafts autosave; failed writes retry safely; user input survives connectivity loss | **Recommendation** | End-to-end test with network throttling and offline toggling |
| NFR-REL-03 | Email as fallback channel | Email delivery retries with backoff when the provider is down; users are told when delivery is delayed | **Recommendation** | Fault-injection test |
| NFR-REL-04 | Graceful degradation | LLM outage disables assist features only; object-storage outage blocks evidence upload only; email outage queues messages; none blocks core request or outcome flows | **Recommendation** | Fault-injection test per dependency |
| NFR-REL-05 | At-least-once jobs with idempotent handlers | Running any job twice produces the same final state | **Recommendation** | Test that executes every handler twice |
| NFR-REL-06 | Database outage behavior | App returns a clear maintenance response, never partial writes; the PWA shell and local drafts remain usable | **Recommendation** | Fault-injection test |

---

## 4. Durability and recovery (DUR)

| ID | Requirement | Target | Label | Verification |
|---|---|---|---|---|
| NFR-DUR-01 | Backups | Daily automated backups with **point-in-time recovery enabled** | README, **Proposed default** | Provider configuration check |
| NFR-DUR-02 | Recovery point objective (RPO) | At most 15 minutes of data loss | **Proposed default** | Restore drill measures actual |
| NFR-DUR-03 | Recovery time objective (RTO) | At most 4 hours within business hours | **Proposed default** | Restore drill measures actual |
| NFR-DUR-04 | Restore is proven | A restore is **actually performed** into a separate environment **before the pilot** and repeated at least quarterly | README, **Proposed default** | Dated drill record |
| NFR-DUR-05 | Secondary backup | A periodic logical dump stored with a different provider or account | **Recommendation** | Scheduled job and a restore test |
| NFR-DUR-06 | Evidence file durability | Private bucket with versioning disabled for deleted evidence once the retention window ends (deletion must be real) | **Recommendation** | Retention job test (see NFR-PRV-02) |

---

## 5. Integrity and auditability (INT)

The outcome and reputation ledgers are the product's credibility. These requirements are stricter than ordinary application data.

| ID | Requirement | Target | Label | Verification |
|---|---|---|---|---|
| NFR-INT-01 | Append-only ledgers | `outcome_event`, `verification_record`, `reputation_event`, `consent_record`, and `audit_log` accept inserts only. The application database role has no UPDATE or DELETE privilege on them, and a trigger rejects both | **Recommendation** (ADR-008) | Migration test that attempts UPDATE and DELETE and expects failure |
| NFR-INT-02 | Projection consistency | `outcome.status` always equals the result of replaying that outcome's events | **Recommendation** | Property test plus a nightly consistency job with an alert |
| NFR-INT-03 | Deterministic recompute | Recomputing a mentor's snapshot from the ledger yields the stored snapshot exactly, for a given configuration version | **Recommendation** | Unit test on pure functions; nightly check |
| NFR-INT-04 | Pure business rules | Match score, reputation points, state transitions, confidence tier, and suppression logic are pure functions in `packages/domain` with no I/O | **Recommendation** (ADR-012) | Dependency-rule check; unit tests |
| NFR-INT-05 | Configuration is versioned | Every weight, threshold, and timing lives in one configuration source; each ledger event records the version it used | **Recommendation** | Schema constraint; code review rule |
| NFR-INT-06 | Time | All timestamps stored in UTC (`timestamptz`); display defaults to Asia/Dhaka and is user-adjustable | **Recommendation** | Lint and tests |
| NFR-INT-07 | Concurrency safety | Capacity limits, state transitions, and counting cannot be violated by concurrent requests (transactions with locking or constraints, plus optimistic version checks) | **Recommendation** | Concurrency tests |

---

## 6. Security (SEC)

This is the engineering baseline, **not legal advice** and not the full threat model (`security-requirements.md`).

| ID | Requirement | Target | Label | Verification |
|---|---|---|---|---|
| NFR-SEC-01 | Standard | OWASP ASVS as the baseline. Aim for Level 2 on authentication, authorization, file handling, and the ledger; Level 1 elsewhere | README, **Proposed default** (level split) | ASVS checklist before pilot |
| NFR-SEC-02 | Passwords | Minimum length **12** (owner decision; `auth-and-access-control.md` section 4.3), check against known-breached passwords, no arbitrary composition rules, hashing with a modern memory-hard algorithm | **Proposed default** | Auth test suite |
| NFR-SEC-03 | Sessions | Access tokens about 15 minutes; rotating refresh tokens; idle session limit 7 days and absolute limit 30 days for users; shorter limits for admins; httpOnly, Secure cookies on web | **Proposed default** | Auth test suite |
| NFR-SEC-04 | MFA | Required for Mentors, Institution Admins, Platform Admins (TOTP first) | README, **Recommendation** | Auth test |
| NFR-SEC-05 | Authorization | Role-based plus object-level checks on every endpoint; permission-matrix tests | README | Generated tests |
| NFR-SEC-06 | Transport and storage encryption | TLS everywhere; encryption at rest for the database and object storage | **Recommendation** | Provider configuration check |
| NFR-SEC-07 | Secrets | Held in a secrets manager or platform secret store; never in the repository, logs, prompts, or agent memory | README | Secret scanning in CI |
| NFR-SEC-08 | Uploads | Allow only PDF, PNG, JPEG; at most 10 MB per file and 5 files per outcome; private storage; malware scan before release; signed URLs valid at most 5 minutes | **Proposed default** | Upload abuse tests |
| NFR-SEC-09 | Rate limiting | Per user and per IP on sign-up, sign-in, password reset, and request creation. Example starting limits: 10 sign-in attempts per minute per IP; 5 new requests per student per day | **Proposed default** | Automated tests |
| NFR-SEC-10 | Dependency and container scanning | In CI on every change; critical findings block release | README | CI gate |
| NFR-SEC-11 | Web hardening | Content Security Policy, CSRF protection for cookie-based sessions, secure headers, output encoding | **Recommendation** | Header scan; security tests |
| NFR-SEC-12 | Privileged access | Platform Admin production data access is break-glass, reasoned, and audited; no shared accounts | **Recommendation** | Audit-log test |
| NFR-SEC-13 | Logging hygiene | Logs contain request IDs and pseudonymous identifiers, never message bodies, evidence content, tokens, or secrets | **Recommendation** | Log-content test |
| NFR-SEC-14 | Breach response | A documented incident outline with severity levels. The regulator is notified when a breach is likely to cause significant damage [S1]; timing is **Open**, counsel to confirm | **Recommendation** | Tabletop exercise before pilot |

---

## 7. Privacy and compliance (PRV)

Bangladesh's Personal Data Protection Act, 2026 (Law 63 of 2026) was passed in April 2026 [S1]. The research used **secondary summaries only**; the primary text must be read by Bangladeshi counsel before real users are onboarded. **Data-localization status is Unverified** because sources conflict [S2][S3][S4].

| ID | Requirement | Target | Label | Verification |
|---|---|---|---|---|
| NFR-PRV-01 | Collect less | Never collect or store government ID numbers (NID, passport, driver's license, tax ID), payment card data, precise location, health, religion, political data, or the user's **date of birth** (used once for the 18+ check, then discarded) | **Recommendation** (ADR-010) | Schema review; data inventory |
| NFR-PRV-02 | Automated retention | Evidence files deleted 90 days after an outcome is counted or rejected (**Proposed default**, confirm with counsel); other periods in `data-privacy-and-retention.md` | **Proposed default** | Job test with fake clock |
| NFR-PRV-03 | Consent records | Append-only, versioned, queryable; institution and employer sharing consent separate and revocable | README, **Recommendation** | Tests |
| NFR-PRV-04 | Data rights | Export and deletion requests tracked and completed within a stated period (period **Open**); account deletion pseudonymizes and keeps ledger structure | **Recommendation** | End-to-end test; counsel review |
| NFR-PRV-05 | Small-cohort suppression | Aggregates for fewer than the minimum cohort size (**5**, owner decision) are hidden | README 11.4 | Dashboard tests |
| NFR-PRV-06 | Processor and transfer disclosure | Hosting, email, error tracking, and any LLM provider listed as processors; cross-border transfers described in the privacy notice [S1] | **Recommendation** | Data inventory; legal checklist |
| NFR-PRV-07 | Processing register | Records of processing kept for at least five years as the law requires for the register [S1] | **Verified [S1]** (secondary) | Legal checklist |
| NFR-PRV-08 | Minors | None in the pilot; sign-up blocked under 18; no parental-consent flow until counsel scopes it | **Owner decision** | Sign-up test |
| NFR-PRV-09 | Data protection impact assessment | A short DPIA before the pilot | **Recommendation** [S1] | Document exists |
| NFR-PRV-10 | Residency stance | Because localization status is unverified, store no data that could be "restricted" (no government IDs) and keep the hosting region choice reversible | **Recommendation** | Counsel review |

---

## 8. Accessibility, usability, and compatibility (ACC, USA, CMP)

| ID | Requirement | Target | Label | Verification |
|---|---|---|---|---|
| NFR-ACC-01 | Accessibility | WCAG 2.1 AA on all Phase 1 flows | README | Automated checks plus manual keyboard and screen-reader review |
| NFR-ACC-02 | Color | Text contrast meets AA; color is never the only carrier of meaning (stakeholder colors in diagrams are decoration, not information) | **Recommendation** | Contrast checks |
| NFR-USA-01 | Time to first request | A new student can reach a submitted request, with a mentor chosen, in a short guided flow; target of 10 minutes or less in moderated tests | **Proposed default** | Moderated usability test with at least 5 students |
| NFR-USA-02 | Outcome reporting effort | A student can report an outcome in under 3 minutes; a mentor can confirm in under 2 minutes | **Proposed default** | Usability test |
| NFR-USA-03 | Plain language | Product copy for decisions, outcomes, and the verified badge is plain and non-technical | **Recommendation** | Copy review |
| NFR-CMP-01 | Browsers | Latest two versions of major browsers; Android Chrome and iOS Safari are first-class | README, **Proposed default** | Cross-browser test run |
| NFR-CMP-02 | Devices | Mobile-first layouts; the PWA installable on supported browsers; Android and iOS minimum versions **Open** | README (open) | Device matrix |
| NFR-CMP-03 | PWA | Installable, with an app shell that loads on a poor connection | **Recommendation** | Lighthouse PWA audit |
| NFR-LOC-01 | Language | UI and documents are **English only** (**Owner decision**, 16 Oct 2026) | **Owner decision** | Review |
| NFR-LOC-02 | Unicode | User-entered text (names, bios, messages) is stored and displayed correctly in any Unicode script, including Bangla; fonts have fallbacks; no text is baked into images | **Recommendation** | Tests with Bangla and other scripts |

Note that English-only UI does not mean English-only content. Mentors and students may write in Bangla; NFR-LOC-02 covers this.

---

## 9. Maintainability and delivery (MNT)

| ID | Requirement | Target | Label | Verification |
|---|---|---|---|---|
| NFR-MNT-01 | Typed contracts | TypeScript strict mode; OpenAPI is the source of truth; the web client is generated from it | README | CI |
| NFR-MNT-02 | Test coverage on rules | At least 90% line and branch coverage on `packages/domain`; every state transition and edge case (zero weights, ties, empty results) has a test | **Proposed default** | Coverage gate |
| NFR-MNT-03 | CI gates | Lint, type-check, unit tests, contract tests, build, dependency and secret scan must pass before merge | README | CI |
| NFR-MNT-04 | Review | Mandatory code review; trunk-based development with short-lived branches | README | Repository settings |
| NFR-MNT-05 | Decisions recorded | Architectural choices recorded as ADRs; product decisions in `decision-log.md`; changing an Approved document needs a log entry | README, **Recommendation** | Review checklist |
| NFR-MNT-06 | Modularity | Modules interact only through their public interfaces; only the owning module writes its tables | **Recommendation** | Dependency-rule test |
| NFR-MNT-07 | Replaceable vendors | Identity, email, object storage, meeting links, LLM, and (later) payments sit behind interfaces so a vendor change does not touch domain code | README, **Recommendation** | Architecture review |

---

## 10. Observability and operations (OBS, OPS)

| ID | Requirement | Target | Label | Verification |
|---|---|---|---|---|
| NFR-OBS-01 | Structured logs | JSON logs with request ID on every line | README | Log sample review |
| NFR-OBS-02 | Error tracking | Sentry (or equivalent) for web and API with release tagging | README | Test error appears |
| NFR-OBS-03 | Uptime and synthetic check | Health endpoint check at least every 5 minutes plus a synthetic sign-in and read flow | **Proposed default** | Monitor configuration |
| NFR-OBS-04 | Alerts | Alert on error-rate spike, job lateness above 15 minutes, overdue reviews, email failure rate, database storage, and backup failure | **Recommendation** | Fire-drill each alert once |
| NFR-OBS-05 | Business events | Product and KPI events recorded in a privacy-respecting way (no sale of data) | README | Event taxonomy in `analytics-and-reporting-spec.md` (Planned, not yet created) |
| NFR-OPS-01 | Deploy and rollback | Repeatable containerized deploy; rollback to the previous release in 15 minutes or less | **Proposed default** | Rollback drill |
| NFR-OPS-02 | Runbook | One page covering deploy, rollback, rotate keys, restore, and handle a dispute backlog | **Recommendation** | Document exists |
| NFR-OPS-03 | Support targets | A support inbox with response targets (values **Open**); honest on-call statement: the owner during business hours unless coverage is added | **Recommendation** | Document exists |
| NFR-OPS-04 | Review turnaround | Targets for dispute, audit, and abuse-report review time (values **Open**, N7) | **Open decision** | Operations view (FR-ADM-09) |
| NFR-OPS-05 | Incident severity levels | Defined severities and communication rules to partners | **Recommendation** | Document exists |

---

## 11. Portability, cost, and email (PORT, CST, EML)

| ID | Requirement | Target | Label | Verification |
|---|---|---|---|---|
| NFR-PORT-01 | Containerized from day one | All services run in containers locally and in staging and production; no host-specific add-ons | **Recommendation** (ADR-004) | Fresh clone runs with Docker Compose |
| NFR-PORT-02 | Exit path | The same containers can move to AWS (ECS Fargate or App Runner, RDS, S3, SES) when triggers hit | **Recommendation** | Documented path in `system-architecture.md` |
| NFR-CST-01 | Monthly cost cap | A Owner-set cap on infrastructure and AI spend, with alerts at stated percentages of the cap | **Open decision** (OD-9) | Cost report |
| NFR-CST-02 | AI spend control (**Later**) | Per-user and global LLM caps; assist features disable themselves when a cap is hit. No AI spend in the MVP | **Recommendation** | Test with a low cap |
| NFR-EML-01 | Deliverability | SPF, DKIM, and DMARC configured; bounces and complaints handled; transactional and any later marketing mail separated | **Recommendation** | Mail-tester check before pilot |

---

## 12. AI-specific requirements (AI) — **Deferred (owner decision)**

Not applicable in the MVP: no AI features or models ship. These requirements apply only if an AI feature is ever added after the pilot.

| ID | Requirement | Target | Label | Verification |
|---|---|---|---|---|
| NFR-AI-01 | Boundary | AI output never confirms an outcome, alters reputation, decides a match, or triggers a privileged action | **Recommendation** (ADR-009) | Tests and design review |
| NFR-AI-02 | Untrusted input | All user text is treated as untrusted (prompt injection); model output is validated against a schema and never executed | **Recommendation** | Adversarial test set |
| NFR-AI-03 | Redaction | Personal identifiers are stripped before sending text to an external model; providers are disclosed as processors [S1] | **Recommendation** | Redaction tests |
| NFR-AI-04 | Logging | Every call logs purpose, model, input class, and output id, not raw sensitive text beyond what is needed | **Recommendation** | Log review |
| NFR-AI-05 | Labeling | AI-generated text is clearly labeled in the UI; transparency duties under the EU AI Act were not deferred [S14] | **Recommendation** | UI review |
| NFR-AI-06 | Timeouts and fallback | An LLM call times out in 15 seconds or less; failure shows a normal form, not an error wall | **Proposed default** | Fault-injection test |
| NFR-AI-07 | Evaluation | A small evaluation set is reviewed each release | **Recommendation** | Release checklist |
| NFR-AI-08 | Free or retained-prompt models | If a free or possibly retaining model is used, it receives **no real user data and no secrets** (N12) | **Recommendation** | Configuration review |

---

## 13. What is not required in Phase 1

To prevent over-engineering, these are **not** NFRs for the pilot:

- Multi-region deployment, active-active failover, or an uptime SLA.
- Horizontal autoscaling, Kubernetes, or a service mesh.
- Sub-2-second WebSocket delivery (see deviation D1).
- Offline-first writes. Only drafts are preserved; reads may be cached.
- A separate analytics store or data warehouse.
- Penetration testing by a third party (recommended before institutional scale, not before the pilot).
- Multi-language support beyond Unicode-correct display of user content.

---

## 14. Deviations from the README

Per the README rule, conflicts are resolved explicitly and both documents are updated. The README text still needs these edits.

| # | README says | This document says | Reason |
|---|---|---|---|
| D1 | "Message delivery to online users in under 2 seconds" (section 13) | Phase 1 uses refetch within 30 seconds and email within 5 minutes (NFR-PERF-06). The 2-second target moves to the phase that adds WebSocket | WebSocket is deferred; mentorship is asynchronous by design |
| D2 | Android and iOS versions "to be decided" | Still open; mobile web and PWA are first-class (NFR-CMP-02) | Flutter deferred to Phase 2 |
| D3 | Localization: "Bangla and other languages are an Open decision" | English only (NFR-LOC-01) | **Owner decision** |
| D4 | Redis for rate limiting, caching, queues | Rate limiting, jobs, and caching use the application and PostgreSQL in Phase 1 | See ADR-006; add Redis on a measured trigger |

---

## 15. Verification matrix

| Verification method | Requirements covered |
|---|---|
| Automated unit and property tests | NFR-INT-01 to 07, NFR-REL-01, 05, NFR-MNT-02, NFR-SEC-05 |
| Load test (k6 or equivalent) | NFR-SCA-01 to 03, NFR-PERF-01, 02 |
| Lighthouse in CI | NFR-PERF-03 to 05, NFR-CMP-03, NFR-ACC-01 |
| Fault-injection tests | NFR-REL-03, 04, 06, NFR-AI-06 |
| Restore and rollback drills | NFR-DUR-01 to 05, NFR-OPS-01 |
| Security checks (ASVS checklist, scans, abuse tests) | NFR-SEC-01 to 14 |
| Moderated usability tests (5 or more participants) | NFR-USA-01, 02, NFR-ACC-01 |
| Legal and counsel review | NFR-PRV-04, 06, 07, 09, 10, NFR-SEC-14 |
| Document and configuration review | NFR-OPS-02, 03, 05, NFR-MNT-05, NFR-CST-01 |

---

## 16. Acceptance checklist

- [ ] Every requirement has a target, a label, and a verification method.
- [ ] Every number is labeled **Proposed default** unless sourced.
- [ ] The availability target is stated as a target, not an SLA.
- [ ] The restore drill is scheduled before the pilot.
- [ ] Ledger immutability (NFR-INT-01) is implemented as a database rule, not only application code.
- [ ] README deviations D1 to D4 are applied to the README.
- [ ] Nothing in section 13 is required by a Phase 1 requirement.

## 17. Questions for the owner

1. **Monthly cost cap (OD-9):** what spend can you carry for hosting, email, storage, and AI during the pilot?
2. **Reference device (NFR-PERF-03):** which low-end Android phone and network profile should represent your target students? A real device from the partner cohort is best.
3. **Support and review targets (NFR-OPS-03, 04):** what response times can you honestly commit to, given you are the only engineer?
4. **Counsel timing:** can a Bangladeshi lawyer read the primary text of the Personal Data Protection Act before the pilot so the retention, deletion, and residency requirements can move from **Proposed** to **Verified**?
5. **Minimum Android and iOS versions:** do you have partner device data, or should the first pilot survey collect it?
