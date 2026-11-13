# Design: register-annotation-cleanup

## Repository snapshot (verified 2026-11-13)

- `main` at the merge of `discovery-availability-filter` (PR #65); `openspec validate --all --strict` 41 passed; the gate run before it: domain 132, web 219, contracts 23, api 282, 0 skipped.
- The register holds 64 Must rows across 15 areas. A parse of the feedback column finds 29 with no status word at all and 9 with contradictory ones.

## R1: One marker, at the end of the feedback cell, in one of three exact forms

- `**Status: DONE** — <code reference>.`
- `**Status: PARTIAL** — <what works>; gap: <one line>.`
- `**Status: NOT STARTED** — <what is missing>.`

Reason: the requirement text stays first and readable, and a `grep -c "Status: DONE"` counts the register. Leading markers were rejected because the cell's first sentence is what a human reads when deciding a priority.

Alternative rejected: a separate status column. It would duplicate information the feedback cell already owns and force a 64-row table rewrite for no gain.

## R2: What Done means

Done requires the Then clause to be observable in code and covered by a test that fails without it. A row whose behaviour exists but whose evidence depends on a manual step (a real device install, a live Google account, a screen reader) is Partial with that step named. A row whose behaviour was narrowed by decision stays Partial unless the narrowed requirement is fully met — `FR-ADM-05` is the one row that reaches Done through an amendment, and it is therefore excluded from the code-only figure.

## R3: The scoring convention

Done 1.0, Partial 0.5, Not started 0.0, summed and divided by 64. The code-only figure drops the amended-to-Done row to 0.0. Both are published; neither replaces the other.

## R4: Amended rows keep one parenthetical, not two statuses

The five amended rows keep the behaviour the owner decided and one `(amended by … )` note. The superseded sentence is deleted, because two sentences describing different scopes in one cell is what made the score uncomputable.

## R5: Stale register facts are corrected, not carried forward

Where a row's note names a debt that is now closed (`DEBT-26`, `DEBT-40`, `DEBT-50`) or a deferral that no longer applies, the note says so once. `DEBT-55` is recorded in `FR-ADM-03`'s own note because it is the only row it blocks.

## Risks

- A verdict can be wrong in either direction. Mitigation: every Done cites a file or test that exists on `main`; every Partial names the gap; the report lists any row whose verdict moved.
- The score is a lower bound on the amended rows by construction (R3), which is the conservative direction.
