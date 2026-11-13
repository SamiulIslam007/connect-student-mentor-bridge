# Design: register-and-docs-harmonisation

## Context

**Repository snapshot (verified 2026-11-12, re-check at apply).**

- `main` is at `3c8c571`, clean, no active change before this round; 37 specs valid (`openspec validate --all --strict` printed 37 passed, 0 failed). CI run `43208893367` on `3c8c571` succeeded (checks 7m35s).
- `docs/functional-requirements.md` holds 96 `FR-` rows, 64 of them Must. The five rows this change touches sit at lines 187 (`FR-OUT-07`), 255 (`FR-PRIV-01`), 200 (`FR-REP-02`), and the four to annotate at 189 (`FR-OUT-09`), 190 (`FR-OUT-10`), 244 (`FR-NOT-01`), 258 (`FR-AUD-01`).
- `docs/mvp-build-plan.md` section 1.1 (lines 18-33) lists the Must set and omits `AUTH-08/09/10` and `OUT-10`, while section 1.2 (line 37) files `FR-PRIV-03` and `FR-INST-01` as Should; line 124 carries the stale "After these: privacy export and deletion …" sentence.
- `docs/milestones-and-phases.md` lines 19-23: line 19 says "applying four more changes" and names five, line 21 says "In flight: None … all five archived", line 22 names `DEBT-25` as the next change although it closed on 2026-11-12 and repeats the same sentence twice.
- `docs/audit/08-resolution-report.md` has no status header; it is a Gate-0-era report whose line 75 records the `openspec init` run.
- Evidence for the four annotations, verified by reading the code: `services/api/src/reputation/counting-job.ts` (`countDueOutcomes`, cooling deadline then `COUNTED`), `services/api/src/outcomes/drizzle-outcome.service.ts` lines 625-737 (`REVERSED` plus the compensating `REVERSAL` event and the decremented snapshot), 14 outbox templates under `services/api/src` (`request-received`, `request-decided`, `request-expired`, `request-reminder`, `thread-message`, `outcome-reported`, `outcome-disputed`, `outcome-escalated`, `outcome-reminder`, `report-resolved`, `account-suspended`, `affiliation-decided`, `reset-password`, `verify-email`), and `audit_logs` written inside the same transaction as each state change (`services/api/src/identity/audit-log.ts`).

**Library behaviour:** none consulted; this change touches no dependency.

## Goals / Non-Goals

**Goals**

- The register states what the code does and what the owner decided, row by row, without lowering any unbuilt row.
- The two status blocks and the build plan stop contradicting the register.
- Every annotation is checkable with one grep.

**Non-Goals**

- No code, no schema, no contract, no test change.
- No edit to `FR-PRIV-03`, `FR-ADM-05`, `FR-INST-01` (owned by later changes in this round).
- No rewrite of archived change directories, the research report, or dated decision-log entries.

## Decisions

The brief fixed no `D` numbers for this change; decisions taken here carry `R` numbers.

### R1. Amendments keep the row's original sentence and add a "Narrowed by decision" clause

Each amended row keeps its Given/When/Then and appends the decision that narrowed it. Alternative rejected: replacing the row with a new requirement, which would hide from a pilot-gate reader that the original intent was wider and that a decision — not a missing implementation — is the reason. Status column moves to Done only because the narrowed behaviour is built and tested; the row says which behaviour is not built.

### R2. `FR-PRIV-03` stays untouched and Partial

Its text demands automated deletion of evidence files; no evidence file exists and no sweeper runs (DEBT-32). Amending it would raise the score without any artefact behind it. Alternative rejected: restating it as "retention is policy", which is what the register already says in `data-privacy-and-retention.md` and would be a score, not a fact.

### R3. The four annotations cite a symbol, not a PR

`FR-OUT-09` names `countDueOutcomes`, `FR-OUT-10` names the `REVERSAL` write in `drizzle-outcome.service.ts`, `FR-NOT-01` names the template catalogue and the outbox dedupe key, `FR-AUD-01` names the in-transaction audit write and states the read surface as missing (it is built by `audit-log-search` later in this round). Alternative rejected: citing the archive directory, which a reader cannot turn into a check.

### R4. The build-plan Must list is aligned by enumeration, not by prose

Section 1.1 is rewritten as one row per area listing the exact ids the register marks Must, so a mismatch is visible by comparison rather than by reading. Alternative rejected: adding the missing ids to the existing grouped sentences, which is how the drift happened.

### R5. One decision-log row, no new debt rows

The harmonisation itself is a decision about the register, so it gets one `D` row at apply. No debt row is added or closed: no debt is created and none of the five amended rows was ever a debt row.

## Assumptions

1. The register, not the build plan, is the authoritative Must set — the owner's brief states this; the build plan is corrected to match.
2. The three amended rows are narrowed by decisions the owner already recorded (D-84, D-67, the evidence drop), so amending them needs no new product decision; this change only makes the register say so.
3. `FR-UX-04`'s accessibility row does not become Done by this change even though the automated half may ship in `ui-state-sweep`; it needs a human screen-reader pass.

## Acceptance criteria

1. `grep -c '| Must |' docs/functional-requirements.md` still prints 64, and no row's id changed.
2. `FR-OUT-07`, `FR-PRIV-01` and `FR-REP-02` each name the decision that narrowed them.
3. `grep -n 'DEBT-25' docs/milestones-and-phases.md` finds the row only where it is described as closed.
4. The ids listed in `docs/mvp-build-plan.md` section 1.1 equal the ids with a Must cell in the register (checked by a one-line diff in the tasks).
5. `grep -n 'privacy export and deletion' docs/mvp-build-plan.md` returns nothing.
6. `docs/audit/08-resolution-report.md` line 1-5 carries the historical note and the file has not moved.

## Risks

- A stale line elsewhere in `docs/mvp-build-plan.md` (a forward reference keyed to a change number) can be missed; the tasks grep the whole file for "After these", "in this release" and "not yet" before closing.
- The register is long and hand-edited; a bad patch could shift a table row. Each edit is a whole-line replacement and the tasks re-count the Must rows afterwards.
