# Proposal: e2e-happy-path

## Why

Gate 1's own checklist requires "CI green: lint, type-check, unit tests, API contract tests, **one end-to-end test of the happy path**" (`docs/milestones-and-phases.md:162`), and `docs/production-requirements.md:165` lists the same line among the CI gates. No end-to-end test exists: `find . -name 'playwright*'` and `find . -name '*e2e*'` outside `.git` return nothing, no `package.json` lists a browser test dependency, and `.github/workflows/ci.yml` has three jobs (`checks`, `images`, `security`), none of which drives a browser. The 2026-11-15 explore recorded this as finding **B4**; it has no debt row and was never scheduled.

The consequence is concrete: the web suite is pure-helper tests plus source-grep wiring tests, so a page can render nothing at all and stay green. That is exactly what an unstyled, server-rendered app looks like from the inside.

## What Changes

- One `@playwright/test` dependency at the repository root, pinned, chromium only.
- One spec that walks the product's happy path in a browser: sign-up with email and password (honeypot empty, consent accepted, more than two seconds after the intent marker is minted — `SIGNUP_MIN_SUBMIT_SECONDS` at `packages/config/src/index.ts:134`) → verification link read from Mailpit → student profile and one field → request to a seeded demo mentor → mentor accepts → message in the thread → student reports an outcome → mentor confirms → the counted outcome appears on the mentor's impact read.
- The mentor's second factor: the demo seed writes a verified `two_factors` row with `DEMO_TOTP_SECRET` (`services/api/src/db/seed/demo-mentors.ts:191-197`), so the test computes a code with Node's own `crypto` — no TOTP dependency.
- A new `e2e` job in `.github/workflows/ci.yml` with its own Postgres service, so a browser failure and a unit failure are distinguishable, and the 10-minute `checks` job keeps its shape.
- No product behaviour changes. The API, the contract, the schema and the pages are untouched.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `platform/ci-pipeline`: one ADDED requirement, "CI runs one end-to-end path through a browser". The existing "Every pull request runs the full check suite" is not modified: it enumerates workspace commands, and this path is a second job against a running stack, not another `pnpm -r` command. Adding it there would have meant restating a requirement whose scenarios are about workspace commands, to describe something they were never shaped to cover.

## Impact

- **Code**: none in `apps/web`, `services/api` or `packages/`. New: `e2e/` at the repository root (`playwright.config.ts`, `e2e/happy-path.spec.ts`, `e2e/support/{mailpit,totp,actors}.ts`).
- **Dependencies**: `@playwright/test` (dev, pinned) and its chromium browser download in CI. `pnpm-lock.yaml` updated; `pnpm audit --audit-level=high` stays at zero high/critical.
- **CI**: `.github/workflows/ci.yml` gains a fourth job. No existing job changes its steps.
- **Contract / data**: none. The test reads the same endpoints a browser reads; it seeds through the existing demo seed (`pnpm --filter api db:seed:demo`) and creates its own student through the UI.
- **Tests**: the browser suite itself. `apps/web/test/*` and `services/api/test/*` are unchanged.
- **Docs**: `docs/milestones-and-phases.md` §5.5 (the e2e box, ticked with the run that proves it), `docs/production-requirements.md` §11, `docs/mvp-build-plan.md` §4 (DoD item 2), `docs/local-setup.md` (how to run the suite), `docs/decision-log.md` (D-236 to D-239), `README.md` status line, `docs/known-debt.md` (the B4 gap recorded and closed).

## Depends on

None technically. It is second because change 5 (accessibility evidence) reuses its browser and its page list, and because a trustworthy build gate (change 1) makes the PR that adds a browser dependency safe to merge.

## Out of scope

- **Cross-browser coverage** (firefox, webkit): chromium is the browser the pilot's Android Chrome and desktop Chrome both approximate; a second engine triples the runner minutes for no pilot signal.
- **Visual or screenshot regression testing**: the app has no styling to regress yet; that belongs after `visual-design-and-responsive-layout`.
- **Accessibility assertions, narrow viewports and slow-network profiles**: those are change 5 and the deferred `DEBT-37` work.
- **A second end-to-end path** (institution attestation, platform review, evidence upload): one path is what the gate asks for; the next one is added when it is the thing most likely to break.
- **Seeding through the UI for every actor**: the mentor and the institution come from the existing demo seed, because recreating them through the UI would test the seed, not the product.
- **A separate staging environment**: the job runs the local Compose stack, which is what "staging" means until a host is chosen (`docs/production-requirements.md:94`).

## Risks and rollback

| Risk | Mitigation |
|---|---|
| A flaky browser test blocks every PR and gets disabled | One path, one worker, `retries: 0` locally and `retries: 1` in CI, explicit waits on responses (never on sleeps), and a failure screenshot plus trace on the first retry |
| The suite takes too long and developers stop running it | The job is separate and cancel-in-progress; locally `pnpm e2e` starts only the two app containers it needs |
| The test writes into a database someone cares about | It refuses to run unless `DATABASE_URL` names a database whose name ends in `_test`, checked in `playwright.config.ts` before any browser starts |
| The TOTP helper drifts from the library's expectations | The helper is a pure function with its own unit test against the RFC 6238 vectors; the seeded secret is imported, never copied |
| Mailpit's API shape differs from the version pinned | The endpoint is confirmed against the running container (`compose.yaml:74`, `axllent/mailpit:v1.32.0`) in the task that writes the helper, before the spec body is written |

**Rollback**: delete `e2e/`, the job and the dependency; no product code, data or contract is involved.

**Traces to** `platform/ci-pipeline`, `FR-UX-01`, `FR-REQ-01`, `FR-OUT-01`, `SEC-SUP-2`, D-236, D-237, D-238, D-239, `DEBT-71`.
