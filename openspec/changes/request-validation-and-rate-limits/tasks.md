# Tasks: request-validation-and-rate-limits

Two phases that can land separately: **Phase A (groups 1 to 4)** is the body guard, **Phase B (groups 5 to 7)** is throttling. If the day runs out, Phase A is a complete PR and Phase B follows on the same change.

## Phase A — the body guard

## 1. The shared guard

- [ ] 1.1 Add `services/api/src/http/request-body.ts` with `bodyKeys(body, allowed)` returning the validated record or throwing `IdentityError("VALIDATION_ERROR", "unknown property: <name>")` for the first offending key in sorted order, and refusing a non-object body; verify `services/api/test/request-validation.integration.test.ts` covers a clean body, one unknown key, several unknown keys, and a non-object body.
- [ ] 1.2 Add a route inventory constant per controller (`*_BODY_KEYS`) and export them from one module so the contract test can read the same list; verify `pnpm --filter api typecheck` passes.
- [ ] 1.3 Add the contract-parity test to `packages/contracts/test/openapi.test.ts`: every route with a request body has a constant whose keys equal the OpenAPI schema `properties`, and a route with a body but no constant fails; verify `pnpm --filter @connect/contracts test` passes.

## 2. Apply the guard to every body route

- [ ] 2.1 `identity/auth.controller.ts` (nine routes): replace the ad-hoc `bodyRecord`/`textOf` reads with `bodyKeys` and the documented keys, keeping `account_status` tolerated on register; verify the auth integration tests still pass and a new case asserts `user_id` in a register body is `422`.
- [ ] 2.2 `profiles/profiles.controller.ts` (four routes) and `me/{me,roles}.controller.ts`: same treatment, `account_status` tolerated on both profile saves; verify the profile tests pass and the two "body user id" cases now assert `422`.
- [ ] 2.3 `affiliations`, `availability`, `requests`, `mentorships`, `sessions`, and `outcomes` controllers: same treatment; verify each file's test passes and the "ignored property" cases assert `422` with the property named.
- [ ] 2.4 Rewrite the five flipped integration cases (`roles`, `profiles`, `availability`, `affiliations`, `outcomes`) so each keeps its "the other account is unchanged" assertion and only changes the expected status and code; verify none of them still claims a property is ignored.

## 3. Body size at the API boundary

- [ ] 3.1 Refuse a body above the configured limit with `413` before parsing (a `json({ limit })` on the Nest adapter or an equivalent guard), reusing the BFF's constant naming; verify a test sends an oversized body and asserts `413` with no service call.

## 4. Contract and docs for validation

- [ ] 4.1 Document the refusal in `packages/contracts/openapi.yaml` (the `422 VALIDATION_FAILED` problem is already declared; add the unknown-property case and the `413` response where a body exists); verify the contracts test passes.
- [ ] 4.2 Update `docs/api-contracts.md` §1 and §10 with the rule, the `account_status` exception, and the `413`; verify no doc still says unknown properties are ignored.
- [ ] 4.3 Label the five modified capabilities in `docs/functional-requirements.md` where the acceptance text promises ignoring, and close DEBT-01 in `docs/known-debt.md` with the test evidence.

## Phase B — throttling

## 5. Register the throttler

- [ ] 5.1 Add `@nestjs/throttler@6.7.1` as an exact dependency in `services/api/package.json`, run `pnpm install`, commit `pnpm-lock.yaml`, and run `pnpm audit --audit-level high`; verify the audit passes and the lockfile pins one version.
- [ ] 5.2 Add `RATE_LIMITS` to `packages/config/src/index.ts` with the five starting values from the design, each commented as a placeholder pending pilot traffic and citing `docs/api-contracts.md` §9 (SEC-O2 still Open); verify `pnpm --filter @connect/config typecheck` passes.
- [ ] 5.3 Register `ThrottlerModule.forRoot` with the named definitions in `services/api/src/app.module.ts` and apply `@Throttle` per route according to the design table, keying on IP and on the account or body email (hashed); verify `services/api/test/rate-limits.integration.test.ts` asserts the sixth sign-in inside a minute is `429`, a different account is still served, and `GET /healthz` never throttles.
- [ ] 5.4 Confirm the worker (`services/api/src/worker.ts`) boots without the throttler and that the sweeper and counting jobs are unaffected; verify the worker smoke check and the queue registrations are unchanged.

## 6. The refusal shape

- [ ] 6.1 Map `ThrottlerException` to `429 RATE_LIMITED` with a numeric `Retry-After` in `services/api/src/http/problem-details.filter.ts`; verify the test asserts the code, the status, and the header.
- [ ] 6.2 Translate the identity library's own `429` to the same problem shape in `services/api/src/identity/better-auth-identity.service.ts`; verify a test drives a library refusal and asserts no `500` (closes DEBT-12).
- [ ] 6.3 Close DEBT-02 and DEBT-12 in `docs/known-debt.md`, and state the per-instance limitation and the shared-store decision in `docs/security-requirements.md`; verify no debt row still says the routes are unthrottled.

## 7. Checks, docs and handoff

- [ ] 7.1 Record D-78 to D-81 in `docs/decision-log.md` if they are not already present from the propose round, and update `docs/mvp-build-plan.md` §5, `docs/milestones-and-phases.md` "Current state" and the `README.md` status line at apply time.
- [ ] 7.2 Add an `helmet`/CORS/CSP open question to `docs/assumptions-and-open-questions.md` with the reason it is not in this change; verify it reads as an open question, not a promise.
- [ ] 7.3 Run `pnpm lint`, `pnpm typecheck`, `pnpm test` (`CI=true`), `pnpm build`, and the review gate; record each exit code, the per-package totals, and every rewritten test with its rationale.
- [ ] 7.4 Confirm the diff contains only the tasks above and write the handoff naming the PR, the merge commit, the gate totals, and the dependency added.
