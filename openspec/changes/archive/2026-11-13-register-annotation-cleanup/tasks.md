# Tasks: register-annotation-cleanup

## 1. Prepare

- [x] 1.1 Confirm `main` is clean and the four changes of the round are merged; record the base commit.
- [x] 1.2 Parse the 64 Must rows and list every one whose feedback cell has no status or two.

## 2. Annotate

- [x] 2.1 Give each of the 64 Must rows exactly one marker in the R1 format.
- [x] 2.2 Cite a code path or test for every Done row; name the gap for every Partial row.
- [x] 2.3 Delete the superseded status from the five amended rows, keeping the amended text and one decision parenthetical.
- [x] 2.4 Record `DEBT-55` in `FR-ADM-03`'s note.

## 3. Score

- [x] 3.1 Count the markers by area and publish `## Must score (2026-11-13)` with the fraction and percent on both bases.
- [x] 3.2 Assert in the report that the counts match the markers.

## 4. Finish

- [x] 4.1 Update `docs/milestones-and-phases.md` "Current state" to match `main` after this round.
- [x] 4.2 Record the scoring convention in `docs/decision-log.md`.
- [x] 4.3 Run `pnpm lint`, `pnpm typecheck`, `CI=true pnpm test`, `pnpm build`, `openspec validate --all --strict`.
- [x] 4.4 Archive the change and re-validate.
- [x] 4.5 Commit, open the PR, merge with a merge commit, delete the branch.
