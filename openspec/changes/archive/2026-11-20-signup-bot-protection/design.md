# Design: signup-bot-protection

## Context

**Repository snapshot (verified 2026-11-20 at propose; re-check at apply).**

- `apps/web/app/api/auth/register/route.ts` is four lines: `export async function POST(request: Request) { return proxyJson("/v1/auth/register", request); }`.
- `apps/web/app/sign-up/page.tsx` is a client component whose form carries a submit handler posting to that route; its inputs are `display_name`, `email`, `password`, `date_of_birth` and `consent_accepted` (lines 83-120), each with an `autoComplete` value.
- `packages/contracts/src/body-keys.ts:8-16` — the `POST /v1/auth/register` allowlist is `display_name`, `email`, `password`, `date_of_birth`, `consent_accepted`, `timezone`, `account_status`. `BodyAllowlistInterceptor` refuses any other top-level key with `422 VALIDATION_FAILED` **naming it**, so an undocumented honeypot key would both break the request and announce the mechanism.
- `services/api/src/identity/auth.controller.ts:71-91` — `@Throttle({ default: RATE_LIMITS.register })`, then the `consent_accepted` gate, then `identity.register(...)`. A refusal thrown here writes nothing.
- `services/api/src/identity/api-error.ts:11` — `VALIDATION_CODES` is the set that maps an `IdentityError` code to `422`; a new code needs one entry there.
- The register route is one of the five pre-session writes exempt from the CSRF token guard (`D-160`), so adding a header or a body key does not touch that guard.
- Per-IP and per-account buckets already exist on register (`SEC-ABUSE-1`'s first clause); this change adds the second clause only.
- `grep -rni "captcha\|turnstile\|hcaptcha" services/api apps/web` returns nothing.

## Goals / Non-Goals

**Goals**

- A script that posts the register endpoint directly, or fills every input it finds, is refused without a third-party service.
- A person is never blocked, and a refusal always tells them one thing they can do.
- The refusal is indistinguishable from outside, whatever the check.

**Non-Goals**

- No captcha, no proof of work, no IP or ASN block, no block table.
- No check on sign-in, password reset, or the request form.
- No change to the rate-limit buckets, the password policy, the age gate or the consent gate.
- No admin surface and no queue: a refusal is a log line, not a case.

## Decisions

The owner fixed the two mechanisms (honeypot, minimum submit time), the absence of a third-party processor, the "no check is revealed" rule, and the refusal-before-creation order. The decisions below are the ones left open.

### R1. The honeypot is a documented body key, not a secret one

`contact_website`, declared in the OpenAPI register schema and in `ROUTE_BODY_KEYS`, ignored by the identity service and refused by the controller when non-empty. Alternative rejected: an undeclared key, which the body allowlist turns into `422` naming `contact_website` — a refusal that teaches a bot exactly which field to leave empty.

### R2. The intent marker is an unsigned httpOnly cookie

`connect_signup_intent` holds an ISO instant, is `httpOnly`, `SameSite=Lax`, `Path=/`, one-hour `maxAge`, and is minted by `GET /api/auth/register-intent`, which the sign-up page calls once on mount. Alternative rejected: an HMAC over the value — the cookie is httpOnly and same-site, and the threat this check prices is the cost of loading the form at all, not forgery by a browser that already runs the app's own JavaScript.

### R3. Two seconds and one hour, in `@connect/config`

`SIGNUP_MIN_SUBMIT_SECONDS = 2`, `SIGNUP_INTENT_MAX_AGE_SECONDS = 3600`. Two seconds is longer than any paste-and-submit gesture and far shorter than a person reading a form; one hour covers a slow form fill and refuses a marker scraped yesterday. Alternative rejected: a per-deploy random window, which makes a refusal unreproducible in support.

### R4. One generic refusal with one actionable sentence

`422 REGISTRATION_REFUSED`, message "This submission could not be processed. Reload the page and try again." — the same body for all three checks, because reloading re-mints the marker, clears a stale one and costs a person nothing. The string lives in `apps/web/lib/strings.ts` and the API's copy matches it; alternative rejected: naming the check, which is the oracle the brief forbids.

### R5. Timing in the BFF, the honeypot in both places

The API is bearer-only and parses no session cookie (`grep -rn cookie services/api/src` finds cookie *settings* and a rate-limit key reader), so the cookie check can only live in the BFF. The honeypot is checked in the BFF too, and again in the controller, so a client that calls `POST /v1/auth/register` directly gets the same refusal instead of bypassing the control. Alternative rejected: teaching the API to read a cookie, which would break the boundary the CSRF and BFF design rests on.

### R6. The log line carries the check and nothing else

One JSON line, `{ event: "registration.refused", check: "honeypot" | "timing" }`, at `info` in the BFF. No email, no address, no body, no user agent — `SEC-DATA-5` forbids message bodies and personal data in logs, and `SEC-DATA-4` forbids retaining the date of birth. Alternative rejected: logging the email so support can trace a complaint; the user can retry without help, and the address would be the only personal datum in a log line.

### R7. The BFF parses the body once and passes it on

`request.json()` consumes the stream, so the route reads the body once, checks it, and hands the parsed object to `proxyJson`'s body option; the route's parameter type becomes `NextRequest` to read cookies. Alternative rejected: `request.clone()`, which doubles the buffered body on the one route an attacker can drive at will.

## Acceptance criteria

1. A registration whose `contact_website` is non-empty answers `422 REGISTRATION_REFUSED`; no user row, no consent row and no audit row exist afterwards.
2. A registration with a marker younger than two seconds answers the same status, code and body.
3. A registration with no marker, or one older than an hour, answers the same status, code and body.
4. The three refusal bodies are byte-identical.
5. A valid registration (empty honeypot, marker between two seconds and an hour old) still creates one account and one verification email.
6. A direct call to `POST /v1/auth/register` with a filled honeypot is refused by the API without the BFF in the path.
7. The refusal message is one catalog string, and `apps/web/test/sign-up-errors.test.ts` fails if it is hard-coded in the page.
8. The page renders the honeypot with `tabindex="-1"`, `aria-hidden="true"`, `autoComplete="off"` and a name no password manager claims.
9. The log line for a refusal carries exactly `event` and `check`.
10. `pnpm --filter @connect/contracts test` passes with `contact_website` in both the allowlist and the schema, and the inventory test names no unknown key.

## Assumptions

- The pilot's threat is opportunistic automation (credential stuffing lists, invite farming), not a targeted adversary with a headless browser.
- Two seconds is comfortably below the fastest plausible human submission on a phone on a slow network — measured against the sign-up page's own field count in review, not asserted as fact.
- `proxyJson` accepts an explicit body (the BFF routes that send one already do); the apply verifies it before relying on it.

## Risks

The proposal's table covers the user-facing risks. The two this design adds:

- Reading the body in the BFF before proxying can change the `Content-Length` or the content type; the apply asserts the proxied request still carries `application/json` and that the 100 KiB cap still answers `413`.
- A clock skew between the browser-served cookie and the server's `Date` header would refuse a legitimate form; the check compares against the server's own `Date.now()` at the moment the request arrives, never against a client-supplied time.
