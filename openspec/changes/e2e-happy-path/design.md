# Design: e2e-happy-path

## Context

**Repository snapshot (verified 2026-11-21 at propose; re-check at apply).**

- `.github/workflows/ci.yml` has three jobs: `checks` (install, lint, typecheck, create `connect_test`, `pnpm test`, `pnpm build`), `images` (two Dockerfile builds plus `trivy`), `security` (`pnpm audit --audit-level high`, gitleaks). No job starts a browser.
- `compose.yaml:73-82` runs Mailpit `axllent/mailpit:v1.32.0` with `MAILPIT_HTTP_PORT` defaulting to `8025` and a `/livez` healthcheck; the API sends through `SMTP_HOST=mailpit` (`compose.yaml:17`).
- `services/api/src/db/seed/demo-mentors.ts:191-197` writes one verified `two_factors` row per demo mentor using `DEMO_TOTP_SECRET`; `:181-197` also grant the `MENTOR` role, a `LEVEL_1` verified affiliation and an `ACTIVE` mentor profile, so a seeded mentor can accept a request.
- `pnpm --filter api db:seed:demo` runs `src/db/seed/run-demo.ts` (`services/api/package.json:17`).
- The sign-up form posts `display_name`, `email`, `password`, `date_of_birth`, `consent_accepted` and the hidden `contact_website`, and the BFF refuses a submission younger than `SIGNUP_MIN_SUBMIT_SECONDS = 2` (`packages/config/src/index.ts:134`) or one with no intent marker.
- `apps/web/package.json` has no test dependency beyond `tsx`; the web suite is `node --import tsx --test test/*.test.ts`.
- `docs/milestones-and-phases.md:162` and `docs/production-requirements.md:165` both name the missing end-to-end test.

## Goals / Non-Goals

**Goals**

- A red happy path fails a PR, with enough evidence (step, screenshot, trace) to fix it without a local reproduction.
- The test drives the same surfaces a person does: the pages and the BFF, never `POST /v1/...` directly except where the product itself has no page (none of the steps).
- Deterministic: no sleeps, no randomness in the seeded actors, no shared state with the unit suites.

**Non-Goals**

- No page-object layer, no framework beyond Playwright, no custom reporter beyond the built-in list and html reporters.
- No coverage of failure paths (refusals, 403s, validation) — those are the unit and integration suites' job.
- No change to the demo seed: the test consumes it, and if a seeded actor is missing the test says so instead of creating it.

## Decisions

### D-236: One full path through the browser, actors seeded rather than typed

- Date: 2026-11-21
- Decision: one spec walks sign-up → verify → profile and field → request → accept → message → outcome → confirm → impact. The mentor comes from `pnpm --filter api db:seed:demo`; the student is created through the sign-up page; the institution and the field taxonomy come from the same seed.
- Reason: the gate asks for one path, and the failures this product actually has are seam failures (a page that renders nothing, a BFF route missing from an allow-list, a payload key the API ignores). A shorter test that skips the mentor's confirmation would miss the one invariant the product exists for — that only a confirmed outcome counts.
- Alternatives rejected: two shorter specs (auth; outcome) — cheaper per run but neither proves the seam between them; driving every actor through the UI — it would test the seed and add minutes for no signal.
- Status: Decided (owner-approved as the audit's E1 recommendation)
- Affects: `e2e/happy-path.spec.ts`, `docs/milestones-and-phases.md` §5.5

### D-237: Its own CI job, not a step in `checks`

- Date: 2026-11-21
- Decision: a fourth job `e2e` with its own Postgres service, `playwright install --with-deps chromium`, and `retries: 1` in CI only. The `checks` job keeps its five steps.
- Reason: the two failures mean different things and the logs should say which. A browser flake must not be able to mask a unit-test regression, and the existing 10-minute job is already the longest signal in the repository.
- What would change this decision: Actions minutes becoming a real constraint (a private repository with no free tier), in which case the job moves to a nightly schedule plus a pre-merge label.
- Status: Decided (owner-approved as the audit's E2 recommendation)
- Affects: `.github/workflows/ci.yml`, `docs/local-setup.md`

### D-238: The verification link is read from Mailpit's HTTP API

- Date: 2026-11-21
- Decision: the test polls Mailpit's HTTP API for the newest message to the student's address, extracts the link and visits it. No test-only bypass, no fixed token, no environment switch in the API.
- Reason: verification is part of the path the gate names, and any bypass would be a production seam that exists for tests. Mailpit is already a Compose service and already the local sink for every message.
- What would change this decision: Mailpit's API not exposing message bodies in the pinned version, in which case the helper reads the `.eml` from the container's spool file instead — a documented fallback, not a redesign.
- Status: Decided (owner-approved as the audit's E3 recommendation)
- Affects: `e2e/support/mailpit.ts`, `docs/local-setup.md`

### D-239: The mentor's second factor is computed with Node's `crypto`, not a TOTP dependency

- Date: 2026-11-21
- Decision: `e2e/support/totp.ts` decodes the base32 `DEMO_TOTP_SECRET` and computes a six-digit code with `crypto.createHmac("sha1", …)`, checked against the RFC 6238 test vectors in its own unit test. The seed's own constant is imported, never duplicated. No authenticator library is added.
- Reason: the demo mentor has a verified factor (`demo-mentors.ts:191-197`), so the mentor's sign-in cannot avoid the challenge; the alternative is a dependency of a few hundred kilobytes to reproduce twenty lines of standard arithmetic, in a repository that carries no test library beyond `node:test`.
- What would change this decision: the library's challenge flow changing to something other than a six-digit TOTP code, in which case the helper is replaced by whatever the flow needs and the decision is recorded again.
- Status: Decided (proposal-time decision, beyond the audit's list, because the seeded factor otherwise stalls the path)
- Affects: `e2e/support/totp.ts`, `e2e/test/totp.test.ts`

## Risks / Trade-offs

- Flake from timing (the two-second sign-up floor, the cooling period, the sweeper intervals) → the path never asserts a clock it does not control: it waits for the intent marker's timestamp to age past the floor by reading `Date.now()` against the cookie it holds, and it asserts states the API reports, not states a timer would produce.
- Flake from ordering → one worker, one spec, serial steps; `fullyParallel: false`.
- The suite needs the stack, so a broken Compose file fails it → that is a true failure and the job says which service was unhealthy.
- Node 24 + Playwright on a Windows dev box is slower than on the runner → the local script is documented with a timeout budget, and CI is the authority.

## Migration Plan

1. Add the dependency and lockfile in one commit; CI's `security` job already blocks a HIGH/CRITICAL advisory from it.
2. Land the support helpers with their unit tests before the spec body, so the spec's first run reports a product failure rather than a helper bug.
3. Add the job last, so a red job never sits on `main` while the spec is still being written.

**Rollback**: delete `e2e/`, the job and the dependency, and restore `docs/milestones-and-phases.md` §5.5 to unchecked with the reason.

## Open Questions

None that change the approach. The Mailpit endpoint shape (D-238) is confirmed against the pinned container before the helper is written; it is a verification step, not an open decision.
