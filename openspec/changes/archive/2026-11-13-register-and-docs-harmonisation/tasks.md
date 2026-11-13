# Tasks: register-and-docs-harmonisation

## 0. Preconditions

- [x] 0.1 Re-check the snapshot in `design.md`: `git log --oneline -1` (expect `3c8c571`), `git status`, `grep -c '| Must |' docs/functional-requirements.md` (expect 64), `grep -n 'FR-OUT-07\|FR-PRIV-01\|FR-REP-02\|FR-OUT-09\|FR-OUT-10\|FR-NOT-01\|FR-AUD-01' docs/functional-requirements.md`. Verify: every snapshot line is confirmed or listed as a mismatch in the handoff.
- [x] 0.2 Record the baseline: `grep -o '^\| FR-[A-Z]*-[0-9]*' docs/functional-requirements.md | grep -c .` and a saved copy of the Must id list in this file, so the re-count in 5.3 compares against something. Verify: the saved list has 64 ids.

## 1. Amend the three narrowed rows

- [x] 1.1 `docs/functional-requirements.md` `FR-OUT-07` (line 187): keep the tier definition sentence, add that every MVP outcome is Tier 0 because evidence upload was dropped (DEBT-22) and the tier multipliers are inert until a later phase, and mark the row built to that depth. Verify: the row still opens with its original Given/When/Then and names DEBT-22.
- [x] 1.2 `FR-PRIV-01` (line 255): state the decided shape — one synchronous JSON document, `Cache-Control: no-store`, attachment disposition, one `privacy_requests` row — and name D-84 and DEBT-39 as the reason the signed-link clause is not met. Verify: `grep -n 'FR-PRIV-01' docs/functional-requirements.md` shows both the shape and the two ids.
- [x] 1.3 `FR-REP-02` (line 200): counts by field and outcome type plus the two response-reliability counts, and name the confidence tier as Phase 1b (D-67, DEBT-24). Verify: the row names both counts and DEBT-24.

## 2. Annotate the four built rows

- [x] 2.1 `FR-OUT-09` (line 189): annotate built with `countDueOutcomes` in `services/api/src/reputation/counting-job.ts`, the cooling deadline column, the ten-minute cron queue, and the idempotent status guard. Verify: `grep -n 'countDueOutcomes' docs/functional-requirements.md` hits the row.
- [x] 2.2 `FR-OUT-10` (line 190): annotate built with the review route's `REVERSED` path plus the compensating `REVERSAL` event and the decremented snapshot in `services/api/src/outcomes/drizzle-outcome.service.ts`. Verify: the row names `REVERSAL` and the file.
- [x] 2.3 `FR-NOT-01` (line 244): annotate built with the outbox path, the per-event dedupe key, retry with backoff, and the template catalogue (list the template names as they are in code). Verify: `grep -c 'template:' services/api/src -r` equals the number of templates the row lists.
- [x] 2.4 `FR-AUD-01` (line 258): annotate as partially built — entries are written in the same transaction and the application role holds insert and select only, and the search surface does not exist until `audit-log-search` lands. Verify: the row states the gap and is not marked complete.

## 3. Fix the two status blocks

- [x] 3.1 `docs/milestones-and-phases.md` lines 19-23: state five archived changes on 2026-11-12 (not four), replace "In flight: None … is applying" with one consistent sentence, and rewrite "Next change" so it names what is actually next (the next proposal in this round after this change) and drops the duplicate sentence and the closed `DEBT-25`. Verify: `grep -n 'four more changes\|DEBT-25' docs/milestones-and-phases.md` returns only correct mentions.
- [x] 3.2 `docs/mvp-build-plan.md` section 1.1 (lines 18-33): rewrite the Must list as one row per area with the exact register ids, adding `FR-AUTH-08`, `FR-AUTH-09`, `FR-AUTH-10`, `FR-OUT-10`, `FR-PRIV-03` and `FR-INST-01`. Verify: `grep -o 'FR-[A-Z]*-[0-9]*' docs/mvp-build-plan.md` in section 1.1 equals the register's 64 Must ids (sorted diff, empty).
- [x] 3.3 `docs/mvp-build-plan.md` section 1.2: remove `FR-PRIV-03` and `FR-INST-01` from the Should list. Verify: neither id appears in section 1.2.
- [x] 3.4 `docs/mvp-build-plan.md` line 124: delete the stale "After these: privacy export and deletion, institution aggregates with suppression, accessibility and hardening." sentence, since export and deletion shipped on 2026-11-10. Verify: `grep -n 'privacy export and deletion' docs/mvp-build-plan.md` returns nothing.
- [x] 3.5 Sweep both files for other forward references made stale by the last eight changes: `grep -n 'in this release\|not yet\|After these' docs/mvp-build-plan.md docs/milestones-and-phases.md`. Verify: every remaining hit is still true, or is rewritten in this task.

## 4. Mark the old audit report as history

- [x] 4.1 Prepend a one-line status note to `docs/audit/08-resolution-report.md` naming it a Gate-0-era resolution report kept as history and pointing at the register for current status. Verify: `head -5 docs/audit/08-resolution-report.md` shows the note, and `git status` shows no move or rename.

## 5. Decisions and handoff

- [x] 5.1 Add one `D` row to `docs/decision-log.md` recording the harmonisation and naming the three amended rows and the four annotated ones (full text at the end of this file).
- [x] 5.2 Update `docs/milestones-and-phases.md` "Last archived change" only if this change is archived in the same run; otherwise leave it to the archive step.
- [x] 5.3 Re-count and record: `grep -c '| Must |' docs/functional-requirements.md` still 64, and the annotated rows now read as built (or built-to-depth) while `FR-PRIV-03`, `FR-ADM-03`, `FR-ADM-07`, `FR-CONS-02`, `FR-UX-04` still read as unbuilt.

## 6. Gates and handoff

- [x] 6.1 Run from the repo root: `pnpm lint` and `pnpm typecheck`, each as its own command with its exit code echoed. Tests and build are unchanged by a docs-only diff, but CI runs them: name the CI run id and conclusion in the handoff instead of claiming them locally.
- [x] 6.2 Review gate per `AGENTS.local.md` section 2: verify-before-done, the silent-failure hunt (nothing to hunt here), and a diff read for accidental edits to other rows. Verify: `git diff --stat` names only the five files in this change's Impact.
- [x] 6.3 Confirm the diff touches no code, no schema, no contract, no spec: `git diff --name-only | grep -v '^docs/'` returns nothing.
- [x] 6.4 Write the handoff: the five files, the re-count, the two gate exit codes, the CI run id, and the list of docs left deliberately stale (archived changes, the research report, dated decision-log entries).

## Decision row to add at apply

**D row (number assigned at apply, next free in `docs/decision-log.md`)**

- Date: 2026-11-12
- Decision: The register is harmonised with recorded decisions: `FR-OUT-07` becomes Tier 0 only (DEBT-22), `FR-PRIV-01` becomes the synchronous JSON export (D-84), `FR-REP-02` becomes counts plus response reliability with the confidence tier deferred (D-67); `FR-OUT-09`, `FR-OUT-10`, `FR-NOT-01` and `FR-AUD-01` are annotated as built where the code exists, and `FR-PRIV-03` is left untouched.
- Reason: the register is the pilot gate's scoreboard; five rows no longer described what the owner decided or what the code does, and the register may not be lowered to reach a number.
- Status: Decided
- Affects: `docs/functional-requirements.md`, `docs/mvp-build-plan.md`, `docs/milestones-and-phases.md`, `docs/audit/08-resolution-report.md`
