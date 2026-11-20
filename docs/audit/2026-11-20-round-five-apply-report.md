---
title: Round five apply report (2026-11-20)
status: Final
owner: Owner / CTO
date: 2026-11-20
sources: [docs/functional-requirements.md, docs/known-debt.md, docs/decision-log.md, openspec/changes/archive/]
---

# Round five apply report — 2026-11-20

Five changes applied, verified, archived and merged, in the order the round
fixed. One follow-up fix merged on top. One thing was briefly red on `main`,
and it is named in §1 rather than hidden.

Everything below was run on this machine except where it says **UNVERIFIED**.

## 1. Per change

| # | Change | PR | Merge commit | Archived as |
|---|---|---|---|---|
| 1 | `institution-dashboard-aggregates` | #96 | `fe36aa2` | `archive/2026-11-20-institution-dashboard-aggregates` |
| 2 | `idempotency-key-on-writes` | #97 | `be515fa` | `archive/2026-11-20-idempotency-key-on-writes` |
| 3 | `signup-bot-protection` | #98 | `9cfd554` | `archive/2026-11-20-signup-bot-protection` |
| 4 | `evidence-retention-edges` | #99 | `afdc1d3` | `archive/2026-11-20-evidence-retention-edges` |
| — | `fix/evidence-retention-clock` (follow-up) | #101 | `79fcc93` | not a change |
| 5 | `pilot-runbook-and-docs-truth` | #100 | `4364131` | `archive/2026-11-20-pilot-runbook-and-docs-truth` |

All five merged with a **merge commit** (no squash), branch deleted after each.

### 1.1 Institution dashboard aggregates (FR-INST-02)

- Built: `GET /v1/institution/aggregates?institution_id=` for an `INSTITUTION_ADMIN`
  with MFA and that institution's scope; whole-number counts only; a five-row
  suppression floor as a code constant; keyset pagination on `GET /v1/institutions`.
- Tests added: `institution-dashboard.integration.test.ts` (10),
  `aggregates.test.ts` (4), `cursor.test.ts` (5), plus updates to
  `authorization-matrix.test.ts` and `request-validation.integration.test.ts`.
- Closed: `FR-INST-02` (a Should), `DEBT-51`. Opened: `DEBT-68`.
- Decisions: D-211 to D-214.

### 1.2 Idempotency keys on the three writes (SEC-API-7)

- Built: an optional `Idempotency-Key` on `POST /v1/requests`, `POST /v1/outcomes`
  and `POST /v1/mentorships/{id}/messages`; keyed on `(actor, server-chosen
  operation, key)`; canonical-JSON SHA-256 digest; replay of a completed 2xx;
  `409` on a body mismatch or an unfinished key; hourly sweep; migration `0023`.
- Tests added: `idempotency.integration.test.ts` (10), `idempotency.test.ts` (4),
  `database.integration.test.ts` updated to 34 tables plus a DELETE grant probe.
- Closed: `SEC-API-7`, `DEBT-21`.
- Decisions: D-215 to D-220.

### 1.3 Bot protection on sign-up (SEC-ABUSE-1's second clause)

- Built: a documented hidden `contact_website` field refused by the BFF **and** by
  `POST /v1/auth/register`; an httpOnly `connect_signup_intent` marker minted by
  `GET /api/auth/register-intent`; a 2-second floor and 1-hour ceiling; one
  generic `422 REGISTRATION_REFUSED`; one server-side log line naming the check.
- Tests added: `sign-up-bot-protection.test.ts` (4), `sign-up-intent.test.ts` (7),
  `auth-routes.test.ts` additions, `registration-refusal.test.ts` (2).
- Closed: `SEC-ABUSE-1`'s bot clause, `DEBT-70`. No migration, no dependency.
- Decisions: D-221 to D-224.

### 1.4 Evidence retention edges (FR-PRIV-03)

- Built: all four settled states start their own clock (`counted_at`,
  `rejected_at`, `reversed_at`, `withdrawn_at`); a null own instant is never due;
  the reporting student's earlier institution-sharing withdrawal moves the origin
  earlier, never the mentor's, never later; the selection and the per-row re-read
  share one predicate under the row lock.
- Tests changed: `evidence-retention.test.ts` rewritten (7), eight new cases in
  `evidence.integration.test.ts`, two pre-existing expectations updated (see §5).
- Closed: `DEBT-64`, `DEBT-66`. No migration.
- Decisions: D-230 (supersedes D-204's third clause) to D-233.

### 1.5 Pilot runbook and docs truth

- Built (docs only, `skip_specs`): `docs/runbook.md`; a by-command recount; the
  register amendments; `DEBT-67`; 21 struck debt rows; two restored build-plan
  rows; the milestones rewrite with its history section.
- Tests added: none (docs only; the gate is that the other suites do not move).
- Closed: none by code. Register truth: `FR-INST-01` and `FR-ADM-03` to `DONE`
  **by amendment, not by built work**. Opened: `DEBT-67`.
- Decisions: D-225 to D-229.

### 1.6 The red minute on `main`

PR #99 merged green, and its merge commit `afdc1d3` then failed CI: `the window is
measured from the terminal instant, not earlier` passed locally and failed on the
runner. The candidate query compared a row's origin against the app's
`new Date()` while the fixture wrote its instant with the database's `now()`;
milliseconds of app/DB skew kept an exactly-90-day-old file. #101 makes one clock
(the database's) decide both the selection and the re-read, and writes
`deleted_at` with that same instant. `main` was red for about one hour, never for
a release.

## 2. Final state

- `main` at the merge of this round: `4364131` (then this report's own PR).
- Test totals on the round's last verified run (CI on `79fcc93`, and the same
  suites locally): **832 tests, 831 pass, 1 skipped** —
  domain 164, web 259, contracts 23, api 386 (385 pass, 1 skipped).
  The skip is pre-existing and environmental:
  `readiness resolves a host run through the repository .env` — `# the repository .env does not exist`.
- Latest migration: **`0023_aberrant_drax.sql`** (the idempotency table). No change
  in this round adds another.
- Must count, by command:

  ```
  $ grep '^| FR-' docs/functional-requirements.md | grep '| Must |' | wc -l
  64
  $ ... | grep -c 'Status: DONE'      → 55
  $ ... | grep -c 'Status: PARTIAL'   →  9
  $ ... | grep -c 'Status: NOT STARTED' → 0
  ```

  **Register 59.5 / 64 = 93.0%. Code-only 56.0 / 64 = 87.5%.** The code-only figure
  scores three amendment-only rows at 0.0 (`FR-ADM-05`, `FR-ADM-06`, `FR-INST-01`)
  and `FR-ADM-03` at 0.5.
- `openspec validate --all --strict`: 47 passed, 0 failed.

## 3. Verification evidence, per change

**1 — aggregates.** Real HTTP as four callers against the rebuilt stack: the
owning institution admin with MFA gets `200` with `verified_alumni`,
`active_mentors` and the request/outcome counts as whole numbers; an admin of a
different institution gets `404 INSTITUTION_NOT_FOUND`, as does an unknown id, so
the two are indistinguishable; a non-admin gets `403 ROLE_REQUIRED`; no token gets
`401`. A cohort of 4 alums returns `suppressed: ["verified_alumni"]` and no
number; 5 returns `5`. Mutation checks: `<` to `<=` in the floor (2 of 4 domain
tests fail), dropping the sort (stable order fails), dropping the institution
filter (count 9 instead of 5), skipping the scope check (200 instead of 404) —
all restored.

**2 — idempotency.** The same key twice with the same body replays the first
response byte for byte and writes one row; the same key with a different body is
`409 IDEMPOTENCY_KEY_REUSED` and writes nothing; a second in-flight call is
`409 IDEMPOTENCY_IN_PROGRESS`; an invalid key (`6` chars, `a b`, `x!`) is
`422 IDEMPOTENCY_KEY_INVALID`; an `IN_PROGRESS` row expires after five minutes and
the hourly sweep removes it, so a crashed request cannot wedge a key; the same key
string used by two different actors produces two independent rows. Mutation: the
digest comparison toggled off made the different-body case pass — caught.

**3 — sign-up.** Against the rebuilt web container: `GET
/api/auth/register-intent` sets the marker; a valid submission 3 s later is `200
{"status":"verification_sent"}`; a filled honeypot is `422 REGISTRATION_REFUSED`;
a submission 0 s after the marker is the same `422`; a submission with no marker is
the same `422` again, with a byte-identical body. `select count(*)` on the three
refused addresses returns `0` — no user, no consent, no audit row. Mutation: a
per-check detail made the identical-bodies test fail; skipping the API check made
the refusal test return `200`.

**4 — retention.** Dry run against the dev database with the variable unset:
`{"event":"evidence.retention_swept","examined":0,"eligible":0,"deleted":0,"failed":0,"dryRun":true}`,
with the storage stub's `delete` set to throw — it was never called. In the test
database: a year-old count reversed yesterday keeps its file; the same reversal 91
days old deletes the object, keeps the hash and writes one audit row; a
`WITHDRAWN` outcome past its own window deletes; a counted outcome 10 days old
with a 100-day-old student withdrawal is due, the same row with a 5-day-old
withdrawal is not, and the mentor's own withdrawal changes nothing. Mutations:
dropping the consent subquery and joining the mentor instead of the student both
failed the intended tests.

**5 — runbook and counts.** Every command in the runbook was run here: the seven
services `(healthy)`; `/healthz` → `{"status":"ok","service":"api"}`; `/readyz` →
`{"status":"ok","checks":{"database":"ok"}}`; web `/healthz` →
`{"status":"ok","service":"web"}`; `docker compose logs api | grep api.started` →
`{"event":"api.started","port":3001}`; `pnpm --filter api db:migrate` →
`[✓] migrations applied successfully!`; `to_regclass('public.idempotency_keys') is not null` → `t`;
an SDK head/put/get against the bucket → `HEAD ok`, `GET ok`. The recount printed
the numbers in §2. Untestable steps are marked **UNVERIFIED** in the runbook with
the reason.

## 4. Security review findings and fixes

| Finding | Where | Fix |
|---|---|---|
| The refusal detail briefly named which check fired, which is an oracle for the next attempt | `apps/web/app/api/auth/register/route.ts` | One sentence for all three checks; the check name goes to the server log only (D-224) |
| An undeclared honeypot key would be refused by the body allowlist with the key named, teaching a bot what to leave empty | `packages/contracts/src/body-keys.ts` | The field is declared in the allowlist and in OpenAPI, and refused for being *filled* (D-221) |
| A platform admin could plausibly be assumed to read institution aggregates | `docs/functional-requirements.md` §3 | Row corrected to `No (institution scope only, D-212)`; the route returns `403 ROLE_REQUIRED` |
| An unknown institution id and an out-of-scope id must not differ | `authorize.ts` | Both `404 INSTITUTION_NOT_FOUND` (D-212) |
| A clawback's material could be deleted on the day it was needed | `evidence-retention.ts` | Each state's own instant, never a coalesce (D-230) |
| A retention decision depended on app/DB clock skew | `services/api/src/evidence/retention.ts` | One clock — the database's — decided both halves (#101) |
| An `Idempotency-Key` could become a cross-tenant signal | `idempotency` store | Bound to `(actor_user_id, operation, key)`; the operation literal is server-chosen (D-215) |
| Dependency advisories | `pnpm audit` | **Open**: 9 moderate advisories, no high or critical — 7 on `next@16.4.3`, 1 `esbuild@0.18.20` (dev server), 1 `minimatch@10.2.6`. Recorded as `DEBT-71`; not fixed inside this round's scope |

Both review passes ran on every diff (line-by-line, then adversarial). No test was
weakened or deleted; two pre-existing expectations moved and both are named in §5.

## 5. Known-debt changes and decisions taken without asking

**Debt rows**

- Closed: `DEBT-21`, `DEBT-51`, `DEBT-64`, `DEBT-66`, `DEBT-70`.
- Opened: `DEBT-67` (the breached-password clause of `SEC-AUTH-3`), `DEBT-68` (no
  institution aggregates page and no cursor-following admin list), `DEBT-71`
  (the nine moderate dependency advisories, seven of them `next@16.4.3`).
- Struck (closed text, same rule): the 20 rows that said `Closed` with unstruck
  problem text, plus `DEBT-70` struck when added — the check now prints zero.

**Decisions I made myself**

1. **Struck 21 rows, not only the 15 named in the design.** The design's own check
   must print zero, and the extra six (`DEBT-21`, `DEBT-40`, `DEBT-50`, `DEBT-51`,
   `DEBT-64`, `DEBT-66`) closed in this round and the last one.
2. **Opened #101 instead of folding the clock fix into the docs PR.** A docs-only
   change must not carry code, and the fix belongs to the change that introduced it.
3. **Changed the boundary test's `examined` expectation from 1 to 0.** The candidate
   query now filters on the origin (design and D-232), so an inside-the-window row
   is never examined; the behavioural claims — nothing deleted at 89 days, deleted
   at exactly 90 — were kept and still pass.
4. **Corrected the §3 role-table row for platform admins.** It contradicted D-212,
   and docs truth is this change's job.
5. **Wrote the two restored build-plan rows from the archive's own text.** The
   designs were not available for those two 2026-11-13 changes; the rows cite what
   the archive records, and say "docs only, no code".
6. **Recorded the register as 59.5 / 64 rather than the design's 59.5 / 64 by
   coincidence.** The command was run first and the prose follows it.

## 6. Manual leftovers (owner)

1. `pnpm --filter api db:migrate` on every non-dev database **before** the new API
   and worker images take traffic — migration `0023` adds `idempotency_keys`.
2. Rebuild and restart the `api` and `worker` containers there (done locally here).
3. Create or confirm the evidence bucket on the non-dev object stores.
4. Read **one** `evidence.retention_swept` line with `eligible > 0`, then set
   `EVIDENCE_RETENTION_DRY_RUN=false` on the worker and restart that one service.
5. Perform the restore drill and fill the record table in `docs/runbook.md` §7.
6. Enrol the second factor for the first `PLATFORM_ADMIN` and fill the bootstrap
   record in §6.
7. Decide `DEBT-67`: which breach list, which outbound call, and what registration
   does when the provider is unreachable.
8. Consider bumping `next` past 16.4.3 (`DEBT-71`); `pnpm build` stops once with a
   security nudge and needs a retry until then.

## 7. Unverified, and the risk

| Item | Risk |
|---|---|
| The deployment migrate, and `0023` on a non-dev database | Medium: a new image on an old schema fails every keyed write with a missing-relation error; the runbook orders migrate first |
| The bucket step with an `aws`/`mc` client | Low: the SDK head/put/get proved the store and the credentials; only the client syntax is untested |
| The restore drill itself | Medium: an untested restore is discovered during an incident; the record table says `not yet performed` so nobody assumes it ran |
| Provider-specific TLS, host and backup values | Low now, high at Gate 2: they are `<deployment value>` and must be filled before real users |
| The first live retention sweep | Medium and one-way: it deletes objects for good; the dry run reports first, and the default is unchanged (`true`) |
| `next@16.4.3` advisories | Low today (all moderate, several behind `use cache` which the app does not use), rising as the app grows |
