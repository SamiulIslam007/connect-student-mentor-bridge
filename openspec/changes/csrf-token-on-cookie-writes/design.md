# Design: csrf-token-on-cookie-writes

## Context

**Repository snapshot (verified 2026-11-14 at propose, re-check at apply).**

- Base: `main` at `42768e9`, tree clean, zero active changes, `openspec validate --all --strict` → 41 passed. Gates at propose: lint 0, typecheck 0, `CI=true pnpm test` 674 tests / 0 fail / 0 skipped, build 0. CI run `43519432739` on that SHA: success.
- The browser holds one credential: `connect_session`, set by `apps/web/lib/session-cookie.ts` with `httpOnly: true`, `sameSite: "lax"`, `secure` outside development.
- Every BFF route reads it with `readSessionCookie(request.headers.get("cookie"))` and then sends the token it found as a bearer credential (`apps/web/lib/bff.ts`, `proxyJson`, and the per-route handlers such as `apps/web/app/api/me/mentor-profile/pause/route.ts`).
- The NestJS API never authenticates from a cookie: `grep -rn "cookie" services/api/src` finds only `identity/` cookie *settings* and `http/account-throttler.ts`, which reads a cookie purely to build a rate-limit key.
- `find apps/web/app/api -name route.ts` → 48 files; 34 of them export a write method (`POST`, `PUT`, `DELETE`). 22 `*.tsx` files call `fetch("/api/...")` with a write, across 35 call sites (31 `POST`, 3 `PUT`, 1 `DELETE`).
- `apps/web/lib/api.ts` already exports `appOrigin()`, which resolves `BETTER_AUTH_URL` and refuses a non-http scheme; it is the origin the CSRF check compares against.
- `ProblemDetailsFilter` on the API owns the problem shape; the BFF already returns local problem bodies of its own (`payload-too-large`, `invalid-request-body` in `apps/web/lib/bff.ts`), so a BFF-local `CSRF_INVALID` matches the existing pattern.

## Goals / Non-Goals

**Goals**

- A cross-site write from another origin cannot succeed even if `SameSite` is ignored.
- One guard, one helper, no per-page invention.
- A failure is diagnosable from the refusal body alone.

**Non-Goals**

- No API change, no new API route, no OpenAPI delta.
- No token rotation, no per-form token, no server-side token store.

## Decisions

The owner fixed the mechanism (origin check plus double-submit cookie, `SameSite=Lax` retained, stateless). The decisions taken here carry `R` numbers, because the brief's `D` labels are spent.

### R1. The CSRF boundary is the Next BFF, not the NestJS API

The API accepts only a bearer token; it is unreachable with a cookie the browser could be tricked into sending. Enforcing CSRF there would guard a door with no handle and would put the token in the OpenAPI document, which describes the API, not the browser. Alternative rejected: enforcing in both places, which would add a header the API's own clients never send and break the bearer contract.

### R2. The token is a random value in a readable cookie, compared to itself

`connect_csrf` is 32 random bytes, base64url, `sameSite: "lax"`, `secure` outside development, `path: "/"`, `httpOnly: false`. Double-submit needs the client helper to read it; the session cookie stays httpOnly. The comparison is length-independent constant time. Alternative rejected: HMAC-of-session-token, which would rotate on every session and buy nothing here, because the value is already unguessable and never leaves the browser.

### R3. The token is minted by the BFF, and only for a signed-in caller

`GET /api/me` sets the cookie when it is absent, and a new `GET /api/csrf` exists for the case where a page needs the token before any `/api/me` read. Both mint only when a session cookie is present, so an anonymous visitor is never given one. Alternative rejected: minting in a middleware, which would run for static assets too.

### R4. `Origin` is authoritative when present; the token carries the decision

The guard refuses when `Origin` (or `Referer` when `Origin` is absent) names a host other than `appOrigin()`. A missing header does not fail the request on its own: a valid token pair is accepted, which is what the double-submit rule says and what keeps a stripped-proxy deployment working. Alternative rejected: refusing a missing `Origin` outright, which breaks documented non-browser use.

### R5. Five writes stay exempt, and the list is a constant

`POST /api/auth/sign-in`, `/sign-in/provider`, `/register`, `/forgot-password`, `/reset-password`. Each either creates the session or is used by a caller who has none; a token would be unverifiable, not merely unnecessary. `sign-out` and `sign-out-everywhere` are **not** exempt: a forced sign-out is a real nuisance attack. The exemption list is one exported array, so the wiring test can assert both the ruled-in and the ruled-out set.

### R6. The client helper is the only writer

`apps/web/lib/csrf-client.ts` exports `csrfFetch(input, init)`: read the cookie, add the header, call `fetch`. Every one of the 22 client components uses it. A page that keeps `fetch` is a build failure through `csrf-wiring.test.ts`, which reads the source of each file and asserts neither a raw write-`fetch` nor a missing guard.

### R7. A switch-off flag exists for one deploy

`WEB_CSRF_MODE=off` disables the guard and nothing else; the flag is read at request time so a restart is enough. This is the owner's rollback in practice, and it is documented in `docs/local-setup.md`.

## Assumptions

1. `BETTER_AUTH_URL` is the app origin in every deployment, which `appOrigin()` already assumes for redirects.
2. No non-browser client calls the BFF write routes; the bearer path is the API's.
3. The token cookie is acceptable to the privacy notice: it is a security cookie with no personal data, and the notice already covers "strictly necessary cookies".

## Risks

- A user with an expired token sees a `403` once; the helper re-mints on that code and retries once, and the retry is asserted in a test. This is the only behaviour change a real user can notice.
- A second web origin (a staging host sharing cookies) would fail the origin check; the flag is the answer, and the deployment rule is one origin per cookie domain.

## Acceptance criteria

1. A write with no token is `403 CSRF_INVALID` and the API receives no call.
2. A write with a mismatched token is `403 CSRF_INVALID`.
3. A write with a matched token and the configured origin succeeds unchanged.
4. A cross-site `Origin` is refused even with a matched token.
5. `GET` routes are unaffected, and all five exempt writes still work.
6. `csrf-wiring.test.ts` fails when any write-capable `route.ts` loses its guard or any `*.tsx` posts without the helper.
7. `WEB_CSRF_MODE=off` restores today's behaviour with no code change.
