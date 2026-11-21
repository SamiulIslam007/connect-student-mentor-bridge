# Propose round, 2026-11-20 — five changes

Read-only planning round. Five change directories left uncommitted under `openspec/changes/`; no code, migration, test, branch or commit. Base: `main` at `bcdb2e4`, clean tree.

## 1. The five changes and their validation

| Change | Artifacts | Status | `validate --strict` |
|---|---|---|---|
| `institution-dashboard-aggregates` | proposal, design, tasks, `specs/institutions/institution-dashboard`, `specs/institutions/onboarding` | 4/4 | valid |
| `idempotency-key-on-writes` | proposal, design, tasks, `specs/platform/idempotency` | 4/4 | valid |
| `signup-bot-protection` | proposal, design, tasks, `specs/identity/email-password-auth` | 4/4 | valid |
| `pilot-runbook-and-docs-truth` | proposal, design, tasks (`skip_specs: true`) | 3/3 (1 skipped) | valid (one expected `skip_specs` info) |
| `evidence-retention-edges` | proposal, design, tasks, `specs/trust/evidence-retention` | 4/4 | valid |

`openspec validate --all --strict`: `49 passed, 0 failed (49 items)`.
`scripts/check-delta-headers.py`: `institutions/onboarding` modified requirement and all 3 scenario names match; `trust/evidence-retention` modified requirement and all 7 scenario names match. `0 failure(s)`, both.

Apply order: `institution-dashboard-aggregates`, `idempotency-key-on-writes`, `signup-bot-protection`, `evidence-retention-edges`, then `pilot-runbook-and-docs-truth` — the last one recomputes the counts after the other four have landed.

## 2. Decisions I made myself (beyond the brief)

1. **Counts, never rates.** The two "shares" ship as integer pairs, so a share of one in four is suppressible and the payload cannot become a score (`D-114` to `D-116`'s precedent).
2. **`institution_id` is required, and an unknown id and an unassigned id answer the same `404`** — a derived institution breaks the day an admin holds two.
3. **Suppression omits the value and names it** in a `suppressed` list; a null would render as zero and a rounded value is a lie.
4. **API only for the aggregates**; the page is a follow-up debt row, because a page needs an approved visual direction this round cannot produce.
5. **Institution pagination keysets on name then id**, default 50, max 100 — the existing order, not a new one.
6. **Idempotency store keys on (caller, operation, key)**, not on the key alone: a client-chosen string must not be a cross-tenant signal.
7. **Two retentions on one column** — 24 hours completed, 5 minutes unfinished — so a crashed request cannot wedge a key for a day.
8. **The digest is canonical JSON, not raw bytes**, because hashing raw bytes needs a `verify` hook on the one JSON parser every route shares.
9. **`idempotency_keys.status` is text with a check, not a new pg enum** — it is plumbing and never reaches a payload.
10. **The honeypot is a documented body key** (`contact_website`); an undeclared key would be refused by `BodyAllowlistInterceptor` with the field named, which announces the mechanism.
11. **The signup marker is an unsigned httpOnly cookie** minted by a new `GET /api/auth/register-intent` route; the threat priced is the cost per attempt, not forgery.
12. **Two seconds and one hour**, in `@connect/config`, because a per-deploy random window makes a refusal unreproducible in support.
13. **Timing is enforced in the BFF, the honeypot in both** — the API is bearer-only and parses no session cookie.
14. **A reversal's clock starts at `reversed_at`, never at `counted_at`** — the coalesce shape would delete the material a clawback was decided on.
15. **The consent instant can only advance the clock** (`min` with the settle instant), and the withdrawal that counts is the earliest one by the reporting student.
16. **No column for the consent-to-file link**: Change 2 owns migration `0023`, so the link is a lateral subquery, not `retention_clock_started_at`.
17. **`D-204` is superseded by a new decision row, never edited** — the log is history.
18. **The milestones narration moves to a `## History` section** rather than being deleted.
19. **The broken-password clause becomes `DEBT-67`** (recorded, not built): it needs a provider decision and an outbound call on the registration path.

## 3. Conflicts between the brief and the repo

1. **Docs edits are both ordered and forbidden.** The brief forbids touching anything but the proposal artifacts, then tells Change 2 to "add the missing known-debt row first", Change 4 to rewrite `docs/milestones-and-phases.md`, `docs/mvp-build-plan.md`, `docs/known-debt.md` and the register. Resolved by scheduling every one of those as a tickable task inside the owning change's `tasks.md` and editing no tracked doc now. This report file is the single allowed exception.
2. **Change 5 reverses a recorded decision.** `D-204` (in `docs/decision-log.md`) says a `REVERSED` or `WITHDRAWN` outcome keeps its file, and `packages/domain/src/evidence-retention.ts` says so in its own comment. The change therefore schedules a superseding `D` row and leaves `D-204` intact, per `AGENTS.local.md` §1.1.
3. **"No other change may add a migration" removed the obvious design.** The consent-to-evidence link would normally be a `retention_clock_started_at` column; with `0023` reserved to Change 2, it is derived from `consent_records` instead. Recorded as design R5 rather than silently ignored.
4. **`FR-INST-01` has two owners.** `DEBT-51` says pagination belongs with the institution dashboard (`institution-dashboard-aggregates` closes it and the clause), while the brief gives the row's `DONE` amendment to `pilot-runbook-and-docs-truth`. Stated in both changes so the second apply does not revert the first.
5. **The twelve-line rule is not where the brief says.** It lives in `AGENTS.local.md` §4 ("One live truth"), with the loop-and-audit gate in `.hermes.md` §5; the artifacts now cite both correctly.
6. **`SEC-ABUSE-1`'s row over-claims.** `docs/security-requirements.md` credits both rate-limit buckets and says nothing about bot protection, which the code does not have — the register's silence is the defect, not the gap.
7. **The register disagrees with its own synced specs.** `FR-ADM-03` keeps an anomaly clause that appears nowhere in `openspec/specs/mentorship/platform-review` (`grep -c anomaly` returns 0), and `FR-INST-01` is marked `PARTIAL` against scope no `openspec/specs/institutions` requirement asks for. That is why Change 4 is `skip_specs` — the amendments align the register with the specs, not the other way round.

## 4. Nothing was created outside the proposal artifacts

- `git branch --show-current` → `main`; `git log --oneline -1` → the same `bcdb2e4` as before the round.
- No commit, no branch, no PR, no staged file.
- No application code, no migration file (`ls services/api/drizzle/*.sql | tail -1` still `0022`), no test file.
- Changed paths: the five new directories under `openspec/changes/` and this one file in `docs/audit/`.
