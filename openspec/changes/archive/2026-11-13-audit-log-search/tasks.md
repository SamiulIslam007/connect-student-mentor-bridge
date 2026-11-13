# Tasks: audit-log-search

## 0. Preconditions

- [x] 0.1 Re-check the snapshot in `design.md`: `git log --oneline -1` (expect `3c8c571`), `git status`, `sed -n '75,100p' services/api/src/db/schema/trust.ts`, `grep -n "GRANT SELECT, INSERT ON TABLE" services/api/drizzle/0000_baseline.sql`, `grep -rn "audit" services/api/src --include=*.controller.ts`. Verify: every line confirmed or listed as a mismatch.
- [x] 0.2 Derive the two allowlists the filters need: `grep -o 'AUDIT_[A-Z_]*\|[A-Z][A-Z_]*' services/api/src/identity/audit-log.ts | sort -u` for actions, and `grep -rhn "objectType:" services/api/src --include=*.ts | sort -u` for object types. Record both lists in this file before writing the validator.

## 1. The API read

- [x] 1.1 Add `services/api/src/audit/` with `audit.controller.ts`, `audit.service.ts`, `drizzle-audit.service.ts`, `audit.tokens.ts` and `audit.module.ts`, registered in `app.module.ts`; one route `GET /v1/admin/audit` behind `requireRole(..., "PLATFORM_ADMIN", { requiresMfa: true })` with the read throttle. Verify: `pnpm --filter api typecheck` passes and the module resolves in the integration stack.
- [x] 1.2 Implement the query: five AND-combined filters, order by `occurred_at` desc then `id` desc, limit default 50 and maximum 100, keyset cursor on the last `(occurred_at, id)` pair. Verify: an integration test seeds entries across two actors, two actions and two object types and asserts each filter alone and two together.
- [x] 1.3 Implement the projection exactly as `design.md` R2 lists it, with no `metadata`, `prev_hash` or `hash` in the select at all (not merely out of the payload). Verify: the test freezes the key set and greps nothing.
- [x] 1.4 Measure the action filter: `EXPLAIN (ANALYZE, BUFFERS)` on a seeded table of about 5,000 rows, and record the timing in this file. Verify: the plan is a scan and the timing is stated; if it exceeds 100 ms, add the index in this change and say so in the handoff instead of opening the debt row.
- [x] 1.5 Add the comment and, if 1.4 shows a scan, the debt row: `shortcut: the action filter is a scan, add an index when audit_logs passes roughly a million rows`. Verify: the debt row text states the bound and the table.

## 2. Contract and registries

- [x] 2.1 Add `GET /v1/admin/audit` to `packages/contracts/openapi.yaml` with its query parameters, its page schema and its `200`/`400`/`401`/`403`/`422` responses. Verify: `pnpm --filter @connect/contracts test` passes.
- [x] 2.2 Add the `MATRIX` row in `services/api/test/authorization-matrix.test.ts` with `access: "PLATFORM_ADMIN"`, `mutating: false`, plus the controller and its provider tokens in that file's lists. Verify: the matrix test passes.
- [x] 2.3 Add the controller and its provider tokens to the controller and provider lists in `services/api/test/request-validation.integration.test.ts`. Verify: no "allowlisted without a route" and no "route without an allowlist". A GET has no body, so no body key is added.

## 3. Tests

- [x] 3.1 Add `services/api/test/audit-read.integration.test.ts`: the four refusals (mentor, institution admin, no second factor, anonymous), the successful page's exact key set, each filter, two filters combined, the date range, the unknown-action `422`, pagination stability across an append, and the unchanged row count after two reads. Verify: every assertion names its case.
- [x] 3.2 Assert no write by the read: snapshot the row count and the newest id before and after, and assert no entry carries a read action. Verify: the assertion fails if 3.4 of the controller is changed to append a row, then revert.

## 4. The admin page

- [x] 4.1 Add the BFF route `apps/web/app/api/admin/audit/route.ts` by copying `apps/web/app/api/admin/reports/route.ts` and forwarding the query string unchanged. Verify: the route test asserts forwarding, the `403` passthrough and the non-JSON `502`.
- [x] 4.2 Add `apps/web/lib/audit.ts`: the row type, the filter-to-query builder, and a pure formatter for the reason and the break-glass marker. Verify: unit tests cover no filters, one filter, and a break-glass row.
- [x] 4.3 Add `apps/web/app/admin/audit/page.tsx` with the filters in the URL, the result table, a loading line, an error line with retry, an empty line, and keyset "load more". Follow the report page's markup; no Stitch. Verify: a page test reads the file and asserts the fetch call, the filter inputs and the three state keys.
- [x] 4.4 Add the strings and one admin navigation link. Verify: `grep -rn "Audit" apps/web/app` finds no literal outside the catalogue and the nav link is gated like its siblings.

## 5. Docs and register

- [x] 5.1 Update `docs/functional-requirements.md` `FR-AUD-01` as complete, naming the read route, its projection and the fact that the read itself is not audited.
- [x] 5.2 Update `docs/api-contracts.md` (the route, the filters, the projection), `docs/auth-and-access-control.md` (who may read the log) and `docs/security-requirements.md` (`SEC-AC-4`'s review path names the page).
- [x] 5.3 Add the decision rows to `docs/decision-log.md` (full text at the end of this file), and update `docs/mvp-build-plan.md` section 5 and `docs/milestones-and-phases.md`.

## 6. Gates, review and handoff

- [x] 6.1 Run from the repo root: `pnpm lint`, `pnpm typecheck`, `CI=true pnpm test`, `pnpm build`, each with its exit code echoed, in one background job writing to a log file. Record per-package totals.
- [x] 6.2 Review gate per `AGENTS.local.md` section 2: verify-before-done, `/ponytail-review`, the silent-failure hunt (a filter silently ignored is the specific risk), the trust-rule check and an independent second review of the projection against the "no free text" rule.
- [x] 6.3 Handoff: the route, the projection, the four refusals, the timing from 1.4, the four gate totals, the register row flipped and the debt row if one was opened.

## Decision rows to add at apply

**D rows (numbers assigned at apply, next free block in `docs/decision-log.md`)**

- Decision: The audit read is `GET /v1/admin/audit`, `PLATFORM_ADMIN` with an enrolled second factor, keyset-paginated, with optional actor, action, object type, object id and date range filters.
- Decision: The projection is the row minus `metadata`, `prev_hash` and `hash`; a reason is returned because the audit row states it, and no request body is ever returned.
- Decision: Reading the log writes no audit row; the reading is not itself on the record.
- Decision: No new index for the action filter; a debt row records the scan and the bound at which an index is added.
- Affects: `trust/audit-log-inspection`, `docs/api-contracts.md`, `docs/auth-and-access-control.md`, `docs/known-debt.md`
