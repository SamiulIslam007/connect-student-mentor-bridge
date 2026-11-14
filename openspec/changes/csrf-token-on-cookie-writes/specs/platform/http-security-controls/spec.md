# Spec Delta

## ADDED Requirements

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
