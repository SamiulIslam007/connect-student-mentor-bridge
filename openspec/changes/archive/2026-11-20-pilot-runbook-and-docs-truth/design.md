# Design: pilot-runbook-and-docs-truth

## Context

**Repository snapshot (verified 2026-11-20 at propose; re-check at apply).**

- `find . -iname "*runbook*" -not -path "./node_modules/*"` returns nothing, while `docs/production-requirements.md` §12.1 is titled "One-page runbook (must exist before Gate 2)" and §13.2 repeats it in the pilot launch criteria.
- `docs/known-debt.md` `DEBT-46`: "The first production `PLATFORM_ADMIN` has no route and no script … a hand-run `INSERT` … documented manual step with no audit trail". `AGENTS.md` rule 12 keeps the `INSERT` and forbids a route.
- `docs/known-debt.md` holds 66 rows; **15** carry `Closed` in their Status cell and still describe the problem as present in their Debt cell (computed, not eyeballed): DEBT-01, DEBT-03, DEBT-04, DEBT-05, DEBT-09, DEBT-12, DEBT-17, DEBT-18, DEBT-20, DEBT-23, DEBT-26, DEBT-36, DEBT-40, DEBT-50, DEBT-55. DEBT-19, DEBT-25, DEBT-27, DEBT-33, DEBT-34, DEBT-35 and DEBT-56 already strike theirs — the file is uneven, and DEBT-47/DEBT-53 exist because of exactly this pattern.
- Build-plan check: `for d in $(ls openspec/changes/archive); do grep -q "${d#*-*-*-}" docs/mvp-build-plan.md || echo MISSING-PLAN-ROW: $d; done` prints exactly two rows — `2026-11-13-register-and-docs-harmonisation` and `2026-11-13-register-annotation-cleanup`.
- `docs/milestones-and-phases.md` "Current state" is three stacked statements inside two cells: "Current sprint" still describes a round that finished, and "Next change" restates the same paragraph three times, one version still claiming three `NOT STARTED` rows that no longer exist. `AGENTS.local.md` §4 ("One live truth") allows at most twelve lines and forbids two conflicting current-looking statements; `.hermes.md` §5's docs gate is what makes the block part of "done".
- `docs/functional-requirements.md` `FR-INST-01` is `PARTIAL` naming "status transitions, editing, domain verification and pagination (DEBT-51)", but its own Then clause is "the admin creates the institution, Then its admins can sign in and see only their institution" — and `openspec/specs/institutions/onboarding` has no requirement for edit, status transition or domain verification (`grep -rn "status transition\|edit an institution\|domain verification" openspec/specs/institutions` returns nothing). `DEBT-51` (pagination) closes in `institution-dashboard-aggregates`.
- `FR-ADM-03` is `PARTIAL` on "plus anomaly-triggered cases"; `grep -rn "anomaly" openspec/specs` returns **nothing**, so the synced spec already encodes random sampling plus the always-sampled types and no anomaly clause.
- `SEC-AUTH-3` reads "Passwords are hashed with a modern algorithm …; minimum length 12; breached-password check" with no annotation, and `grep -rni "breach\|pwned\|hibp" services/api/src packages/domain/src apps/web/lib` returns nothing.
- Register arithmetic at propose: 64 Must rows, 53 `DONE`, 11 `PARTIAL`, 0 `NOT STARTED` = 58.5/64 (91.4%); code-only 56.5/64 (88.3%) with `FR-ADM-05` and `FR-ADM-06` excluded as amendment-only.

## Goals / Non-Goals

**Goals**

- A runbook an operator can follow on a machine that is not this one, with each step's expected output written down.
- Every number and status in the four tracker documents recomputed from the rows, not remembered.
- Two amendments that make the register agree with the code and the synced specs, labelled as amendments.

**Non-Goals**

- No code, no migration, no test, no spec delta.
- No new policy, no SLA, no rota, no provider choice.
- No rewrite of history: archives, dated audit reports and dated decision rows stay as they are.

## Decisions

The owner fixed the runbook's contents, the `INSERT`-only bootstrap, the two register amendments, the debt row for the breached-password clause and the five doc fixes. The decisions below are the ones left open.

### R1. The runbook is `docs/runbook.md`, linked from two places

`docs/production-requirements.md` §12.1 describes the artifact but is a requirements document; the operator-facing file belongs beside `docs/local-setup.md`, with frontmatter in the repo's own shape, and is linked from `README.md` and `local-setup.md`. Alternative rejected: appending an operations section to `production-requirements.md`, which would mix "what launch requires" with "how to do it".

### R2. The first-admin procedure is an INSERT, a verify step, and a note in the runbook's own record table

The procedure is: run the `INSERT` from `docs/local-setup.md`, verify the row and its `role_assignments` entry with one `SELECT`, sign in and enrol a second factor, then write one line in the runbook's "bootstrap record" table (date, operator, environment, reason, the `INSERT`'s audit note). Alternative rejected: a CLI script — it would amend `AGENTS.md` rule 12 and need its own change, and the note is what the rule is really missing, not the typing.

The runbook states plainly that this step is outside the audit log, which is why the note exists, and names `DEBT-46` as closed by the procedure rather than by code.

### R3. The restore record is a table template, filled by hand

`docs/production-requirements.md` wants a performed restore with a date, a duration and a result before the pilot. The runbook carries the drill (backup, restore into a scratch database, verify the ledger's row counts and one known snapshot replay, drop the scratch database) and a record table with those four columns plus the environment. Alternative rejected: a scripted drill, because the provider is undecided and a script for an unknown target is untested code.

### R4. The fifteen debt strikes keep the text and change nothing else

Each struck row wraps its Debt cell in `~~…~~`, matching `DEBT-19`/`DEBT-25`/`DEBT-56`, and leaves `Impact`, `Owner / target` and `Status` untouched. A row whose Status is not `Closed` is not in the list and is not touched. Alternative rejected: deleting the problem text, which loses the record of what was owed.

### R5. The two register amendments say so in the row

`FR-INST-01` becomes `DONE`, with one parenthetical naming the amendment ("amended to the pilot's create-and-assign scope; edit, status transition and domain verification are in neither the acceptance nor `openspec/specs/institutions/onboarding`, D-xxx"). `FR-ADM-03` drops the anomaly clause from its requirement text and `DEBT-62` keeps it. §2.16's convention paragraph names both as amendment-only rows **except** that `FR-ADM-03` keeps `0.5` of code-only credit, because the sampler is code and only the anomaly half is amended.

Resulting figures, to be recomputed by command at apply and quoted from the command: register `59.5/64` (93.0%), code-only `56.0/64` (87.5%). If the command disagrees, the command wins and the task records the real number.

### R6. `SEC-AUTH-3` gets a debt row, not a fix

`DEBT-67` records the unbuilt breached-password clause, the decision it needs (which list, which outbound call, what happens on a provider outage during registration) and that the length rule and the hashing are built. The `SEC-AUTH-3` annotation then names both halves. Alternative rejected: leaving the row silent — the audit found three security Musts that were neither built nor owed, and silence is the defect.

### R7. Order inside the change: runbook first, count-bearing edits last

The runbook, the plan rows and the milestones rewrite come first; the register, §2.16, the debt file and `README`'s status line come last, so the last edit is the one that reads the final row set. The milestones "Current state" cell is written after the recount for the same reason.

### R8. The superseded milestones narration moves, it does not vanish

The three stacked paragraphs move under a `## History` heading in `docs/milestones-and-phases.md`, each prefixed with its date and "historical, superseded by the live tracker". The live cell then holds one statement per field in at most twelve lines. Alternative rejected: deleting them, which would destroy the only round-by-round record outside the archives.

## Acceptance criteria

1. `docs/runbook.md` exists, has the repo's frontmatter, and covers bring-up, migrate, bucket, the dry-run switch, incident and support, bootstrap and the restore drill.
2. Every command in the runbook is either verified at apply (output quoted in `tasks.md`) or marked UNVERIFIED with the reason.
3. The two missing build-plan rows exist, and the mechanical check prints no `MISSING-PLAN-ROW`.
4. The "Current state" block is at most twelve lines, each field holding one statement, and the superseded text is under `## History` with its date.
5. The Python check that found fifteen closed-and-unstruck rows now finds zero, and no row's Status changed.
6. `DEBT-67` exists, names the clause, the evidence and the decision it needs, and stays open.
7. `FR-INST-01` reads `DONE` with its amendment parenthetical; `FR-ADM-03` reads its new text with `DEBT-62` named.
8. §2.16's figures equal the command's counts, and the amendment-exemption note names three full exemptions plus `FR-ADM-03`'s half.
9. `docs/production-requirements.md` §12.1's runbook item is ticked and points at the new file; §13.2's restore item points at the drill.
10. `README.md`'s status line names this change and the register figure the command printed.

## Assumptions

- The `INSERT` in `docs/local-setup.md` is still the sanctioned statement; the runbook copies it rather than inventing a new one.
- The provider-specific values (database URL, bucket endpoint, TLS) are known at deployment time and are placeholders in the runbook, clearly marked.
- Nothing in the runbook needs a secret: it names environment variables, never values.

## Risks

The proposal's table covers the substantive risks. The one this design adds:

- Striking fifteen rows and amending two is a large diff in files nobody re-reads; the change therefore keeps each edit mechanical, quotes the command it came from in the task list, and leaves the prose of every untouched row alone.
