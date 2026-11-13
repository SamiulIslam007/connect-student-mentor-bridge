# Proposal: register-annotation-cleanup

## Why

`docs/functional-requirements.md` is the authoritative scoreboard: 64 Must rows, and the number quoted at every gate comes from them. It cannot currently be computed. Twenty-nine of the 64 rows carry no status at all, several carry two ("Partially built" beside a later "Built by"), five amended rows still describe the behaviour that was narrowed away, and the amended rows mix "Complete for its amended scope" with the older sentence it replaced. A reader, or a script, cannot tell Done from Partial from Not started, and the quoted score depends on who last edited the file.

Nothing in the runtime changes. This change makes the register say what the code does, once per row, in one format, with a code path behind every Done.

## What Changes

- Every one of the 64 Must rows ends its feedback cell with exactly one marker, in one format: `**Status: DONE** — <code reference>.`, `**Status: PARTIAL** — <what works>; gap: <one line>.` or `**Status: NOT STARTED** — <what is missing>.` The Given/When/Then text keeps its place before the marker; the older "Built by …" sentence stays only where it carries evidence the reference does not.
- The five amended rows (`FR-OUT-07`, `FR-PRIV-01`, `FR-REP-02`, `FR-ADM-05`, `FR-INST-01`) keep the amended text and one parenthetical naming the narrowing decision, and lose the second status.
- The rows that were built but unannotated (`FR-AUTH-01` to `FR-AUTH-09`, `FR-PROF-04`, `FR-THR-01`, `FR-OUT-01`, `FR-OUT-04`, `FR-OUT-06`, `FR-REP-01`, `FR-ADM-07`, `FR-PRIV-02`, `FR-PRIV-03`, `FR-UX-04`) are annotated from the code, not from memory: each verdict cites the file or test that proves it, and each Not started row names the debt that keeps it there.
- A new section, `## Must score (2026-11-13)`, publishes the per-area table, the exact fraction and percent on the register basis, and the code-only figure that excludes a row that reached Done only through an amendment to the register.
- `FR-ADM-03` carries `DEBT-55` in its own note: the audit sampling hold cannot exist while `CONFIRMED` to `IN_PLATFORM_REVIEW` (T6) is unreachable.
- `docs/milestones-and-phases.md` "Current state" is rewritten to match `main` after this round, with no stale next-change line.
- Documentation only. No code, no schema, no migration, no contract, no test.

## Capabilities

### New Capabilities

None. No runtime behaviour changes, so `.openspec.yaml` sets `skip_specs: true`.

### Modified Capabilities

None.

## Impact

- **Docs only**: `docs/functional-requirements.md` (all 64 Must rows plus one new section), `docs/milestones-and-phases.md` (Current state), `docs/decision-log.md` (one row recording the scoring convention).
- **Code, contract, data, dependencies**: none.
- **Tests**: none added. The gate is that every Must row carries exactly one marker, the counts in the new section equal the markers, and the existing suite is untouched.

## Depends on

- `ui-state-sweep`, `audit-log-search`, `sanction-lifecycle-warn-and-lift` and `discovery-availability-filter`, all merged before this change, because four rows flip on their evidence.

## Out of scope

- Any change to a requirement's text, priority, or scope beyond the five amended rows already decided.
- Any change to Should or Could rows.
- Building any of the Partial or Not started work.
