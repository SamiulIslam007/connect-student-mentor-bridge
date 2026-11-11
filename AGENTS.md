# AGENTS.md

connect is a mentorship and reputation platform for the academic-to-career transition.
Students send structured requests to volunteer mentors; mentors decide within 48 hours.
Students report outcomes; mentors confirm them; only confirmed, counted outcomes build reputation.
Every outcome, verification, consent, and reputation change is append-only and auditable.
The MVP is a Pilot build for one partner: about 8 one-week sprints at 3 days per week.

## Stack

- TypeScript monorepo: NestJS modular monolith (API + worker), Next.js PWA, PostgreSQL, Drizzle ORM (schema declared in TypeScript, `drizzle-kit` for migrations).
- Identity: better-auth behind the `IdentityService` interface.
- Local development is Docker Compose (Postgres, S3-compatible object store, mail catcher). Hosting is not chosen yet.
- Jobs: pg-boss (provisional). No Redis, no WebSocket, no Flutter, no Zoom API, no AI in the MVP.

## Rules

1. Docs are the source of truth. Read the relevant docs before coding; if code and docs disagree, stop and ask.
2. Spec-driven: every change starts as an OpenSpec proposal, then a spec, then implementation.
3. Never invent facts, numbers, prices, legal claims, or statistics. Keep truth labels.
4. Never read, print, commit, or paste secrets or `.env` files. `.env.example` only, with no values.
5. Never push to `main`, never force-push, never rewrite history. Branch and commit only; the owner merges.
6. Run lint, type-check, tests, and build before saying a task is done. Report only observed results.
7. Never weaken a trust rule: unconfirmed outcomes never count; the neutrality firewall; append-only ledger; object-level authorization; audit log; consent records; erasure design.
8. No payments, no AI features, no Redis or WebSocket in the MVP. `mentorships.is_paid` stays false.
9. English UI only, but every user-facing string goes through the string catalog.
10. Keep the diff small. Change only what the task needs; do not add speculative abstractions.
11. Every new route needs three registrations in the same change: an OpenAPI path, a row in the `authorization-matrix` `MATRIX`, and an entry in `ROUTE_BODY_KEYS` (empty when it takes no body). The inventory and contract-parity tests fail otherwise.
12. No route grants `PLATFORM_ADMIN`, and the pilot's `PLATFORM_ADMIN` role is granted by the hand-run `INSERT` in `docs/local-setup.md`. The checked-in dev seed (`services/api/src/db/seed/admins.ts`) is the only script allowed to create a `PLATFORM_ADMIN` or an `INSTITUTION_ADMIN`: it does so only for the reserved `example.com` demo accounts, prints each generated password once, and refuses to run when `NODE_ENV=production` (D-103). Every admin route requires an enrolled second factor.
13. Throttling is per route: `@Throttle({ default: RATE_LIMITS.<bucket> })` with the values in `@connect/config`, and `@SkipThrottle()` on `/healthz` and `/readyz`. Any raw 429 (including the identity library's) maps to `429 RATE_LIMITED` in `ProblemDetailsFilter`.

## Where to find what

- Read first: `README.md`, then `docs/mvp-build-plan.md`.
- Product rules: `docs/functional-requirements.md`, `docs/reputation-and-verification-policy.md`.
- Data and API: `docs/data-model.md` (canonical enums), `docs/api-contracts.md`.
- Auth and security: `docs/auth-and-access-control.md`, `docs/security-requirements.md`.
- Decisions: `docs/architecture-decisions.md`, `docs/decision-log.md`.
- Build sequence and gates: `docs/milestones-and-phases.md`.
- OpenSpec: `openspec/` (initialized; use `openspec` or the `/opsx` commands).
