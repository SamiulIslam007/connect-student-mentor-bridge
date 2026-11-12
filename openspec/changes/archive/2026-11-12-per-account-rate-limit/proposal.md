# Proposal: per-account-rate-limit

## Why

`DEBT-27` records the gap in the owner's own words: "The rate limiter keys on the client IP only; `SEC-ABUSE-1` also names a per-account bucket ... A distributed credential-stuffing run against one account from many addresses is not capped, and a shared NAT address shares one bucket." `DEBT-02` was narrowed by `request-validation-and-rate-limits` for exactly this reason: the per-IP limits ship, the per-account bucket does not.

The spec already promises it. `openspec/specs/platform/rate-limits/spec.md` line 10 says the limits are "keyed by the caller's address and, where a session or a body account exists, by that account". The implementation only does the address half, so this change closes a gap between the written requirement and the code rather than inventing a new rule.

The attack it stops is cheap and realistic for a student-mentor platform: five attempts per address per minute does not slow a run that rotates addresses, and it does nothing at all against one account being tried from a botnet while a shared campus NAT is being rate-limited out of its own bucket. One extra in-memory key per credential attempt is the whole cost.

## What Changes

- Register a second **named** throttler, `account`, in `services/api/src/app.module.ts` beside the existing `default` one, with a permissive module-level default so no route changes behaviour by accident.
- Give it a tracker that derives one key from, in order: the account identifier in the request body on the credential routes (the normalised email), a present session token, and finally the client address. The key is a hash, never a raw email, so no personal data lands in a throttle key or a log line.
- Opt the credential routes in with tight per-route values: sign-in 10 per hour per account, password reset 5 per hour per account. Registration gets no account bucket, because no account exists yet.
- Add the values to `RATE_LIMITS` in `packages/config/src/index.ts` and change no existing value.
- Prove the property twice: a unit test that the tracker returns one key for one account seen from two different addresses, and an integration test that the sixth attempt for one account is `429 RATE_LIMITED` with `Retry-After`, while a different account is unaffected.
- Close `DEBT-27` and record `DEBT-02` as fully satisfied.
- No migration, no new dependency, no Redis.

## Capabilities

### New Capabilities

None. The behaviour belongs to the capability that already owns throttling.

### Modified Capabilities

- `platform/rate-limits`: one requirement is added for the account bucket, its key derivation and its fallback. The existing requirements are unchanged, because they already describe a per-caller key; only the implementation was behind.

## Impact

- **Code**: `services/api/src/app.module.ts` (the second named throttler and its tracker), `packages/config/src/index.ts` (`RATE_LIMITS` gains three entries), `services/api/src/identity/auth.controller.ts` (two `@Throttle` overrides), and wherever the tracker function lives (a small module beside the throttler wiring, chosen at apply).
- **Tests**: `services/api/test/rate-limits.integration.test.ts` (one new case), and a unit test for the tracker (new file beside the module that owns it, or a case in the existing rate-limit test if the function is exported from a pure module). `services/api/test/support/api-stack.ts` only if the two-address proof turns out to be expressible there.
- **API/contract**: none. No route, path, body key or schema changes; the `429` shape and `Retry-After` are unchanged.
- **Data**: none. The throttle store stays in process memory.
- **Dependencies**: none added.
- **Docs**: `docs/security-requirements.md` (`SEC-ABUSE-1` now met; the per-instance limitation stays), `docs/api-contracts.md` section 9 (the account bucket and its numbers), `docs/known-debt.md` (`DEBT-27` closed, `DEBT-02` noted as satisfied), `docs/decision-log.md` (D-118, D-119), `docs/mvp-build-plan.md` section 5, `docs/milestones-and-phases.md` current state, `README.md` status line.

## Depends on

- `platform/rate-limits` (archived 2026-11-09): the throttler wiring, `RATE_LIMITS`, the `429 RATE_LIMITED` translation and the existing per-IP buckets.
- `identity/email-password-auth` (archived 2026-11-03): the sign-in, sign-out and reset routes and their bodies.

## Out of scope

- A shared quota store (Redis or otherwise); the per-instance limitation stays documented.
- Bot detection, device fingerprinting, CAPTCHA, and account lockout after N failures.
- Any change to an existing limit value.
- Throttling by IP reputation or by ASN.

## Risks and rollback

| Risk | Mitigation |
|---|---|
| A named throttler applies to every route, so a careless default 429s the whole API | The module-level default is the same permissive 120 per minute the `default` bucket uses, and only two routes opt in to tighter values |
| The sixth sign-in for one account locks out a legitimate user behind a shared NAT | The account bucket is hourly, not per-minute, and is set at 10; a legitimate user does not sign in ten times an hour, and the per-IP bucket is unchanged |
| A raw email address lands in a throttle key or a log | The tracker hashes the normalised email, and the test asserts the key contains no at-sign |
| The tracker throws when a body is absent or malformed | It reads defensively and falls back to the session token and then the client address; a route with no body and no session still resolves to a key |
| `@SkipThrottle()` on the health probes stops skipping once a second named throttler exists | The apply task verifies the probes stay unthrottled after the change and adjusts to a named skip if needed |

Rollback: revert the commit. The throttle store is in-memory, so a restart clears every counter and no state needs repair.

**Traces to** SEC-ABUSE-1 (per-account and per-address buckets), FR-AUTH-01 and FR-AUTH-05 (the credential routes), FR-AUTH-07 (refusals are problem responses); NFR-SEC-01 where it names credential stuffing; D-118 and D-119 (this change); DEBT-27 (closed), DEBT-02 (satisfied), DEBT-03 (untouched).
