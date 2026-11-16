# Proposal: evidence-upload-and-scan

## Why

`FR-OUT-02` is the oldest deferred capability in the project: `docs/api-contracts.md` §5.6 documents two evidence routes and adds, in the row itself, "**Documented but not built** (evidence change, DEBT-22). The contract omits it so it never advertises a `404`". Every pilot outcome is therefore Tier 0 by amendment (D-156), `FR-OUT-07` is scored `DONE` for a scope it cannot reach, and `FR-PRIV-03` — the retention sweeper — has nothing to sweep. The stack already has everything needed and uses none of it: `compose.yaml` gives the API `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_FORCE_PATH_STYLE`, `CLAMAV_HOST` and `CLAMAV_PORT`, and `grep -rn "S3\|presign\|clam" services/api/src` finds **no reader** of any of them. This change makes those two documented routes real: a private file, hashed, quarantined, scanned, and served only when the scan is clean.

## What Changes

- Two routes, exactly the pair §5.6 already names: `POST /v1/outcomes/{id}/evidence` (create the intent) and `POST /v1/outcomes/{id}/evidence/{evidence_id}/complete` (complete it with the bytes).
- One new table `outcome_evidence`: the object key, the SHA-256, the size, the declared content type, the scan status, the timestamps, and a `deleted_at` column the retention change will use.
- Private object storage through `@aws-sdk/client-s3` at pinned versions, against the existing `versitygw`; a short-lived presigned `GET` is the only way a file leaves the store, and only for a clean file.
- A malware scan in a worker job against the existing `clamav` container, quarantine-first and fail closed: a file that is not clean, or whose scan could not run, is never served and never raises the tier.
- `evidence_tier` becomes `1` on a clean scan of the first file, which is the first time any code writes a tier other than `0`. Every reputation multiplier stays `1.0`, so no reputation is re-priced.
- One audit action, `EVIDENCE_VIEWED`, added to the writer union **and** the reader map, written when a platform admin obtains a download link. This is the event `docs/auth-and-access-control.md` §12 already lists as "documented, no code path".
- The 100 KiB JSON body cap stays for every JSON body. The complete route accepts a binary body under three content types with a 5 MiB cap, which is the documented exception `DEBT-01` anticipated; `API_MAX_BODY_BYTES` is unchanged.

## Capabilities

### New Capabilities

- `mentorship/outcome-evidence`: the evidence record, the two routes, the scan gate, the tier it raises, and who may obtain a download link.

### Modified Capabilities

None. No existing requirement changes: `FR-OUT-07`'s register row becomes built work through documentation, not through a spec delta, and the audit-log parity requirement in `trust/consent-and-audit-records` already demands that a new action be filterable.

## Impact

- **Code**: new `services/api/src/evidence/` (controller, service, tokens, module, storage client, scan client, scan job), `services/api/src/db/schema/outcomes.ts` (one table), `services/api/src/main.ts` (one route-scoped raw body parser), `services/api/src/http/body-allowlist.interceptor.ts` (skip a `Buffer` body), `services/api/src/outcomes/outcome.service.ts` and `drizzle-outcome.service.ts` (the outcome read carries its evidence), `services/api/src/platform/outbox/outbox-worker.ts` (one queue), `services/api/src/identity/audit-log.ts` + `services/api/src/audit/audit.service.ts` (`EVIDENCE_VIEWED`).
- **Dependencies (new, pinned, owner-approved in the brief)**: `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner`, exact versions, `pnpm-lock.yaml` committed, `pnpm audit --audit-level high` re-run.
- **Contract**: `packages/contracts/openapi.yaml` gains two paths and the evidence schema; `ROUTE_BODY_KEYS` gains both routes (the create route's JSON keys, the complete route's empty list); `MATRIX` gains two student-only rows.
- **Data**: migration `0022` — `CREATE TABLE outcome_evidence` with its grant block and two indexes; no change to `outcomes` itself (`evidence_tier` already exists with its 0..2 check).
- **Tests**: `services/api/test/evidence.integration.test.ts` (both routes, the cap, the scan gate, the tier, the readers, the audit row), a storage-client unit test with a fake client, and a scan-client unit test with a fake socket.
- **Docs**: `docs/api-contracts.md` §5.6 stops saying "not built", `docs/data-model.md` (the table and the grant), `docs/functional-requirements.md` (`FR-OUT-02` built for API clients, `FR-OUT-07` built rather than amended), `docs/data-privacy-and-retention.md` (the file's storage, access and deletion), `docs/security-requirements.md` (a note that files are scanned before they are served), `docs/known-debt.md` (close `DEBT-22`, narrow `DEBT-39`'s sibling), `docs/local-setup.md` and `.env.example` (the one new variable name), `docs/mvp-build-plan.md` §5, `docs/milestones-and-phases.md`, `README.md` status line, `docs/decision-log.md`.

## Depends on

- `outcomes-and-verification` (archived 2026-11-08): the outcome, its student-only report route and `evidence_tier`.
- `outbox-and-job-runner` (archived 2026-11-08): the worker, the queue pattern and the retry semantics the scan job rides.
- `security-headers-csp-cors` (archived 2026-11-13): the body-parser ordering in `main.ts`, which this change must not disturb.

## Out of scope

- The web app: no BFF route, no upload control. A browser cannot upload until a later frontend change, and `FR-OUT-02` is therefore recorded as built for API clients, not end to end. This is the backend-first boundary, stated rather than implied.
- Tier 2 and third-party confirmation (`FR-OUT-08`, a Could for 1b).
- Evidence on a request, a profile, or anything other than an outcome.
- Multiple files per outcome, image thumbnails, PDF text extraction, virus-signature management, or a scanning SLA.
- Deleting a file on replacement or on consent withdrawal — `evidence-retention-sweeper` owns deletion, and this change only adds the `deleted_at` column it will use.
- Any change to the reputation multipliers.
- A presigned `PUT`: the bytes go through the API (see `design.md` R2).

## Risks and rollback

| Risk | Mitigation |
|---|---|
| A malicious file reaches a reviewer or the mentor | Quarantine-first and fail closed: `status` starts `QUARANTINED`, a `GET` link is produced only for `CLEAN`, and a scan that errors or times out leaves the row quarantined forever rather than guessing |
| A presigned `GET` leaks a private document | Five-minute expiry, the key is unguessable, the route that mints it is participant-or-admin only, and an admin's mint writes `EVIDENCE_VIEWED` before returning the URL |
| A 5 MiB binary body bypasses the body rules or the allowlist | The binary parser is content-type-scoped to three types with its own 5 MiB cap, the JSON cap stays 100 KiB for every JSON body, and the allowlist interceptor is taught to skip a `Buffer` rather than silently refusing every upload |
| `versitygw` does not support the presigned `GET` the contract promises | Only the download path presigns; the precondition task proves it against the running container before any code is written, and the fallback (stream the object through the API with `no-store`) is stated in `design.md` R3 |
| A new dependency with an unknown vulnerability | Two packages, exact pins, lockfile committed, `pnpm audit --audit-level high` re-run and recorded; `@aws-sdk/*` is the documented client for the store already in the stack |
| A clean scan raises a tier and thereby changes reputation | `REPUTATION_TIER_MULTIPLIERS` stay `1.0`, so tier 1 multiplies by 1; the calibration is D-67's decision, not this change's |

Rollback: remove the two route registrations and stop the scan queue; the file bytes stay in the bucket and the table keeps its rows, so a later change can serve or delete them. Reverting the migration drops a table nothing else references. No outcome, ledger or reputation row is touched by either direction.

## Decisions taken here

Four things the brief did not fix, each decided and recorded in `design.md`: **(1)** the bytes travel through the API on the documented `complete` route rather than through a presigned `PUT`, because a presigned upload would need the object store reachable by the browser and CORS-correct on a store whose presign support is unverified; **(2)** quarantine is a database status on one object, not a second object, because a server-side copy is another unverified store capability; **(3)** `EVIDENCE_VIEWED` is the only new audit action — an upload is recorded by the evidence row itself and §12 documents no "uploaded" event, so adding one would be a second row for one fact; **(4)** the size cap is 5 MiB and one file per outcome, which the brief left at "max 5 MiB" and "one file per outcome" — those are used exactly as given, and the allowed types are PDF, PNG and JPEG as given.
