# Tasks: per-account-rate-limit

## 0. Preconditions

- [ ] 0.1 Re-read the repository snapshot in `design.md` against the real tree: `git log --oneline -1` (expect `6e88994`), `git status`, `sed -n '44,72p' services/api/src/app.module.ts`, `sed -n '80,110p' packages/config/src/index.ts`, `grep -rn "@Throttle" services/api/src --include=*.ts | wc -l` (expect 16), `grep -n "SkipThrottle" services/api/src/health/health.controller.ts`. Verify: every snapshot line is confirmed by an output or listed as a mismatch in the handoff.
- [ ] 0.2 Confirm the installed throttler version and the two-bucket syntax before writing code: read `node_modules/.pnpm/@nestjs+throttler@*/node_modules/@nestjs/throttler/package.json` for the version, and re-check the named-throttler and `getTracker` signatures with context7. Verify: the version and the two facts are quoted in the handoff; if the installed version cannot carry two named throttlers per route, stop and write the guard variant into `design.md` before coding.

## 1. The failing test first

- [ ] 1.1 Write the tracker unit test first and run it red: same body email with two different client addresses yields one key; two different emails yield two keys; no body and no session yields an address key; the key contains no at-sign. Verify: the test fails for the absent function, and the failure output is recorded.
- [ ] 1.2 Add the integration case to `services/api/test/rate-limits.integration.test.ts`: with the account bucket configured at its real limit, the sixth sign-in for one account is `429 RATE_LIMITED` with a numeric `Retry-After`, and a second account signed in inside the same window is served. Verify: it fails before the throttler is registered.

## 2. The tracker and the wiring

- [ ] 2.1 Add the tracker function beside the throttler wiring, exported for its test, returning `body:hash`, `session:hash` or `ip:address` per `design.md` R2, with SHA-256 from `node:crypto` and no dependency. Verify: 1.1 turns green.
- [ ] 2.2 Register the second named throttler in `services/api/src/app.module.ts`: `{ name: "account", ttl: RATE_LIMITS.accountDefault.ttl, limit: RATE_LIMITS.accountDefault.limit, getTracker: accountTracker }`. Verify: `pnpm --filter api typecheck` passes, and a smoke request to a public route and to `/healthz` still answers `200`.
- [ ] 2.3 Add `accountAuth` (10 per hour), `accountReset` (5 per hour) and `accountDefault` (120 per minute) to `RATE_LIMITS` in `packages/config/src/index.ts`, with the existing comment style and no change to any existing entry. Verify: `grep -n "accountAuth\|accountReset\|accountDefault" packages/config/src/index.ts` shows the three, and the diff touches no existing value.
- [ ] 2.4 Apply `@Throttle({ account: { limit: RATE_LIMITS.accountAuth.limit, ttl: RATE_LIMITS.accountAuth.ttl } })` to the sign-in route and `accountReset` to the forgot-password and reset-password routes in `services/api/src/identity/auth.controller.ts`, leaving registration untouched. Verify: 1.2 turns green.

## 3. Regression checks that the second throttler could break

- [ ] 3.1 Confirm the operational probes still answer `200` under repeated polling now that a second named throttler exists, and change `@SkipThrottle()` to a named skip only if the plain form no longer covers every throttler. Verify: `pnpm --filter api test` passes the health cases.
- [ ] 3.2 Confirm the sixteen existing `@Throttle({ default: ... })` sites still behave as before and were not edited. Verify: `git diff --stat services/api/src` shows only `app.module.ts`, `auth.controller.ts` and the tracker module among the controllers.

## 4. Docs and decisions

- [ ] 4.1 Update `docs/security-requirements.md`: `SEC-ABUSE-1` now met by two buckets, with the per-instance limitation still stated. Update `docs/api-contracts.md` section 9 with the account bucket, its numbers and the fallback order.
- [ ] 4.2 Close `DEBT-27` in `docs/known-debt.md` with its evidence, and note in `DEBT-02` that it is now fully satisfied while `DEBT-03` stays open.
- [ ] 4.3 Add the decision rows `D-118` and `D-119` and this change's `R` rows to `docs/decision-log.md` (full text at the end of this file).
- [ ] 4.4 Update `docs/mvp-build-plan.md` section 5, `docs/milestones-and-phases.md` "Current state", and the `README.md` status line. Verify: the three docs agree on status, PR number and date.

## 5. Gates, review and handoff

- [ ] 5.1 Run from the repo root with Docker up: `pnpm lint`, then `pnpm typecheck`, then `CI=true pnpm test`, then `pnpm build`. Record each exit code and the per-package totals. `CI=true` is what makes the integration files run; a run with skipped files and zero failures is UNVERIFIED. Run the four gates as one background job writing to a log file and poll it. CI creates `connect_test` itself and the whole checks job takes about 3.5 minutes.
- [ ] 5.2 Run the review gate from `AGENTS.local.md` section 2: `verify-before-done`, `/ponytail-review`, `/ce-code-review`, the silent-failure hunt, the trust-rule check, `/ponytail-debt`, and `review-diff`. This change sits in the auth middleware path, so run `/ponytail-audit`.
- [ ] 5.3 Confirm the diff contains only the tasks above and that `services/api/test/rate-limits.integration.test.ts` passes unchanged apart from the added case, then write the handoff naming the PR, the merge commit, the four gate totals and the two numbers.

## Decision rows to add at apply

Add each to `docs/decision-log.md` as its own row. They are reserved here because this propose round may create only files under `openspec/changes/`.

**D-118**

- Date: 2026-11-11
- Decision: A second named throttler `account` is registered beside `default`. Sign-in takes 10 per hour per account, password reset and forgot-password take 5 per hour per account, registration takes none, and the module-level default is 120 per minute. No existing limit value changes.
- Reason: the spec already promised a per-account key and only the address half was built; mirroring the per-IP numbers per account would double an attacker's allowance for one account.
- Status: Decided
- Affects: `platform/rate-limits`, `packages/config/src/index.ts`, `services/api/src/app.module.ts`

**D-119**

- Date: 2026-11-11
- Decision: The account key is derived in a fixed order: a hash of the normalised body email, then a hash of a present session credential, then the client address. A request with no derivable account key falls back to the address bucket and never errors, and no key ever contains a raw email address.
- Reason: the credential routes are where the attack happens and they carry an email; hashing keeps personal data out of a key that can surface in headers, and a fallback keeps anonymous routes working.
- Status: Decided
- Affects: `platform/rate-limits`, `services/api/src/app.module.ts`, `docs/api-contracts.md` section 9

## Workflow follow-up

- Merge the PR with a merge commit after every check passes, then archive on its own `chore/archive-per-account-rate-limit` branch, because the ruleset refuses a direct push to `main`.
- At archive, confirm the added requirement is synced verbatim, the three existing rate-limit requirements are untouched, and `openspec validate --all --strict` passes with 40 items.
