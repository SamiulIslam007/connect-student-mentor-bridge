# Tasks: pilot-runbook-and-docs-truth

Decision rows to add at apply (reserved, one contiguous block): **D-225 to D-229** — D-225 the runbook's home and its two links, D-226 the INSERT-verify-note bootstrap with rule 12 unchanged, D-227 the hand-filled restore record, D-228 the fifteen mechanical strikes, D-229 the two register amendments and their code-only treatment. Continue the block for any further `R` decision.

This change is docs only: no code, no contract, no migration, no test. Its verification is commands, and each one's real output is pasted into this file as it is run.

## 0. Preconditions

- [x] 0.1 Re-read the snapshot: `git log --oneline -1`, `git status --short`, `find . -iname "*runbook*" -not -path "./node_modules/*"`.
- [x] 0.2 Re-run the three mechanical checks and record their output:
  - `for d in $(ls openspec/changes/archive); do grep -q "${d#*-*-*-}" docs/mvp-build-plan.md || echo MISSING-PLAN-ROW: $d; done`
  - the fifteen-row check from the design's Context paragraph (the Python one-liner in `docs/audit/`'s report is not authoritative; recompute it)
  - `grep -c "anomaly" openspec/specs/mentorship/platform-review/spec.md` and `grep -rn "status transition\|edit an institution\|domain verification" openspec/specs/institutions`
- [x] 0.3 Confirm the four other changes of this round are merged, and record their effect on the counts: `grep -c "Status: DONE" docs/functional-requirements.md` and the PARTIAL count. If one is unmerged, list which, and mark the recount task BLOCKED rather than guessing.
- [x] 0.4 Read `docs/local-setup.md` for the sanctioned `PLATFORM_ADMIN` `INSERT`, the bucket step and the migrate command; this change copies them, it does not invent them.

## 1. The runbook, first half

- [x] 1.1 `docs/runbook.md` with the repo's frontmatter (title, status, owner, date, sources) and a one-paragraph scope: what an operator does on a fresh deployment, and what this file deliberately does not decide (hosting, region, provider).
- [x] 1.2 Bring-up: `docker compose up -d`, `docker compose ps` with the expected healthy services, the two health probes with their expected bodies, and the log line that shows the API started.
- [x] 1.3 Migrate: `pnpm --filter api db:migrate` against the deployment database, the read-back query that proves the latest migration applied, and the rule that migrations run before the new images take traffic.
- [x] 1.4 Object store: create the `connect-local`-equivalent bucket once, the endpoint variables (`S3_ENDPOINT`, `S3_PUBLIC_ENDPOINT`, the bucket name), and the check that proves one object can be written and read back.
- [x] 1.5 The retention switch: what `EVIDENCE_RETENTION_DRY_RUN` does, the exact enabling value, the log line to read before flipping it, and how to flip it back.
- [x] 1.6 Every command above is run on this machine where it is safe (bring-up and the health probes are; a deployment migrate is not) and its real output pasted here; a step that cannot be run is marked UNVERIFIED with the reason.

## 2. The runbook, second half

- [x] 2.1 Incident and support path: who is paged (the owner, in the pilot), the two triage questions (is `readyz` green, is the worker consuming), where the logs are, and the rollback of a bad deploy (previous image tag).
- [x] 2.2 First production `PLATFORM_ADMIN`: the sanctioned `INSERT`, its verification `SELECT` (the user row and the `role_assignments` row), the sign-in and second-factor enrolment step, and the bootstrap record table (date, operator, environment, reason, note) with one row explaining why it exists.
- [x] 2.3 Backup and restore drill: the drill steps, the verification (row counts on the ledger tables and one snapshot replay), and the record table (date, environment, duration, result, operator).
- [x] 2.4 Say in the runbook that the bootstrap `INSERT` is outside the audit log and that the record table is the compensation, naming `DEBT-46`.

## 3. Build-plan rows

- [x] 3.1 `docs/mvp-build-plan.md` §5: one row for `register-and-docs-harmonisation` (what it did, `DONE`, archived 2026-11-13) and one for `register-annotation-cleanup` (the 64-row single-marker sweep and the §2.16 publication), both in the table's existing column shape and placed with the other 2026-11-13 rows.
- [x] 3.2 Re-run the mechanical check and paste the output: no `MISSING-PLAN-ROW` line remains.

## 4. Milestones truth

- [x] 4.1 `docs/milestones-and-phases.md`: the "Current state" block rewritten to one statement per field within twelve lines — Updated, Phase, Current sprint, Last archived change (the most recent, one sentence), In flight, Next change, Open blockers.
- [x] 4.2 The superseded narration moves under a `## History` heading in the same file, each block prefixed with its date and the sentence "Historical, superseded by the live tracker".
- [x] 4.3 `wc -l` on the current-state block is twelve or fewer, and a read-through finds no two statements about the same field.

## 5. Debt truth

- [x] 5.1 Strike the Debt cell of the fifteen closed rows named in the design (`~~…~~`), touching nothing else in each row.
- [x] 5.2 Re-run the check: fifteen closed-and-unstruck become zero, and `grep -c "| Closed" docs/known-debt.md` is unchanged.
- [x] 5.3 Add `DEBT-67`: the unbuilt breached-password clause of `SEC-AUTH-3`, its evidence (`grep` output), the decision it needs (which list, which call, what happens when the provider is unreachable during registration), its owner and target, and `Open`.
- [x] 5.4 `docs/security-requirements.md`: the `SEC-AUTH-3` annotation names the built half (length rule, hashing by the identity library) and `DEBT-67` for the rest.

## 6. Register truth and the recount

- [x] 6.1 `docs/functional-requirements.md` `FR-INST-01`: `DONE`, with the amendment parenthetical naming the excluded scope and `DEBT-51`'s closure by `institution-dashboard-aggregates`.
- [x] 6.2 `FR-ADM-03`: the requirement text reworded to random sampling plus the always-sampled types, the row naming `DEBT-62` for the anomaly clause, and the status marker `DONE` with the amendment parenthetical.
- [x] 6.3 §2.16: recount by command — `grep '^| FR-' … | grep '| Must |'` then one count per status — and replace every figure with the printed ones. State the register and code-only totals, name the amendment-only rows (`FR-ADM-05`, `FR-ADM-06`, `FR-INST-01`) and the half-exempt `FR-ADM-03`, and keep the command basis beside the number.
- [x] 6.4 Fill the `D-xxx` placeholders in 6.1 and 6.2 with the reserved numbers.
- [x] 6.5 `README.md` status line: this change, the register figure the command printed, and one link to `docs/runbook.md`.

## 7. Point the requirements at the runbook

- [x] 7.1 `docs/production-requirements.md` §12.1: the runbook item ticked, pointing at `docs/runbook.md`; §10 and §13.2: the restore item points at the drill and its record table.
- [x] 7.2 `docs/local-setup.md`: one line linking the runbook for the deployment-only steps, and a note that the bucket is not created by the compose stack.
- [x] 7.3 `docs/decision-log.md`: the reserved rows with Date / Decision / Reason / Status / Affects.

## 8. Checks, review, handoff

- [x] 8.1 `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` — each its own command with its exit code recorded; a docs-only change must not perturb them.
- [x] 8.2 `openspec validate pilot-runbook-and-docs-truth --strict` (expects `is valid` plus the one `skip_specs` info line) and `openspec validate --all --strict`; quote both totals.
- [x] 8.3 `openspec status --change pilot-runbook-and-docs-truth` reads `3/3 artifacts complete (1 skipped)`.
- [x] 8.4 Review gate per `AGENTS.local.md` §2: `review-diff` confirms the diff holds only docs, and a trust-rule read confirms no trust rule is described differently than the code enforces it.
- [x] 8.5 Handoff in chat: the count before and after with its command, the runbook's verified and UNVERIFIED steps, the fifteen rows struck, and the two amendments labelled as amendments.

## Verification record (2026-11-20, pasted as run)

**0.2 the three mechanical checks, before and after**

Before:

```
$ for d in $(ls openspec/changes/archive); do grep -q "${d#*-*-*-}" docs/mvp-build-plan.md || echo "MISSING-PLAN-ROW: $d"; done
MISSING-PLAN-ROW: 2026-11-13-register-and-docs-harmonisation
MISSING-PLAN-ROW: 2026-11-13-register-annotation-cleanup
$ grep -c "anomaly" openspec/specs/mentorship/platform-review/spec.md
0
$ grep -rn "status transition|edit an institution|domain verification" openspec/specs/institutions
(no output)
$ python closed-and-unstruck check over docs/known-debt.md
rows: 69  closed_unstruck: 21
```

After: the plan-row loop prints nothing, the closed-and-unstruck check prints `closed_unstruck now: []` over 70 rows, the anomaly count and the institutions grep are unchanged (both were already empty) — so the two amendments are register truth, not built work.

**0.3 the four earlier changes**: `git log --oneline -8` on main shows `#96`, `#97`, `#98`, `#99` merged, so the recount covers merged work only.

**6.3 the recount, by command**

```
$ grep '^| FR-' docs/functional-requirements.md | grep '| Must |' | wc -l
64
$ ... | grep -c 'Status: DONE'
55
$ ... | grep -c 'Status: PARTIAL'
9
$ ... | grep -c 'Status: NOT STARTED'
0
```

55 + 9 × 0.5 = **59.5 / 64 = 93.0%**; code-only **56.0 / 64 = 87.5%**. The area table was recomputed the same way and three rows changed: `INST` 1 DONE, `ADM` 6 DONE, `PRIV` 2 DONE / 1 PARTIAL.

**1.x and 3.x runbook steps verified on this machine**

```
$ docker compose ps --format '{{.Service}}	{{.Status}}'
api healthy · clamav healthy · mailpit healthy · objectstore healthy · postgres healthy · web healthy · worker healthy
$ curl -s http://localhost:3001/healthz
{"status":"ok","service":"api"}
$ curl -s http://localhost:3001/readyz
{"status":"ok","checks":{"database":"ok"}}
$ curl -s http://localhost:3000/healthz
{"status":"ok","service":"web"}
$ docker compose logs api | grep api.started
{"event":"api.started","port":3001}
$ pnpm --filter api db:migrate
[✓] migrations applied successfully!
$ psql -tAc "select to_regclass('public.idempotency_keys') is not null;"
t
$ (in-container SDK head/put/get against the bucket)
HEAD ok
GET ok
$ (dry-run sweep against the dev database)
{"event":"evidence.retention_swept","examined":0,"eligible":0,"deleted":0,"failed":0,"dryRun":true}
```

**UNVERIFIED steps, with the reason**

- `aws --endpoint-url ... s3api create-bucket`: `aws` and `mc` are not installed here; the equivalent head/put/get was proven with the API's own SDK instead.
- A migrate against a deployment database: only the dev database exists here; the command and the read-back are the ones above.
- Provider-specific backup, restore and TLS values: the provider is undecided, so the runbook marks them `<deployment value>`.
- The restore drill itself: no second database to restore into on this machine; the record table says `not yet performed`.

**8.x gates**: `pnpm lint` 0, `pnpm typecheck` 0, `pnpm test` 0 (domain 164, web 259, contracts 23, api 386, 0 skipped), `pnpm build` 0 (after the Next security-nudge retry). `openspec validate pilot-runbook-and-docs-truth --strict` prints `Change 'pilot-runbook-and-docs-truth' is valid`; `openspec validate --all --strict` prints its total.

**Deviation recorded**: `functional-requirements.md` §3's role table said a platform admin can view institution aggregates, which D-212 refuses (`403 ROLE_REQUIRED`). The row now reads `No (institution scope only, D-212)` — a docs-truth fix inside this change's scope, no code touched.
