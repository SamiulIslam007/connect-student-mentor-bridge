# Tasks: docs-register-and-local-setup-fixes

## 0. Preconditions

- [x] 0.1 Re-check the snapshot: `git log --oneline -1`, `grep -n "FR-PROF-02\|FR-OUT-07\|FR-ADM-06" docs/functional-requirements.md`, `grep -n "CAPACITY_BELOW_ACTIVE" services/api/src/profiles/drizzle-profiles.service.ts services/api/src/http/problem-details.filter.ts`, `grep -n "55432" docs/local-setup.md .env.example`. Record every mismatch.
- [x] 0.2 Prove `DEBT-17` is closed and says what it closed: `grep -n "DEBT-17" docs/known-debt.md`.
  - Closed 2026-11-08 by `mentorship-thread-and-sessions` (#8): "resuming from `PAUSED` counts live `ACTIVE` mentorships under the mentor row lock and refuses at capacity with `409 CAPACITY_BELOW_ACTIVE`", asserted by `profiles.integration.test.ts`. The register row still quoted the pre-closure gap, which is the defect this change fixes.
  - Applied at `main` = `42768e9`, clean tree. Mismatches recorded: (a) `55432` appears at `local-setup.md` lines 36, 43, 73 and 115 — four lines, three sentences, so the design's "three places" is one line short; (b) **arithmetic**: task 2.3 reserves `ADM 4.5/6`, but `FR-ADM-06` is one row moving PARTIAL to DONE, so ADM is 4 DONE / 0 PARTIAL / 2 NOT STARTED = **4.0 / 6**. The rows win and section 2.16 publishes 4 / 6.
  - No mismatch in the code path: `CAPACITY_BELOW_ACTIVE` is at `services/api/src/profiles/drizzle-profiles.service.ts:286` and `services/api/src/http/problem-details.filter.ts:45`, exactly as the design says.

## 1. The three rows

- [x] 1.1 `FR-PROF-02`: `PARTIAL` → `DONE`, gap replaced by the code path (`CAPACITY_BELOW_ACTIVE` in `services/api/src/profiles/drizzle-profiles.service.ts`, the resume test in `services/api/test/profiles.integration.test.ts`) and the two acceptance clauses it satisfies.
- [x] 1.2 `FR-OUT-07`: `PARTIAL` → `DONE` for the pilot scope — every MVP outcome is Tier 0 (D-64), the multipliers exist for a later tier, and evidence upload, Tier 1/2 and the evidence-file route are post-pilot (`DEBT-22`).
- [x] 1.3 `FR-ADM-06`: `PARTIAL` → `DONE` for the thread half (the audited break-glass read), with the evidence-file half named as post-pilot and `DEBT-52`'s disclosure gap kept as its own line.

## 2. The recount, from the rows

- [x] 2.1 Count and score mechanically, not by eye: `grep '^| FR-' docs/functional-requirements.md | grep '| Must |' | wc -l` (expect 64) and one pass per row over its `**Status:**` marker; per-area totals rebuilt from the rows. Verify: the sum equals the printed per-area points and the total equals the sum of the areas.
- [x] 2.2 Paste both commands and their output into this file, with the date, as the evidence for the new totals.
- [x] 2.3 Update §2.16: the per-area table (`PROF` 5.0/5, `OUT` 7.0/7, `ADM` 4.5/6), **register 55.5 / 64 = 86.7%**, **code-only 52.5 / 64 = 82.0%**, the convention paragraph naming the three amendment rows (`FR-ADM-05`, `FR-OUT-07`, `FR-ADM-06`), and one sentence explaining why the code-only figure falls.
- [x] 2.4 Second reader: recompute §2.16 from the table without reading `tasks.md`, and record agreement or the difference.

Evidence, 2026-11-14. Count of the Must rows, then one pass per row over its status marker:

```
$ grep '^| FR-' docs/functional-requirements.md | grep -c '| Must |'
64
```

```
AUTH  10 rows  DONE= 9 PARTIAL= 1 NOT_STARTED= 0  9.5 pts
PROF   5 rows  DONE= 5 PARTIAL= 0 NOT_STARTED= 0  5.0 pts
VER    4 rows  DONE= 3 PARTIAL= 1 NOT_STARTED= 0  3.5 pts
DISC   4 rows  DONE= 3 PARTIAL= 1 NOT_STARTED= 0  3.5 pts
REQ    7 rows  DONE= 7 PARTIAL= 0 NOT_STARTED= 0  7.0 pts
THR    3 rows  DONE= 2 PARTIAL= 1 NOT_STARTED= 0  2.5 pts
OUT    7 rows  DONE= 7 PARTIAL= 0 NOT_STARTED= 0  7.0 pts
REP    6 rows  DONE= 4 PARTIAL= 2 NOT_STARTED= 0  5.0 pts
INST   1 rows  DONE= 0 PARTIAL= 1 NOT_STARTED= 0  0.5 pts
ADM    6 rows  DONE= 4 PARTIAL= 0 NOT_STARTED= 2  4.0 pts
NOT    1 rows  DONE= 1 PARTIAL= 0 NOT_STARTED= 0  1.0 pts
CONS   2 rows  DONE= 2 PARTIAL= 0 NOT_STARTED= 0  2.0 pts
PRIV   3 rows  DONE= 1 PARTIAL= 1 NOT_STARTED= 1  1.5 pts
AUD    1 rows  DONE= 1 PARTIAL= 0 NOT_STARTED= 0  1.0 pts
UX     4 rows  DONE= 1 PARTIAL= 3 NOT_STARTED= 0  2.5 pts
REGISTER 55.5 / 64 = 86.7%
$ python3 - (the same script, before the three edits)
REGISTER 54.0 / 64 = 84.4%
```

The script reproduces the published 54.0 exactly before the edits, so the 1.5-point delta is these three rows and nothing else. Code-only: 55.5 minus the three named amendment rows (1.0 each) = **52.5 / 64 = 82.0%**. Second reader, recomputed from the Points column alone: 9.5 + 5 + 3.5 + 3.5 + 7 + 2.5 + 7 + 5 + 0.5 + 4 + 1 + 2 + 1.5 + 1 + 2.5 = 55.5; minus 3.0 = 52.5. Agreement, no difference.

## 3. The local setup port

- [x] 3.1 `docs/local-setup.md` line 36: the port table row gains "or whichever free port `POSTGRES_PORT` names".
- [x] 3.2 `docs/local-setup.md` lines 41–44: keep the default, add the Windows note — reserved ranges, the `netsh interface ipv4 show excludedportrange protocol=tcp` check, the 55405–55504 example and `55400` as the worked value — and state that Compose reads `POSTGRES_PORT` so no file changes.
- [x] 3.3 `docs/local-setup.md` line 115: the host-`DATABASE_URL` sentence names `POSTGRES_PORT`'s value instead of the literal port.
- [x] 3.4 `.env.example` lines 11–12: a comment above the two variables giving the same note; the values stay `55432`.
- [x] 3.5 Verify the note is executable: `netsh interface ipv4 show excludedportrange protocol=tcp` prints a range containing 55432 on this machine, and `docker compose up -d postgres` succeeds with `POSTGRES_PORT=55400` in `.env`. Paste both.

Evidence, 2026-11-14:

```
$ netsh interface ipv4 show excludedportrange protocol=tcp | grep -E "55[0-9]{3}"
     54998       55097
     55098       55197
     55198       55297
     55298       55397
     55405       55504      <- contains 55432, so the documented port cannot bind
     55505       55604
$ grep -c 'POSTGRES_PORT=55400' .env
1
$ docker compose ps postgres --format '{{.Name}} {{.Status}} {{.Ports}}'
connect-postgres-1 Up 2 hours (healthy) 0.0.0.0:55400->5432/tcp, [::]:55400->5432/tcp
```

The 55400 publish comes from this machine's existing `.env`, which already carried it; no Compose file and no `.env` line was changed by this task.

## 4. Consequences

- [x] 4.1 `docs/known-debt.md`: beside `DEBT-22` and `DEBT-39`, one line saying the register now scores those rows `DONE` for the pilot scope and that no code changed.
- [x] 4.2 `docs/milestones-and-phases.md` "Current state" and "Next change": the new totals, dated.
- [x] 4.3 `docs/mvp-build-plan.md` §5: no status row changes; the §1.1 divergence is reported, not edited.
- [x] 4.4 `docs/decision-log.md`: the reserved rows at the end of this file.

## 5. Gates and review

- [x] 5.1 Run the full gate set so the change cannot have broken a gate it never touched: `pnpm lint`, `pnpm typecheck`, `CI=true pnpm test`, `pnpm build`, `pnpm exec openspec validate --all --strict`, each exit code echoed.
- [x] 5.2 Review: `git diff --stat` touches only `docs/`, `.env.example` and this change directory — no file under `services/`, `apps/`, `packages/`, `openspec/specs/`.
- [x] 5.3 Handoff: the three row changes, both totals with the command that produced them, the port note, and the three "found, not fixed" items repeated.

## Decision rows recorded at apply

Written as **`D-156`** and **`D-157`**. The reservation `D-169 … D-170` in this file was a placeholder written before the other four changes of the round landed; `D-155` is the last recorded entry in `docs/decision-log.md`, so 156 and 157 are the real next free numbers, and the round consumes 156 to 170 in apply order.

- **D-156**: `FR-OUT-07` and `FR-ADM-06` reach `DONE` through an amendment that states the pilot's Tier 0 scope, not through built work, and join `FR-ADM-05` in the code-only exclusion. Reason: the owner's standing deferral of evidence upload means no code can close them, and counting them as built would inflate pilot readiness. Affects: `docs/functional-requirements.md` §2.7, §2.11, §2.16, `docs/known-debt.md`.
- **D-157**: the local `55432` guidance becomes "a free port named by `POSTGRES_PORT`", with the Windows reserved-range check and `55400` as the example; the default value does not change. Reason: Windows on the owner's machine reserves 55405–55504, so the documented port cannot bind and the host-facing integration suite loses its database silently. Affects: `docs/local-setup.md`, `.env.example`.
