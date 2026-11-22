---
title: Runbook
status: Draft
owner: Owner / CTO
date: 2026-11-20
sources: [docs/local-setup.md, docs/production-requirements.md, docs/data-privacy-and-retention.md, docs/known-debt.md, docs/security-requirements.md]
---

# Runbook

What an operator does on a fresh deployment, and what to do when it misbehaves.
Every command below carries the output it produced when this file was written
(2026-11-20, on the local stack) or is marked **UNVERIFIED** with the reason.

This file deliberately **does not decide**: the host, the region, TLS, the
object-store product, or the database provider. Those are placeholders
(`<deployment values>`) until an owner decision names them. Nothing here is a
secret: variable *names* appear, never values.

Sections: 1 bring-up · 2 migrate · 3 object store · 4 the retention switch ·
5 incident and support · 6 the first `PLATFORM_ADMIN` · 7 backup and restore
drill · 8 what this file does not decide.

## 1. Bring-up

```bash
docker compose up -d
docker compose ps --format '{{.Service}}\t{{.Status}}'
```

Verified on the local stack:

```
api        Up About an hour (healthy)
clamav     Up 6 hours (healthy)
mailpit    Up 6 hours (healthy)
objectstore Up 6 hours (healthy)
postgres   Up 6 hours (healthy)
web        Up About an hour (healthy)
worker     Up About an hour (healthy)
```

Every service must read `(healthy)`. `unhealthy` on `api` or `web` is a boot
failure, not a slow start — read that container's log before retrying.

The two API probes, with their expected bodies:

```bash
curl -s http://localhost:3001/healthz   # {"status":"ok","service":"api"}
curl -s http://localhost:3001/readyz    # {"status":"ok","checks":{"database":"ok"}}
curl -s http://localhost:3000/healthz   # {"status":"ok","service":"web"}
```

`/healthz` says the process is up. `/readyz` says the **database** answers: a red
`readyz` with a green `healthz` is a database or credential problem.

The line that shows the API finished booting:

```bash
docker compose logs api | grep 'api.started'
# {"event":"api.started","port":3001}
```

In production the same containers run with `<deployment values>` in place of the
compose defaults; the probes and the log line are identical.

## 2. Migrate

Migrations run **before** the new images take traffic — a new container on an
old schema is a 500 on the first write.

```bash
pnpm --filter api db:migrate
```

Verified on the local stack:

```
Reading config file 'services/api/drizzle.config.ts'
Using 'pg' driver for database querying
[✓] migrations applied successfully!
```

Read back what applied. The ledger is `drizzle.__drizzle_migrations`; the newest
row is the last migration that ran:

```bash
docker compose exec -T postgres psql -U connect -d connect \
  -tAc "select hash, created_at from drizzle.__drizzle_migrations order by created_at desc limit 3;"
```

For the round that added the idempotency table, the named check is one query —
`t` means the table exists:

```bash
docker compose exec -T postgres psql -U connect -d connect \
  -tAc "select to_regclass('public.idempotency_keys') is not null;"
# t
```

The newest migration file in `services/api/drizzle/` is the one to expect. At
2026-11-20 that is `0023_aberrant_drax.sql` (the idempotency table); the next
round adds `0024` and this file names it then.

Migrations are applied by the owner/script only, never through the read-only
`postgresql` MCP, and **never** against a non-deployment database by accident:
read the generated SQL before running it.

## 3. Object store

Evidence uploads need a bucket. The dev stack does not create one.

Variables (names only): `S3_ENDPOINT` (the container's address,
`http://objectstore:7070` locally), `S3_PUBLIC_ENDPOINT` (the address a browser
can reach; presigned links are signed against it), `S3_BUCKET`, `S3_REGION`,
`S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`. A missing bucket or credential makes
the three evidence routes answer `503 EVIDENCE_UNAVAILABLE`; the API still boots.

Create it once. With any S3 client against `S3_ENDPOINT`:

```bash
aws --endpoint-url "$S3_ENDPOINT" s3api create-bucket --bucket "$S3_BUCKET"
```

**UNVERIFIED**: `aws` and `mc` are not installed on the machine this file was
written on. The equivalent was proven with the SDK the API itself uses, inside
the API container — head, put, get:

```bash
docker compose exec -T api node -e "const {S3Client,HeadBucketCommand,PutObjectCommand,GetObjectCommand}=require('@aws-sdk/client-s3');const c=new S3Client({endpoint:process.env.S3_ENDPOINT,region:process.env.S3_REGION,forcePathStyle:true,credentials:{accessKeyId:process.env.S3_ACCESS_KEY_ID,secretAccessKey:process.env.S3_SECRET_ACCESS_KEY}});(async()=>{try{await c.send(new HeadBucketCommand({Bucket:process.env.S3_BUCKET}));console.log('HEAD ok')}catch(e){console.log('HEAD missing:',e.name)}await c.send(new PutObjectCommand({Bucket:process.env.S3_BUCKET,Key:'runbook-check.txt',Body:'ok',ContentType:'text/plain'}));const g=await c.send(new GetObjectCommand({Bucket:process.env.S3_BUCKET,Key:'runbook-check.txt'}));console.log('GET',await g.Body.transformToString())})();"
# HEAD ok
# GET ok
```

A `HEAD missing: NotFound` means the bucket does not exist; create it and run the
same line again.

## 4. The retention switch

Evidence files are deleted by an hourly job, `evidence-retention`. It **ships in
dry run**: it reports what it would delete and deletes nothing.

- Dry run is the default. Only the exact value `false` in
  `EVIDENCE_RETENTION_DRY_RUN` enables deletion; unset, empty, `FALSE` and `0`
  all stay dry.
- The job logs one line per pass:

  ```bash
  docker compose logs worker | grep 'evidence.retention_swept'
  # {"event":"evidence.retention_swept","examined":0,"eligible":0,"deleted":0,"failed":0,"dryRun":true}
  ```

  `examined` counts settled outcomes past their own clock, `eligible` the ones
  the pass would delete, `deleted` what it did.

- Read **one** line with `"eligible"` above zero before flipping it. A real
  deletion is final: the row keeps its hash and metadata, the object does not
  come back.
- Flip it by setting `EVIDENCE_RETENTION_DRY_RUN=false` on the **worker** and
  restarting that one service (`docker compose up -d worker`). Flip it back the
  same way: delete the variable or set it to anything other than `false`.
- What deletion is based on: `COUNTED` from `counted_at`, `REJECTED` from
  `rejected_at`, `REVERSED` from `reversed_at`, `WITHDRAWN` from `withdrawn_at`,
  90 days each, and sooner if the reporting student withdrew institution data
  sharing earlier (`data-privacy-and-retention.md`).

## 5. Incident and support

**Who is paged**: the owner, in the pilot. One person, one phone, no rota.

**Two triage questions**, in this order:

1. Is `readyz` green? (`curl -s <api>/readyz`) — if not, the database is unreachable
   or the credentials changed; nothing else is worth checking first.
2. Is the worker consuming? `docker compose logs worker | tail -30` — the outbox
   relay logs every delivered event; a silent worker with rows in
   `outbox_events` means mail and the hourly jobs have stopped.

**Where the logs are**: `docker compose logs <service>` per container. The API
logs one JSON object per line. A 500 line names the method, the route (never the
query string), the request id and the error class only — never the exception
message, which is where a driver puts its SQL and params
(`failureLog` in `services/api/src/http/problem-details.filter.ts`). The web BFF
logs `web.api_unreachable` with the route and the error class, never the query
string or the upstream detail (`apps/web/lib/api.ts`). Error reports are scrubbed
before they leave the process (`packages/domain/src/observability-scrub.ts`:
headers, cookies, request data, query string, exception values, stack-frame
variables, contexts, tags and the username). The 500 response body is a fixed
problem document.

**Rolling back a bad deploy**: bring up the previous image tag for the affected
service only, after confirming the schema is compatible — a migration is not
rolled back. Binding the tag is a `<deployment value>`:
`docker compose up -d --no-deps api` after pinning the tag.

### 5.1 Breach and containment

1. **Contain in the first hour.** Rotate `BETTER_AUTH_SECRET` and `BFF_TRUST_SECRET` on the host, redeploy the API and web images, and revoke every admin session (`DELETE FROM sessions WHERE user_id IN (SELECT user_id FROM role_assignments WHERE role IN ('PLATFORM_ADMIN','INSTITUTION_ADMIN'))`). A rotated `BETTER_AUTH_SECRET` invalidates every existing session and every verification link, which is the point.
2. **Scope from the audit log.** `GET /v1/admin/audit` filtered by action and time; `ACCOUNT_DELETED`, `PERMISSION_DENIED`, `EVIDENCE_VIEWED` and `THREAD_BREAK_GLASS_READ` are the four rows that answer "who reached what".
3. **Notify.** The pilot has no legal entity yet (settled decision); the owner records the affected accounts, the data classes and the containment time, and takes legal advice before any external notice.
4. **Fix and record.** The fix lands through the normal PR path; the incident's facts go in `docs/audit/` with the date, the detection point, the containment commands and what the audit log showed. Never rewrite the audit log.

### 5.2 Key rotation

- `BETTER_AUTH_SECRET`: rotate on a suspected compromise, or yearly. Rotation signs everyone out and invalidates outstanding verification and reset links; schedule it outside a pilot cohort's active window.
- `BFF_TRUST_SECRET`: rotate with the API and web deployed together. A mismatch makes every BFF write fail the client-key check with a refusal, not a silent downgrade; deploy both images in one `docker compose up -d`.
- `S3_*` credentials: rotate the key pair on the object store, then restart the API and worker. Evidence links are minted per request, so nothing cached outlives the rotation.
- SMTP credentials: rotate with the provider, restart the worker. Queued mail retries; a failed send is visible in the worker's outbox log.
- `SENTRY_DSN`: rotate by replacing the value; the old DSN only receives events until the next restart.
- Never write a value into a file, an issue, a PR or a chat. The only accepted form is the host's environment store, and `pnpm build` must keep passing with `grep -c '\\*\\*\\*' .env.example` at 0.

### 5.3 Break-glass review

1. Every admin thread read writes one `THREAD_BREAK_GLASS_READ` row with the stated reason **before** the content is returned; every admin evidence read needs an open review case and a `x-access-reason` header, else `403 EVIDENCE_ACCESS_DENIED` (`services/api/src/evidence/drizzle-evidence.service.ts`).
2. Weekly, in the pilot: `GET /v1/admin/audit?action=THREAD_BREAK_GLASS_READ` and `?action=EVIDENCE_VIEWED`. For each row, check that a matching open case exists and that the reason describes it. A read with no case, or a reason that does not match, is an incident under 5.1.
3. Record the review date and the row count in the operator log. A week with zero rows is a valid result and worth recording.

### 5.4 Audit review

1. Monthly: read `GET /v1/admin/audit` for `ROLE_GRANTED`, `ACCOUNT_SUSPENDED`, `REPORT_RESOLVED` and every `PERMISSION_DENIED`. A `ROLE_GRANTED` with `actor_role = USER` for an institution scope is a defect; the grant route records the real acting role (D-255).
2. Confirm the retention sweep's `EVIDENCE_RETENTION_DELETED` rows match the operator's recorded dry run (`pnpm --filter api privacy:sweep` prints the candidate count; a real run needs `--confirm-backup=YYYY-MM-DD`).
3. Any gap between what the audit log shows and what the operator expected is an incident under 5.1, not a documentation note.


### 5.5 Error tracking, uptime and the one alert

| Piece | What is in the repository | What is not |
|---|---|---|
| Error tracking | `services/api/src/platform/observability.ts` and `apps/web/instrumentation.ts` initialise Sentry only when `SENTRY_DSN` is set, with one shared scrub list in `packages/domain/src/observability-scrub.ts`; `services/api/test/observability.test.ts` proves a token, a cookie, a query string, a message body and an email address are dropped | **OWNER ACTION:** create the Sentry project, copy its DSN into the host's environment store, throw one deliberate error per process and read the three reports |
| Uptime check | the two URLs and the interval are fixed here: `/healthz` and the sign-in page, every five minutes, alert to the owner's address | **OWNER ACTION:** create the monitor (free tier), confirm the alert address, and record the first alert email's arrival time |
| The alert on a provider outage | the API logs `{"event":"password.breach_check_unavailable","reason":...}` | **OWNER ACTION:** add an alert on that line once the log platform is chosen |
| Recovery | a failed check is fail-open by design (D-249), so nothing has to be done to keep sign-up working; the alert exists so a sustained outage is visible | - |

`SENTRY_DSN`, `SENTRY_ENVIRONMENT` and `SENTRY_TRACES_SAMPLE_RATE` are the only names; no value is committed
(`grep -c 'SENTRY_' .env.example` prints `3`).

### 5.2 The deployed release

`infra/deploy/deploy.sh` is the migrate-first sequence: `pnpm --filter api db:migrate` runs as its own step and a failure
stops the release before any new image takes traffic. Verified locally against a deliberately wrong `DATABASE_URL`:

```
{"event":"deploy.migrate.failed","action":"release stopped, previous version keeps serving"}
EXIT=1
```

**OWNER ACTION:** run it once on the chosen host and quote the four lines (`deploy.migrate.start`,
`deploy.migrate.done`, `deploy.restart`, `deploy.ready_to_verify`) plus the `/healthz`, `/readyz` and sign-in answers.

## 6. The first production `PLATFORM_ADMIN`

No route and no script grants this role (`AGENTS.md` rule 12). One hand-run
statement, one verification, one note.

1. Run the sanctioned statement from `local-setup.md` (the same one, not a new
   variant):

   ```sql
   INSERT INTO role_assignments (user_id, role)
   SELECT id, 'PLATFORM_ADMIN' FROM users WHERE email = '<owner email>'
   ON CONFLICT DO NOTHING;
   ```

2. Verify the row and the role in one query — two lines, one per table:

   ```bash
   docker compose exec -T postgres psql -U connect -d connect -tAc \
     "select u.email, ra.role from users u join role_assignments ra on ra.user_id = u.id where u.email = '<owner email>';"
   ```

3. Sign in, then enrol a second factor at `/account/security`. The review and
   attestation routes answer `403 MFA_REQUIRED` without one.

4. Write one row in the bootstrap record below.

This step is **outside the audit log** — a hand-run `INSERT` writes no
`audit_logs` row. The record table is the compensation, and it is why the step is
written down at all (`DEBT-46`, closed by this procedure rather than by code).

### Bootstrap record

| Date | Operator | Environment | Reason | Note |
|---|---|---|---|---|
| 2026-11-20 | Owner | local stack | the first `PLATFORM_ADMIN` for the pilot | mirrors the statement in `local-setup.md`; no `audit_logs` row, recorded here instead |
| **not performed** | - | deployed environment | the first `PLATFORM_ADMIN` of the pilot | **OWNER ACTION:** run the `INSERT` below on the deployed database, enrol the second factor at `/account/security`, then run the proving `SELECT` and fill this row |

## 7. Backup and restore drill

Run once before the pilot, then on a schedule the owner sets.

1. **Back up**: `pg_dump` the deployment database to a file outside the volume.
   Provider-specific command: `<deployment value>`.
2. **Restore into a scratch database**, never over the live one:
   `createdb connect_restore && psql connect_restore < dump.sql`.
3. **Verify** — the ledger tables carry the same counts, and one known row
   replays:

   ```bash
   docker compose exec -T postgres psql -U connect -d connect_restore -tAc \
     "select (select count(*) from users), (select count(*) from outcomes), (select count(*) from audit_logs);"
   ```

   Compare against the live database. A count that differs by more than the
   backup window is a failed restore, not a rounding difference.
4. **Drop the scratch database**: `dropdb connect_restore`.
5. Write one row below.

### Restore record

| Date | Environment | Duration | Result | Operator |
|---|---|---|---|---|
| **not performed** | deployed environment | - | **OWNER ACTION:** `pg_dump`, `pg_restore` into a scratch database, the three counts for `users`, `outcomes` and `audit_logs`, and one authenticated read against the restored data; then fill this row | - |

The drill is a table filled by hand because the provider is undecided: a script
for an unknown target is untested code (design R3). The restore has **not** been
performed: no host exists yet, so the row above is an owner action, not a result.

## 8. What this file does not decide

- Host, region, TLS, provider, and the backup tool's flags — `<deployment value>`
  until an owner decision names them.
- An on-call rota, an SLA or an escalation tree: the pilot has one operator.
- Anything about money, certificates or AI models: out of MVP scope.
