# Tasks

## 0. Propose-time document conformance (committed before apply)

- [x] 0.1 Add the 4a/4b/6a plan rows, the Sprint 1 partial notes, the Sprint 0/2/3 and checkpoint updates, the doc-drift fixes, D-40 to D-44, `docs/known-debt.md`, the clean-checkout secret step, the app-role note, and the `.env`/README targets; commit as `20ef00d`. Verify: `git show --stat 20ef00d` lists the expected files and `openspec validate --all --strict` passes.

## 1. CI and database first

- [x] 1.1 Add `services/api/drizzle/0003_grant_profile_tables.sql` granting exactly `SELECT, INSERT, UPDATE, DELETE` on `fields`, `student_profiles`, `student_field_interests`, `mentor_profiles`, and `mentor_fields` to `connect_app`. Verify: `pnpm --filter api db:migrate` applies it twice with the second run a no-op, and `drizzle-kit check` passes.
- [x] 1.2 Add a `SET ROLE connect_app` integration test that seeds a user and a field as the owner, then performs SELECT/INSERT/UPDATE/DELETE on each of the five tables and rolls back. Verify: the test passes with `pnpm --filter api test`, and a table outside the grant set is refused.
- [x] 1.3 Change `audit_logs.actor_user_id` to `onDelete: "restrict"` in `services/api/src/db/schema/trust.ts`, generate `0004_audit_fk_restrict.sql`, review the SQL, and commit the snapshot. Verify: the migration applies twice (second no-op), `drizzle-kit check` passes, and a delete of a user referenced by an audit or consent row fails with `23503`.
- [x] 1.4 Add the `postgres:16-alpine` service, a `connect_test` creation step, and `DATABASE_URL` to the `checks` job in `.github/workflows/ci.yml`; change `services/api/test/support/database.ts` so `openTestDatabase` throws when `CI` is truthy and the database is missing or unreachable, while keeping the loud skip outside CI. Verify: `CI=true` plus the real test DB passes with 0 skipped; `CI=true` plus an unreachable `TEST_DATABASE_URL` fails; the CI log shows 0 skipped; the job names stay `checks`, `images`, `security`.
- [x] 1.5 Verify the propose-time `connect_app` login-role/membership and clean-checkout secret steps in `docs/local-setup.md` against the actual migration and boot behaviour; fix any drift. Verify: the documented `CREATE ROLE`/`GRANT` step works against the local Compose Postgres, and a clean `.env.example` copy plus `docker compose up` fails with the documented message.

## 2. Security and correctness fixes

- [x] 2.1 Add the shared email-shape validator and map better-auth client errors to `IdentityError("VALIDATION_ERROR", ...)` in register, forgot-password, and sign-in. Verify: `a@b..c` returns `422 VALIDATION_FAILED` on all three endpoints, no 500 is logged, and a real 5xx still maps to 500.
- [ ] 2.2 On the existing-email registration path, call `hashPassword` from `better-auth/crypto` and discard the result; do not await SMTP on the fresh path. Verify: 20 samples per path through the BFF, median ratio below 1.5×, recorded in the handoff; the duplicate path still writes no second account, consent, or audit row.
- [x] 2.3 Wrap `signInEmail` in `runWithRequestId`, re-read the account after every successful call, and on a failed `SIGN_IN_SUCCEEDED` audit revoke the new session before returning the 500. Add the optional `auditWriter` seam. Verify: reactivation and verified-PENDING repair report `active`; the `ACCOUNT_ACTIVATED` row carries the response request id; a fault-injected audit failure leaves zero sessions and a 500.
- [x] 2.4 Add the server-only `appOrigin()` from `BETTER_AUTH_URL`, expose `BETTER_AUTH_URL` to the web service in `compose.yaml`, and build the verify redirect only from that origin with an `http`/`https` allowlist. Verify: spoofed `Host: evil.example` and `x-forwarded-proto: javascript` never change the `Location`; the normal verification flow still redirects to `/verify?status=verified`.
- [x] 2.5 Add the BFF body cap (`128 KiB`, Content-Length check plus a chunked byte counter), the `decodeURIComponent` catch in `readSessionCookie`, and the non-JSON upstream `502` mapping. Verify: a 200 KiB body returns `413`; a chunked 200 KiB body returns `413`; `Cookie: connect_session=%` returns `401`; an upstream `500 text/html` becomes a `502` problem body.
- [x] 2.6 Change `defaultProbe` to resolve the database URL through `resolveDatabaseUrl()` (catching a missing config and reporting `unavailable`). Verify: a host-style API with only the repository `.env` reports `/readyz` `200`; a missing URL reports `503` without leaking the connection string.

## 3. Taxonomy bounds and pagination

- [ ] 3.1 In `packages/domain/src/fields.ts`, strip `/[\p{Cf}]/gu` after NFKC and require `/\p{L}|\p{N}/u` after normalization; add unit tests for zero-width-only, NFKC plus format characters, symbol-only, and `C++`. Verify: `pnpm --filter @connect/domain test` passes and a zero-width-only name is refused.
- [ ] 3.2 Add `MENTOR_FIELD_TOTAL_MAX = 5` and `PROFILE_LANGUAGE_MAX = 5`; enforce them after de-duplication in the student and mentor validators; add unit and API integration tests for 5-accepted and 6-refused. Verify: the tests pass and a refused save writes nothing.
- [ ] 3.3 Add `/v1/fields` `limit` (default 100, max 200) and `cursor` (last slug), order by `normalized_slug`, return `{ fields, next_cursor }`, and forward the query params through the BFF. Update `packages/contracts/openapi.yaml` and `docs/api-contracts.md` in the same task. Verify: the contract tests pass, the cursor returns the next page without duplicates, `limit=201` returns `422`, and the UI still loads the first page.

## 4. UI completeness (Stitch reference)

- [ ] 4.1 Add `apps/web/app/forgot-password/page.tsx`, a sign-in link, the BFF-facing form, and the string-catalog entries, using the Stitch screen `projects/7444600524954243355/screens/4d4ed8f5e03a47fdbb27e2d1b7f4f8bf` and the "Civic Trust" design system. Verify: `pnpm --filter web build` passes, the page renders the default/loading/success/invalid/network states, and the success copy does not reveal whether an account exists.
- [ ] 4.2 Map `UNDER_MINIMUM_AGE` and `VALIDATION_FAILED` to distinct sign-up messages with catalog strings; extract the mapping into a pure helper and test it. Verify: the helper test covers under-18, validation, and network/unknown cases; the sign-up page keeps non-password values and shows the under-18 message.
- [ ] 4.3 Make the `BETTER_AUTH_SECRET` boot error name the variable and the generation command; confirm the propose-time `local-setup.md` step matches. Verify: starting the API with an empty secret fails with the documented message, and the documented setup command produces a working stack.

## 5. Test quality and edge cases

- [ ] 5.1 Add the missing registration test with extra keys (`account_status`, `email_verified`, `status`, camelCase variants) and assert the DB stays `PENDING`/unverified with no role change. Verify: the test passes and no account-level value is applied.
- [ ] 5.2 Add session-expiry and reset-token-expiry tests using DB rows with past `expires_at` (or an injected clock where the seam allows). Verify: an expired session returns `401`; an expired reset token returns `400 INVALID_RESET_TOKEN`; an unexpired token still works.
- [ ] 5.3 Remove the tautological `packages/config/test/constants.test.ts` and its now-empty test script; strengthen `services/api/test/workspace-packages.test.ts` into a resolution/export smoke test. Verify: `pnpm test` passes with the updated package count, and the workspace packages still resolve.
- [ ] 5.4 Add the remaining security tests: malformed cookie, spoofed Host/XFP, BFF body cap (both headers), `connect_app` positive grants, zero-width/NFKC field names, and the audit-failure fail-closed path. Verify: each test fails on the old behaviour and passes on the new one.

## 6. Documentation and hygiene

- [ ] 6.1 Re-read the propose-time docs against the implemented code (`README.md`, `mvp-build-plan.md`, `milestones-and-phases.md`, `decision-log.md`, `data-model.md`, `api-contracts.md`, `security-requirements.md`, `non-functional-requirements.md`, `auth-and-access-control.md`, `production-requirements.md`, `system-architecture.md`, `known-debt.md`) and fix any statement that is now wrong. Verify: `openspec validate --all --strict` passes and no live document calls a deferred item current.
- [ ] 6.2 Add `opencode.json`, `AGENTS.local.md`, `dbhub.toml`, and `.mcp-memory.jsonl` to `.dockerignore`. Verify: `docker compose build` still succeeds and the four paths are excluded from the build context.
- [ ] 6.3 Record the apply evidence in the change handoff: test counts, the timing medians, the CI log with 0 skipped, the clean-volume migration pair, and any UNVERIFIED item that remains. Verify: every claim cites a command run in the session.

## 7. Integration, review, and handoff

- [ ] 7.1 On a clean volume, run `docker compose down -v`, `up -d --build`, `db:migrate` twice, `db:seed` twice, then `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and the Sprint 1 demo end to end. Verify: all gates exit 0, the second migrate is a no-op, the second seed inserts nothing, and the demo passes.
- [ ] 7.2 Run the review gate on the diff: `/ponytail-review`, `/ce-code-review`, `silent-failure-hunter`, the trust-rule check, `/ponytail-debt`, and a diff-scope check. Verify: every finding is fixed in scope or reported with a reason; the debt is recorded in `docs/known-debt.md`.
- [ ] 7.3 Write the handoff: what changed, docs updated, stale docs found, the real gate output, the branch commit list, and the still-UNVERIFIED list from design.md. Verify: every claim traces to a command or file.

## Workflow follow-up

- Archive only when the owner asks: run docs-sync, `/ce-compound`, the memory update, `openspec archive`, and `openspec validate --archived --strict` with this change's own entry showing `"valid": true` and `"issues": []`.
- Run the git lifecycle from `AGENTS.local.md` section 6: push the branch, open the PR, wait for green `checks`/`images`/`security`, then merge with `gh pr merge <n> --merge --delete-branch` (the repo has squash and rebase disabled; do not use them), and paste the raw `git log --oneline -3` from `main`.
- After archive, update the change status and the README/current-state block with the PR number and date.
