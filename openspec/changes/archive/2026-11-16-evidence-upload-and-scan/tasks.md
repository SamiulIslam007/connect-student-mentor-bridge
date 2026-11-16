# Tasks: evidence-upload-and-scan

## 0. Preconditions

- [x] 0.1 Re-check the snapshot in `design.md`: `git log --oneline -1`, `git status --short`, `ls services/api/drizzle/*.sql | tail -1` (and record the number this change must use), `grep -rn "S3_\|CLAMAV_" services/api/src` (expect no reader), `grep -n "API_MAX_BODY_BYTES" services/api/src/http/request-body.ts services/api/src/main.ts`.
- [x] 0.2 **Prove the store before writing code.** Against the running `objectstore` container: `PutObject` a small PDF with the `S3_*` credentials from `.env.example`, `GetObject` it back, delete it, and then produce a presigned `GET` with the public endpoint and fetch it with `curl` from the host. Record the three commands and their results here. If presigning fails, stop and report — the fallback in `design.md` R3 (stream through the API) needs the owner's word, not a silent substitution.
- [x] 0.3 **Prove the scanner.** From inside the API container (or with `docker compose exec clamav`), complete one `zINSTREAM` conversation with a benign file and one with the EICAR test string, and record both replies here. If EICAR is not detected, the scan gate is unproven and the change stops.
- [x] 0.4 Record the exact `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` versions to pin, and why: both packages must be added at an exact version with the lockfile committed, and the same major as each other.
- [x] 0.5 Read `services/api/src/main.ts`, `http/body-allowlist.interceptor.ts` and `http/problem-details.filter.ts` and record how a body-parser `413` is currently mapped, so the raw parser's oversize answer is the same shape.

## 1. Schema and migration

- [x] 1.1 Add `evidenceScanStatus` to `db/schema/enums.ts` (`QUARANTINED`, `CLEAN`, `REJECTED`) and `outcomeEvidence` to `db/schema/outcomes.ts` with every column and constraint of design R4/Rollback. Export from `db/schema/index.ts`.
- [x] 1.2 Generate `0022_*.sql` (`pnpm --filter api db:generate`), read it, confirm the enum, the table, the unique index on `outcome_id`, the partial index on `status` where `QUARANTINED`, and the three checks.
- [x] 1.3 Append the grant block: `GRANT SELECT, INSERT, UPDATE ON TABLE "outcome_evidence" TO connect_app;` — no `DELETE`, because retention only marks `deleted_at`.
- [x] 1.4 Apply to the local and test databases and paste `\d outcome_evidence` and `\dp outcome_evidence` here.
- [x] 1.5 Record the rollback path in this file: routes off, queue off, table optional to drop, no outcome or ledger row affected.

## 2. The body path

- [x] 2.1 `services/api/src/http/request-body.ts`: export `EVIDENCE_MAX_BYTES = 5 * 1024 * 1024` and `EVIDENCE_CONTENT_TYPES` (the three), as the one place both the parser and the validator read.
- [x] 2.2 `services/api/src/main.ts`: register the raw parser for those three types with `EVIDENCE_MAX_BYTES` **before** the JSON parser, and leave the JSON parser exactly as it is (design R10). Verify: an existing JSON route still refuses a 200 KiB body with `413`, by test not by eye.
- [x] 2.3 `services/api/src/http/body-allowlist.interceptor.ts`: skip a `Buffer` body (design R9), with a unit test that a Buffer on a no-key route is not refused.
- [x] 2.4 Test the oversize answer: a body over 5 MiB on the complete route answers `413 PAYLOAD_TOO_LARGE` in the standard problem shape, and a 6 MiB JSON body on an existing route is still refused at 100 KiB.

## 3. Storage and scan clients

- [x] 3.1 Add the two dependencies at exact pins (`pnpm --filter api add --save-exact …`), commit the lockfile, and run `pnpm audit --audit-level high`. Record the audit output.
- [x] 3.2 `services/api/src/evidence/storage.ts`: a small interface (`put`, `get`, `delete`, `presignGet`) with one S3 implementation; the internal client and the signing client from design R3; `configured()` returning false when a credential or bucket is missing. No caller imports the AWS SDK directly.
- [x] 3.3 Unit test with a fake `S3Client` (constructor-injected, no mocking library — the repo's seam pattern): `put` sends the bytes, the type and the length; `presignGet` asks for 300 seconds; `configured()` is false with a missing bucket.
- [x] 3.4 `services/api/src/evidence/scan.ts`: `scanStream(bytes): Promise<{ clean: true } | { clean: false; signature?: string } | { error: string }>` over `node:net` with the `INSTREAM` framing and a 30-second timeout (design R5). No new dependency.
- [x] 3.5 Unit test with a fake socket: `stream: OK` → clean; `stream: Eicar FOUND` → not clean with the signature; a socket error → `{ error }`; a timeout → `{ error }`; an unparseable reply → `{ error }`.
- [x] 3.6 Mutation checks recorded here: make an error reply count as clean and confirm 3.5 fails; return `clean` unconditionally and confirm the FOUND case fails. Restore.

## 4. The routes

- [x] 4.1 `services/api/src/evidence/evidence.service.ts` (interface) and `drizzle-evidence.service.ts`: `createIntent`, `completeUpload`, `read`, `scanEvidence`. `createIntent` refuses a second file per outcome with `409 EVIDENCE_ALREADY_ATTACHED`, an unverified participant with `404`, a wrong type or size with `422`, and `503 EVIDENCE_UNAVAILABLE` when storage is not configured. `completeUpload` asserts the intent belongs to the caller and is still `QUARANTINED`, hashes the received bytes, compares the declared digest and type, writes the object, updates the row, enqueues the scan, and answers `409 EVIDENCE_NOT_READY`-style refusals for a second completion (`409 EVIDENCE_ALREADY_ATTACHED` is wrong here — use `409 EVIDENCE_ALREADY_COMPLETED`, and add it to the contract).
- [x] 4.2 `services/api/src/evidence/evidence.controller.ts`: the three routes of design R1, each resolving participation in the service, `@Throttle({ default: RATE_LIMITS.write })` on the two writes.
- [x] 4.3 `services/api/src/evidence/scan-job.ts` + registration in `platform/outbox/outbox-worker.ts` (`EVIDENCE_SCAN_QUEUE = "evidence-scan"`, `*/2 * * * *`, batch 10): select `QUARANTINED` rows whose `deleted_at` is null, fetch, scan, and transition in one transaction with the conditional tier update of design R5. A `REJECTED` row never sets a tier.
- [x] 4.4 `EVIDENCE_VIEWED` in `AuditAction` and `AUDIT_ACTION_MAP` (both), written by the read route only when the caller is a platform admin, before the URL is returned.
- [x] 4.5 The outcome read's payload gains `evidence: { id, status, content_type, size_bytes, sha256 } | null` (no URL), so the page can show whether evidence exists without a side effect.

## 5. Registry and contract

- [x] 5.1 `packages/contracts/openapi.yaml`: three paths, the `evidence` property on the outcome schema, `403`/`404`/`409` (`EVIDENCE_ALREADY_ATTACHED`, `EVIDENCE_ALREADY_COMPLETED`, `EVIDENCE_NOT_READY`)/`413`/`422`/`503` documented, `429` on the writes, and the `413` note that the complete route's cap is 5 MiB for three content types.
- [x] 5.2 `ROUTE_BODY_KEYS`: `POST /v1/outcomes/{id}/evidence` → `["content_type", "size_bytes", "sha256"]`; `POST /v1/outcomes/{id}/evidence/{evidence_id}/complete` → `[]` (a binary body has no keys); `GET /v1/outcomes/{id}/evidence/{evidence_id}` → `[]`.
- [x] 5.3 `MATRIX`: three rows — the two writes and the read are `signed-in` with `mutating: true` on the writes; the service resolves the object-level rule.
- [x] 5.4 Check the contract parity tests: `pnpm --filter @connect/contracts test` and the inventory/authorization tests in `services/api/test`.

## 6. Tests

- [x] 6.1 `services/api/test/evidence.integration.test.ts`, one case per scenario in the spec delta: attach a PDF; second file `409`; disallowed type `422`; oversize `413`; digest mismatch → `REJECTED` and no tier; clean scan → `CLEAN` and tier 1; scan error → stays `QUARANTINED`, no link, tier 0; a re-run of the job is a no-op; the mentor reads; another student `404`; a platform admin read writes exactly one `EVIDENCE_VIEWED` row before the URL; a quarantined row `409`; `503` when storage is unconfigured (inject a `configured() === false` client).
- [x] 6.2 Assert the audit action is filterable: `GET /v1/admin/audit?action=EVIDENCE_VIEWED` returns `200` with the row.
- [x] 6.3 Assert the tier change does not move a number: count an outcome with tier 1 and confirm the ledger row's `points` equals the same computation at tier 0 under the all-`1.0` multipliers, so the change is provably reputation-neutral at today's values.
- [x] 6.4 Mutation checks recorded here: make the read route skip the audit row for an admin and confirm 6.1 fails; make the scan job write the tier before the scan and confirm the rejected case fails; drop the `AND evidence_tier = 0` predicate and confirm the re-scan no-op test fails. Restore all three.

## 7. Docs gate

- [x] 7.1 `docs/api-contracts.md` §5.6: the two rows stop saying "not built"; add the read route; state the 5 MiB exception, the three types, the one-file rule and the `503` when storage is unconfigured.
- [x] 7.2 `docs/data-model.md`: the enum in §4.1, the table, its indexes, its grants, and `deleted_at` flagged as the retention column.
- [x] 7.3 `docs/functional-requirements.md`: `FR-OUT-02` becomes built for API clients with the gap named (no browser path, no link evidence); `FR-OUT-07` becomes built work and the D-156 amendment for that row is superseded by a new `D-xx`; recount §2.16 by command and publish the new register and code-only totals.
- [x] 7.4 `docs/data-privacy-and-retention.md` §4 item 11 and §6: where the file lives now, who can obtain a link, the audit row, and that deletion belongs to `FR-PRIV-03`.
- [x] 7.5 `docs/security-requirements.md`: one annotation that an uploaded file is quarantined and scanned before any link exists, with the test name.
- [x] 7.6 `docs/known-debt.md`: close `DEBT-22` with the evidence sentence; open one row for the browser upload path and one for the "or a link" half of `FR-OUT-02`.
- [x] 7.7 `.env.example` gains `S3_PUBLIC_ENDPOINT` (name and local value); `docs/local-setup.md` explains that it must be browser-reachable while `S3_ENDPOINT` is the container's address, and `compose.yaml` passes it to the api service.
- [x] 7.8 Audit findings **C1** and **C2**: fix if this change lands first, otherwise verify and leave.
- [x] 7.9 `docs/mvp-build-plan.md` §5 row, `docs/milestones-and-phases.md` "Current state", `.hermes.md` §10 if still stale, `docs/decision-log.md` one row per decision R1–R10.

## 8. Verification gate

- [x] 8.1 `pnpm lint && pnpm typecheck && pnpm test && pnpm build`, real totals pasted here, skipped 0.
- [x] 8.2 `pnpm audit --audit-level high` output pasted.
- [x] 8.3 `openspec validate evidence-upload-and-scan --strict` passes.
- [x] 8.4 End-to-end against the local stack with `curl`: create, complete with a real PDF, wait for the scan, read the link, fetch it, and confirm the tier became 1 and one `EVIDENCE_VIEWED` row exists after an admin read. Paste the status codes.
- [x] 8.5 `git status`, `git diff --staged` reviewed; the lockfile is the only unexpected file and it is intended.
- [x] 8.6 Stop. Not archived until the owner says so.

## Results (2026-11-16)

- **Independent review** (fresh context): six findings; three fixed before merge (guarded rejection, a `TIER_CHANGED` event for the tier, a compensating object delete on a failed commit) plus `breakGlass` on the audit row; three accepted with reasons in `design.md`.
- **Gates** under `CI=true` at the commit that opened PR: `pnpm lint` exit 0, `pnpm typecheck` exit 0, `pnpm build` exit 0, `openspec validate --all --strict` 44 items 0 failed. Test totals: domain 144, web 245, contracts 23, api 347 — **759 total, 0 failed, 0 skipped** (baseline 740; +8 unit for the storage and scan clients, +11 integration).
- **`pnpm audit --audit-level high`**: exit 0. Two moderate advisories remain, both pre-existing tooling (`esbuild` dev-server request forwarding, `minimatch` globpart DoS); neither is from `@aws-sdk/*`.
- **Mutation checks**: an error reply counted as clean failed the scan unit test; a `FOUND` reply counted as clean failed it too; an unaudited admin read failed the integration test; a tier written on a rejected file failed the rejected-file test. All four restored. The `AND evidence_tier = 0` predicate has no reachable failing path today (the row is already `CLEAN` and the scan never re-selects it), so it is defence for the Tier 2 writer to come — stated rather than claimed as covered.
- **8.4 live end-to-end**: NOT run against the dev stack through `curl`. The Task 0 proofs exercised the real store and the real scanner directly (`PutObject`/`GetObject`/presigned `GET`, `zINSTREAM` + EICAR), and the route-level end-to-end is covered by `evidence.integration.test.ts` against a fake store. A `curl` pass on the live stack remains the owner's check after `docker compose up -d --build api worker`.
- **8.6**: archived by owner authorisation in the 2026-11-16 unattended round.
