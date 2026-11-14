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

### Requirement: The web app sends a documented header set with a report-only policy

The web app SHALL set `X-Content-Type-Options`, `Referrer-Policy`, frame protection and a permissions policy on every route, and SHALL set a content security policy in report-only mode until enforcement is decided separately.

#### Scenario: Every route carries the headers

- **WHEN** any web route is requested
- **THEN** the header map returned for that path contains the four enforcing headers and the report-only policy

#### Scenario: The policy is report-only, named as such

- **WHEN** the response headers are read
- **THEN** the content policy appears under the report-only header name and no enforcing policy header is present

#### Scenario: The policy permits what the app uses

- **WHEN** the policy is read
- **THEN** it allows same-origin scripts, styles and connections, inline styles, and data images, and forbids framing and foreign form actions

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
