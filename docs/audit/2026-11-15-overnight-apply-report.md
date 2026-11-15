# Overnight apply round — 2026-11-15

Run of the approved round of five OpenSpec changes, in the announced order, unattended.
Three changes are merged and archived; two were not started. Everything below is what the
commands returned, not what they were expected to return.

## Per change

| # | Change | Status | PR | Merge commit | Migration | Gate totals before → after |
|---|---|---|---|---|---|---|
| 1 | `thread-read-state` | **Merged and archived** | apply #83, archive #84 | `7d75023`, archive `39752d2` | `0020_yellow_donald_blake.sql` (tables 30 → 31) | 711 (domain 134, web 245, contracts 23, api 309) → **718** (135 / 245 / 23 / 315) |
| 2 | `audit-sampling` | **Merged and archived** | apply #85, archive #86 | `8636de5`, archive `177341b` | none | 718 → **728** (139 / 245 / 23 / 321) |
| 3 | `configuration-versioning` | **Merged and archived** | apply #87, archive #88 | `1992f9b`, archive `14e4b44` | `0021_absent_morbius.sql` (tables 31 → 32) | 728 → **740** (144 / 245 / 23 / 328) |
| 4 | `evidence-upload-and-scan` | **Not started** | — | — | — | — |
| 5 | `evidence-retention-sweeper` | **Not started** (depends on 4) | — | — | — | — |

## Final state

- `main` at **`14e4b44`** (merge of archive PR #88); `git log --oneline` confirms all six merges above.
- `openspec list` shows two active changes, `evidence-upload-and-scan` and `evidence-retention-sweeper`, both at 0 tasks — the proposals as they were written, untouched.
- `openspec validate --all --strict`: **44 passed, 0 failed** (the count drops as each change leaves `changes/`).
- `pnpm lint` exit 0, `pnpm typecheck` exit 0, `pnpm build` exit 0, `CI=true pnpm test` **740 tests, 0 fail, 0 skipped**.
- Three branches merged and deleted; no branch is left open or unmerged.

## Register recount (2026-11-15, from the rows by command)

| Basis | Before the round | After the round |
|---|---|---|
| Register (`docs/functional-requirements.md` §2.16) | 56.0 / 64 = 87.5% (51 done, 10 partial, 3 not started) | **57.5 / 64 = 89.8%** (52 done, 11 partial, 1 not started) |
| Code-only | 53.0 / 64 = 82.8% | **54.5 / 64 = 85.2%** |

What moved, and why it is honest:

- `FR-THR-02` **stays `PARTIAL`**: the read state and the count are built, but no page sends the mark-read write or shows the count, so no user sees it (DEBT-61).
- `FR-ADM-03` **NOT STARTED → PARTIAL (+0.5)**: random sampling, the always-sampled types and the hold are built; the anomaly clause has no signal in the system and is DEBT-62.
- `FR-ADM-07` **NOT STARTED → DONE (+1.0)**: versioned, attributed, audited configuration with the version recorded on every ledger row.
- The last remaining `NOT STARTED` Must is `FR-PRIV-03` (the retention sweeper), which is change 5 of this round and is not started.

## Decisions taken during the run (full text in `docs/decision-log.md`)

- **D-172 to D-177** (`thread-read-state`): separate marker table; one explicit write and no `GET` writes; conditional upsert on the database clock; the count on the two mentorship reads and absent from write responses; a pure rule pinned to the SQL; no `DELETE` grant.
- **D-178 to D-183** (`audit-sampling`): rate 0.25; three always-sampled types by name; no new audit action; FNV-1a with a fixed salt; a null actor records `SYSTEM`; **`case_kind` keeps its three existing wire values and gains `audit_hold`** — the draft delta wanted to rename two values to `disputed` / `conflict_declared`, which would have broken `apps/web/lib/review-queue.ts` outside this change's scope, so I corrected the delta spec instead and said so in the PR.
- **D-184 to D-191** (`configuration-versioning`): tunables = values that price a ledger row only; no active version means no ledger write; the pair factor is a formula recorded as fixed; version numbers assigned by the database; add-nullable/seed/backfill/`NOT NULL` in one migration; **the baseline row's actor is null**; `CONFIGURATION_CHANGED` in both audit unions; the sampler's rate comes from the version.
- **One deviation from the design, recorded rather than hidden**: `config_versions.created_by_user_id` is nullable (design R3 said `NOT NULL`) because the migration seeds version 1 before any account exists, and inventing a system account would fabricate an identity in an audit surface (D-189).
- **Two entries added to the reputation schema guard's allowlist** (`audit_sample_rate`, `tier_multipliers`), each with a reason, because the admin-only configuration payload legitimately names them; no participant-facing payload gained a score-shaped field.
- I drove the OpenSpec CLI directly rather than the `/opsx` slash commands (`.hermes.md` §4: those belong to OpenCode).
- Codex CLI was not used: no `oc-ds` / `oc-glm` profiles exist in `~/.codex/config.toml`, so every line was written and reviewed in this session.

## Verification done beyond the gates

- Mutation checks, each failing the intended test and then restored: participation guard, sender filter and break-glass marker write (`thread-read-state`); cooling predicate, status predicate, random draw, missing `AUDIT_HOLD` branch, unconditional sample and ignored type list (`audit-sampling`); a widened range, the exact-membership check, the job's null guard and a hard-coded version id (`configuration-versioning`).
- Live check (`audit-sampling`, task 7.4): the sampler ran once against the dev database through a throwaway script (deleted). Before and after `outcomes.status` counts were identical (`PENDING_CONFIRMATION` 3, no `CONFIRMED` row), result `selected 0, held 0, raced 0`. The positive path is proven only against `connect_test`.
- Migrations applied to the dev database (`0020`, `0021`); `0021` was read before it ran and its seed digest is recomputed by a test.

## Stopped / not started, and what to do next

- **`evidence-upload-and-scan` was not started.** Its task 0 (versitygw presigned-GET proof, ClamAV EICAR proof, pinning `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner`) is the gate for the whole change, and the remaining work — a new table and migration, upload/download/scan plumbing, fail-closed serving, contracts, registries and tests — could not be completed to the "exercised, not described" standard inside this run. Nothing partial was merged and no branch was left behind.
- **`evidence-retention-sweeper` was not started**, because it depends on 4 exactly as the brief says.
- Both proposals remain unmodified and active under `openspec/changes/`; the next run starts with task 0 of `evidence-upload-and-scan` and follows the brief's stop rule (no PutObject or no EICAR detection means stop that change and skip 5).

## What the owner must do by hand

1. Review the three merged PRs (#83, #85, #87) and their archives (#84, #86, #88).
2. Decide the anomaly signal for `FR-ADM-03` (DEBT-62) — until then that row stays `PARTIAL`.
3. Decide whether the audit sample rate 0.25 and the three always-sampled types are right for the pilot (D-178, D-179); both are one constant each.
4. Run `pnpm --filter api db:migrate` on any database other than the dev one (`0020`, `0021` are forward-only).
5. Nothing to flip for the retention sweeper yet: it does not exist in this round, so its `DRY_RUN` default was not touched.
6. The `audit_hold` case kind renders as its raw value on `/admin/reviews` until a frontend change adds the label (DEBT-61 and the review-page label are both frontend follow-ups).

## Could not verify

- The browser: no change in this round touched `apps/web`, so no browser pass was run and none was needed.
- The positive sampling and counting paths against the **dev** database: they are proven against `connect_test` only, because the dev seed has no `CONFIRMED` outcome.
- CI's own job times: read from `gh pr checks` (checks 8m11s–8m39s, images 1m33s–2m21s, security 22–26s per PR).
