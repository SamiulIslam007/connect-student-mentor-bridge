# Proposal: first-deployment-restore-drill-and-observability

## Why

Every remaining Gate 2 item that is engineering rather than paper is here, and all of it is absent:

- **No environment exists.** `docker compose ps` is the only running stack; there is no host, no managed Postgres, no private bucket and no transactional mail provider, so `SEC-INF-6` ("production deploys come only from CI, using the image that passed tests") and `SEC-INF-7` ("daily backups with point-in-time recovery, and a **restore performed and recorded before the pilot**") are both unmet.
- **No restore has ever been performed.** `docs/production-requirements.md:156` is unticked and `docs/runbook.md` §7's record table is empty.
- **No observability.** `docs/production-requirements.md` §9 lists error tracking, an external uptime check and alerts as the pilot minimum; `grep -rni sentry` across the repository finds only documentation, and `known-debt.md` has no row for the gap at all.
- **No bootstrap record.** The first `PLATFORM_ADMIN` is a hand-run `INSERT` (`AGENTS.md` rule 12, `D-226`); the runbook's §6 record table is empty, so nobody can prove the one procedure that unlocks every admin surface.

## What Changes

- One host, chosen by the one-day test `docs/production-requirements.md` §5 already describes, deploying the two existing images (`infra/docker/Dockerfile.web`, `infra/docker/Dockerfile.api`) with the worker as a second process from the API image.
- Migrate-first deployment: `pnpm --filter api db:migrate` runs as its own step before the new API image takes traffic, exactly as `docs/runbook.md` §2 orders it.
- Error tracking in web, API and worker (`@sentry/node` and `@sentry/nextjs`, pinned), initialised only when a DSN is present, with a `beforeSend` scrub list that drops `authorization`, cookies, message bodies, email bodies and evidence content.
- One external uptime check on `/healthz` and the sign-in page, with an email alert, and one alert on the worker's failed-job/retention event lines.
- The three runbook records filled by hand, on the day: deployment values (§5), the first `PLATFORM_ADMIN` and its second factor (§6), and the restore drill (§7) with date, duration, result and operator.
- `EVIDENCE_RETENTION_DRY_RUN` stays `true` until one `evidence.retention_swept` line reports `eligible > 0`, then flips on the worker only.

## Capabilities

### New Capabilities

- `platform/production-operations`: the deployed environment, the migrate-first deploy order, the minimum observability set for the pilot, the backup and restore obligation with its record, and the one-time admin bootstrap record. It is new because no existing capability covers running the product anywhere: `platform/ci-pipeline` covers checks, `platform/health-endpoints` covers the two probes, `platform/local-stack` covers Compose.

### Modified Capabilities

None. The probes, the CI jobs and the Compose stack keep their behaviour; this change consumes them.

## Impact

- **Code**: `services/api/src/main.ts` and `services/api/src/worker.ts` (one conditional `Sentry.init` and one error hook each), `apps/web/instrumentation.ts` or the Next runtime hook (one conditional init), a small `services/api/src/platform/observability.ts` for the scrub list, and `.env.example` (three variable names: `SENTRY_DSN`, `SENTRY_ENVIRONMENT`, `SENTRY_TRACES_SAMPLE_RATE`).
- **Dependencies**: `@sentry/node`, `@sentry/nextjs` (pinned). Both are inert without a DSN, so local development and CI are unchanged.
- **Infrastructure**: one host account, one managed Postgres, one private bucket, one transactional mail provider, one uptime checker. No IaC, no Kubernetes, no CDN.
- **Contract / data**: none. No migration, no API change; the schema is whatever the repository already has (`0023` today).
- **Tests**: `services/api/test/observability.test.ts` for the scrub list (pure), and a smoke check in the deployed environment recorded by hand (the browser harness cannot reach a paid host from CI without credentials).
- **Docs**: `docs/runbook.md` §5, §6, §7 (the three records), `docs/production-requirements.md` §4.2, §5, §9, §10, §12.1, §13.1 and §13.2, `docs/architecture-decisions.md` (a new ADR for the host), `docs/known-debt.md` (`DEBT-11` retargeted and closed for the identity mail; the new observability row closed), `docs/milestones-and-phases.md` "Current state", `README.md` §14 and §20, `docs/decision-log.md` (D-250 to D-252).

## Depends on

- `dependency-security-bump` — the first deployed build must come from a commit whose `pnpm build` passes on the first invocation.
- `e2e-happy-path` — the path is the smoke test a deployment is verified against.
- `accessibility-evidence` and `thread-read-state-ui` — last functional changes before a pilot build; deploying between them would deploy twice for no reason.
- `docs-truth-gate-doc-and-debt-targets` — it leaves the gate document with an honest "unmet:" list this change then ticks.

## Out of scope

- **A separate staging environment.** `docs/production-requirements.md:94` says staging means the local stack until a host is chosen; this change deploys one environment and leaves the gate-document question about staging (§13.1 vs §5) to the owner, as change 3's Open Question records.
- **Infrastructure as code** (Terraform, Pulumi, Ansible). The provider is chosen by a one-day test and may change; a script for an unknown target is untested code.
- **Autoscaling, a CDN, multi-region, read replicas, a Kubernetes cluster.** Sized for 1 institution, 30 mentors and 100 students.
- **A scheduled restore drill.** The launch criterion is one performed restore with a record; the quarterly repeat is a calendar item, not code.
- **A paid error-tracking tier, a paid uptime tier, or a paid log platform.** Free tiers only, and a documented fallback if a free tier disappears.
- **Any change to the retention dry-run default**, to the evidence bucket's policy, or to the worker's queue set.
- **Secrets management beyond the host's own environment store.** No Vault (that is a `secrets-vault-manager` decision for a later scale).
- **A staging→production promotion pipeline.** One environment, deployed from `main` on green, as `SEC-INF-6` requires.

## Risks and rollback

| Risk | Mitigation |
|---|---|
| A migration runs against a database with real users and fails halfway | Every migration in the repo is forward-only and reviewed; the drill runs the migrate step against a scratch database first, and the deploy order stops the API from starting if the migrate step fails |
| The first retention sweep deletes files irreversibly | `EVIDENCE_RETENTION_DRY_RUN` stays `true` until a dry-run line reports `eligible > 0`, and the flip is one service restart, recorded in §4 of the runbook |
| Error tracking captures personal data | `beforeSend` drops the headers, the bodies and the evidence content; a test asserts the scrub list, and the deployed project's first day is read by hand |
| The free tier of the uptime checker or Sentry lapses | Each has a documented fallback: a second free checker, and logs-only with a log-based alert |
| The host cannot run the worker as a second process | The worker is the same image with a different command (`docs/production-requirements.md` §4.1); a host that cannot run two processes from one image is disqualified in the one-day test rather than worked around |
| The restore "works" but the data is wrong | The drill compares row counts for three tables and one checksum against the source, then reads one row through the API; a count-only check is not a restore |
| The bootstrap `INSERT` is mistyped | §6's record table names the operator, the instant and the `SELECT` that proves the row plus its `role_assignments` entry, and the second factor is enrolled before the account is used |

**Rollback**: roll back the image to the previous tag (no migration in this change), and disable error tracking by removing the DSN. The host itself is a one-day decision that can be reversed by repeating the same test elsewhere; nothing in the repository depends on which provider it is.

**Traces to** `SEC-INF-1` to `SEC-INF-8`, `SEC-INF-7` (restore), `FR-PRIV-03`, `DEBT-11`, `DEBT-46`, `DEBT-67`, `D-48`, `D-226`, `D-227`, `D-250`, `D-251`, `D-252`.
