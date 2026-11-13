# Proposal: register-and-docs-harmonisation

## Why

The register (`docs/functional-requirements.md`, 64 Must rows) is the authoritative scoreboard, and in five places it no longer states what the owner decided: three rows demand behaviour that was dropped by decision (evidence tiers, signed download links, a confidence tier), and four Must rows that are built carry no annotation at all. Two further status blocks contradict themselves. A pilot gate read against this file reports the project wrongly in both directions.

## What Changes

- Amend `FR-OUT-07` so the tier is 0 for every MVP outcome and the evidence multipliers exist for a later phase (evidence upload dropped, DEBT-22).
- Amend `FR-PRIV-01` to the decided shape: one synchronous JSON export with `Cache-Control: no-store` and a tracked request, no signed URL, no object storage (D-84, DEBT-39).
- Amend `FR-REP-02` to counts plus response reliability only, naming the confidence tier as Phase 1b (D-67, DEBT-24).
- Annotate `FR-OUT-09`, `FR-OUT-10`, `FR-NOT-01` and `FR-AUD-01` as built, each with the code path that proves it, so the register stops reading as if they were owed.
- Fix `docs/milestones-and-phases.md` "Current state": the four-versus-five count, the "In flight: None" line that contradicts "is applying", and the stale "Next change" sentence that names `DEBT-25` (closed 2026-11-12) and repeats itself.
- Fix `docs/mvp-build-plan.md` section 1.1: the Must list gains `FR-AUTH-08`, `FR-AUTH-09`, `FR-AUTH-10`, `FR-OUT-10`, `FR-PRIV-03` and `FR-INST-01`, and section 1.2 drops the two rows that are not Should; delete the stale "After these: privacy export and deletion …" line at line 124.
- Add a one-line "historical, Gate-0-era" note at the top of `docs/audit/08-resolution-report.md`; do not move it.
- **No** amendment to `FR-PRIV-03`: no sweeper exists, so the row stays honest and Partial.
- **No** amendment to `FR-ADM-05` or `FR-INST-01` here: those belong to `sanction-lifecycle-warn-and-lift` and `institution-admin-assignment-ui`, which change the code the row describes.
- Documentation and register text only. No code, no schema, no migration, no contract.

## Capabilities

### New Capabilities

None. No runtime behaviour changes, so `.openspec.yaml` sets `skip_specs: true`.

### Modified Capabilities

None.

## Impact

- **Docs only**: `docs/functional-requirements.md` (seven rows), `docs/milestones-and-phases.md` (Current state block), `docs/mvp-build-plan.md` (sections 1.1, 1.2, the line at 124), `docs/audit/08-resolution-report.md` (one header line), `docs/decision-log.md` (one row recording the harmonisation).
- **Code, contract, data, dependencies**: none.
- **Tests**: none added; the gate is that the four documentation checks below stay true and the existing suite is untouched.

## Depends on

- Nothing. It is the first change of the round and every later change's register annotation cites the numbers it fixes.

## Out of scope

- Rewriting the four archived mentions of Prisma and MinIO: they are history and correctly labelled (ADR-018 supersedes ADR-002).
- Any change to a numbered decision already recorded; this change only makes the register agree with it.
- `FR-PRIV-03`, `FR-ADM-03`, `FR-ADM-07`, `FR-CONS-02`, `FR-UX-04`: still unbuilt, still honestly Partial or Not started.
- Restructuring `docs/` or renaming files.

## Risks and rollback

| Risk | Mitigation |
|---|---|
| An amendment reads as "we lowered the bar to reach a number" | Each amended row names the decision that narrowed it and keeps the original intent sentence; the register's status column still says Partial where code is missing |
| An annotation claims code that does not exist | Each annotation cites a file and symbol the reviewer can grep in one command, and the tasks list that command |
| The build-plan fix and the register drift apart again | The tasks add one check that the two Must lists enumerate the same ids |
| A docs change breaks a gate | Only lint and typecheck are meaningful; both are run and the CI run is named in the handoff |

Rollback: revert the commit. No runtime state exists to undo.

**Traces to** FR-OUT-07, FR-PRIV-01, FR-REP-02, FR-OUT-09, FR-OUT-10, FR-NOT-01, FR-AUD-01, FR-PRIV-03, FR-ADM-05, FR-INST-01; D-67, D-84, D-109 (cited), DEBT-22, DEBT-24, DEBT-39.
