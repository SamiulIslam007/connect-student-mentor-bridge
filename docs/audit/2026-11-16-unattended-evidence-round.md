# Unattended round, 2026-11-16 — evidence upload and retention

Two changes, both merged and archived: `evidence-upload-and-scan` (change 4) and
`evidence-retention-sweeper` (change 5). The final code and archive commit is `5f1cf78`; this
report is the commit after it, landed through PR #94. Nothing is left open, unmerged or
stopped.

## Per change

| | `evidence-upload-and-scan` | `evidence-retention-sweeper` |
|---|---|---|
| Status | merged and archived | merged and archived |
| Feature PR | #90, merge `4198a89` | #92, merge `59f09ac` |
| Archive PR | #91, merge `13a2a96` | #93, merge `5f1cf78` |
| Migration | `0022` (`evidence_scan_status`, `outcome_evidence`, grants, tables 32 → 33) | none |
| Tests before → after | 740 → 759 | 759 → 772 |
| Decisions | D-192 to D-203 | D-204 to D-210 |
| New debt | DEBT-63 (no browser path), DEBT-64 (consent-withdrawal early deletion), DEBT-65 (no link evidence) | DEBT-66 (`REVERSED`/`WITHDRAWN` keep their file) |
| Closed debt | DEBT-22 | DEBT-32 |

Each change was one branch off fresh `main`, merged with a merge commit (`--merge
--delete-branch`), never squashed or rebased, and its archive landed through its own
`chore/archive-…` PR because the ruleset refuses a direct push to `main`.

## Task 0 proofs (change 4), run before any feature code

**0.2 versitygw v1.10.0, the real dev container** — a throwaway script using
`@aws-sdk/client-s3` 3.1161.0 against `http://localhost:7070`:

```
HeadBucket: missing -> CreateBucket: ok
PutObject: ok ETag="1bbc324fd49ac1b6e692f4520dcc42d7"
GetObject: bytes=69 sha256Match=true
Presigned GET: http://localhost:7070/connect-local/probe/evidence-proof.pdf?X-Amz-Algorithm=AWS4-HMAC-SHA256&…&X-Amz-Expires=300&X-Amz-SignedHeaders=host
Presigned fetch: status=200 bytes=69 sha256Match=true
DeleteObject: ok
```

The bucket did not exist; `CreateBucket` was needed and that is now stated in
`docs/local-setup.md`. All three capabilities the design depends on work, so the
streaming fallback was not used.

**0.3 clamd, the real container, `zINSTREAM` from inside the API container:**

```
benign: {"reply":"stream: OK\u0000"}
eicar:  {"reply":"stream: Eicar-Test-Signature FOUND\u0000"}
```

**0.4 versions pinned:** `@aws-sdk/client-s3@3.1161.0` and
`@aws-sdk/s3-request-presigner@3.1161.0`, both published 2026-10-30 (17 days old at the
time, past the two-week rule) and the same minor line. `pnpm-lock.yaml` committed.

**0.5 the 413 shape:** `ProblemDetailsFilter` already maps a body-parser `413` and
`entity.too.large` to `413 PAYLOAD_TOO_LARGE`, so the raw parser needed no new mapping; a
test asserts it on both a binary route and a JSON route.

## Gates at the final commit

- `pnpm lint` exit 0, `pnpm typecheck` exit 0, `pnpm build` exit 0.
- `CI=true pnpm test`, per package: domain 148, web 245, contracts 23, api 356 — **772
  tests, 0 failed, 0 skipped**. Read from each package's own `ℹ pass`/`ℹ fail` lines.
- `openspec validate --all --strict`: 44 items, 0 failed.
- `pnpm audit --audit-level high`: exit 0. Two moderate advisories remain, both
  pre-existing tooling (`esbuild` dev-server request forwarding, `minimatch` globpart DoS);
  neither comes from the two new packages.
- A build trap worth recording: if the shell has `NODE_ENV=development` exported (for
  example after sourcing `.env` to run a probe), `next build` fails with
  `Cannot read properties of null (reading 'useState')`. It is an environment artefact, not
  a code fault; run the gate with `NODE_ENV` unset.

## Register recount

Command basis: `grep '^| FR-' docs/functional-requirements.md | grep '| Must |'`, then one
`grep -c` per status. Result: **64 Must rows, 53 `DONE`, 11 `PARTIAL`, 0 `NOT STARTED`.**

- Register basis **58.5 / 64 = 91.4%**.
- Code-only basis **56.5 / 64 = 88.3%** — the two rows still Done by amendment
  (`FR-ADM-05`, `FR-ADM-06`) are scored 0.0 there.
- `evidence-upload-and-scan` moved no Must row: **`FR-OUT-02` is a `Should` row in the
  register, not a Must, although the brief called it a Must.** It was recorded `PARTIAL`
  for its missing browser path and link evidence.
- `FR-OUT-07` left the amendment-exclusion list: tier 1 is now written by code, so the
  code-only figure rose by one point while the register total held (D-202).
- `evidence-retention-sweeper` closed the last `NOT STARTED` Must, `FR-PRIV-03` (+1.0).
  The register total is honest only with one caveat stated in the row itself: the job
  **ships in dry run**, so the retention promise is code that is switched off until the
  owner flips `EVIDENCE_RETENTION_DRY_RUN`.

## Decisions I made alone

All recorded in `docs/decision-log.md`; the ones worth the owner's eye:

- **D-192/D-193:** a third route (`GET …/evidence/{id}`) mints the link, and the bytes
  travel through the API rather than a presigned PUT.
- **D-195:** quarantine is a status on one object, and a declared type/size/digest that
  disagrees with the bytes is `REJECTED` by the completion route itself, before storage.
- **D-196:** the scan runs on its own two-minute pass over quarantined rows rather than a
  per-upload job — the API holds no pg-boss handle, and one query also serves retries. Cost:
  up to two minutes of latency before a file is readable.
- **D-198:** the "or a link" half of `FR-OUT-02` is not built (DEBT-65).
- **D-199:** no storage configuration is a `503` on the three routes, never a failed boot.
- **D-203:** an upload is accepted whatever the outcome's state (the spec fixes no state
  gate), and the test stack now mirrors `main.ts`'s raw parser.
- **D-205:** `REVERSED` and `WITHDRAWN` outcomes keep their evidence forever (DEBT-66).
- **D-206:** the scan status does not gate retention; an infected file goes on the same
  clock.
- **D-208:** dry run is the default and only the exact string `false` enables deletion
  (the comparison deliberately does not trim, per the review).

## Reviews

Two independent fresh-context reviews of the branch diffs (Codex, read-only) produced ten
findings.

- `evidence-upload-and-scan`: three fixed — a late detection could reverse a committed
  clean result, the tier raise was not in the outcome ledger (now a `TIER_CHANGED` event),
  and an object could outlive a failed commit (now deleted on failure) — plus
  `breakGlass` on the admin audit row. Three accepted with reasons in its `design.md`: an
  admin read is not routed through a case-linked break-glass decision (the owner fixed the
  reader set and the audit action), the 5 MiB parser is content-type scoped rather than
  path scoped, and the audit row is written before the link by design.
- `evidence-retention-sweeper`: four fixed — a clawback could lose its evidence (each row
  is now swept inside a locked transaction that re-reads the outcome), an intent with no
  bytes could be swept (both guards require `uploaded_at`), overlapping runs could delete
  the same object twice (the same lock), and `" false "` enabled deletion.

## Stopped, failed, unmerged

Nothing. Change 4 did not hit its stop conditions, so change 5 ran as planned.

## What the owner must do by hand

1. **Flip `EVIDENCE_RETENTION_DRY_RUN`** to `false` on a deployment only after reading one
   `evidence.retention_swept` log line there. Until then no file is deleted and the job is
   a rehearsal. This is the one operational switch this round leaves off by design.
2. **Run `pnpm --filter api db:migrate`** on every non-dev database: migration `0022`
   creates `outcome_evidence` and its grants. Dev and `connect_test` are already migrated.
3. **Create the bucket** on a non-dev object store. The dev stack does not create
   `connect-local`; the Task 0 probe created it here, and `docs/local-setup.md` now says so.
4. **Rebuild the API and worker images** (`docker compose up -d --build api worker`) before
   a live check — the running containers predate this round.

Dev-database writes this round caused: the `connect-local` bucket and one deleted probe
object (Task 0.2); one planted `outcome_evidence` row plus object and a temporary
`COUNTED` stamp for the retention dry-run proof, all removed and verified back to zero rows.
The integration suite writes only to `connect_test`.

## Not verified

- **No `curl` end-to-end pass against the live stack.** The store and the scanner were
  proven directly against the running containers, and the routes are covered by
  `evidence.integration.test.ts` against a fake store; a live create → complete → scan →
  link → fetch pass on a rebuilt stack was not run.
- **The real deletion path ran against a fake store only.** `DeleteObject` against
  versitygw was proven in Task 0.2, and the sweep's real path is exercised by tests with an
  in-memory store; the composed delete against the real bucket was not run, because that
  would destroy a real object for a test.
- **No browser verification.** Nothing in this round touched `apps/web`.

## Contradictions found and how they were treated

- `design.md` snapshots said base `c3996dd` / migration `0019`; the tree was at `22d5ee6`
  with `0021` as the latest migration. Code wins: `0022` was used, and the change notes
  record the real base.
- The brief called `FR-OUT-02` a Must and said only two Must rows remained: the register
  has it as `Should`, and `FR-OUT-07` was already Done. Recorded here rather than
  reconciled silently.
- `docs/data-model.md` listed the planned table as `evidence_items`; the built table is
  `outcome_evidence`, and the inventory now says so.
