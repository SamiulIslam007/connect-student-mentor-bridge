# Round five: apply and archive report (2026-11-21)

Every change in this round came from `docs/audit/2026-11-20-propose-round-five-changes.md`. Eight proposals were written,
validated and uncommitted on `main`; this run took each one from proposal to merged, one branch and one pull request at a
time, and archived seven of the eight.

## 1. Per change

| # | Change | Merged | PR | Merge commit | Archived | Tests it added or ran | Deviations |
|---|---|---|---|---|---|---|---|
| 1 | `dependency-security-bump` | yes | #103 | `a7880cf` | yes, PR #104 (`4e3ac78`) | full suite green: web 259, contracts 23, domain 164, api 386, 0 skipped; `pnpm build` twice 0 and 0 | `next` moved only to 16.4.6; the two dev-only moderates were recorded as `DEBT-72` rather than suppressed |
| 2 | `e2e-happy-path` | yes | #105 | `2f9741d` | yes, PR #106 (`38a23eb`) | 832 tests green (the four suites above); the browser path itself 1 passed | task `3.2` (a deliberate red CI run) was not performed; recorded in `tasks.md`, not hidden |
| 3 | `docs-truth-gate-doc-and-debt-targets` | yes | #107 | `b5605aa` | yes, PR #109 (`968e9d0`) | no new tests: the change is documents. Production requirements ended at 19 `[x]` / 23 `[ ]` / 17 `unmet:`; milestones §5.5 at 12 `[x]` / 6 `[ ]` | none; every ticked box cites a file, test or command in its own row |
| 4 | `visual-design-and-responsive-layout` | yes | #108 | `a8b0de8` | yes, PR #113 (`0862f86`) | `e2e/visual-contract.spec.ts` 4 passed; 360 px, 44 px targets, focus ring and computed tokens measured on 23 surfaces | pages are styled by element rather than by a class per element; recorded in `tasks.md` §7 |
| 5 | `accessibility-evidence` | yes | #110 | `3ffa4e4` | yes, PR #116 (`e085cb9`) | `e2e/accessibility.spec.ts` 5 passed over 23 surfaces + 2 forced error states; zero violations at every severity | the NVDA pass and the signed-in admin surfaces were not performed; `FR-UX-04` stays `PARTIAL`, `DEBT-38` open |
| 6 | `thread-read-state-ui` | yes | #112 | `1311aa5` | yes, PR #117 (`6cd384f`) | web 271 (8 read-state + 4 wiring tests); browser assertion in the happy path | `/requests` makes one mentorships read for the whole page because the request row carries no `unread_count`; `D-247` |
| 7 | `breached-password-check` | yes | #114 | `d348dfe` | yes, PR #118 | domain 8, checker 5, integration 4 | the privileged-role variant is `DEBT-77`, not half-built; one Gitleaks false positive recorded in `.gitleaksignore` |
| 8 | `first-deployment-restore-drill-and-observability` | yes | #115 | `d1f807f` | **no, deliberately open** | `services/api/test/observability.test.ts` 4 passed; full suite 840 at that commit | only the repository half could be done: 12 of 34 tasks ticked, everything needing a host is an owner action |

## 2. Final state

- Final `main` after this report's own merge: the commit that carries this file (see `git log -1` on `main`).
- Full suite at the final state: `CI=true pnpm test` - web 270, contracts 23, domain 172, api 399, 0 failed,
  0 skipped; `CI=true pnpm lint` 0, `pnpm typecheck` 0, `CI=true pnpm build` twice, 0 and 0.
- `openspec list --json`: one active change (`first-deployment-restore-drill-and-observability`); seven archived.
- `openspec validate --all --strict`: 49 items, 0 failed.

## 3. Register movement

| Document | Before | After |
|---|---|---|
| `docs/functional-requirements.md` | `FR-THR-02` `PARTIAL`, `FR-UX-04` `NOT STARTED` | `FR-THR-02` **`DONE`** (change 6); `FR-UX-04` `PARTIAL` with the automated half built (change 5) |
| `docs/security-requirements.md` | `SEC-AUTH-3` "the third is not" | `SEC-AUTH-3` **all three clauses built** (change 7) |
| `docs/known-debt.md` | `DEBT-11`, `14`, `38`, `61`, `67`, `71`, `74`, `75`, `76` open | `DEBT-38` (NVDA), `DEBT-72` (dev-only advisories), `DEBT-74`, `DEBT-75` (narrowed), `DEBT-77` (privileged breach check) open; `DEBT-61`, `67`, `71`, `73`, `76` closed |
| `docs/production-requirements.md` | 17 `unmet:` lines | same count of open boxes, but each now names either a built artefact or an **OWNER ACTION** |
| `docs/milestones-and-phases.md` §5.5 | 12 `[x]` / 6 `[ ]` | unchanged by this round; the two functional closures are in §2, not §5.5 |

## 4. Owner actions (nothing below can be done by an agent)

1. **Host and region.** Run `production-requirements.md` §5's one-day test; Render is the recorded first candidate
   (ADR-021 is `Proposed`, not decided).
2. **Managed Postgres with PITR, a private bucket, a transactional mail provider.** Then set the deployed environment's
   variables from `.env.example` - no value is committed.
3. **`SENTRY_DSN`** for the Sentry project (free tier), then throw one deliberate error per process and read the three
   reports. The scrub list is proven locally; the deployed reports are not.
4. **External uptime check** on `/healthz` and the sign-in page, five-minute interval, alert to your address; prove it once by
   pointing a check at a 500 and recording the email's arrival time.
5. **One alert** on the API's `password.breach_check_unavailable` line once the log platform is chosen.
6. **The first deployed release:** run `infra/deploy/deploy.sh` once and record the four lines it prints plus `/healthz`,
   `/readyz` and the sign-in page answering 200.
7. **The first `PLATFORM_ADMIN`** on the deployed database: the documented `INSERT`, the second factor at
   `/account/security`, and the proving `SELECT`; fill the runbook §6 row.
8. **The real restore drill:** `pg_dump`, `pg_restore` into a scratch database, the three counts, and **one authenticated read
   through the API against the restored data** - the part a local rehearsal cannot show, and the one that would catch an empty
   evidence bucket. Fill the runbook §7 row.
9. **The NVDA screen-reader pass** and the signed-in admin surfaces, then update
   `docs/audit/2026-11-21-accessibility-pass.md` and decide whether `FR-UX-04` becomes `DONE` (`DEBT-38`).
10. **`EVIDENCE_RETENTION_DRY_RUN`**: read one `evidence.retention_swept` line with `eligible > 0`, then flip it on the worker
    only and record both lines.
11. **Rebuild after the bump:** any local `.next` from before `next@16.4.6` should be removed once; CI is clean.
12. **Bird's-eye check of `db:migrate`** on any non-development database before it is used; migrations `0000`-`0023` are
    unchanged by this round.

## 5. Open questions, and the default used

| Question | Default this round used | What settles it |
|---|---|---|
| Is there a staging environment, or is the local stack staging until a host exists? | The local stack, as `production-requirements.md` §5 already says | The host decision (ADR-021) |
| Does the identity library's mail get a provider-level retry, closing `DEBT-11`? | Left open; `DEBT-11` stays with the deployment change | The mail provider's own retry capability |
| Should a privileged role be exempt from the breach check at registration? | No exemption; the variant is `DEBT-77` | A password-change route, or an admin policy decision |
| Is `FR-UX-04` `DONE` on the automated evidence alone? | No: `PARTIAL` until a manual pass exists | Your NVDA pass |

## 6. Skipped, unverified and risky

- **Skipped:** the e2e job's deliberate red run (task `3.2` of change 2); the deployed halves of changes 5, 7 and 8; metrics
  (`production-requirements.md` §9 has no metrics surface at all).
- **Unverified:** Google sign-in's success path (`DEBT-15`, unchanged by this round); image digests and registry tagging (no
  registry exists); every deployed Sentry report; the uptime alert's real arrival time; the PITR window.
- **Risky, stated plainly:** the API now makes one outbound HTTP call on the registration path (3-second budget, fail open);
  `/requests` reads the mentorships list to build its badge map; the seeded demo mentors now carry an obviously-fake password
  and an encrypted TOTP secret, which is test-fixture truth, not production behaviour.
- **Defect found and fixed in this round:** the merge on `feat/breached-password-check` staged `docs/` wholesale and carried
  two conflict-marker lines into `docs/decision-log.md` on `main`. Fixed in #115 by rebuilding the round-five tail from the
  entries themselves; a repository-wide scan for markers now returns nothing. The lesson: resolve every conflicted file
  explicitly, never `git add docs`.
- **Two PRs were closed or superseded rather than merged:** #111 (the first visual-design archive) was closed and rebuilt as
  #113 after a conflict with #110.
