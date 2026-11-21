# Proposal: docs-truth-gate-doc-and-debt-targets

## Why

`AGENTS.md` rule 1 makes the docs the source of truth, and four of them currently describe a repo that no longer exists:

- `README.md:778` still lists "**Not built yet:** role-keyed MFA … the platform review queue … evidence upload and scanning (DEBT-22) … response reliability (DEBT-25) … institution aggregates". All five are built and archived between 2026-11-05 and 2026-11-20.
- `docs/production-requirements.md` has **39 unchecked and 3 checked** boxes, although rate limits, the audit log, MFA for all three privileged roles and evidence scanning are built and tested; `:120` still says the admin idle timeouts "arrive with `access-google-mfa-and-sessions`", a change archived on 2026-11-04.
- `docs/assumptions-and-open-questions.md:152` lists the security-header/CSP question as **Open**; the CSP has enforced since 2026-11-14 (`DEBT-56` closed, D-169) and the CORS answer is recorded in D-131 to D-134.
- `DEBT-11` (`docs/known-debt.md:27`) and `DEBT-14` (`:30`) both name **Sprint 7** as their target; Sprint 7 is closed and neither is built.

An audit that reads these files first would plan work that already exists and miss work that does not. That happened this round: the missing end-to-end test, the absent observability and the unstyled UI were invisible in every tracker.

## What Changes

- `README.md` §20's "Built so far / Not built yet" paragraph is rewritten from the archive and the register, and "Last reviewed" moves to the date of the last verified change.
- `docs/production-requirements.md` §4, §7, §8, §9, §10 and §13 are reconciled: every box either cites the file and test that proves it, or stays unticked with a one-line statement of the gap. The stale `access-google-mfa-and-sessions` reference is corrected.
- `docs/assumptions-and-open-questions.md` Q5 is closed against D-169, `DEBT-56`, `DEBT-57` and D-131 to D-134.
- `docs/known-debt.md`: `DEBT-11` and `DEBT-14` are retargeted at named future changes, and the admin idle/absolute session timeouts get their **own** row instead of being one clause of a "narrowed" profile-visibility row.
- `docs/milestones-and-phases.md` §5.5 (13 unchecked boxes) and the "Current state" block are reconciled the same way: cite, or state the gap.
- The orphaned `docs/audit/2026-11-20-propose-round-five-changes.md` is committed; its sibling apply report was merged in #102 and this file was left untracked.

## Capabilities

### New Capabilities

None. No behaviour changes; this change makes descriptions match behaviour.

### Modified Capabilities

None. No requirement text changes: where a requirement and the code disagreed this round, the code won each time and the requirement was already amended by its own change (`D-229`).

## Impact

- **Code**: none. No file outside `docs/` and `README.md` is touched, apart from committing the audit file that already exists.
- **Tests**: none added. The verification is that the existing 832 tests do not move, and that every ticked box names a file and a test that exist.
- **Docs**: `README.md`, `docs/production-requirements.md`, `docs/assumptions-and-open-questions.md`, `docs/known-debt.md`, `docs/milestones-and-phases.md`, `docs/decision-log.md` (D-240, D-241), plus the untracked audit file.
- **Contract / data**: none.

## Depends on

None, and deliberately first among the documentation-shaped work: the next seven changes are scoped against these files, so a false statement here costs every one of them.

## Out of scope

- **Any status change that a command or a test does not prove.** A box is ticked with a citation or not at all; "it looks done" is not a citation.
- **Renumbering, rewriting or deleting `D-` rows.** The decision log is history (D-228's precedent: closed text is struck, not deleted).
- **Creating the documents `README.md` §16-17 still list as "Planned, not yet created"** — `kpis-and-metrics.md`, `risk-register.md`, `design-system.md`, `terms-and-policies-drafts.md`. Each is a document with content, not a correction, and none is a gate for the next eight changes except `design-system.md`, which change 4 deliberately replaces with tokens in code.
- **`openspec/specs/` edits.** Specs change only through a change's delta and `openspec archive`.
- **A new gate, checklist or tracking system.** The existing files are corrected; no second tracker is introduced.

## Risks and rollback

| Risk | Mitigation |
|---|---|
| A box is ticked on a stale reading and becomes a false claim | Every tick carries a path and a test name in the same row; the reviewer opens one of them per section |
| The reconciliation becomes a rewrite and the file loses its history | Only checkbox state and the stale sentences change; the requirement text, the tables' columns and every open gap stay |
| `DEBT-14` is split and the old row's history is lost | The new row cites `DEBT-14` and the split is recorded in `D-241`, so the trail survives |
| A later change re-breaks a line this change fixed | The two later documentation-shaped changes (`e2e-happy-path`, the deployment change) each verify their own line and fix only what is stale, as `signup-bot-protection` task 6.4 did |

**Rollback**: revert the commit; no code, data or contract is involved.

**Traces to** `AGENTS.md` rule 1, `.hermes.md` §5, `DEBT-11`, `DEBT-14`, `DEBT-56`, `DEBT-57`, `FR-ADM-03`, `FR-INST-01`, D-131 to D-134, D-169, D-228, D-229, D-240, D-241.
