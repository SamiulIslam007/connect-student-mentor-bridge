# Design: docs-register-and-local-setup-fixes

## Context

**Repository snapshot (verified 2026-11-14 at propose, re-check at apply).**

- Base: `main` at `42768e9`, clean tree, zero active changes; gates at propose: lint 0, typecheck 0, 674 tests / 0 fail / 0 skipped, build 0.
- `docs/functional-requirements.md` has 96 `FR-` rows, 64 of them `Must`; §2.16 scores them `DONE` 1.0 / `PARTIAL` 0.5 / `NOT STARTED` 0.0 and publishes **54.0 / 64 = 84.4%** register and **53.0 / 64 = 82.8%** code-only, with `FR-ADM-05` as the single code-only exclusion.
- `FR-PROF-02` (line 121) reads `PARTIAL` with the gap "the capacity-on-resume check waits for active mentorships (DEBT-17)". `DEBT-17` closed on 2026-11-08 (`docs/known-debt.md`), and the check exists: `CAPACITY_BELOW_ACTIVE` is thrown at `services/api/src/profiles/drizzle-profiles.service.ts` line 286 and mapped in `services/api/src/http/problem-details.filter.ts` line 45. The row's three acceptance clauses (capacity stored and bounded, enforced by `FR-REQ-06`, a paused mentor hidden) are all built.
- `FR-OUT-07` (line 188) is `PARTIAL` because the Tier 1/2 multipliers are inert without evidence upload; `FR-ADM-06` (line 236) is `PARTIAL` because the evidence-file half has no route. Both gaps trace to `DEBT-22` (evidence upload, unscheduled) and the owner's standing deferral.
- `docs/local-setup.md` names `localhost:55432` at lines 36, 73 and 115; `.env.example` sets `POSTGRES_PORT=55432` and a matching `DATABASE_URL` at lines 11–12. Windows on this machine reserves TCP 55405–55504 (`netsh interface ipv4 show excludedportrange protocol=tcp`), so a container cannot bind `55432` and the host-facing integration suite fails.
- `docs/mvp-build-plan.md` §1.1 carries its own Must set that disagrees with the register (it omits `FR-AUTH-08/09/10` and `FR-OUT-10` and demotes `FR-PRIV-03` and `FR-INST-01`). Unchanged by this change; reported.

## Goals / Non-Goals

**Goals**

- The register's score equals the code's state for the three rows named.
- The code-only figure is recomputable by a reader from the document alone.
- The local setup doc stops publishing a port this machine cannot bind.

**Non-Goals**

- No other doc fix, no score change for a row whose gap is real work.
- No code, no test, no schema, no spec delta.

## Decisions

The owner fixed the three edits and forbade everything else. Decisions taken here carry `R` numbers.

### R1. `FR-PROF-02` is `DONE`, not `PARTIAL`, and the correction is a one-line fix

The acceptance clauses are satisfied by `canCreateRequest` and the resume path; the row's stated gap names a debt row that closed three changes ago. The alternative — leaving it `PARTIAL` because a *different* gap might exist — would be an unaudited guess; `DEBT-17`'s own closure evidence is the test that proves the check.

### R2. The two evidence rows are amended, not re-scored, and their Done is labelled

`FR-OUT-07` and `FR-ADM-06` cannot be closed by code under the owner's standing deferral of evidence upload, so the honest closure is a wording change that states the pilot scope. The register's own convention already excludes an amendment-reached `Done` from the code-only figure; this change applies that rule and says so in §2.16, rather than quietly counting two points.

### R3. The arithmetic is published both ways, including the fall

Register after both edits: **55.5 / 64 = 86.7%**. Code-only: **52.5 / 64 = 82.0%**, which is *lower* than today's 53.0, because `FR-OUT-07` and `FR-ADM-06` were each worth 0.5 of built work and now score 0.0 on that basis. Publishing only the register number would misrepresent the change, so §2.16 states both and names the three excluded rows.

### R4. The port note changes guidance, not a default

`POSTGRES_PORT=55432` stays the documented default in `.env.example`; the note says to pick a free port when the range is reserved, with `55400` as the worked example and the `netsh` command that proves it. Changing the default would touch every existing `.env` and buy nothing for a machine that does not have the reservation.

### R5. Everything else stale is reported, not edited

A docs-only change that also fixes six unrelated statements is unreviewable. The list is in §"Found, not fixed" with file and line, and the final report repeats it so the owner can schedule each one against the change that will next rewrite that file.

## Found, not fixed

1. `docs/functional-requirements.md` line 245 (`FR-NOT-01`) says "18 named templates"; `services/api/src/email/email-sender.ts` lines 1–21 declare 20.
2. `docs/mvp-build-plan.md` §1.1's Must set disagrees with the register's 64 rows (four omissions, two demotions). This is a recorded divergence, not a typo, and needs an owner decision.
3. `docs/milestones-and-phases.md` "Current state" quotes 54.0 / 53.0; after this change it reads 55.5 / 52.5. The apply-time doc task updates it.

Two further candidates were checked and are **not** defects, recorded here so a later reader does not re-raise them: `docs/local-setup.md` line 43–44 is one wrapped sentence, not a truncation, and the mid-cell status markers in `FR-REP-02`/`FR-REP-03` are still the row's last clause, which the convention allows.

## Assumptions

1. The owner accepts that two rows reach `Done` by amendment and that the code-only figure falls as a result.
2. The machine's reserved port ranges are a Windows configuration fact, not a repo fact, so the doc gives a check rather than a new default.
3. No other doc quotes the three totals this change rewrites; `design.md` §"Found, not fixed" 3 is the one known follower.

## Risks

- A reader quotes 86.7% as "built". Mitigation: R3's two-number publication and the named exclusions.
- The port note is read as permission to change Compose. Mitigation: the note says the default does not change.

## Acceptance criteria

1. `FR-PROF-02` reads `DONE` with the code path and its test named.
2. `FR-OUT-07` and `FR-ADM-06` read `DONE` with the pilot scope stated and the deferred work named as post-pilot.
3. §2.16's table, per-area points and both totals are recomputed by the command in `tasks.md`, and the numbers match 55.5 / 64 and 52.5 / 64.
4. `docs/local-setup.md` and `.env.example` no longer present `55432` as the only option, and the new text names the exclusion range and a workable example.
5. No file under `services/`, `apps/`, `packages/` or `openspec/specs/` is modified.
