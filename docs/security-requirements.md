---
title: Security Requirements
status: Approved (MVP baseline, owner decision)
owner: Owner
date: 2026-10-29
sources: README.md (sections 9.3, 10.4, 12, 14); connect-research-report.md (Sections 4.7, 5.6, 5.7, Doc 4 D, Doc 13, Doc 19); auth-and-access-control.md; architecture-decisions.md (ADR-008, ADR-009, ADR-010, ADR-016)
---

# Security Requirements

> **Not legal advice.** This is an engineering checklist. Privacy and breach-notification duties must be reviewed with Bangladeshi counsel before the pilot (README 12). Bangladesh data-law points come from secondary summaries **[S1]** and must be checked against the primary text.
>
> Labels: **Plan target**, **Proposed default**, **Recommendation**, **Open decision**, **Verified [S#]**, **Unverified**.

## 1. Purpose and baseline

- **Baseline:** OWASP ASVS (README 12.1). **Recommendation:** target ASVS Level 1 across the application and Level 2 for authentication, sessions, access control, file upload, and the ledger. Pin the ASVS version in the first security review.
- **Security goals, in priority order:**
  1. **Integrity of the ledger.** Outcomes, verification records, and reputation cannot be silently altered (ADR-008).
  2. **Confidentiality of private content.** Threads, evidence files, disputes, and consent records.
  3. **Correct access.** Every action is allowed only by the policy in `docs/auth-and-access-control.md`.
  4. **Availability** appropriate to a pilot (see `docs/non-functional-requirements.md`).
- **Posture:** collect less (ADR-010), keep private by default, log security events without logging private content.

## 2. Data classification

| Class | Examples | Handling |
|---|---|---|
| **High** | Evidence files, thread messages, dispute content, consent records, credentials, session secrets | Private storage, access only by participants or audited reviewers, encrypted at rest and in transit, never in logs, shortest retention |
| **Medium** | Profile details, affiliation, outcomes, private feedback | Access by role and object policy, encrypted in transit and at rest |
| **Low** | Field taxonomy, aggregated metrics with small-cohort suppression | Normal handling |
| **Never stored** | Government ID numbers, payment card data, precise location, the user's date of birth (checked once, then discarded) | Not collected. Hosted checkout only when payments exist (ADR-015) |

The data model must tag every field with one of these classes (`docs/data-model.md`).

## 3. Assets, actors, and trust boundaries

| Asset | Why it matters |
|---|---|
| Append-only ledger (outcomes, reputation, audit) | The product's credibility |
| Evidence files | Sensitive documents (offer and admission letters) |
| Private threads | Sensitive conversations |
| Accounts and sessions | Account takeover leads to false confirmations |
| Admin and break-glass access | Highest-privilege path |
| Secrets and keys | Compromise exposes everything |

**Trust boundaries:** browser to API; API to database; API to object storage; API to email provider; API to the AI provider; CI to the container registry and host; developer machine and AI agents to the repository.

## 4. Threat model

### 4.1 Product-level threats (from the verification policy)

| Threat | Control | Requirement IDs |
|---|---|---|
| Fabricated outcome | Evidence tiers, audits, platform review | SEC-LED-1, SEC-LED-3 |
| Mentor and student collusion | Pair factor, conflict declaration, ring detection, audit | SEC-LED-3 |
| Mentor farming easy outcomes | Difficulty and tier weights, contribution split | Policy document |
| Credit for unrelated results | Contribution confirmation, cooling period | Policy document |
| Retaliation after a dispute | Private double-blind feedback, platform arbiter | Policy document |
| Fake mentor identities | Affiliation levels, institution attestation | SEC-AUTH-1 |
| Institution inflating outcomes | Institution cannot edit or arbitrate | SEC-AC-2 |
| Bribery or off-platform payment for confirmations | Terms, reporting, anomaly signals | SEC-ABUSE-2 |
| Sock-puppet accounts | Email-domain checks, rate limits, device and network signals as inputs to human review | SEC-ABUSE-1 |
| Harassment | Reporting, moderation queue, suspension path | SEC-ABUSE-3 |

### 4.2 Technical threats

| Threat (STRIDE category) | Example | Control |
|---|---|---|
| **Spoofing:** account takeover | Credential stuffing, phishing, reused passwords | Rate limits, breached-password check, MFA for privileged roles, session revocation |
| **Tampering:** ledger edit | Direct SQL update, compromised admin | Database roles without UPDATE or DELETE on ledger tables, hash chain or integrity checks (Open decision), audit log |
| **Repudiation:** denied admin action | "I did not approve that" | Immutable audit log with actor, reason, request ID |
| **Information disclosure:** broken object-level access (IDOR) | Changing an ID to read another mentorship | Object policies, `404` for invisible objects, matrix tests |
| **Information disclosure:** upload abuse | Malware, oversized files, public bucket | Type and size limits, malware scan before availability, private bucket, signed URLs |
| **Information disclosure:** directory scraping | Bulk collection of mentor profiles | Authentication to browse, rate limits, no sequential IDs (UUIDs), limited fields in lists |
| **Denial of service** | Request flooding, expensive queries, AI cost abuse | Rate limits, pagination caps, query timeouts, per-user and global AI cost caps |
| **Elevation of privilege** | Role confusion, mass assignment, missing policy on a route | Deny by default, explicit DTO allow-lists, CI gate for routes without policy |
| **Injection** (SQL, XSS, command, prompt) | Malicious profile text, evidence names, AI prompts | Parameterized queries via ORM, output encoding, input validation, content security policy, prompt-injection handling (section 5.12) |
| **Supply chain** | Malicious or vulnerable dependency or image | Lockfile, pinned versions, dependency and image scanning, minimum age for new releases |
| **Secrets leakage** | Key committed to git, pasted into an agent prompt | Secret manager, secret scanning, agent rules (section 5.14) |

## 5. Requirements

Each requirement has an ID, a priority (**Must**, **Should**, **Could**), and the way it is verified. Priorities and thresholds are **Proposed defaults** until the owner approves them.

### 5.1 Authentication and sessions (details in auth-and-access-control.md)

| ID | Requirement | Priority | Verification |
|---|---|---|---|
| SEC-AUTH-1 | Mentors cannot receive requests until affiliation Level 1 is verified | Must | Integration test |
| SEC-AUTH-2 | MFA is enforced for Mentor, Institution Admin, and Platform Admin | Must | Integration test |
| SEC-AUTH-3 | Passwords are hashed with a modern algorithm (Argon2id or scrypt); minimum length 12; breached-password check | Must | Config review and test |
| SEC-AUTH-4 | Web sessions use httpOnly, Secure, SameSite cookies; no tokens in `localStorage`; CSRF protection on cookie-authenticated writes | Must | Automated test and manual review |
| SEC-AUTH-5 | Refresh token reuse revokes the session family | Must | Test |
| SEC-AUTH-6 | Sign-in, sign-up, and password-reset responses do not reveal whether an email exists | Must | Test |
| SEC-AUTH-7 | Under-18 sign-up is blocked and no unnecessary data is retained | Must | Test, counsel review |

### 5.2 Access control

| ID | Requirement | Priority | Verification |
|---|---|---|---|
| SEC-AC-1 | Every endpoint declares a policy; a route without one fails CI | Must | CI check |
| SEC-AC-2 | Institution admins and employers cannot edit outcomes, reputation, or resolve disputes | Must | Matrix test |
| SEC-AC-3 | The permission matrix is tested for every role on every endpoint, including IDOR cases | Must | Matrix test |
| SEC-AC-4 | Break-glass access needs a reason and a case reference, expires, and is audited | Must | Test and weekly review |
| SEC-AC-5 | Student-level data for institutions is returned only with active, purpose-specific consent | Must | Test |
| SEC-AC-6 | No shared admin accounts | Must | Process check |

### 5.3 Input, output, and API

| ID | Requirement | Priority | Verification |
|---|---|---|---|
| SEC-API-1 | All inputs are validated against the OpenAPI schema; unknown fields are rejected; request body size is limited | Must | Contract tests |
| SEC-API-2 | All database access is parameterized (no string-built SQL) | Must | Lint and review |
| SEC-API-3 | User-generated content is encoded on output; a strict content security policy is set | Must | Automated scan |
| SEC-API-4 | Security headers: HSTS, `X-Content-Type-Options`, `Referrer-Policy`, frame protection | Must | Automated scan |
| SEC-API-5 | CORS is restricted to known origins | Must | Config test |
| SEC-API-6 | Errors use the standard problem format and never expose stack traces, SQL, or internals | Must | Test |
| SEC-API-7 | Retryable writes accept an `Idempotency-Key` and are safe to repeat | Must | Test |
| SEC-API-8 | Identifiers are UUIDs, not sequential integers | Must | Schema review |

### 5.4 Data protection

| ID | Requirement | Priority | Verification |
|---|---|---|---|
| SEC-DATA-1 | TLS is required on every external connection; plain HTTP redirects or is refused | Must | Scan |
| SEC-DATA-2 | Database and object storage use encryption at rest provided by the host | Must | Host configuration check |
| SEC-DATA-3 | Backups are encrypted and access-controlled | Must | Host configuration check |
| SEC-DATA-4 | Government ID, card data, precise location, and the user's date of birth (used once for the 18+ check) are never stored | Must | Schema review, code search |
| SEC-DATA-5 | Logs, error reports, and analytics never contain passwords, tokens, message bodies, or evidence contents; personal data in logs is minimized | Must | Log review and test |
| SEC-DATA-6 | Evidence file deletion runs on schedule after the retention window (**Proposed default: 90 days after the outcome is counted**); a hash and metadata are kept | Should | Job test |
| SEC-DATA-7 | Personal data sent to external processors (email, error tracking, AI) is minimized, and each processor is listed in the privacy document | Must | Document review |
| SEC-DATA-8 | The Bangladesh data-residency status is resolved by counsel. **Deferred (owner decision):** not a Gate 0 or Gate 1 blocker; revisit after the pilot before wider onboarding (status **Unverified**, conflicting sources **[S2][S3][S4]**) | Should | Counsel written advice |

### 5.5 Ledger integrity

| ID | Requirement | Priority | Verification |
|---|---|---|---|
| SEC-LED-1 | The application database role has no UPDATE or DELETE on `OutcomeEvent`, `VerificationRecord`, `ReputationEvent`, `ConsentRecord`, and `AuditLog` | Must | Database permission test |
| SEC-LED-2 | Corrections are compensating entries; reputation is recomputable from the ledger and the result matches stored snapshots | Must | Recompute test in CI |
| SEC-LED-3 | Anomaly signals are produced for human review: reciprocal confirmation, many outcomes in a short window, shared device or network among "different" users, templated evidence, concentration of confirmations | Should | Report review |
| SEC-LED-4 | Tamper evidence for the ledger (for example periodic hash chaining) | Could, **Open decision** | Design review |

### 5.6 File upload and evidence

| ID | Requirement | Priority | Verification |
|---|---|---|---|
| SEC-FILE-1 | Private bucket only; access through short-lived signed URLs (**Proposed default: 5 minutes**) | Must | Test |
| SEC-FILE-2 | Allowed file types and size limits are enforced server-side by content inspection, not just file extension | Must | Test |
| SEC-FILE-3 | Files are scanned for malware before they are made available; unscanned files are never served | Must | Test |
| SEC-FILE-4 | Original file names are not used as storage keys; images are re-encoded where practical to remove hidden content | Should | Review |
| SEC-FILE-5 | A file hash is stored at upload time | Must | Test |

### 5.7 Audit and logging

| ID | Requirement | Priority | Verification |
|---|---|---|---|
| SEC-LOG-1 | Audit events listed in `docs/auth-and-access-control.md` section 12 are written for every occurrence | Must | Test |
| SEC-LOG-2 | Every request carries a request ID that appears in logs, errors, and audit entries | Must | Test |
| SEC-LOG-3 | Audit entries are searchable by actor, object, and time, and are retained for a defined period (**Open decision**, counsel to advise) | Must | Review |
| SEC-LOG-4 | Alerts fire on repeated failed sign-ins, break-glass use, role changes, and bulk exports | Should | Alert test |

### 5.8 Rate limiting and abuse

| ID | Requirement | Priority | Verification |
|---|---|---|---|
| SEC-ABUSE-1 | Rate limits on sign-up, sign-in, password reset, request creation, outcome reporting, and file upload, per account and per IP; bot protection on sign-up | Must | Test |
| SEC-ABUSE-2 | Users can report abuse or off-platform pressure; reports reach a moderator with a visible status | Must | Test |
| SEC-ABUSE-3 | Suspension and removal paths exist, with reasons. Appeals are **Later**; in the MVP a Platform Admin reviews each case once | Should | Process test |
| SEC-ABUSE-4 | Default limits are stored in configuration, not hard-coded | Should | Review |

Concrete limit values are **Open decisions** to set during the first build iteration from realistic pilot traffic.

### 5.9 Dependencies and supply chain

| ID | Requirement | Priority | Verification |
|---|---|---|---|
| SEC-SUP-1 | Lockfiles are committed; versions are pinned | Must | CI |
| SEC-SUP-2 | Dependency vulnerability scanning runs in CI and blocks critical findings | Must | CI |
| SEC-SUP-3 | Container image scanning runs in CI (ADR-016) | Must | CI |
| SEC-SUP-4 | New dependency releases are adopted only after a minimum age (**Proposed default: 14 days**) unless fixing a known vulnerability | Should | Review |
| SEC-SUP-5 | Secret scanning runs on every commit and in CI | Must | CI |

### 5.10 Containers and infrastructure (ADR-016)

| ID | Requirement | Priority | Verification |
|---|---|---|---|
| SEC-INF-1 | Containers run as a non-root user; the filesystem is read-only where practical; no privileged mode | Must | Image test |
| SEC-INF-2 | Base images are pinned, minimal, and rebuilt on a schedule for security patches | Must | CI |
| SEC-INF-3 | No secrets inside images or the repository; configuration comes from environment variables sourced from the host's secret store | Must | CI and review |
| SEC-INF-4 | The database is not reachable from the public internet; only the API (and worker) can connect | Must | Network test |
| SEC-INF-5 | Staging and production use separate databases, storage, and credentials; staging contains no real user data | Must | Review |
| SEC-INF-6 | Production deploys come only from CI, using the image that passed tests | Must | Process check |
| SEC-INF-7 | Daily backups with point-in-time recovery, and a **restore performed and recorded before the pilot** (README 13) | Must | Restore record |
| SEC-INF-8 | Health checks and an uptime monitor exist (`/healthz`, `/readyz`) | Must | Monitor check |

### 5.11 CI/CD security

Branch protection on `main`; mandatory review; CI required to pass; CI secrets scoped to the minimum; no long-lived cloud keys in CI where short-lived credentials are possible; build provenance recorded where the platform supports it (**Could**).

### 5.12 AI-specific controls (**Later**, ADR-009)

No AI feature ships in the MVP. These controls apply if AI is added after the pilot.

| ID | Requirement | Priority | Verification |
|---|---|---|---|
| SEC-AI-1 | AI output never triggers a privileged action, confirms an outcome, or changes reputation, access, or a dispute | Must | Code review and test |
| SEC-AI-2 | All user text is treated as untrusted input; prompts separate instructions from user content | Must | Test with injection cases |
| SEC-AI-3 | Personal identifiers are stripped before text goes to an external model; the provider is listed as a processor | Must | Review |
| SEC-AI-4 | Every AI call is logged (purpose, model, input class, output ID) without keeping raw sensitive text longer than needed | Must | Test |
| SEC-AI-5 | AI-generated text is labelled in the UI and never auto-sent | Must | UI test |
| SEC-AI-6 | Per-user and global cost caps; the provider sits behind an interface; an AI outage disables assist features without blocking core flows | Must | Test |
| SEC-AI-7 | A small evaluation set is reviewed each release | Should | Release checklist |

### 5.13 Incident response

**Severity levels (Proposed defaults):**

| Level | Definition | Example | Target first response (single operator, business hours unless stated) |
|---|---|---|---|
| **SEV-1** | Confirmed breach of High-class data, ledger tampering, or full outage | Evidence files exposed | As fast as possible, including outside business hours when alerted |
| **SEV-2** | Serious degradation or suspected breach | Admin account takeover suspected | Same day |
| **SEV-3** | Limited impact | A failed backup job, a single user's account takeover | Next business day |

**Process:** detect, contain (revoke sessions, rotate keys, disable the affected feature), assess scope from audit logs, notify, recover, and run a short post-incident review with actions recorded.

**Breach notification:** Bangladesh's law requires notifying the authority when a breach is likely to cause significant damage **[S1]**. The timing and the notice to affected people are set by regulation and must be **confirmed with counsel**. Keep a draft notification template and a contact list in `docs/runbooks/`.

**On-call honesty:** the owner, business hours, unless coverage is added (research report Doc 15).

### 5.14 Developer, agent, and MCP security (ADR-017, AGENTS.md)

| ID | Requirement | Priority |
|---|---|---|
| SEC-DEV-1 | Real user data and secrets never go into code, prompts, logs, or the memory MCP server | Must |
| SEC-DEV-2 | Agents may branch and commit on feature branches; they never push or merge to `main`, force-push, or edit `.env*` and CI secrets. **Decided (owner decision, 2026-10-29)**; the minimal safe default is stated in `AGENTS.md` | Must |
| SEC-DEV-3 | MCP servers (filesystem, GitHub) are scoped to the connect repository with the least privilege; new servers and skill libraries are read and reviewed before installation | Must |
| SEC-DEV-4 | Free or possibly retained models receive no real user data and no secrets (N12) | Must |
| SEC-DEV-5 | Pull requests that touch auth, the ledger, consent, or audit code get a human review focused on explicitness over brevity | Must |

### 5.15 Vulnerability disclosure

Publish a short security contact (`security.txt` and a mailbox) and a promise to acknowledge reports. Response targets are an **Open decision**.

## 6. Security testing plan

| Activity | When | Notes |
|---|---|---|
| Unit tests for policies and ledger rules | Every commit | In `packages/domain` |
| Permission matrix and IDOR tests | Every commit | See auth document section 16 |
| Static analysis, dependency, image, and secret scans | Every commit in CI | Block on critical findings |
| Dynamic scan against staging | Before the pilot and each release | Basic automated scan |
| Backup restore drill | Before the pilot, then each quarter | Record the result |
| Manual security review of auth, uploads, and the ledger | Before the pilot | Owner plus a second reviewer if available |
| External penetration test | **Open decision**: before the pilot or before institutional expansion | Budget and timing are the owner's call |

## 7. Compliance mapping (secondary sources, check primary text)

| Topic | What we found | Where handled |
|---|---|---|
| Children under 18 need verifiable parental consent **[S1]** | 18+ only in the pilot | SEC-AUTH-7, auth document 4.2 |
| Data subject rights: access, rectification, erasure, withdrawal, portability **[S1]** | Tracked requests | `docs/data-privacy-and-retention.md`, endpoints in `docs/api-contracts.md` |
| Processing records kept at least five years **[S1]** | Register of processing | Privacy document |
| Breach notification when significant damage is likely **[S1]** | Incident process | Section 5.13 |
| Processors' actions attributed to the controller **[S1]** | Processor list and contracts | SEC-DATA-7 |
| Data localization for restricted data **Unverified (conflicting)** | Collect no government ID; **Deferred (owner decision)** until after the pilot | SEC-DATA-8 |
| Rights over automated decisions **[S19]** | AI never decides | SEC-AI-1 |

## 8. Open decisions

| # | Decision | Recommended default |
|---|---|---|
| SEC-O1 | Tamper evidence for the ledger (hash chain) | Decide after the first ledger design review |
| SEC-O2 | Concrete rate-limit values | Set from pilot traffic estimates in the first iterations |
| SEC-O3 | Audit log retention period | Counsel to advise |
| SEC-O4 | Penetration test timing and budget | Before the pilot if affordable |
| SEC-O5 | Vulnerability disclosure response targets | 5 business days to acknowledge |
| SEC-O6 | Data residency interpretation | **Deferred (owner decision)** until after the pilot |
| SEC-O7 | Agent git permissions (N11) | **Decided 2026-10-29:** branch and commit only; never push to `main` or touch secrets |

## 9. Acceptance checklist

- [ ] Every threat in section 4 maps to at least one requirement ID.
- [ ] Every Must requirement has a verification method that can run in CI or in a recorded manual check.
- [ ] Data classes match the data model, and every stored field has a class.
- [ ] No requirement depends on a **Later** component (Redis, WebSocket, FastAPI, SSO).
- [ ] Legal and data-law statements keep their **[S#]** or **Unverified** labels, and counsel review is scheduled before real users.
- [ ] The restore drill is performed and recorded before the pilot.
