# Spec Delta

## MODIFIED Requirements

### Requirement: The web app enforces its content security policy

The web app SHALL send `Content-Security-Policy` on every route with a nonce-based script policy and the documented directive list, SHALL NOT send a report-only policy in the default configuration, and SHALL send the report-only header only when `WEB_CSP_MODE=report-only` is configured. Script source SHALL use nonces, not `unsafe-inline`; style source SHALL use nonces or hashes for inline styles.

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
- **THEN** it allows same-origin scripts, nonce-marked inline scripts, same-origin and nonce-or-hash styles, and data images, and it forbids framing, foreign form actions and any foreign script origin

#### Scenario: The browser runs every flow under it

- **WHEN** the manual checklist in the change's tasks is executed on the running stack
- **THEN** sign-up, sign-in, Google sign-in and its callback, MFA, one form submit and one admin read complete with no CSP violation in the browser console

## ADDED Requirements

### Requirement: Production web responses carry HSTS and hide the framework

In production the web app SHALL send `Strict-Transport-Security` with a one-year max age, SHALL NOT send `X-Powered-By`, and SHALL send `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Resource-Policy: same-origin`; local HTTP MAY omit HSTS but SHALL still hide the framework header.

#### Scenario: A production response carries the headers

- **WHEN** the web app runs with production configuration over HTTPS
- **THEN** the response carries the HSTS, COOP and CORP values and no `X-Powered-By`

#### Scenario: A local response hides the framework

- **WHEN** the local stack serves the web app over HTTP
- **THEN** no `X-Powered-By` is present, and the HSTS header is absent or clearly development-only

#### Scenario: A refusal carries the same set

- **WHEN** a web route answers `401`, `403` or `422`
- **THEN** the same security headers are present, so a refusal cannot be told apart by its headers

### Requirement: Pre-session writes accept JSON only

The five BFF writes that run before a session exists SHALL require an `application/json` content type, SHALL answer `415 UNSUPPORTED_MEDIA_TYPE` for `text/plain` or any other simple content type, and SHALL NOT call the API or set a session cookie for such a request.

#### Scenario: A text/plain sign-in is refused

- **WHEN** a cross-site simple request sends a JSON body with `Content-Type: text/plain`
- **THEN** the response is `415`, no API call is made, and no session cookie is set

#### Scenario: A JSON sign-in still works

- **WHEN** the same route receives `application/json`
- **THEN** the existing sign-in behavior is unchanged

#### Scenario: The exemption is not widened

- **WHEN** a new pre-session route is added
- **THEN** a test fails unless it is on the five-route allowlist and enforces the JSON content type

#### Scenario: The refusal carries no account detail

- **WHEN** an unsupported content type is refused
- **THEN** the problem body names the content type and carries no email, password or account status
