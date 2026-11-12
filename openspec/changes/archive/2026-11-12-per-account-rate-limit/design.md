# Design: per-account-rate-limit

## Context

See `proposal.md` for motivation. Only the state that shapes the approach is recorded here.

**Repository snapshot (verified 2026-11-11, re-check at apply).**

- `main` is at `6e88994`, clean; no active change; 35 specs valid before this round. No gate was run in this propose round.
- `@nestjs/throttler` is installed at **6.7.1** (`.pnpm/@nestjs+throttler@6.7.1_...`). `services/api/src/app.module.ts` line 48 registers one throttler: `ThrottlerModule.forRoot([{ name: "default", ttl: RATE_LIMITS.default.ttl, limit: RATE_LIMITS.default.limit }])`, with `APP_GUARD` bound to `ThrottlerGuard` at line 70.
- `@Throttle({ default: RATE_LIMITS.xxx })` appears at 16 call sites across the API, always in the named single-key form.
- `RATE_LIMITS` (`packages/config/src/index.ts` line 84) holds `auth` (5 per minute), `register` (3 per hour), `reset` (3 per hour), `export` (3 per hour), `write` (60 per minute) and `default` (120 per minute), each `{ limit, ttl }` with `ttl` in milliseconds.
- `services/api/test/rate-limits.integration.test.ts` starts a stack with `throttle: true`, registers an account, signs in five times and asserts the sixth is `429` with a numeric `Retry-After`. `services/api/test/support/api-stack.ts` line 208 `apiRequest(stack, method, path, body?, sessionToken?)` sets `content-type` and `authorization` only; it takes no extra headers, and the stack binds one local address.
- `GET /healthz` and `GET /readyz` carry `@SkipThrottle()`.

**Library behaviour confirmed with context7 (2026-08-11 style check run 2026-11-11, version 6.7.1):**

- `ThrottlerModule.forRoot` accepts an object with `throttlers: [...]`, where each entry may carry `name`, `ttl`, `limit`, `blockDuration`, `ignoreUserAgents`, `skipIf`, `getTracker` and `generateKey`. A named tracker is therefore supported natively.
- `@Throttle` takes a record keyed by throttler name, so `@Throttle({ account: { limit, ttl } })` overrides only that bucket on that route and leaves `default` alone.
- `getTracker` takes the request and the execution context and returns a string or a promise of one, and its default is the built-in IP tracker.
- Named throttlers add their own `X-RateLimit-*` headers, which is worth knowing because it changes the response headers on every route once a second throttler exists.

## Goals / Non-Goals

**Goals**

- One account, many addresses, capped: the bucket follows the account, not the network.
- No behaviour change on the other 60-odd routes.
- The proof is a pure unit test plus one integration case, so the property does not depend on a test harness feature that may not exist.

**Non-Goals**

- No shared store, no distributed quota.
- No lockout, no CAPTCHA, no reputation scoring of addresses.
- No change to any existing limit or window.

## Decisions

Owner decisions keep the numbers the brief fixed (D-118 and D-119). Decisions taken while writing carry `R` numbers.

### D-118. Sign-in 10 per hour and reset 5 per hour per account; registration has no account bucket (owner decision)

`RATE_LIMITS` gains `accountAuth` (10 per hour), `accountReset` (5 per hour) and `accountDefault` (120 per minute). No existing value changes. Registration keeps only its address bucket, because no account exists before the request succeeds. Alternative rejected: mirroring the per-IP numbers per account, which would double an attacker's effective allowance for one account and defeat the point.

### D-119. A request with no account key falls back to the address bucket and never errors (owner decision)

The tracker resolves in order: the account identifier in the body, then a present session token, then the client address. A route with no body and no session still resolves to a key, so the guard never throws on a missing key. Alternative rejected: refusing a request whose key cannot be derived, which would break anonymous reads.

### R1. A second named throttler with a permissive default, plus per-route opt-in

The `account` throttler is registered module-wide because that is how the library binds a tracker, and its module-level limit is `accountDefault` (120 per minute), the same order as the existing `default` bucket, so no route changes behaviour. Only the two credential routes override it through `@Throttle({ account: { ... } })`. Alternative rejected: a hand-written `CanActivate` guard, which would duplicate the storage, the `429` shape, the `Retry-After` header and the test seam the existing guard already provides.

**Consequence to verify at apply:** adding a named throttler adds its headers and its counter to every route. The health probes must still answer `200` continuously; the existing `@SkipThrottle()` is expected to skip every throttler when it takes no argument, and the task verifies that rather than assuming it.

### R2. The key is a hash of the identifier, resolved in a fixed order

`accountTracker(req)` returns one of, in order:

1. A body key: the prefix `body`, a colon, and the SHA-256 hex of the lowercased trimmed email, when the JSON body carries a non-empty `email` string. This covers sign-in, forgot-password and reset-password, which is where credential stuffing and mail flooding actually happen.
2. A session key: the prefix `session`, a colon, and the SHA-256 hex of the bearer token or session cookie, when a credential is present. This is a proxy for the account that costs no database read inside a global tracker.
3. An address key: the prefix `ip`, a colon, and the client address, using the same address the default tracker resolves.

Alternatives rejected: resolving the session to a user id, which would put a database read in a global tracker on every request; and the raw email as the key, which would put personal data in a key that appears in error headers and could be logged.

### R3. The per-account bucket is hourly, and it is not a lockout

Ten sign-ins and five resets per account per hour are high enough that a person never hits them and low enough that a dictionary run against one account is finished. Account lockout after N failures is explicitly out of scope: it is a denial-of-service lever, and `DEBT-08` already records how a similar lever was used against a victim.

### R4. The proof is a pure tracker test plus one integration case

The two-address property is proven at the unit level: call the tracker with the same body email and two different `req.ip` values and assert one key. The enforcement property is proven in `services/api/test/rate-limits.integration.test.ts`: with the account bucket at its real limit, the sixth sign-in for one account answers `429`, and a different account in the same window is still served.

This split exists because `apiRequest` (`services/api/test/support/api-stack.ts` line 208) sends no custom headers and the stack binds one address, so the integration harness cannot vary the client address today. If the apply-time reader finds `trust proxy` enabled or a second address available, the two-address case may be added to the integration test as a third assertion; it is not required for the property to be proven.

## Acceptance criteria

1. The tracker returns exactly the same key for one account identifier seen from two different client addresses, and different keys for two different accounts.
2. The key contains no at-sign and no raw email address, and a request with no body and no session resolves to a key rather than an error.
3. The sixth sign-in inside the hour for one account answers `429` with code `RATE_LIMITED` and a numeric `Retry-After`, and no session is created.
4. A different account is still served in the same window, and the per-address buckets behave exactly as before.
5. No existing limit value changes, and the sixteen existing `@Throttle({ default: ... })` sites are untouched.
6. `GET /healthz` and `GET /readyz` stay unthrottled after the second throttler is registered.
7. Every other route answers as it did before: the module-level account default matches the existing default bucket's order of magnitude.

## Assumptions

1. A legitimate user does not sign in more than ten times an hour or request more than five resets an hour; if pilot data says otherwise the values are configuration and change without code.
2. The body email on the credential routes is present and is the same string for the same account regardless of case, which the existing normalisation already ensures.
3. A named throttler's per-route override syntax (`@Throttle({ account: { ... } })`) behaves as the 6.7.1 docs describe; the integration test proves it before the change is claimed.
4. In-process storage is acceptable because the pilot runs one API instance, a limitation already documented for the whole throttle.

## Risks / Trade-offs

- A second counter per request costs a hash and a map lookup. Mitigation: the hash runs only when a body email or a session is present, and the tracker is synchronous.
- Adding named throttlers changes response headers on every route. Mitigation: no client reads them; the check is that the health probes and one smoke route still answer as before.
- A user who genuinely exhausts the hourly account bucket must wait. Mitigation: the wait is bounded at an hour, the refusal names `RATE_LIMITED` and `Retry-After`, and the per-address bucket still applies independently.
- Hash collisions could merge two accounts' buckets. Mitigation: SHA-256 over the normalised identifier; a collision is not a practical concern at this scale.

## Open Questions

- Whether the integration stack can vary the client address, which would let the two-address proof live at the integration level too (see R4). Not blocking: the unit test proves the property.

## Migration Plan

None. No schema change, no stored value; the throttle store is in-memory and empties on restart.
