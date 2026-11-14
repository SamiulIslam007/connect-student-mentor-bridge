# Proposal: docs-register-and-local-setup-fixes

## Why

Three current-truth statements are wrong, and each one costs the owner a wrong decision: `FR-PROF-02` is scored `PARTIAL` against a debt row that closed on 2026-11-08 while the code it asks for exists; `FR-OUT-07` and `FR-ADM-06` still read as if evidence upload were in pilot scope, which the owner has deferred twice; and `docs/local-setup.md` plus `.env.example` publish a Postgres host port (`55432`) that Windows reserves on this machine, so a local gate run silently loses its integration suite. Documentation only — no code, no behaviour change.

## What Changes

- `FR-PROF-02` becomes `DONE`, with the code path named (`CAPACITY_BELOW_ACTIVE`, `drizzle-profiles.service.ts`), and §2.16's per-area table and totals are recomputed from the rows rather than copied.
- `FR-OUT-07` and `FR-ADM-06` are re-worded to the pilot scope the owner already decided: Tier 0 only, no evidence file route, upload and the Tier 1/2 multipliers after the pilot. Both become `DONE` for that scope, and §2.16's code-only convention gains them to its exclusion list, because their Done comes from an amendment, not from code.
- `docs/local-setup.md` (three places) and `.env.example` (two lines) stop hardcoding `55432` and explain the Windows exclusion, with `55400` as the example.
- §2.16's prose gains one sentence stating which rows reached `Done` by amendment, so the code-only figure can be recomputed by a reader.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. No behaviour, route, payload or status changes, so there is no delta and the change declares `skip_specs: true`.

## Impact

- **Code**: none.
- **Tests**: none. The only executable artefact is the recount command in `tasks.md`.
- **API/contract**: none.
- **Data**: none.
- **Docs**: `docs/functional-requirements.md` (§2.2 `FR-PROF-02`, §2.7 `FR-OUT-07`, §2.11 `FR-ADM-06`, §2.16 table, prose and totals), `docs/local-setup.md` lines 36, 73, 115, `.env.example` lines 11–12, `docs/known-debt.md` (a note beside `DEBT-39`/`DEBT-22` that the register now matches the deferral), `docs/decision-log.md`, `docs/milestones-and-phases.md`, `docs/mvp-build-plan.md` §5.

## Depends on

- `register-annotation-cleanup` (archived 2026-11-13): the one-status-per-row convention and §2.16.
- `response-reliability` (archived 2026-11-12): the change that closed `DEBT-17`'s neighbour and left `FR-PROF-02`'s text behind.

## Out of scope

- Every other stale statement found while auditing. They are listed in `design.md` §"Found, not fixed" and reported, never edited here.
- Re-scoring any row whose gap is real work: `FR-ADM-03`, `FR-ADM-07`, `FR-PRIV-03`, `FR-VER-04`, `FR-THR-02`, `FR-AUTH-02`.
- Reconciling `docs/mvp-build-plan.md` §1.1's Must set with the register's 64 rows; that divergence is a decision, not a typo.
- Any `.env` file, any Compose file, any code.

## Risks and rollback

| Risk | Mitigation |
|---|---|
| An amendment reads as built work and inflates the pilot's readiness | The two amended rows are named in §2.16's prose, excluded from the code-only figure, and `design.md` states the arithmetic both ways, including that code-only *falls* |
| The recount is wrong because it is copied from this proposal | `tasks.md` 2.1 makes the count a command over the rows, and 2.2 makes a second reader recompute it |
| The port note is read as a repo-wide change | The docs say the default stays `55432`; the note is "pick a free port if Windows excludes it", and no Compose default changes |
| A stale statement listed but not fixed is forgotten | Each one is in `design.md` with a file and line, and the final report repeats the list |

Rollback: revert the documentation commit. No runtime effect at all.
