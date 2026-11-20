# Proposal: pilot-runbook-and-docs-truth

## Why

Two things are missing that a pilot launch needs and no code can supply: a runbook (`find . -iname "*runbook*"` finds nothing, while `docs/production-requirements.md` §12.1 says one "must exist before Gate 2"), and a truthful register. Four documents currently assert something the code contradicts — two archived changes have no row in the build plan, the milestones cell holds three superseded statements, fifteen closed debt rows still describe their problem as present, and two Must rows are scored `PARTIAL` against scope that neither the code nor any synced spec requires.

## What Changes

- **New `docs/runbook.md`**: bring-up, migrate, object-store bucket, the `EVIDENCE_RETENTION_DRY_RUN` switch, the incident and support path, the first-production-admin procedure, and a backup/restore drill with its record template.
- **First production `PLATFORM_ADMIN`**: the documented `INSERT` plus a verification step and a written audit note in the runbook. `AGENTS.md` rule 12 is unchanged; no CLI script, no route.
- **Build-plan truth**: the two missing rows (`2026-11-13-register-and-docs-harmonisation`, `2026-11-13-register-annotation-cleanup`) restored to `docs/mvp-build-plan.md` §5.
- **Milestones truth**: the "Current state" cell rewritten to one current statement per field within the twelve-line limit `AGENTS.local.md` §4 sets; the superseded narration moves to a dated history section instead of being deleted.
- **Debt truth**: the fifteen closed rows whose problem text is unstruck are struck, keeping their `Status` cells; one new row (`DEBT-67`) records the unbuilt breached-password clause of `SEC-AUTH-3` as debt, not as work.
- **Register truth**: `FR-INST-01` to `DONE` (its Then clause is met; edit, status transition and domain verification are in neither the acceptance nor any synced spec) and `FR-ADM-03` reworded to random plus always-sampled while `DEBT-62` keeps the anomaly clause. Both are **register truth, not built work**, and every affected count is recomputed by command.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. Nothing observable in the product changes: no route, no payload, no schema, no job. The change declares `skip_specs: true`, which is the repository's own escape hatch for a register and docs harmonisation.

## Impact

- **Code, contract, data**: none. No route, no migration, no test.
- **Docs**: `docs/runbook.md` (new), `docs/mvp-build-plan.md` §5, `docs/milestones-and-phases.md` (the "Current state" block plus a history section), `docs/known-debt.md` (fifteen strikes plus `DEBT-67`), `docs/functional-requirements.md` (`FR-INST-01`, `FR-ADM-03`, §2.16), `docs/security-requirements.md` (`SEC-AUTH-3` annotation), `docs/production-requirements.md` §12.1 and §13.2 (the runbook item ticked, the restore record referenced), `docs/local-setup.md` (a link to the runbook), `README.md` (status line and a runbook link), `docs/decision-log.md`.
- **Tests**: none. The only verification is that every command quoted in the runbook still produces the output it claims, re-run at apply.

## Depends on

The four other changes of this round, in the sense that its recount must be the **last** word: apply order is `institution-dashboard-aggregates`, `idempotency-key-on-writes`, `signup-bot-protection`, `evidence-retention-edges`, then this change. The four earlier changes each carry their own minimal docs task; this one reconciles the totals afterwards instead of racing them.

## Out of scope

- **The breached-password check itself.** `SEC-AUTH-3`'s third clause stays unbuilt and becomes `DEBT-67`; building it needs a breach-list provider decision and an outbound call on the registration path.
- **A CLI or a route for the first admin.** Rule 12 stands as written.
- **Hosting, region, TLS and provider-specific backup commands.** The provider is undecided; the runbook names the steps and marks the provider-specific values as decided at deployment.
- **Editing history**: `openspec/changes/archive/**`, `docs/audit/**` and dated `decision-log.md` rows keep what they said on their date.
- **The other twelve debt rows that are real work** (`DEBT-58`, `DEBT-59`, `DEBT-60`, `DEBT-61`, `DEBT-62`, `DEBT-63`, `DEBT-64`, `DEBT-65`, `DEBT-66`, `DEBT-46` closed here, `DEBT-10`, `DEBT-13`): this change records and closes nothing by code.
- **Any new policy.** The runbook documents procedures the repo already implies; it invents no retention, no on-call rota and no SLA.

## Risks and rollback

| Risk | Mitigation |
|---|---|
| A runbook that is confidently wrong is worse than none | Every step is a command with its expected output, re-run at apply on this machine; a step that cannot be verified is marked UNVERIFIED with the reason |
| A register amendment reads as built work | Both amended rows say "amended, not built" in the row itself, §2.16 gains the exemption note, and the report states the register and code-only figures side by side |
| The rectified counts drift again in the next round | §2.16 keeps the command basis next to the number, and the change states the date it was computed |
| Striking fifteen debt rows hides a still-open problem | Each strike is mechanical (the row already says `Closed` with its evidence); a row whose Status is not `Closed` is not touched |
| The milestones rewrite loses the round-by-round record | The superseded text moves to a dated history section in the same file, not to the bin |

**Rollback**: a docs-only commit; reverting it restores the previous text exactly. Nothing else in the repo depends on it.

**Traces to** SEC-AUTH-3, SEC-INF-7, FR-INST-01, FR-ADM-03, DEBT-46, DEBT-62, DEBT-51, D-103, D-142, D-156, D-179.
