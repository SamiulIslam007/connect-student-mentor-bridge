---
title: Read-only repo audit and next-five-changes plan
status: Draft (audit output, not a decision)
owner: Owner / CTO
date: 2026-11-15
sources: [git, pnpm gates, openspec CLI, docs/functional-requirements.md §2.16, docs/known-debt.md, docs/mvp-build-plan.md, docs/milestones-and-phases.md, services/api/src, packages/domain/src, services/api/test]
mode: explore only — no code, no proposals, no commits
---

# Hermes explore audit — 2026-11-15

> Read-only. Nothing in this file is a decision. Every claim carries the command or file that produced it.
> Truth order used: `docs/decision-log.md` > `docs/architecture-decisions.md` > `README.md` > `openspec/specs/` > code. Where code and docs disagree, the code is reported and the disagreement is listed in §6.

---

## 1. Verified repo state

| Check | Command | Result |
|---|---|---|
| Branch | `git branch --show-current` | `main` |
| HEAD | `git log --oneline -1` | `c3996dd Merge pull request #82 from SamiulIslam007/chore/archive-web-csp-enforce` |
| Working tree | `git status --short` | empty — no modified, staged or untracked files |
| Unarchived changes | `openspec list --json` | `"changes": []` — nothing in flight |
| Archived changes | `ls openspec/changes/archive \| wc -l` | 46 |
| Synced specs | `find openspec/specs -name spec.md` | 41 spec files across 8 capability areas |
| Spec validity | `openspec validate --all --strict` | **41 passed, 0 failed (41 items)** |
| Lint | `pnpm lint` (`eslint .`) | exit 0 |
| Type-check | `pnpm typecheck` (`tsc --noEmit` × packages/contracts, packages/domain, services/api, apps/web) | exit 0 |
| Tests | `pnpm test` | **711 pass, 0 fail, 0 cancelled, 0 skipped** — domain 134, contracts 23, web 245, api 309 (api run 1761 s, serial) |
| Build | `pnpm build` | exit 0 — api `tsup` bundle, worker, web Next production build (16 routes) |
| Local stack | `docker compose ps` | 7 services `Up (healthy)`: postgres, objectstore (versitygw), mailpit, clamav, api, worker, web |
| Postgres port | `docker compose ps` / `compose.yaml:37` | published on host **55400** here (`${POSTGRES_PORT:-55432}`, D-157) |
| Test DB | `psql -lqt` inside the container | `connect_test` exists; the suite ran against it with 0 skipped |
| CI definition | `.github/workflows/ci.yml` | jobs: checks (lint, typecheck, create `connect_test`, test, build), images (build + scan API and web), security (`pnpm audit --audit-level high`, gitleaks) |

Not run by me: CI itself, `pnpm audit`, gitleaks, the two image builds, and any Compose rebuild. Those are reported as UNVERIFIED in §7, not as passing.

Note on test count: 309 api tests this run versus 293 in the last archived change's row. The delta is the tests added by `csrf-token-on-cookie-writes`, `audit-hold-transition`, `affiliation-revocation-pending-expiry` and `web-csp-enforce`, which the plan rows do not restate per package.

---

## 2. Honest Must count

Counted from the register itself, row by row, not from memory.

Convention (`docs/functional-requirements.md` §2.16): DONE 1.0, PARTIAL 0.5, NOT STARTED 0.0, over 64 Must rows.

| Area | Must rows | DONE | PARTIAL | NOT STARTED | Points |
|---|---|---|---|---|---|
| AUTH | 10 | 9 | 1 (FR-AUTH-02) | 0 | 9.5 |
| PROF | 5 | 5 | 0 | 0 | 5.0 |
| VER | 4 | 4 | 0 | 0 | 4.0 |
| DISC | 4 | 3 | 1 (FR-DISC-02) | 0 | 3.5 |
| REQ | 7 | 7 | 0 | 0 | 7.0 |
| THR | 3 | 2 | 1 (FR-THR-02) | 0 | 2.5 |
| OUT | 7 | 7 | 0 | 0 | 7.0 |
| REP | 6 | 4 | 2 (FR-REP-02, -03) | 0 | 5.0 |
| INST | 1 | 0 | 1 (FR-INST-01) | 0 | 0.5 |
| ADM | 6 | 4 | 0 | 2 (FR-ADM-03, -07) | 4.0 |
| NOT | 1 | 1 | 0 | 0 | 1.0 |
| CONS | 2 | 2 | 0 | 0 | 2.0 |
| PRIV | 3 | 1 | 1 (FR-PRIV-01) | 1 (FR-PRIV-03) | 1.5 |
| AUD | 1 | 1 | 0 | 0 | 1.0 |
| UX | 4 | 1 | 3 (FR-UX-01, -02, -04) | 0 | 2.5 |
| **Total** | **64** | **51** | **10** | **3** | **56.0** |

- **Register basis: 56.0 / 64 = 87.5%.** 51 × 1.0 + 10 × 0.5 + 3 × 0.0 = 56.0. My independent recount reproduces the published figure exactly.
- **Code-only basis: 53.0 / 64 = 82.8%.** Three rows reach DONE through an amendment to the register rather than through code — `FR-ADM-05` (amended to warn/suspend/lift, D-142), `FR-OUT-07` (amended to Tier 0 only, D-156), `FR-ADM-06` (amended to no evidence file, D-156). Each loses 1.0 on this basis.
- 51 + 10 + 3 = 64. There is no fourth state and no unmarked row.

Spot verification of DONE claims (I read the code, not just the row):

| Row | Claim checked | Evidence |
|---|---|---|
| FR-REQ-07 | one pending per pair, cap 3 per student | `MAX_PENDING_REQUESTS_PER_STUDENT = 3` in `packages/domain/src/request.ts:40`, enforced at `:135` |
| FR-REQ-06 | capacity under a row lock | `.for("update", { of: mentorProfiles })` in `services/api/src/requests/drizzle-requests.service.ts:218`; `MENTOR_AT_CAPACITY` at `:460` |
| FR-REQ-05 | 24 h reminder, 48 h expiry, idempotent | `services/api/src/requests/request-sweeper.ts:24,39,65,69` |
| FR-AUTH-04 | role-keyed MFA | `requiresMfa` in `services/api/src/authorization/authorize.ts` (3 occurrences) |
| FR-AUD-01 | every documented action with a code path writes a row | 38 `appendAuditEntry` call sites in `services/api/src`; the not-applicable list in `docs/auth-and-access-control.md` §12 matches the code |
| FR-OUT-06 | property test walks the table | `packages/domain/test/outcome-property.test.ts`, 49 pairs after `audit-hold-transition` |
| Jobs | four queues, one scheduler | `services/api/src/platform/outbox/outbox-worker.ts:66-113` — `outbox`, `request-sweep`, `reputation-counter`, `account-sanction` |

Three honest caveats on the 56.0:

1. Two of the 51 DONE rows (`FR-OUT-07`, `FR-ADM-06`) are DONE by amendment, not by built work. The register says so in the rows and in §2.16; this audit confirms it and does not re-score them.
2. `FR-OUT-01` is marked DONE, and the *report* route does what the row's Then clause asks, but the row's Given clause says "an Active or **recently ended** mentorship" and `OutcomeService.report` checks only that the caller is the mentorship's student (`services/api/src/outcomes/drizzle-outcome.service.ts:310-317`). There is no mentorship-status check and no end-window, and the window length is still Open (§6, question 4 of the register). The row is DONE for its Then; its Given is unimplemented.
3. The three NOT STARTED rows are not one kind of problem: `FR-ADM-03` needs a selection rule (a number), `FR-ADM-07` needs a table and a route, `FR-PRIV-03` needs something to sweep (`FR-OUT-02`).

---

## 3. Gap list by severity

### Blocker — Gate 1 ("MVP code complete") cannot be claimed today

| # | Gap | Evidence |
|---|---|---|
| B1 | `FR-ADM-03` audit sampling absent: no random draw, no high-difficulty selection, no anomaly trigger, no configured rate. The hold exists and the counting job skips a held row, so the state is reachable but nothing reaches it | no `sampling` token in `services/api/src`, `packages/domain/src`, `packages/config/src`; `OutcomeService.hold` has no caller (`drizzle-outcome.service.ts:586` says so in a comment) |
| B2 | `FR-ADM-07` configuration versioning absent: weights, thresholds, timings and limits are code constants, so a ledger event cannot record "the version it used" | `packages/config/src/index.ts` exports 9 constants; `reputation_events` has the applied multipliers but no `config_version` column (`db/schema/reputation.ts`) |
| B3 | `FR-PRIV-03` retention sweeper absent, and `FR-OUT-02` evidence upload absent: there is no file to sweep and no way to attach one. The two are each other's dependency | no object-storage or scan client anywhere in `services/api/src` (no S3/sign/presign/ClamAV token); `outcomes.evidence_tier` defaults 0 and nothing writes 1 or 2 (`db/schema/outcomes.ts:60-61`); api-contracts.md:403-404 mark both evidence routes "Documented but not built" |
| B4 | Gate 1's "one end-to-end test of the happy path" does not exist: there is no e2e harness, no browser test, and CI runs unit + contract tests only | no `*e2e*` file or directory outside `.git`; no Playwright dependency in any `package.json`; `ci.yml:43-54` |
| B5 | `README.md` status line is stale: it quotes **54.0 / 64 (84.4%)** and code-only 53.0, and names no change after `audit-action-call-sites`. Five archived changes are missing from it | `grep -c "web-csp-enforce\|csrf-token-on-cookie-writes" README.md` → **0**; `functional-requirements.md:310` and `milestones-and-phases.md:22` both read 56.0 / 64 |

B5 is a docs-gate breach, not a code defect, and it is the cheapest of the five: the `.hermes.md` §5 rule says a task is not done until the docs describe the verified state, and README is the first document the truth order names after the decision log.

### High

| # | Gap | Evidence |
|---|---|---|
| H1 | `FR-THR-02` read state missing: no `thread_read_states` table, no read marker, no unread count. The email half ships | `grep "thread_read\|read_state\|last_read"` over `services/api/src` and `apps/web/lib` → 0 hits; register row says PARTIAL with this exact gap |
| H2 | `SEC-AC-4` / `DEBT-54`: break-glass has a reason and an audit row but no case reference and no expiry | `docs/security-requirements.md:105` "Partially built"; the route is per-call with no grant |
| H3 | `DEBT-52`: a break-glass thread read is not disclosed to the participants | `docs/known-debt.md` DEBT-52; no notification template exists for it (19 in `EmailTemplate`) |
| H4 | `DEBT-59`: a request already pending when its mentor is suspended stays acceptable for its 48 h — `decide` reads the request, not the account | recorded debt, no fix, needs a decision on what suspension does to in-flight requests |
| H5 | `FR-OUT-01`'s Given clause is unenforced: a student can report on a `COMPLETED` or `ENDED_EARLY` mentorship with no window; the window length is register question 4, still open | `drizzle-outcome.service.ts:310-317` (participant check only); `mentorshipStatus` enum has ACTIVE/COMPLETED/ENDED_EARLY |
| H6 | `DEBT-60`: the enforcing web CSP keeps `'unsafe-inline'` in `script-src` and `style-src`, so the injection control does not bite | D-169, `apps/web/lib/security-headers.ts` |
| H7 | No backup/restore evidence: Gate 2 requires a performed restore with a date, duration and result written down; none is recorded | `docs/production-requirements.md:156,214` unchecked boxes |

### Medium

| # | Gap | Evidence |
|---|---|---|
| M1 | `FR-INST-01` partial: no pagination (`DEBT-51`), no edit, no status transition, no domain verification | `grep -i "aggregate\|dashboard" services/api/src/institutions` → only an audit `aggregateType` field; DEBT-51 open |
| M2 | `FR-INST-02` (institution aggregates, suppression at 5) not built — a Should, but it is the buyer-facing half of the product | no route; register §2.9 |
| M3 | `FR-REP-02` / `FR-REP-03` partial: no confidence tier, every multiplier a 1.0 placeholder | D-67, DEBT-24; `REPUTATION_*` constants all 1.0 |
| M4 | `FR-DISC-02` partial: `GoalAlignment` has no data source | DEBT-41 |
| M5 | `DEBT-21`: no `Idempotency-Key` store; a retried message post can duplicate a message and one email | recorded debt |
| M6 | `DEBT-11`: better-auth's own verification and reset mail is sent inline with no failover; only domain events go through the outbox | recorded debt |
| M7 | `FR-NOT-02` (in-app list) and `FR-NOT-04` (bounce/complaint suppression) not built — both Should | register §2.12 |
| M8 | Matching debt cluster: `DEBT-42` (no suggestion log), `DEBT-44` (`MATCH_ALUMNI_BATCH_DISTANCE = 0` vs the spec's illustrative 3 — a MATH-FLAG), `DEBT-45` (200-row pool bound), `DEBT-43` (the match factor still treats a zone difference as missing) | `packages/config/src/index.ts:76`; debt rows |
| M9 | `DEBT-58`: the audit `action` filter is a sequential scan by design until ~1 M rows | shortcut comment in `services/api/src/audit/drizzle-audit.service.ts` |
| M10 | `DEBT-10`: migration `0001_backfill_active_verified.sql` wrote no audit rows | debt row |
| M11 | `DEBT-13`: `database-probe` swallows a pool-close error | debt row |
| M12 | `DEBT-07`: cross-script confusable field names are not folded | debt row |
| M13 | `DEBT-46`: no production `PLATFORM_ADMIN` bootstrap — a hand-run `INSERT` with no audit trail | debt row; `AGENTS.md` rule 12 |
| M14 | `DEBT-47` / `DEBT-53`: two synced requirements keep a historical header that contradicts their own body | debt rows |
| M15 | Admin idle/absolute session timeouts still not implemented (D-48, moved to Sprint 7) | `DEBT-14` narrowed text |
| M16 | `FR-UX-01`, `FR-UX-02`, `FR-UX-04` partial: no device install, no offline state, no automated AA run or recorded manual pass — frontend/manual, out of a backend-first round | register §2.15; DEBT-37, DEBT-38 |
| M17 | Two future audit call sites are already named and will become applicable: "configuration change" (B2) and "evidence file viewed by a reviewer" (B3) | `docs/auth-and-access-control.md` §12 not-applicable list |

### Low

| # | Gap | Evidence |
|---|---|---|
| L1 | `DEBT-06` dev-only advisories (esbuild via drizzle-kit, minimatch via ESLint); `pnpm audit --audit-level high` passes | debt row |
| L2 | `DEBT-08` under-18 pre-block can be used against an arbitrary email — accepted risk | debt row |
| L3 | `DEBT-16` a `Secure` cookie breaks a plain-http LAN address | debt row |
| L4 | `DEBT-48` a 400 ms draft debounce can lose the last keystrokes; `DEBT-49` the draft is device-local | accepted limits |
| L5 | `DEBT-57` no CORS allowlist — intended while the BFF is the only client | D-131..134 |
| L6 | Template count drift: `FR-NOT-01` says "18 named templates", the union has 20 | `services/api/src/email/email-sender.ts:1-21` |
| L7 | `docs/known-debt.md` rows closed without striking their problem text (e.g. DEBT-26 reads "The directory has no availability-window filter" while its Status says Closed). The repo already records this exact pattern as debt in DEBT-47/53, so the standard is uneven | debt file |

### Missing audit-log call sites

None for a code path that exists. `docs/auth-and-access-control.md` §12 lists every documented event with no code path (password change, lockout, role revoked, affiliation overridden, admin removal, configuration change, evidence viewed, institution-level student data view) and each one is genuinely absent from the code. Two of them are unblocked by §4's tasks 3 and 4 and must be added there, together with their readers (the defect D-155 fixed in the other direction).

---

## 4. The five recommended tasks

Ordered for dependency, risk and "one change each". Sizes are estimates in this repo's own currency (its archived changes run 1–3 days at 3 days/week).

### 1. `thread-read-state` — FR-THR-02

**Scope.** Give each participant a read marker on a mentorship thread and an unread count on the reads that already exist. One table (`thread_read_states`: mentorship, user, `last_read_at`, unique per pair), a monotonic "mark read" write, and `unread_count` on the thread read and the mentorship list. Messages stay immutable; no message row is ever updated. The email half of FR-THR-02 already ships and does not change.

**Files and areas.** `services/api/src/db/schema/mentorships.ts` + migration `0020` (grants), `services/api/src/mentorships/*` (service, controller), `packages/contracts/openapi.yaml`, `authorization-matrix` `MATRIX`, `ROUTE_BODY_KEYS`, `docs/data-model.md`, `docs/api-contracts.md`, `services/api/test/mentorship.integration.test.ts`.

**Depends on.** Nothing. Everything it touches exists.

**Risk.** Low. One new table, no write to an existing row, no ledger, no trust rule.

**Size.** Small — half a day. The only trap is the break-glass read: it must not move a participant's marker.

### 2. `audit-sampling` — FR-ADM-03

**Scope.** Make `OutcomeService.hold` reachable: a scheduled selection job that picks `CONFIRMED` outcomes before the cooling period ends, holds each one with a reason (`AUDIT_SAMPLE` / `HIGH_DIFFICULTY`), and lets the existing review queue resolve it. One config constant for the rate, one deterministic draw so a rerun is idempotent, one queue on the existing worker.

**Files and areas.** `packages/config/src/index.ts` (rate), `services/api/src/outcomes/*` (selection job, one service method), `services/api/src/platform/outbox/outbox-worker.ts` + `outbox.ts` (one queue and cron), `docs/functional-requirements.md` `FR-ADM-03`, `docs/known-debt.md` (DEBT-29 narrows), `services/api/test/outcomes.integration.test.ts`.

**Depends on.** `audit-hold-transition` (already archived). No migration if the hold stays enum-free — verify before proposing; a `sampled_at` column would need `0020`/`0021`.

**Risk.** Medium. A wrong draw rate silently changes how much work the owner does per week, and a non-idempotent draw can hold one outcome twice.

**Size.** Medium — one day.

### 3. `configuration-versioning` — FR-ADM-07

**Scope.** The narrow version that satisfies the Then clause: a `config_versions` table of immutable rows, version 1 seeded from today's `@connect/config` constants, a platform-admin route pair to read the current version and create version N+1 (with a reason and an audit row), the counting job reading its values from the current version, and `reputation_events.config_version_id` recorded on every new ledger row. No re-scoring replay (that is FR-REP-06, Should).

**Files and areas.** new `db/schema/config.ts` + migration, `services/api/src/admin-config/*` (controller, service, module), `app.module.ts`, `services/api/src/reputation/counting-job.ts`, `packages/contracts/openapi.yaml` + `MATRIX` + `ROUTE_BODY_KEYS`, `AUDIT_ACTIONS` + the §12 table in `docs/auth-and-access-control.md`, `docs/data-model.md`, `docs/api-contracts.md`, `docs/functional-requirements.md`.

**Depends on.** Nothing hard. `FR-ADM-03`'s rate should land in the same version payload — do 2 first or accept one ordering constraint.

**Risk.** Medium-high. It changes what reputation counts with, and it adds an admin write route that must not be able to edit history.

**Size.** Large for this repo — 1.5 to 2 days. This is the one change I would not hand to an unattended run without the proposal being read first.

### 4. `evidence-upload-and-scan` — FR-OUT-02 (unblocks FR-PRIV-03 and the Tier 1 multiplier)

**Scope.** The two routes `docs/api-contracts.md` §5.6 already documents: request an upload, complete it after the object is scanned clean. File held in private object storage, SHA-256 recorded, quarantined until ClamAV answers, `evidence_tier` raised to 1 on a clean scan. A failed scan never becomes available. Tier 2 (third-party confirmation) stays out.

**Files and areas.** new `services/api/src/evidence/*`, `db/schema/outcomes.ts` (an evidence table) + migration, `packages/contracts/openapi.yaml` + `MATRIX` + `ROUTE_BODY_KEYS`, `outbox-worker.ts` (scan job), `AUDIT_ACTIONS` (`EVIDENCE_VIEWED`, `EVIDENCE_UPLOADED`, `EVIDENCE_SCAN_FAILED`), `docs/data-model.md`, `docs/api-contracts.md` (§5.6 stops saying "not built"), `docs/known-debt.md` (DEBT-22 closes), `docs/functional-requirements.md` (`FR-OUT-07` becomes built, not amended).

**Depends on.** Nothing in this list. It is the dependency for 5.

**Risk.** High. A new runtime dependency, a new I/O boundary that holds other people's documents, and a scan protocol that must fail closed. Also the first change in this repo that stores a user file.

**Size.** Large — 2 days.

### 5. `evidence-retention-sweeper` — FR-PRIV-03

**Scope.** A scheduled job that deletes an evidence object 90 days after its outcome reached a terminal state, keeps the hash and metadata row with `deleted_at`, writes one audit row per deletion, and never deletes while the outcome is live. A dry-run entry point so the owner can prove it ran.

**Files and areas.** `services/api/src/evidence/*` (sweeper), `outbox-worker.ts` + `outbox.ts` (one queue), `packages/config/src/index.ts` (`EVIDENCE_RETENTION_DAYS`), `AUDIT_ACTIONS`, `docs/data-privacy-and-retention.md` §6, `docs/known-debt.md` (DEBT-32 closes), `docs/functional-requirements.md` `FR-PRIV-03`.

**Depends on.** 4 — without uploads there is nothing to sweep.

**Risk.** Medium. A destructive job. It must never delete a live outcome's file and must be dry-runnable.

**Size.** Small — half a day once 4 exists.

### Why these five and not the others

- They close **every Must row that code can close without a credential, a document, or pilot data**: 3 NOT STARTED rows plus the one Must partial that is a plain backend gap. Projected register **56.0 → 59.5 / 64 (93.0%)**, code-only **53.0 → 57.5 / 64 (89.8%)** (the code-only gain includes `FR-OUT-07` returning to built-work credit).
- Not chosen: `FR-INST-02` institution aggregates (a Should, and the frontend half is most of the work), `FR-NOT-02`/`FR-NOT-04` (Should, no trust value), `DEBT-42` suggestion log (needs exposure data that the pilot produces), `FR-REQ-04` redirect (1b, needs the student-approval flow end to end), `DEBT-60` CSP nonce (a frontend change, and it is explicitly blocked on enumerating Next's inline bootstrap), `DEBT-41` GoalAlignment (needs an owner decision that collides with the "no hard-coded taxonomy" principle), `FR-REP-02/-03` calibration (needs pilot data by D-67), `FR-AUTH-02` (needs a real Google account, not code), and everything in the 1b/Could band.

---

## 5. Decisions needed per task

Format: question → recommendation → reason → main alternative → what breaks if it goes the other way. Every value below that the docs do not already fix is a `MATH-FLAG` and must not be invented in the change.

### Task 1 — `thread-read-state`

**1.1 Is "read" a stored timestamp per participant, or derived?**
- Recommend: a stored `last_read_at` per (mentorship, user), monotonic.
- Reason: docs/data-model D-62 already named `thread_read_states`; a stored marker is one write per read and needs no message-row update, so the thread stays immutable.
- Alternative: per-message read rows.
- If wrong: per-message rows grow with message count and need a delete path; they also make "mark all read" a bulk insert.

**1.2 Does reading mark itself read, or is there an explicit route?**
- Recommend: an explicit write (`POST /v1/mentorships/{id}/read`), and `unread_count` on the existing reads.
- Reason: an implicit write inside `GET` makes the read non-idempotent, adds a CSRF-guarded write behind a page load, and breaks the current contract that the thread read is a pure read.
- Alternative: mark on `GET`.
- If wrong: every thread fetch becomes a write, and the BFF's GET path needs a CSRF token it does not carry.

**1.3 Is the BFF/web page in this change?**
- Recommend: no — API, contract and tests only. The register row stays PARTIAL until a page reads the count, and the gap line says exactly that.
- Reason: backend-first is the stated priority, and `FR-THR-02`'s Must clause ("one notification is queued") already ships.
- Alternative: add the badge to `/mentorship/{id}` in the same change (roughly 30 lines of web code plus a test).
- If wrong: the register gains a PARTIAL that looks like dead work to a reader; or, if you take the alternative and the web change is sloppy, a Must row is marked DONE on a badge nobody checked.

**1.4 Does an admin break-glass read move the participant's marker?**
- Recommend: no. It writes its own audit row and touches nothing else.
- Reason: the marker belongs to the participant; a moderator reading must not be able to erase a participant's "unread".
- Alternative: mark read for the admin only (a separate column).
- If wrong: a break-glass read silently destroys evidence of what a participant had not yet seen.

**1.5 Retention of the marker row when a mentorship is deleted?**
- Recommend: `ON DELETE CASCADE`, same as the mentorship's other children.
- Alternative: keep it.
- If wrong: an orphan row survives an erasure.

### Task 2 — `audit-sampling`

**2.1 What is the sampling rate? (`MATH-FLAG`)**
- Recommend: 25% of confirmed outcomes during the pilot, in `@connect/config` as `AUDIT_SAMPLE_RATE`.
- Reason: the register says "start high in the pilot because volume is small", and at pilot scale (tens of outcomes a week) 25% is a few reviews a week for the owner — the only reviewer. The value is a constant, so a wrong guess is one line.
- Alternative: 10%, or all outcomes (100%).
- If wrong: too high overloads the only reviewer and outcomes sit in review past their cooling period; too low makes the control cosmetic.

**2.2 What does "all high-difficulty outcomes" mean while every weight is a 1.0 placeholder?**
- Recommend: the three outcome types the register already singles out as needing Tier 1 — Admission, Internship, Job offer — sampled at 100%.
- Reason: it needs no calibrated weights and it is defensible to a reviewer; reading "high difficulty" off placeholder weights would select everything.
- Alternative: wait for calibrated weights and ship random only.
- If wrong: with calibrated weights later, the rule over- or under-selects and needs a second change.

**2.3 Are anomaly triggers in this change?**
- Recommend: no. There is no anomaly signal in the system today (no device, no network, no rate anomaly per pair), and inventing one is a product decision.
- Alternative: one simple trigger — a mentor–student pair with 3 or more counted outcomes in 30 days.
- If wrong: `FR-ADM-03` stays partial on its third clause, which the register must then say.

**2.4 How is the draw made idempotent?**
- Recommend: a deterministic hash of (outcome id, config version) against the rate, plus the existing conditional hold — a rerun cannot hold twice because the state already moved.
- Reason: survives a retried job with no extra column.
- Alternative: a `sampled_at` column and an `IS NULL` filter (needs a migration).
- If wrong: a job retry holds an already-held outcome (409, noisy logs) or, worse, a random draw re-rolls and the sample is not reproducible.

**2.5 Where does the job live and how often?**
- Recommend: its own `audit-sampler` queue on the existing worker, every 15 minutes, sampling only rows whose `cooling_ends_at` is in the future.
- Reason: matches the sanction job's shape; sampling inside the counting transaction would conflate two jobs and make the counting path do selection.
- Alternative: inside `countDueOutcomes`.
- If wrong: a hold that lands after counting would need a clawback instead of a hold — a much more expensive correction.

**2.6 Does the reviewer get a queue filter for "held for audit"?**
- Recommend: yes, one reason filter on the existing `GET /v1/review-queue` (no new route, no new table).
- Alternative: nothing — the reviewer infers from the outcome.
- If wrong: the owner cannot see what the sampler produced, which defeats the purpose.

### Task 3 — `configuration-versioning`

**3.1 How wide is "configuration"?**
- Recommend: the runtime tunables only — cooling days, the three reputation multipliers, the difficulty weights, the match weights, the audit sample rate, the retention window. Everything else stays code and is recorded in the version payload as read-only.
- Reason: the Then clause is about a ledger event recording a version; rate limits and cron timings never touch a ledger row.
- Alternative: every constant in `@connect/config`, admin-editable.
- If wrong: an admin can change a rate limit or a cron expression from a web form — a denial-of-service surface with an audit row instead of a code review.

**3.2 Does an admin get a write route in this change?**
- Recommend: yes — `POST /v1/admin/config` creating version N+1 (PLATFORM_ADMIN + enrolled second factor + a reason) and `GET /v1/admin/config` for current and history.
- Reason: without a route the "changed only by Platform Admin" clause is unmet and the change produces a table nothing writes.
- Alternative: versions created only by deploy (a seed of the constants).
- If wrong: the version table becomes a mirror of the code and `FR-ADM-07` stays NOT STARTED in substance.

**3.3 Do the jobs read the versioned values?**
- Recommend: yes, the counting job reads cooling days and the four multipliers from the current version; the pure domain functions stay pure (they already take the values as input).
- Alternative: keep code constants and only record a version number.
- If wrong: the ledger records a version whose values nothing used — a worse lie than no version at all.

**3.4 Is the change re-scored (a replay)?**
- Recommend: no. FR-REP-06 (recalibration tool) is a Should and stays separate; history keeps the values it used.
- Alternative: a replay on approval.
- If wrong: a re-price of every mentor at once, with no way to attribute the change to a version after the fact.

**3.5 What happens to the existing ledger rows?**
- Recommend: backfill `config_version_id` to version 1 in the same migration with a `NOT NULL` default for new rows.
- Reason: a nullable version invites "unknown version" forever; version 1 is exactly today's constants.
- Alternative: leave existing rows null.
- If wrong: every historical event is un-attributable, and a later audit cannot tell which weights priced it.

**3.6 Is the version payload opaque or columnar?**
- Recommend: one `jsonb` payload with a schema check and a `sha256` digest column.
- Reason: it is immutable by definition and never queried by field; a digest makes tampering visible without a full hash chain.
- Alternative: one column per setting.
- If wrong: columnar means a migration for every new tunable.

### Task 4 — `evidence-upload-and-scan`

**4.1 How is the file stored? (new dependency)**
- Recommend: S3-compatible storage through `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`, pointed at the Compose `versitygw`. This is the one new dependency the change needs and `AGENTS.md` rule 9 requires your explicit approval.
- Reason: object storage is already in the stack and in the data inventory (`data-privacy-and-retention.md` §4 item 11 says "private object storage"); signed URLs keep files off the API's memory.
- Alternative: bytes in Postgres (`bytea`) — no new dependency, one transaction, no presigner; but every download streams through the API and the export/erasure story gets worse.
- If wrong: the dependency path costs the most review; the `bytea` path costs a later migration to move the bytes out.

**4.2 One upload route or the documented two.**
- Recommend: the two routes api-contracts §5.6 already names (request, then complete after the scan).
- Reason: the contract is the record; the alternative rewrites §5.6, which is a docs change this repo gates on.
- Alternative: one multipart POST.
- If wrong: a multipart body needs an exception to the 100 KiB `BodyAllowlistInterceptor` cap, which is a security control (DEBT-01).

**4.3 When is the scan run and what happens on failure?**
- Recommend: a worker job (ClamAV `INSTREAM` on 3310), quarantine until clean, fail closed — no availability, `EVIDENCE_SCAN_FAILED` audit row, the outcome stays Tier 0.
- Alternative: scan inline in the request (simpler, blocks the request, and a scanner outage becomes a 500 on upload).
- If wrong: fail-open is a malware distribution path; inline makes a ClamAV hiccup look like a broken feature.

**4.4 Does a clean scan move the tier, and do the multipliers change?**
- Recommend: `evidence_tier = 1` on a clean scan; `REPUTATION_TIER_MULTIPLIERS` stay 1.0, so no reputation is re-priced in this change.
- Reason: the multiplier values are a D-67 placeholder decision, not this change's business; mixing them in makes one change re-price the ledger.
- Alternative: enable real tier multipliers now.
- If wrong: enabling them silently changes every future mentor's points with no calibration behind the number.

**4.5 Allowed types and size limit (`MATH-FLAG`).**
- Recommend: PDF, PNG, JPEG; 5 MiB; one file per outcome.
- Reason: the register says "within the size limit" without a number; 5 MiB covers a scanned offer letter and a screenshot.
- Alternative: 10 MiB, or three files per outcome.
- If wrong: too small rejects a real admission letter; too large raises storage and scan time.

**4.6 Who can read a file?**
- Recommend: the reporting student, the mentorship's mentor, and a platform admin (a `EVIDENCE_VIEWED` audit row, `Cache-Control: no-store`, short-lived URL).
- Reason: §12 already names "evidence file viewed by a reviewer" as a documented event waiting for a code path.
- Alternative: platform-only.
- If wrong: mentor access widens what a mentor can see beyond the confirmation screen; the register's data inventory already lists the mentor as an intended viewer.

**4.7 Does the requirement row change shape?**
- Recommend: `FR-OUT-07` moves from "DONE by amendment (D-156)" to built work, and D-156's exclusion is superseded by a new `D-xx`.
- Alternative: leave the row as amended.
- If wrong: the register keeps scoring a built feature as an amendment, and the code-only figure stays artificially low.

### Task 5 — `evidence-retention-sweeper`

**5.1 What is the terminal trigger — COUNTED only, or COUNTED and REJECTED?**
- Recommend: both, 90 days after the terminal transition.
- Reason: the retention table says "90 days after the outcome is counted"; a rejected outcome's file has no purpose either and keeping it is a liability.
- Alternative: COUNTED only.
- If wrong: rejected outcomes keep files indefinitely, which the privacy notice does not say.

**5.2 What survives deletion?**
- Recommend: the metadata row with its SHA-256 and a `deleted_at`, no object.
- Reason: the retention table says "hash and metadata kept"; the hash is what makes a later clawback or audit possible.
- Alternative: delete the row too.
- If wrong: a clawback loses the only record that evidence existed.

**5.3 How often, and does it need a dry run?**
- Recommend: hourly queue; a dry-run entry point the owner can run against the test database.
- Reason: 90 days is coarse, so hourly is cheap; a destructive job needs a rehearsal this repo can point at.
- Alternative: daily, no dry run.
- If wrong: an off-by-one in the predicate deletes evidence for a live outcome, silently.

**5.4 Does a deletion write an audit row?**
- Recommend: yes — one `EVIDENCE_RETENTION_DELETED` per file, added to `AUDIT_ACTIONS` *and* to the reader's accepted union.
- Reason: D-155's lesson is that a writer emitting an action the reader refuses is a defect; both unions move together.
- Alternative: no audit row (the job is mechanical).
- If wrong: an auditor cannot tell whether a file was deleted by policy or by an operator.

**5.5 Withdrawal of consent triggering earlier deletion (the docs' "faster if the user withdraws consent")?**
- Recommend: out of scope, recorded as debt.
- Alternative: include it.
- If wrong: the retention doc promises a behaviour nothing implements — but it is a Draft doc with Proposed defaults, so debt is honest.

---

## 6. Code-versus-docs contradictions found

| # | Contradiction | Evidence |
|---|---|---|
| C1 | `README.md` status line quotes register **54.0 / 64 (84.4%)**, code-only 53.0, and lists no change after `audit-action-call-sites` | `README.md:8`; the register (`functional-requirements.md:310`) and `milestones-and-phases.md:22` both say 56.0 / 64 and 53.0 / 64; `grep` for the last five change names in README → 0 |
| C2 | `functional-requirements.md` §2.16 still says `FR-ADM-03` is "the only Not started row that is blocked by a design gap", because "`CONFIRMED` → `IN_PLATFORM_REVIEW` is unreachable (T6, DEBT-55)" — while the row forty lines above says the hold exists and DEBT-55 is closed | `functional-requirements.md:314` versus `:233`; D-162..164; `transition("CONFIRMED","auditHold")` returns `IN_PLATFORM_REVIEW` in `packages/domain` |
| C3 | `FR-OUT-01` is DONE, but its Given says "an Active or recently ended mentorship" and the report route checks only that the caller is the student — no status, no window — while the end-window length is still an open question | `drizzle-outcome.service.ts:310-317`; `functional-requirements.md:182` and `:387` (question 4) |
| C4 | `FR-NOT-01` says "18 named templates"; the union has 20 | `email-sender.ts:1-21` versus `functional-requirements.md:245` |
| C5 | `docs/known-debt.md` closes 13 rows without striking the problem text in the same row (DEBT-04, -05, -09, -12, -17, -18, -20, -23, -26, -36, -40, -50, -55), so a reader scanning the second column sees thirteen problems described as present that are closed. DEBT-19, -25, -27, -33, -34, -35 and -56 do it the other way (struck through). DEBT-47 and DEBT-53 exist *because* this pattern is misleading | `docs/known-debt.md` |
| C6 | `.hermes.md` §10 records "`docs/audit/` holds only `08-resolution-report.md`". Writing this file makes that line stale; I left `.hermes.md` untouched because this run is read-only | `.hermes.md:143`; `ls docs/audit` now also lists this file |
| C7 | `docs/mvp-build-plan.md` §5 is missing rows for two archived changes — `register-and-docs-harmonisation` and `register-annotation-cleanup` (both 2026-11-13) — while every other one of the 46 archives has a row. The milestone text describes `register-annotation-cleanup` as archived, so a reader of the plan cannot account for it | `for d in $(ls openspec/changes/archive); do grep -q "${d#*-*-*-}" docs/mvp-build-plan.md \|\| echo $d; done` → those two; `milestones-and-phases.md:20` |
| C8 | `docs/known-debt.md` DEBT-22's Status cell says the register "scores `FR-OUT-07` and `FR-ADM-06` as DONE ... (D-156), not by built work; this row is unchanged and no code changed" — correct — but the same file's DEBT-32 still points at "no evidence file exists yet, DEBT-22" as the reason retention cannot run, while `FR-PRIV-03` is scored NOT STARTED for the same reason. Two rows, one cause, no cross-reference from the register row | `known-debt.md` DEBT-22/DEBT-32; `functional-requirements.md:258` |

Not a contradiction, but worth recording: `docs/local-setup.md` documents 55432 as the default and 55400 as this machine's worked value (D-157), and the running stack uses 55400. That is the document and the machine agreeing.

---

## 7. What I could not verify

1. **The Google success path** (DEBT-15). The provider is configured and the authorization leg was previously verified to Google's consent screen, but completing the token exchange needs a real Google account and registered credentials. `FR-AUTH-02` stays PARTIAL on that basis and no test in this run exercises it.
2. **CI itself.** I ran the four gates locally and read `.github/workflows/ci.yml`; I did not run `pnpm audit`, gitleaks, or the two image builds and scans. Do not quote them as passing on my word.
3. **Backup and restore.** Gate 2 requires a performed restore with a date, duration and result. Nothing in the repo records one, and the local stack has no backup job. I report it as absent, not as broken.
4. **Device install and accessibility.** `FR-UX-01` and `FR-UX-04` need a real phone and a manual keyboard/screen-reader pass. I did not run either.
5. **Browser behaviour of the last five archived changes.** Their rows claim a browser pass (the CSP one with zero `securitypolicyviolation` events). I read the code and the tests; I did not re-drive the pages.
6. **All 46 archived changes and all 41 synced specs.** I read the register, the debt file, the plan, the milestones, the decision log tail (D-150..D-171), the OpenSpec inventory and the areas the five tasks touch. I did not check every spec delta against the code; a spec that drifted silently outside those areas would not have been caught.
7. **The 1 M-row threshold in DEBT-58** and the sizing claims behind DEBT-45 (`SUGGESTION_POOL_LIMIT = 200`) are judgment calls in the docs that I did not measure.
8. **`pnpm-lock.yaml` integrity / dependency CVEs.** Not audited in this run.
9. **Whether `origin/main` has moved.** I did not fetch; the local `main` is at `c3996dd` with a clean tree.
10. **The exact size of §4's tasks.** Sizes are estimates from the archived changes' own scale, not measurements.

---

## 8. Suggested apply order, and what must not run unattended

```
Round A  (safe unattended, no new dependency, no destructive job)
  1. thread-read-state          small      no dependency
  2. audit-sampling             medium     needs the rate answered first

Round B  (needs the proposal read before apply)
  3. configuration-versioning   large      admin write route + ledger column
  4. evidence-upload-and-scan   large      new dependency, new file boundary

Round C  (after 4 exists)
  5. evidence-retention-sweeper small      destructive job; dry run first
```

- **Order within a round matters only where stated**: 5 needs 4; 2 is cleaner before 3 because the sampling rate belongs in version 1's payload.
- **Do not run unattended:** `evidence-retention-sweeper` (it deletes files — a wrong predicate is unrecoverable) and `configuration-versioning` (it re-prices reputation and adds an admin write route; a review of the proposal is cheaper than a review of the diff). `evidence-upload-and-scan` is borderline: it is the largest and it adds a dependency, so at minimum a human must approve the dependency and read the scan's fail-closed path.
- **Safe unattended:** `thread-read-state` and `audit-sampling`, provided the sampling rate and the high-difficulty rule are answered before the run starts.
- **One change per branch, one archive per change, and the docs gate in `.hermes.md` §5 applies to each**: after this round, `README.md`'s status line must be rewritten to the verified count (it is already stale, C1), and the register's §2.16 bullet for `FR-ADM-03` must be corrected (C2).
