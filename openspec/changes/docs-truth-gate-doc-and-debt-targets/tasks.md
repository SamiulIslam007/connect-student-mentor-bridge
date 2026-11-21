# Tasks: docs-truth-gate-doc-and-debt-targets

Decision rows to add at apply (reserved, one contiguous block): **D-240** cite-or-leave-unticked, **D-241** `DEBT-11`/`DEBT-14` retargeted and the session timeouts split out.

## 0. Preconditions

- [ ] 0.1 Re-read the snapshot: `git log --oneline -1`, `git status --short`, `grep -n 'Not built yet' README.md`, `grep -c '^- \[ \]' docs/production-requirements.md`, `grep -c '^- \[x\]' docs/production-requirements.md`, `sed -n '149,164p' docs/milestones-and-phases.md | grep -c '\[ \]'`.
- [ ] 0.2 Record the four gate results before touching anything: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` (twice). Verify: the totals are in this file (832 tests on 2026-11-21) and must be identical at 4.1.
- [ ] 0.3 List what the archive already proves: `ls openspec/changes/archive | wc -l`, `grep -n 'Status' docs/functional-requirements.md | head -3`. Verify: the archive count and the register's own recount are quoted, so the README rewrite cites them rather than memory.

## 1. `README.md`

- [ ] 1.1 §20's "Built so far / Not built yet" paragraph is rewritten to match the archive: the four items it calls "not built yet" that shipped (role-keyed MFA, review queue, evidence upload, response reliability) and the institution aggregates move to the built sentence; what actually remains (admin session timeouts, observability, a deployment) moves to the gap sentence. Verify: `grep -n 'role-keyed MFA\|review queue' README.md` no longer appears inside a "Not built yet" sentence, and each moved item is named in `openspec/changes/archive/`.
- [ ] 1.2 `Last reviewed` moves to the date of the last verified change, and the status line names this change. Verify: `grep -n 'Last reviewed\|Not built yet' README.md` shows both lines updated, and neither sentence names a capability that is absent from `openspec/changes/archive/`.
- [ ] 1.3 §17's list of "Planned, not yet created" documents stays as it is except where a document now exists (`docs/runbook.md` is not in that list; check `docs/design-system.md` and `docs/kpis-and-metrics.md` are still absent). Verify: `ls docs | grep -E 'design-system|kpis'` returns nothing.

## 2. `docs/production-requirements.md`

- [ ] 2.1 §4.2 and §7: each box is ticked with a citation or left unticked with an "unmet:" line, per D-240. The specific controls to reconcile: MFA for three roles, object-level authorization, rate limits, input validation, secrets handling, evidence scanning, audit log, break-glass access, TLS and headers. Verify: `grep -c 'unmet:' docs/production-requirements.md` and `grep -c '^- \[x\]' docs/production-requirements.md` are both quoted, and every ticked row names a file.
- [ ] 2.2 `:120`'s sentence about the admin idle timeouts "arriving with `access-google-mfa-and-sessions`" is replaced with the truth: not built, `D-48`, new debt row from 3.2. Verify: `grep -n 'access-google-mfa-and-sessions' docs/production-requirements.md` returns nothing.
- [ ] 2.3 §8, §9 and §10 are reconciled the same way; §9's four rows (errors, uptime, metrics, alerts) are left unticked with "unmet: no provider chosen, see `first-deployment-restore-drill-and-observability`" until that change lands. Verify: `grep -c 'unmet:' docs/production-requirements.md` equals the number of gaps and each names a change or a decision.
- [ ] 2.4 §13.1's staging line gains the §5:94 pointer from the design's Open Question 1 and stays unticked. Verify: `grep -n 'Gate 1 does not require a deployed environment' docs/production-requirements.md` still matches and §13.1 cites it.

## 3. `docs/known-debt.md`

- [ ] 3.1 `DEBT-11`: replace the "Sprint 7 provider failover" target with the deployment change's name. Verify: `grep -n 'DEBT-11' docs/known-debt.md` names `first-deployment-restore-drill-and-observability`.
- [ ] 3.2 `DEBT-14`: keep the profile-visibility clause, add one sentence naming the split, and add a **new** row for the admin idle/absolute session timeouts (citing `D-48` and `DEBT-14`) targeted at a future `admin-session-timeouts` change. Verify: `grep -n 'admin' docs/known-debt.md | grep -i 'timeout'` shows the new row with a target and an owner, and `DEBT-14`'s row still exists.
- [ ] 3.3 Record and close the audit findings that had no row: the missing end-to-end test (unless `e2e-happy-path` closed it first), the absent observability, and the absent styling. Each is one row; the last two stay open with the change that owns them. Verify: `grep -cn 'sentry\|observability\|stylesheet' docs/known-debt.md` is at least 2, and every new row has a target.

## 4. `docs/assumptions-and-open-questions.md` and `docs/milestones-and-phases.md`

- [ ] 4.1 Q5 (security headers, CSP, CORS) is closed with the decisions that answered it: `D-169`, `DEBT-56`, `DEBT-57`, D-131 to D-134. Verify: `grep -n 'Open' docs/assumptions-and-open-questions.md | sed -n '$p'` no longer lists Q5, and the closure names the four references.
- [ ] 4.2 `docs/milestones-and-phases.md` §5.5: the 13 boxes are reconciled per D-240 — tick with a citation or leave with "unmet:". The four this repo can prove today (sign-up and 18+, unconfirmed outcomes never count, ledger replay, `docker compose up` + CI) are ticked; the e2e, accessibility and restore lines stay unticked and name their changes. Verify: `grep -c '\[x\]' docs/milestones-and-phases.md` increases and every new tick cites a test.
- [ ] 4.3 The "Current state" block names this change as the last archived one and the next change in line. Verify: `sed -n '13,23p' docs/milestones-and-phases.md` reads consistently with `docs/mvp-build-plan.md` §5's last row.

## 5. The orphaned audit file

- [ ] 5.1 Commit `docs/audit/2026-11-20-propose-round-five-changes.md`, which is untracked while its sibling apply report was merged in #102. Verify: `git status --short docs/audit` returns nothing after the commit, and `git log --oneline -1 -- docs/audit/2026-11-20-propose-round-five-changes.md` names a commit.
- [ ] 5.2 `docs/decision-log.md`: add D-240 and D-241. Verify: `grep -c '^### D-24[01]'` prints `2`.

## 6. Checks, review, handoff

- [ ] 6.1 `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` (twice) — exit codes and totals identical to 0.2, because this change touches no code. Verify: the comparison is written into the handoff, including any difference.
- [ ] 6.2 `git diff --stat` shows only `README.md`, files under `docs/`, and the newly committed audit file. Verify: `git diff --name-only | grep -v '^docs/' | grep -v '^README.md'` prints nothing.
- [ ] 6.3 `openspec validate docs-truth-gate-doc-and-debt-targets --strict` and `openspec validate --all --strict`; quote the totals.
- [ ] 6.4 Review gate per `AGENTS.local.md` §2: the adversarial pass opens one citation per section and asks whether the named test would still pass if the control were removed.
- [ ] 6.5 Handoff: the count of boxes ticked vs left with "unmet:", the two debt rows retargeted, the new row, and the Open Question left for the owner.
