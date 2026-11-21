# Design: dependency-security-bump

## Context

**Repository snapshot (verified 2026-11-21 at propose; re-check at apply).**

- `apps/web/package.json:14` — `"next": "16.4.3"`, `"react": "19.3.1"`, `"react-dom": "19.3.1"`; the web package has no dependency on anything else beyond `@connect/config`.
- `pnpm-lock.yaml:2250` resolves `next@16.4.3`; `:1913` `esbuild@0.18.20`; `:2217` `minimatch@10.2.6`.
- `CI=true pnpm build` exits `1` on a cold tree with `SecurityFatalError: Your version of Next.js is affected by a known security vulnerability`, and exits `0` when repeated (both runs observed 2026-11-21). `pnpm -r build` stops at `apps/web`, so the API bundle is never emitted in the failing run.
- `pnpm audit --audit-level=high` prints `9 vulnerabilities found` / `Severity: 9 moderate` and exits `0`, which is why the `security` job in CI is green while the build is not.
- `.github/workflows/ci.yml:54` runs `pnpm build` inside the `checks` job; `:79-91` run two `trivy` scans at HIGH/CRITICAL with `exit-code: 1`.
- The last CI run on `main` (`gh run list --limit 5`, 2026-11-21) reported `success` in 10m8s, so the nudge is not firing on that runner today. That is luck, not a guarantee: it is keyed on the advisory feed and on per-machine state.

## Goals / Non-Goals

**Goals**

- `pnpm build` succeeds on a clean tree on the first invocation, on Windows and on the CI runner.
- The advisory set on `next` is cleared, and the two dev-only advisories are either cleared or recorded with a parent and a trigger.
- The diff is a version bump and a lockfile; a source change is a stop signal, not a licence.

**Non-Goals**

- No suppression mechanism of any kind (see D-234).
- No second upgrade in the same change: React, Node, TypeScript, the test runner and ESLint stay where they are.
- No dependency policy, no automated bump lane, no `renovate.json`, no `dependabot.yml`.
- No new test file. The evidence is the gates, the audit output and two cold builds.

## Decisions

### D-234: Bump `next` to the latest patched `16.x`, and never silence the check

- Date: 2026-11-21
- Decision: `apps/web/package.json` moves `next` from `16.4.3` to the newest published `16.x` that clears the seven advisories, pinned exactly, with `pnpm-lock.yaml` regenerated. No ignore flag, environment variable or forked build script is added. The apply reads the changelog for `use cache` and the image optimizer — the two areas the advisories touch — and re-runs the four gates plus **two consecutive builds on a clean `.next`**.
- Reason: The gate is documented as green and is not. A retry is a workaround that hides a security advisory behind an operator's habit, and the `security` job cannot see it because `pnpm audit` reports only moderates. Staying inside `16.x` keeps the change to one variable and one lockfile.
- Alternatives rejected: (a) `next upgrade --agent=security`, which produces a diff nobody reviewed for this repo's own conventions; (b) staying on `16.4.3` and documenting the retry, which leaves a documented gate red on a cold tree.
- Status: Decided (owner-approved as the audit's B1 recommendation)
- Affects: `apps/web/package.json`, `pnpm-lock.yaml`, `docs/known-debt.md`, `docs/decision-log.md`, `README.md`

### D-235: The two dev-only advisories move only inside their parents' existing ranges

- Date: 2026-11-21
- Decision: `esbuild@0.18.20` (through `drizzle-kit`) and `minimatch@10.2.6` (through ESLint) are bumped only if a patched version satisfies the parent's declared range and no other version moves. If either needs a parent major, it stays and `DEBT-71` closes with a dated row naming the parent, the advisory and the trigger that would justify the major.
- Reason: neither is reachable at runtime — one is the dev server of the migration tool, the other is a glob in the linter — and a drizzle-kit or ESLint major is a migration with its own risk, which this change is not sized for.
- What would change this decision: a reachable HIGH or CRITICAL advisory on either package, or `trivy` failing on an image because of one.
- Status: Decided (owner-approved as the audit's B2 recommendation)
- Affects: `pnpm-lock.yaml`, `docs/known-debt.md`, `docs/decision-log.md`

## Risks / Trade-offs

- A `next` minor changes rendering → the web build prints its route table and 259 web tests run; one page is fetched from a rebuilt container and its status recorded in the handoff, so a broken build is seen before the PR.
- A patch bump drags a transitive dependency past the image scan → `trivy` (HIGH/CRITICAL) fails the `images` job; the change stops and reports the new finding rather than adding an ignore.
- The nudge fires on the runner's first attempt → the acceptance requires two consecutive builds and records both exit codes, so "green on retry" cannot be mistaken for fixed.
- The bump needs a React change → out of scope by design; the change stops, records which version needs what, and returns to the owner.

## Migration Plan

1. `pnpm install` after editing `apps/web/package.json`; commit the lockfile in the same commit.
2. `rm -rf apps/web/.next && pnpm build` twice; both must exit `0`.
3. `pnpm audit --audit-level=high`; record the remaining count.
4. Deploy is unchanged: the images are rebuilt by CI from the same Dockerfiles and the app has no server-side requirement tied to the Next version.

**Rollback**: revert the commit; the lockfile returns with it. No schema, no data, no contract.

## Open Questions

None.
