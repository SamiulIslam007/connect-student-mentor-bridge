# Design: evidence-upload-and-scan

## Context

**Repository snapshot (verified 2026-11-15 at propose; re-check at apply).**

- Base: `main` at `c3996dd`, zero active changes before this round.
- `docs/api-contracts.md:403-404` names the two routes and marks both "Documented but not built (DEBT-22)". The sentence in the same cell — "The contract omits it so it never advertises a `404`" — is why `openapi.yaml` has no evidence path today.
- `compose.yaml:10-22` already gives the API `S3_ENDPOINT=http://objectstore:7070`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_FORCE_PATH_STYLE`, `CLAMAV_HOST=clamav`, `CLAMAV_PORT=3310`. `grep -rn "S3\|presign\|bucket\|clam" services/api/src` returns no reader: the variables are declared and unused.
- `.env.example` carries the same names with local values, and `S3_PORT=7070`; `versitygw` publishes `7070` on the host (`compose.yaml:47-56`, `command: ["posix", "/data"]`).
- `services/api/src/main.ts` creates the app with `bodyParser: false`, then `app.use(apiSecurityHeaders)` and `app.useBodyParser("json", { limit: API_MAX_BODY_BYTES, strict: false })`. `API_MAX_BODY_BYTES = 100 * 1024` (`http/request-body.ts:8`). Nest 12 with `@nestjs/platform-express`, so `useBodyParser("raw", …)` is available.
- `BodyAllowlistInterceptor` calls `bodyKeys(request.body, allowed)`, and `bodyKeys` refuses any non-array object whose keys are undocumented — a `Buffer` is `typeof "object"`, so its byte indices would be refused as "unknown property: 0". Every non-GET route passes through this interceptor.
- `outcomes.evidence_tier` is `smallint` default `0` with `check 0..2` (`db/schema/outcomes.ts:60-61,81`); nothing writes 1 or 2. `tierFor()` in `counting-job.ts` maps the tier through `REPUTATION_TIER_MULTIPLIERS`, which are all `1.0`.
- `REPUTATION_TIER_MULTIPLIERS` is all `1.0` (D-67), so raising a tier changes no number.
- `docs/auth-and-access-control.md` §12 lists "evidence file viewed (`DEBT-22`)" among the documented events with no code path, and `AUDIT_ACTION_MAP` is a `Record<AuditAction, true>` so a union member without a map entry fails the build.
- The outcome read is `GET /v1/outcomes/{id}` and its payload is built by `outcomePayload` in `outcomes/outcome.service.ts:143`, which already exposes `evidence_tier`.
- Migration `0019` is the latest; grants are hand-written (`0006_grant_two_factor_table.sql`), role `connect_app`.

## Goals / Non-Goals

**Goals**

- The two documented routes exist and behave as §5.6 describes, with the tier raised only by a clean scan.
- The failure modes are the safe ones: no scan, no service; no clean result, no tier.
- One new dependency pair, pinned, and no new service in the stack.

**Non-Goals**

- No browser upload; no BFF route; no UI control. `FR-OUT-02` is recorded as built for API clients.
- No Tier 2, no third-party confirmation, no multiple files, no link evidence (`FR-OUT-02`'s "or a link" is not built here — see R7).
- No deletion path; `evidence-retention-sweeper` owns `deleted_at`.
- No change to any reputation value.

## Decisions

The owner fixed: the dependency pair, the two documented routes, the 5 MiB JSON-cap exception when the body is not JSON, quarantine-first and fail closed, tier 1 on clean with multipliers at 1.0, three content types, 5 MiB, one file, the three readers, and `EVIDENCE_VIEWED` in both audit unions. The decisions below are the ones left open.

### R1. Three routes: the two documented uploads, plus one read that mints the link

`POST /v1/outcomes/{id}/evidence` (JSON: `content_type`, `size_bytes`, `sha256`) creates the intent and returns the `evidence_id`; `POST /v1/outcomes/{id}/evidence/{evidence_id}/complete` carries the bytes as a raw body and enqueues the scan; `GET /v1/outcomes/{id}/evidence/{evidence_id}` returns the metadata and, when the row is `CLEAN`, a short-lived URL.

The third route is the one deviation from "the two routes already named", and it is deliberate: minting a link inside `GET /v1/outcomes/{id}` would either write an `EVIDENCE_VIEWED` audit row on every outcome read (turning a read into a filtered-noise generator) or never write one (breaking the admin-audit mandate). A separate read route is the only shape where an admin's link is audited and a student's is not. §5.6 gains the row; `ROUTE_BODY_KEYS` gains it with an empty list (a `GET`, registered for the parity test that walks every route).

### R2. The bytes go through the API, not through a presigned `PUT`

`complete` accepts `application/pdf`, `image/png` or `image/jpeg` as a raw body up to 5 MiB and writes them with `PutObject`. Alternative rejected: a presigned `PUT`, which needs the object store reachable from the browser, a CORS policy on `versitygw`, and a public endpoint baked into a signature — three unverified capabilities and a second trust boundary for the sake of bytes that are 5 MiB at most. Downloads *do* presign (R3), because the contract promises short-lived URLs and a download has no quarantine step left.

### R3. Downloads are presigned, with a second client configured for the public host

`getSignedUrl` signs the host header, so a URL signed against `objectstore:7070` is unusable from a browser. The service therefore builds two clients from the same credentials: the internal one (`S3_ENDPOINT`) for `put`/`get`/`delete`, and a signing-only one (`S3_PUBLIC_ENDPOINT`, defaulting to `S3_ENDPOINT`) with `forcePathStyle: true` for `getSignedUrl`. `S3_PUBLIC_ENDPOINT` is the only new variable; `.env.example` gets the name and a local value, and `compose.yaml` passes it through.

Expiry is 300 seconds. Fallback if `versitygw` turns out not to presign: the read route streams the object with `Cache-Control: no-store` and the same audit row — stated here so the precondition task has a defined next step instead of a blocked change.

### R4. Quarantine is a status on one object, not a second object

Uploads land at `outcome-evidence/{outcomeId}/{evidenceId}` with `status = 'QUARANTINED'`. A clean scan sets `CLEAN`; a detection sets `REJECTED`; an error leaves it `QUARANTINED` and the job retries. Only `CLEAN` can be signed. Alternative rejected: a `quarantine/` prefix plus a server-side `CopyObject` on success, which needs a store capability nobody has verified and doubles the bytes written for no security gain — the status is what the read path consults.

### R5. The scan is an `INSTREAM` conversation over `node:net`, in a worker job

`clamd` protocol: `zINSTREAM\0`, then each chunk as a 4-byte big-endian length followed by the bytes, then a 4-byte zero terminator; the reply is `stream: OK`, `stream: <Signature> FOUND`, or an error line. The object is fetched (`GetObject`) into memory — bounded at 5 MiB — fed to the socket with a 30-second timeout, and the reply parsed. No new dependency: `node:net` is enough, and `clamav` is already a container the compose stack health-checks.

Status transitions happen in one transaction with the tier update: `UPDATE outcome_evidence SET status = 'CLEAN', scanned_at = now() WHERE id = $1 AND status = 'QUARANTINED' RETURNING …`, then `UPDATE outcomes SET evidence_tier = 1 WHERE id = $2 AND evidence_tier = 0` — the second predicate is what makes a second scan a no-op rather than an overwrite.

Fail-closed rules, all of them tested: a socket error, a timeout, an unparseable reply, or a `FOUND` line leaves the row not-`CLEAN` and the tier at `0`; a missing `CLAMAV_HOST` makes the job log and retry rather than skip.

### R6. The two audit unions, and only one new action

`EVIDENCE_VIEWED` joins `AuditAction` and `AUDIT_ACTION_MAP`. No `EVIDENCE_UPLOADED` / `EVIDENCE_SCAN_FAILED` action is added: the evidence row itself records the upload, §12 documents no such event, and one fact must not produce two audit rows (the rule D-168 set). The scan outcome is visible in the row's `status`, `scanned_at` and `scan_detail`.

The admin read writes its audit row **before** the link is produced, in the same request, in the pattern the break-glass read established (D-120).

### R7. The "or a link" half of `FR-OUT-02` is not built

`FR-OUT-02`'s Then mentions "a file (PDF, PNG, or JPEG within the size limit) **or a link**". This change builds the file half. A link is an untrusted URL that would be displayed and clicked, which needs its own decisions (host allowlist, `rel`/`target` handling, disclosure that it opens outside connect — the same treatment `mentorship_sessions.meeting_url` got). Recording it as debt with the reason is honest; inventing a link policy in this change is not.

### R8. Missing storage configuration fails closed at the route, not at boot

If any of `S3_BUCKET`/`S3_ACCESS_KEY_ID`/`S3_SECRET_ACCESS_KEY` is absent, the three evidence routes answer `503 EVIDENCE_UNAVAILABLE` with the standard problem shape, and the scan job logs and does nothing. Alternative rejected: failing the API's boot, which would take auth, requests and outcomes down with an optional feature. The API's other paths must keep working on a machine where the object store is not configured.

### R9. The `BodyAllowlistInterceptor` learns to skip a `Buffer`

One line: `if (Buffer.isBuffer(request.body)) return next.handle();` before the `bodyKeys` call, plus a test that a Buffer body on a route with no documented keys is not refused as "unknown property: 0". Alternative rejected: exempting the route by path in the interceptor, which would put a route list in a security control.

### R10. The body parser order

In `main.ts`, after `apiSecurityHeaders` and before the JSON parser:

```ts
app.useBodyParser("raw", {
  type: ["application/pdf", "image/png", "image/jpeg"],
  limit: EVIDENCE_MAX_BYTES,
});
app.useBodyParser("json", { limit: API_MAX_BODY_BYTES, strict: false });
```

`body-parser` selects by `Content-Type`, so a JSON body still gets the 100 KiB cap and a 5 MiB JSON body is still refused; only the three declared types get 5 MiB, and only the complete route accepts them. That is the documented exception: `API_MAX_BODY_BYTES` is unchanged, and `docs/api-contracts.md` states which route and which types are outside it.

## Migration and rollback

- **Migration `0022`**: new enum `evidence_scan_status` (`QUARANTINED`, `CLEAN`, `REJECTED`); `CREATE TABLE outcome_evidence` with `outcome_id` (FK `outcomes`, restrict), `uploaded_by_user_id` (FK `users`, restrict), `object_key` (text, not null, unique), `sha256` (text, not null, check 64 hex), `size_bytes` (integer, not null, check 1..5242880), `content_type` (text, not null, check in the three), `status` (enum, default `QUARANTINED`), `scanned_at`, `scan_detail`, `deleted_at`, timestamps; a unique index on `outcome_id` (one file per outcome); an index on `status` where `QUARANTINED` (the job's scan); the grant block `SELECT, INSERT, UPDATE` for `connect_app` (no `DELETE`: retention marks `deleted_at`).
- **Read the generated SQL before running it.** The enum, the cheap constraints and the two indexes must all be present.
- **Rollback**: remove the three routes and stop the scan queue. Objects stay in the bucket and rows stay in the table; a later change serves or deletes them. A `DROP TABLE` migration is safe once no route reads it. No outcome, ledger or reputation row is touched in either direction.
- **No backfill and no data migration**: `evidence_tier` stays `0` for every existing outcome.

## Risks and what must fail closed

- **Fail closed**: no clean scan → no tier and no link; a scan error → `QUARANTINED`, retried; a missing store configuration → `503`, never a silent success; an admin link → the audit row commits before the URL is returned; a non-participant → `404` with no row and no object.
- **Trust boundary**: the declared content type and the client-supplied SHA-256 are inputs, not facts. The server records the digest of the bytes it actually received and the type it actually saw; a mismatch is a `REJECTED` row, not a warning.
- **The largest risk is the unverified store**: presigned `GET` and `PutObject` against `versitygw` are asserted by the precondition task before any code, and both routes and the job depend on them. If either fails, the change stops and reports rather than inventing a workaround.
- **Scope honesty**: the register will say "built for API clients" for `FR-OUT-02`; the web half is a separate frontend change and `FR-PRIV-03` depends on this one landing first.

## Precondition results (task 0, run 2026-11-16 against the dev stack)

Base `main` at `22d5ee6`; the latest migration was `0021_absent_morbius`, so this change uses `0022`. `grep -rn "S3_\|CLAMAV_" services/api/src` returned no reader, as the snapshot claimed.

**0.2 The store, proven before any feature code.** A throwaway script against `http://localhost:7070` with the `.env.example` credentials, using `@aws-sdk/client-s3` 3.1161.0:

```
HeadBucket: missing -> CreateBucket: ok
PutObject: ok ETag="1bbc324fd49ac1b6e692f4520dcc42d7"
GetObject: bytes=69 sha256Match=true
Presigned GET: http://localhost:7070/connect-local/probe/evidence-proof.pdf?X-Amz-Algorithm=AWS4-HMAC-SHA256&...&X-Amz-Expires=300&X-Amz-SignedHeaders=host
Presigned fetch: status=200 bytes=69 sha256Match=true
DeleteObject: ok
```

The bucket did not exist, so `CreateBucket` ran first: the dev stack does not create `connect-local`, which is now stated in `docs/local-setup.md`. All three capabilities the design depends on work; the R3 streaming fallback was not needed.

**0.3 The scanner, proven with the EICAR test string.** One `zINSTREAM` conversation from inside the API container against `clamav:3310`:

```
benign: {"reply":"stream: OK"}
eicar: {"reply":"stream: Eicar-Test-Signature FOUND"}
```

Detected, so the scan gate is proven.

**0.4 Versions pinned.** `@aws-sdk/client-s3@3.1161.0` and `@aws-sdk/s3-request-presigner@3.1161.0`, both published 2026-10-30 (17 days old at the time of the run, past the two-week rule) and the same minor line as each other. `pnpm-lock.yaml` is committed.

**0.5 The 413 shape.** `ProblemDetailsFilter` already maps `rawStatus === 413` and `entity.too.large` to `413 PAYLOAD_TOO_LARGE` in the standard problem body, so the raw parser's oversize answer needs no new mapping; a test asserts it on both the binary route and a JSON route.

## Independent review, and what it changed (2026-11-16)

A fresh-context review of the branch diff returned six findings. Three were fixed, three are accepted with the reason recorded here.

**Fixed.**

1. A late detection could reverse a committed clean result: the `REJECTED` update was unconditional while the `CLEAN` one was guarded. Both are now conditional on `status = 'QUARANTINED'`, and a rejection only counts when a row comes back. `evidence.integration.test.ts` reproduces the race with a storage client that clears the row while the scan is fetching the bytes.
2. Raising `evidence_tier` was a bare projection update. A tier change is a fact about the outcome and `TIER_CHANGED` already exists in the event enum, so the scan's transaction now appends one `TIER_CHANGED` event (`SYSTEM` actor, the evidence id in its payload) under the outcome row lock the tier update takes.
3. An object written inside the transaction could survive a failed commit, because an object store cannot join a transaction. The completion route now deletes the object it just wrote when the row update or the commit fails, so no unscanned orphan is left with no row naming it.
4. The `EVIDENCE_VIEWED` row now carries `breakGlass: true`: an admin reading a student's private document is a read that widens access, which is what that flag marks (D-124).

**Accepted, with the reason.**

- **A platform admin read is not routed through a case-linked break-glass decision.** The owner fixed the reader set (the student, that mentorship's mentor, a platform admin with an enrolled second factor) and the audit action in the brief, and the spec's scenario states an admin read writes `EVIDENCE_VIEWED`. Requiring a linked case and a reason would be a behaviour the approved spec does not ask for; it is named here so the owner can decide otherwise.
- **The 5 MiB raw parser is content-type scoped, not path scoped.** The brief asks for `API_MAX_BODY_BYTES` to stay 100 KiB and for the exception to be a content-type one; the JSON cap is untouched and a test proves it. A path-scoped mount would need `body-parser` imported directly, which is not a declared dependency. The residual effect is that a PDF, PNG or JPEG body to any route is buffered up to 5 MiB before the route answers; those types are throttled by the default bucket and no route parses them.
- **The audit row is committed before the link is produced.** That is the design's stated order (R6, the D-120 pattern): if signing then fails, the log records an attempted read rather than missing one. An over-audited refusal is the safe direction.
