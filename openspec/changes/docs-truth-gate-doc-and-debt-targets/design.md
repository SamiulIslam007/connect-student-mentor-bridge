# Design: docs-truth-gate-doc-and-debt-targets

## Context

See `proposal.md` — Why. What shapes the approach:

- The repo already runs a by-command recount of the register (`docs/functional-requirements.md` §2.16) and its numbers are current; the stale statements live in the four files around it, not in the register.
- `docs/known-debt.md` §3 rule 2 says a row is removed only with evidence, and D-228 says a closed row's problem text is struck, not deleted. Both bind this change.
- `docs/production-requirements.md` contains one internal disagreement this change must not silently resolve: `:94` says "Until a host is chosen, 'staging' means the local Docker stack with seed data. Gate 1 does not require a deployed environment", while §13.1 (`:208`) lists "Staging and production deploy from the same image" as a Gate 1 item. It is recorded as an Open Question below, not decided here.
- `docs/milestones-and-phases.md` §5.5 has 13 unchecked boxes (`sed -n '149,164p' … | grep -c '\[ \]'` prints `13`), including items that are demonstrably built.

## Goals / Non-Goals

**Goals**

- A reader can answer "is this built?" from a single gate document, without grepping code.
- Every ticked box carries a citation (path, test name or command) in the same row.
- Every debt row names a target that still exists.

**Non-Goals**

- No new document, no new checklist, no second tracker (`.hermes.md` §4 forbids a competing plan).
- No edit to `openspec/specs/`, no renumbering of `D-` rows, no deletion of closed debt text.
- No requirement text change: the register already reflects the code after D-229.

## Decisions

### D-240: A box is ticked only with a citation in the same row

- Date: 2026-11-21
- Decision: in `docs/production-requirements.md`, `docs/milestones-and-phases.md` and any other gate checklist, a box becomes `[x]` only when the same row names the file and the test or command that proves it (for example `services/api/src/platform/throttle.ts` + `rate-limits.integration.test.ts`). A box whose evidence does not exist stays `[ ]` with a one-line "unmet: <gap>" and, where the gap has an owner change, its name.
- Reason: the current file is wrong in both directions — 39 unticked boxes for built controls, and a stale sentence pointing at a change archived two weeks ago. A citation makes the next drift visible in the diff instead of in an audit.
- Alternatives rejected: (a) tick everything that looks built, which is how the file got here; (b) delete the checklists and rely on `known-debt.md`, which loses the gate document the pilot decision reads.
- Status: Decided (owner-approved as the audit's DT1 recommendation)
- Affects: `docs/production-requirements.md` §4, §7, §8, §9, §10, §13; `docs/milestones-and-phases.md` §5.5; `docs/decision-log.md`

### D-241: `DEBT-11` and `DEBT-14` are retargeted, and the admin session timeouts get their own row

- Date: 2026-11-21
- Decision: `DEBT-11` (SMTP failover and the identity library's inline mail) is retargeted at the deployment change that introduces a real transactional provider. `DEBT-14` keeps its profile-visibility clause and its target; its admin idle/absolute timeout clause moves to a **new** row, targeted at a named `admin-session-timeouts` change, because the timeouts are a security control on the most privileged role and must not stay buried in a "narrowed" row whose target has closed.
- Reason: `docs/known-debt.md` §3 rule 1 requires one owner and one target per row, and both rows currently name Sprint 7, which finished without either item. A row whose target no longer exists is invisible to planning.
- What would change this decision: the owner deciding the timeouts are out of the pilot's scope entirely, in which case the new row is marked `Deferred (owner decision)` rather than deleted.
- Status: Decided (owner-approved as the audit's DT2 recommendation)
- Affects: `docs/known-debt.md` (`DEBT-11`, `DEBT-14`, new row), `docs/decision-log.md`, `docs/auth-and-access-control.md` (one line stating the timeout is not built)

## Risks / Trade-offs

- The change is large in line count and touches files other changes also touch (`README.md` status line, `docs/milestones-and-phases.md`) → it lands first, and the two later documentation-shaped changes re-verify their own lines only (`signup-bot-protection` task 6.4's precedent).
- A citation can itself go stale → the citation names a file and a test that exist at the time of the change, which is a strictly better state than an unsourced tick, and the `e2e` job from change 2 covers the browser claim.
- Splitting `DEBT-14` could look like history rewriting → the new row cites `DEBT-14`, and `DEBT-14`'s own text gains one sentence naming the split. Nothing is deleted.

## Migration Plan

Not applicable: no runtime artifact. The commit is docs-only, so the four gates must be unchanged before and after (recorded).

## Open Questions

1. **§13.1 vs §5:94 — is a deployed environment a Gate 1 condition?** §5 says Gate 1 does not require one; §13.1 lists staging and production deploying from the same image. Safe default used here: the §13.1 line stays unticked and gains a one-line pointer to §5:94, so the document is internally consistent without deciding the gate. Deciding it changes the deployment change's priority, not this one's scope.
