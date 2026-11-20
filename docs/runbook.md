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
logs one JSON object per line; errors carry `event` fields and never tokens,
message bodies or evidence content.

**Rolling back a bad deploy**: bring up the previous image tag for the affected
service only, after confirming the schema is compatible — a migration is not
rolled back. Binding the tag is a `<deployment value>`:
`docker compose up -d --no-deps api` after pinning the tag.

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
| _not yet performed_ | | | | |

The drill is a table filled by hand because the provider is undecided: a script
for an unknown target is untested code (design R3).

## 8. What this file does not decide

- Host, region, TLS, provider, and the backup tool's flags — `<deployment value>`
  until an owner decision names them.
- An on-call rota, an SLA or an escalation tree: the pilot has one operator.
- Anything about money, certificates or AI models: out of MVP scope.
