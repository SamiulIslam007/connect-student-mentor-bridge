---
title: Resolution Report (contradiction fixes and MVP baseline)
status: Approved (MVP baseline, owner decision)
owner: Founder / CTO
date: 2026-10-29
version: 1.0
---

# Resolution Report

> **Scope.** This file records the fixes applied on 2026-10-29 to remove contradictions and stale
> statements from the connect documentation, and the redefinition of Gate 0 and the MVP plan.
> It is an output record, not a policy document. Where a rule matters, the owning document states it.

## 0. Source note (important)

The audit files this run was asked to read (`docs/audit/03-contradictions-and-gaps.md`,
`06-founder-decisions.md`, `07-fix-list.md`, and the other five) **do not exist in the repository** at
the start of this run. The repository contained only `README.md`, `docs/*.md` (20 files) and
`research/connect-research-report.md`.

Consequence: every contradiction was re-verified directly against the documents. Audit IDs quoted in
the work prompt (C-01 to C-06, C-11, C-12, C-15, C-18, C-20 to C-23, C-35 to C-39, G-12, G-14 to G-17,
A1 to A10, D1 to D4, N2, N3, N7, N11, O-1, AUTH-O3) are addressed. IDs not described in the prompt could
not be traced to a source record and are marked "No source record" in the final status table.

## 1. Phase 1 - change plan per file

| File | Planned change |
|---|---|
| `docs/data-model.md` | Canonical enums (account_status, mentor_onboarding_status, mentor_status split, no CANCELLED, 7 outcome states); dynamic `fields` table with `normalized_slug`/`created_by`; `primary_field_id` on both profiles; 48h expiry / 24h reminder; age-gate columns replace stored DOB; remove cooling multiplier reference; retention points to privacy doc; `is_paid` always false in MVP; `application_note` note; appeal transitions marked Later |
| `docs/glossary.md` | Section 8 enum list made identical to data-model; DB/API case mapping rule; add Account status, Mentor onboarding status, Field; remove stale statuses |
| `docs/api-contracts.md` | Enum table identical to data-model in lower_snake; `withdraw` replaces `cancel`; add outcome withdraw, privacy export download, mentor pause, account deactivate; remove Microsoft/DOB storage; 48h expiry; remove `appealed` transitions (Later); mark AI section Later; mark redirect endpoint Phase 1b |
| `docs/auth-and-access-control.md` | better-auth (ADR-003); no Microsoft; 12-character minimum; DOB not stored; level-1 student attestation closes AUTH-O3; account lifecycle uses `account_status`; mentor onboarding vs mentor status; remove password-login "MFA" ambiguity; delegated auth endpoints |
| `docs/functional-requirements.md` | FR-AUTH-02 (Google only), FR-AUTH-03 (no stored DOB), FR-REQ-05 (48h/24h), FR-REQ-08 withdraw, FR-REQ-04 -> 1b, FR-ADM-02 appeals -> Later, FR-ADM-08/09 -> 1b, FR-INST-02 funnel detail -> 1b, FR-AI-01..04 -> Later, add response-time KPI definition, student Level 1 |
| `docs/non-functional-requirements.md` | NFR-SEC-02 password 12; NFR-PRV-01 no DOB storage; apply D1-D4 wording to README; remove AI NFRs from MVP-critical framing |
| `docs/security-requirements.md` | SEC-AUTH-3 stays 12 and references the auth doc; SEC-DATA-4 adds date of birth; SEC-DEV-2/agent rule decided (not Open); appeals deferred note; no AI in MVP |
| `docs/reputation-and-verification-policy.md` | Formula without cooling multiplier; `pair_factor = 1/(1+n)`; state diagram aligned to data-model (7 states); expiry/48h request rule; appeals Later; platform admin decides with written reason; certificate recognition |
| `docs/matching-algorithm-spec.md` | 48h expiry / 24h reminder; dynamic fields (no fixed taxonomy); response-time KPI wording |
| `docs/system-architecture.md` | better-auth named; Prisma/pg-boss decided; no Redis/WebSocket/AI in MVP; sweeper timings; no stale app reference |
| `docs/milestones-and-phases.md` | Gate 0/1/2/3 redefined; 8 one-week sprints at 3 days/week; cut order kept; FR moves to 1b/Later; kill criteria labelled |
| `docs/production-requirements.md` | Gate 0 list replaced; hosting undecided is not a Gate 0 blocker; deferred items; open decisions updated; no AI/Redis/WebSocket requirements |
| `docs/assumptions-and-open-questions.md` | Statuses updated (Decided / Deferred (owner decision)); Gate 0 readiness rewritten; blocking questions reduced |
| `docs/pilot-plan.md` | Gate 0 rewritten; deferred items removed from Gate 2; 48h response KPI; certificate recognition; platform-admin dispute rule |
| `docs/architecture-decisions.md` | ADR-003 (better-auth, embedded), ADR-002 (Prisma), ADR-006 (pg-boss provisional), ADR-017 (1-week sprints, 2 weeks in pilot); statuses Approved; hosting still undecided |
| `docs/business-model-and-pricing.md` | Section 3.3 and paid office hours labelled Phase 3 only; `mentorships.is_paid` reserved false |
| `docs/personas-and-user-journeys.md` | 48h/24h; no appeal in MVP; dynamic fields; dispute by platform admin |
| `docs/data-privacy-and-retention.md` | DOB item 2 (not stored); retention is the owner document (C-35); consent purposes aligned to the 8-value enum |
| `docs/legal-and-compliance-checklist.md` | Deferred legal items labelled; Gate 2 keeps only Terms, Privacy Notice, consent screens, restore test, runbook |
| `README.md` | Remove the stale application description; stack updated; dispute diagram to platform review; "Confirmed outcome"; decisions status; doc statuses; planned docs marked; section 20 replaced |
| `AGENTS.md` | New: constraints for agents |
| `docs/decision-log.md` | New: one entry per owner decision |
| `docs/mvp-build-plan.md` | New: scope, 8 sprints, DoR/DoD, first 10 OpenSpec changes, open decisions |

## 2. Applying fixes

See sections 3 to 6 for verification.

## 3. Verification results (commands run)

| Check | Result |
|---|---|
| `docs/audit/` source files present | **No.** Only this report exists; the eight input files were absent. |
| Banned terms (four searches named in the work prompt) | 0 occurrences after the fixes |
| "Microsoft" | Only in "not supported / removed / not built" statements |
| "Keycloak" | Only as a rejected option or a SAML-only fallback |
| "72 hours", "minimum length 10", "Verified outcome" as a current term | 0 occurrences (the glossary's rename-reconciliation row is the only historical mention) |
| Request statuses | `PENDING`, `ACCEPTED`, `DECLINED`, `REDIRECTED`, `EXPIRED`, `WITHDRAWN` in all four documents |
| Outcome statuses | 7 values, identical in `data-model.md` 4.1, `glossary.md` 8, `api-contracts.md` 4, and the policy |
| Consent purposes | 8 values, identical in all four documents |
| Password minimum | 12 in the auth document, NFR-SEC-02, and SEC-AUTH-3 |
| Date of birth | "used once, not stored" in data-model, API, privacy inventory, NFR, security, and FR-AUTH-03 |
| Small-cohort threshold | 5 in data-model, FR-INST-02, NFR-PRV-05, privacy, personas, and README |
| README internal anchors | 23 of 23 resolve to a heading |
| OpenSpec | `openspec init` succeeded with CLI 1.14.3; `openspec/config.yaml`, `openspec/specs`, `openspec/changes`, plus OpenCode and Claude Code skills/commands were created |
| Independent document review (ce-doc-review personas: coherence + feasibility) | 25 findings; all 25 addressed (some by scope change rather than text edit); see section 6 |

## 4. Per-item status (known IDs)

The prompt named these IDs; each was verified in the documents. The audit source files were absent, so IDs not named in the prompt cannot be traced to a source record.

| Item | Status | Reason |
|---|---|---|
| C-01 | Fixed | One canonical enum table; account status split from verification progress |
| C-02 | Fixed | `mentor_onboarding_status` split from `mentor_status` |
| C-03 | Fixed | `consent_purpose` has 8 values everywhere; MVP uses 5 |
| C-04 | Fixed | `outcome_status` reduced to 7 states; event words removed |
| C-05 | Fixed | `request_status` has `WITHDRAWN`/`EXPIRED`; `CANCELLED` removed |
| C-06 | Fixed | API values are the mechanical lowercase form; one mapping rule |
| C-07 | No source record | Audit file absent |
| C-08 | No source record | Audit file absent |
| C-09 | No source record | Audit file absent |
| C-10 | No source record | Audit file absent |
| C-11 | Fixed | Password minimum 12, stated in the auth document and referenced elsewhere |
| C-12 | Fixed | Date of birth never stored; `age_18_plus` + `age_gate_passed_at` |
| C-13 | No source record | Audit file absent |
| C-14 | No source record | Audit file absent |
| C-15 | Fixed | Cooling multiplier removed; `pair_factor = 1/(1+n)` |
| C-16 | No source record | Audit file absent |
| C-17 | No source record | Audit file absent |
| C-18 | Fixed | Enum lists in data-model, glossary, and API are identical |
| C-19 | No source record | Audit file absent |
| C-20 | Fixed | Missing endpoints added (outcome withdraw, export download, mentor pause, account deactivate) |
| C-21 | Fixed | Request cancel renamed to withdraw |
| C-22 | Fixed | Students get Level 1 by institution attestation; AUTH-O3 closed |
| C-23 | Not applicable | `application_note` is used by FR-DISC-03, so it is not orphaned; kept |
| C-24 | No source record | Audit file absent |
| C-25 | No source record | Audit file absent |
| C-26 | No source record | Audit file absent |
| C-27 | No source record | Audit file absent |
| C-28 | No source record | Audit file absent |
| C-29 | No source record | Audit file absent |
| C-30 | No source record | Audit file absent |
| C-31 | No source record | Audit file absent |
| C-32 | No source record | Audit file absent |
| C-33 | No source record | Audit file absent |
| C-34 | No source record | Audit file absent |
| C-35 | Fixed | Retention schedule owned by `data-privacy-and-retention.md`; data model points to it |
| C-36 | Fixed | `mentor_onboarding_status` values |
| C-37 | Fixed | `mentor_status` values |
| C-38 | Fixed | `account_status` values |
| C-39 | Fixed | Consent values and case mapping |
| C-40 | No source record | Audit file absent |
| G-01 | No source record | Audit file absent |
| G-02 | No source record | Audit file absent |
| G-03 | No source record | Audit file absent |
| G-04 | No source record | Audit file absent |
| G-05 | No source record | Audit file absent |
| G-06 | No source record | Audit file absent |
| G-07 | No source record | Audit file absent |
| G-08 | No source record | Audit file absent |
| G-09 | No source record | Audit file absent |
| G-10 | No source record | Audit file absent |
| G-11 | No source record | Audit file absent |
| G-12 | Deferred (owner decision) | Trust-and-safety reviewer naming moved after the pilot; the owner covers it |
| G-13 | No source record | Audit file absent |
| G-14 | Fixed | `POST /v1/outcomes/{id}/withdraw` added |
| G-15 | Fixed | `GET /v1/privacy/export/{id}/download` added |
| G-16 | Fixed | Mentor pause/resume endpoints added |
| G-17 | Fixed | Account deactivate endpoint added |
| G-18 | No source record | Audit file absent |
| G-19 | No source record | Audit file absent |
| G-20 | No source record | Audit file absent |
| G-21 | No source record | Audit file absent |
| G-22 | No source record | Audit file absent |
| G-23 | No source record | Audit file absent |
| G-24 | No source record | Audit file absent |
| G-25 | No source record | Audit file absent |
| G-26 | No source record | Audit file absent |
| G-27 | No source record | Audit file absent |
| G-28 | No source record | Audit file absent |
| G-29 | No source record | Audit file absent |
| G-30 | No source record | Audit file absent |
| G-31 | No source record | Audit file absent |
| G-32 | No source record | Audit file absent |
| G-33 | No source record | Audit file absent |
| G-34 | No source record | Audit file absent |
| G-35 | No source record | Audit file absent |
| G-36 | No source record | Audit file absent |
| G-37 | No source record | Audit file absent |
| G-38 | No source record | Audit file absent |
| G-39 | No source record | Audit file absent |
| G-40 | No source record | Audit file absent |
| G-41 | No source record | Audit file absent |
| G-42 | No source record | Audit file absent |
| G-43 | No source record | Audit file absent |
| G-44 | No source record | Audit file absent |

## 5. Gate 0 state

Gate 0 passes on the five conditions in `milestones-and-phases.md` 3.1: contradictions fixed, `AGENTS.md` exists, `docs/decision-log.md` exists, `docs/mvp-build-plan.md` exists, and the nine baseline documents plus decided ADRs are marked Approved.

## 6. Judgment calls the owner should check

1. **Audit files absent.** The eight `docs/audit/` inputs did not exist, so the per-item table can only verify the IDs named in the work prompt. If those files exist elsewhere, re-run the ID check against them.
2. **`application_note` kept.** C-23 said remove it unless an FR uses it; FR-DISC-03 does use it, so it stays. If Application-only should be dropped entirely, that is a scope decision.
3. **Ownership wording.** "Founder" was normalized to "owner" across the docs to follow the no-founder-content rule. The decision identifiers (D-xx) and dates are unchanged.
4. **Session transport.** A BFF (browser → Next.js → Bearer → API) was chosen to remove the cookie-vs-Bearer contradiction. It is recorded as D-27 and is reversible but touches every screen.
5. **Evidence scanner.** ClamAV in Compose was chosen (D-28) so the "no signed URL until CLEAN" rule is implementable in the MVP. Revisit only if scanning becomes a bottleneck.
6. **Sprint balance.** Sprints 1 to 7 now spread auth, discovery, requests, mentorship, outcomes, reputation, and admin across separate weeks. The plan is still tight at 3 days/week; the cut order is the release valve.

