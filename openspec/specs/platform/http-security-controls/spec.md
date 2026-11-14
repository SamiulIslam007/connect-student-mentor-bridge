# platform/http-security-controls Specification

## Purpose
States which HTTP security headers both surfaces send, what the web app's content policy permits, and which browser origins may call the API, so the answers live in one place instead of in a framework default.

## Requirements

### Requirement: Every API response carries the documented header set

The API SHALL set a content security policy, strict transport security, `X-Content-Type-Options`, `Referrer-Policy` and frame protection on every response, SHALL NOT disclose its server framework, and SHALL send the same set on error responses.

#### Scenario: A successful response carries the headers

- **WHEN** any API route answers `200`
- **THEN** the response carries the content security policy, the transport security header, `X-Content-Type-Options: nosniff`, a referrer policy and frame protection, and no `X-Powered-By`

#### Scenario: A refusal carries the same headers

- **WHEN** any API route answers `401`, `403` or `422`
- **THEN** the same header set is present, so a refusal cannot be told apart from a success by its headers

#### Scenario: The policy forbids what an API never needs

- **WHEN** the content security policy is read
- **THEN** it forbids scripts, frames and form submissions by default

### Requirement: The API accepts no browser origin

The API SHALL send no cross-origin resource-sharing header for any request, because every browser call reaches it through the web app's own server-side routes.

#### Scenario: An origin-bearing request gets no allow header

- **WHEN** a request carries an `Origin` header
- **THEN** the response carries no `Access-Control-Allow-Origin` and no `Access-Control-Allow-Credentials`

#### Scenario: A preflight is not granted

- **WHEN** a preflight request is sent to any route
- **THEN** no allow-origin, allow-method or allow-header value is returned

### Requirement: A cookie-authenticated write requires a CSRF token

The web app SHALL mint one random token per browser, SHALL deliver it in a `connect_csrf` cookie, and SHALL refuse a cookie-authenticated state-changing request that does not echo that value in the `x-csrf-token` header with a same-origin `Origin`, answering `403 CSRF_INVALID` and writing nothing.

#### Scenario: A write without the header is refused

- **WHEN** a signed-in browser sends `POST /api/me/mentor-profile/pause` with no `x-csrf-token` header
- **THEN** the response is `403` with code `CSRF_INVALID`, and no request row, session change or audit entry is written upstream

#### Scenario: A write with a foreign header value is refused

- **WHEN** the same request carries an `x-csrf-token` value that differs from the `connect_csrf` cookie in any character
- **THEN** the response is `403 CSRF_INVALID` and the API is never called

#### Scenario: A matching token and origin are accepted

- **WHEN** the header equals the cookie and `Origin` is the configured app origin
- **THEN** the request proceeds exactly as it does today

#### Scenario: A cross-site origin is refused even with a matched token

- **WHEN** the header equals the cookie but `Origin` names another host
- **THEN** the response is `403 CSRF_INVALID`

#### Scenario: The token is issued to a signed-in browser

- **WHEN** a signed-in browser reads `GET /api/me`, or calls `GET /api/csrf`
- **THEN** the response sets `connect_csrf` when the cookie is absent and leaves an existing value unchanged

#### Scenario: A read needs no token

- **WHEN** a signed-in browser calls any `GET` route handler
- **THEN** no CSRF check runs and no `403` is produced for a missing header

#### Scenario: The exempt writes are the ones with no session yet

- **WHEN** a request reaches `POST /api/auth/sign-in`, `/sign-in/provider`, `/register`, `/forgot-password` or `/reset-password`
- **THEN** no CSRF check runs, because no session cookie exists to abuse yet

#### Scenario: The API reads no session cookie

- **WHEN** any `/v1` route is called with a `connect_session` cookie and no bearer token
- **THEN** it is refused as unauthenticated: the API's only session credential is the bearer token the BFF sets after reading that cookie

### Requirement: The web app enforces its content security policy

The web app SHALL send `Content-Security-Policy` on every route with the documented directive list, SHALL NOT send a report-only policy in the default configuration, and SHALL send the report-only header only when `WEB_CSP_MODE=report-only` is configured.

#### Scenario: The enforcing header is present on every route

- **WHEN** any web route is requested
- **THEN** the response carries `Content-Security-Policy` and the four other documented headers

#### Scenario: No report-only header in the default configuration

- **WHEN** the response headers are read with no flag set
- **THEN** no `Content-Security-Policy-Report-Only` header is present

#### Scenario: The flag restores the report-only mode

- **WHEN** `WEB_CSP_MODE=report-only` is set and the web app restarts
- **THEN** the response carries `Content-Security-Policy-Report-Only` and no enforcing policy

#### Scenario: The policy permits what the app uses and nothing else

- **WHEN** the policy is read
- **THEN** it allows same-origin scripts and connections, same-origin and inline styles, inline scripts, and data images, and it forbids framing, foreign form actions and any foreign script origin

#### Scenario: The browser runs every flow under it

- **WHEN** the manual checklist in the change's tasks is executed on the running stack
- **THEN** sign-up, sign-in, Google sign-in and its callback, MFA, one form submit and one admin read complete with no CSP violation in the browser console
