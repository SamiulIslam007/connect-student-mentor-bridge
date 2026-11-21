# Tasks: first-deployment-restore-drill-and-observability

Decision rows to add at apply (reserved, one contiguous block): **D-250** the host chosen by the documented one-day test with Render first, **D-251** Sentry's free tier with a scrub list and an inert default, **D-252** dump-and-restore first and PITR second.

## 0. Preconditions

- [ ] 0.1 Re-read the snapshot: `git log --oneline -1`, `git status --short`, `grep -n '^## ' docs/runbook.md`, `sed -n '1,30p' infra/docker/Dockerfile.api`, `ls services/api/drizzle/*.sql | tail -1`.
- [ ] 0.2 Confirm nothing is deployed and nothing tracks errors: `docker compose ps --format '{{.Names}}'` (local only), `grep -rni sentry --include=*.ts --include=*.json . | grep -v node_modules` returns nothing.
- [ ] 0.3 Record the release candidate: the commit whose CI run is green, the image digests from the `images` job, and the migration set (`0023` on 2026-11-21). Verify: the commit and the digests are written into this file.

## 1. The host, by test

- [ ] 1.1 Run the §5 one-day test on the first candidate: deploy both images, the worker, managed Postgres and a private bucket; measure response time from a Bangladesh mobile connection; confirm PITR and bucket privacy; record the monthly cost. Verify: the measurements and the cost are in the task file, and the candidate either passes or is disqualified.
- [ ] 1.2 Write the ADR for the host and the region, with the alternatives and their measured numbers. Verify: `docs/architecture-decisions.md` has the new ADR and `README.md` §18 #14 is marked decided with its reference.
- [ ] 1.3 Configure the deployed environment's variables from `.env.example`'s names — including `BETTER_AUTH_URL`, `S3_PUBLIC_ENDPOINT`, `SMTP_*`, `EVIDENCE_RETENTION_DRY_RUN=true` — with no value committed. Verify: `git status --short` shows no `.env`, and the deployed app's `/healthz`, `/readyz` and sign-in page answer `200`.

## 2. Migrate-first deploy

- [ ] 2.1 A deploy script or documented command sequence that runs `pnpm --filter api db:migrate` as its own step and stops on failure. Verify: a deliberately broken migration in a scratch database stops the release and the old API keeps serving.
- [ ] 2.2 Prove the order once by hand: migrate, then API, then worker, then web, each with its health line recorded. Verify: `docs/runbook.md` §2 gains the deployed variant with the four log lines quoted.
- [ ] 2.3 Prove the schema state: `to_regclass('public.idempotency_keys') is not null` on the deployed database returns `t`, and the table count matches the local one (34 on 2026-11-21).

## 3. Error tracking

- [ ] 3.1 `services/api/src/platform/observability.ts`: the `beforeSend` scrub list and an `initObservability({ dsn, environment, release })` that does nothing without a DSN. Verify: 3.4's test exercises the scrub list directly.
- [ ] 3.2 `services/api/src/main.ts` and `services/api/src/worker.ts`: one init call and one unhandled-error hook each. Verify: `grep -c 'initObservability' services/api/src/main.ts services/api/src/worker.ts` counts one per file.
- [ ] 3.3 `apps/web`: the runtime hook (`instrumentation.ts` or the Next-supported equivalent) with the same conditional init, verified against the installed Next version rather than assumed. Verify: `pnpm --filter web build` succeeds with and without a DSN, and the deployed web app reports one deliberate error.
- [ ] 3.4 `services/api/test/observability.test.ts`: a request with `authorization` and `cookie` headers and a body yields a report with neither; a report with no DSN is never sent. Verify: the test fails when one header is removed from the scrub list (mutation, restored).
- [ ] 3.5 Deploy with a DSN set, throw one deliberate error per process, and read all three reports by hand; record what each contains. Verify: no token, no cookie, no message body appears in any of them.
- [ ] 3.6 `.env.example`: `SENTRY_DSN`, `SENTRY_ENVIRONMENT`, `SENTRY_TRACES_SAMPLE_RATE` with names only. Verify: `grep -c 'SENTRY_' .env.example` prints `3` and no value is present.

## 4. Uptime and alerts

- [ ] 4.1 Configure the external check on the deployed `/healthz` and the sign-in page at five minutes, with the alert address set. Verify: the monitor's dashboard shows both URLs green and the alert address confirmed.
- [ ] 4.2 Prove the alert: point one check at a path that answers `500` (or stop the API for two cycles), wait for two failures, and record the email that arrives and the time to arrival. Verify: the email's timestamp is in the handoff.
- [ ] 4.3 `docs/runbook.md` §5: name the monitor, the two URLs, the interval, the alert channel and the recovery behaviour. Verify: the section names all five.

## 5. Backup and restore

- [ ] 5.1 Confirm the managed database's daily backup and PITR window, and the bucket's privacy and versioning state. Verify: both facts are recorded with the screenshot or console path in the handoff.
- [ ] 5.2 Perform the drill per D-252: `pg_dump`, `pg_restore` into a scratch database, row counts for `users`, `outcomes` and `audit_logs`, and one authenticated read through the API against the restored data. Verify: the counts match the source and the read returns the expected row.
- [ ] 5.3 Fill `docs/runbook.md` §7's record table: date, source, target, duration, result, operator, verification. Verify: the table has a filled row and no placeholder remains.
- [ ] 5.4 Once PITR is confirmed, perform the point-in-time variant and record it as a second row. Verify: the row names the target instant and the result.

## 6. The one-time bootstrap and the retention switch

- [ ] 6.1 Create the first `PLATFORM_ADMIN` by the documented `INSERT`, enrol its second factor at `/account/security`, and run the `SELECT` that proves the user plus its `role_assignments` row. Verify: `docs/runbook.md` §6's record table is filled with the operator and the instant.
- [ ] 6.2 Read one `evidence.retention_swept` line with `eligible > 0` while `EVIDENCE_RETENTION_DRY_RUN=true`; then set it to `false` on the worker only and restart that service. Verify: the next run's line reports `dryRun: false` and `deleted` matching `eligible`, and §4 of the runbook records the flip.

## 7. Docs

- [ ] 7.1 `docs/production-requirements.md`: §4.2, §5, §9, §10, §12.1, §13.1 and §13.2 boxes are ticked with citations per the rule from `docs-truth-gate-doc-and-debt-targets` (D-240). Verify: every newly ticked box names a record, a run or a file.
- [ ] 7.2 `docs/known-debt.md`: close `DEBT-11` (the identity library's inline mail now goes through the provider's own retry) if the provider supports it, and close the observability row opened by the docs change. Verify: both rows read `Closed` with struck problem text.
- [ ] 7.3 `README.md` §14 and §20, `docs/milestones-and-phases.md` "Current state", `docs/decision-log.md` (D-250 to D-252). Verify: `grep -c '^### D-25[0-2]'` prints `3`.
- [ ] 7.4 `docs/data-privacy-and-retention.md`: one line naming the error-tracking processor and what it receives. Verify: the line names the processor and the scrub list's exclusions.

## 8. Checks, review, handoff

- [ ] 8.1 `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` (twice) — exit codes recorded, and `pnpm audit --audit-level=high` still exits `0` with the two new dependencies. Verify: the audit output and both severity lines are quoted.
- [ ] 8.2 `openspec validate first-deployment-restore-drill-and-observability --strict` and `openspec validate --all --strict`; quote the totals.
- [ ] 8.3 Review gate per `AGENTS.local.md` §2: the adversarial pass asks what personal data could reach the tracker, and what the restore would look like if the bucket were empty.
- [ ] 8.4 Handoff: the ADR, the three record tables filled, the alert email's timestamp, the restore's counts, the retention flip's before/after lines, and the two Open Questions from the design.
