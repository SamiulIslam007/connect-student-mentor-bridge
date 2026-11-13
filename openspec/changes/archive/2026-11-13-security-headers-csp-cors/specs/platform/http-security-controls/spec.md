# Spec Delta

## Purpose

States which HTTP security headers both surfaces send, what the web app's content policy permits, and which browser origins may call the API, so the answers live in one place instead of in a framework default.

## ADDED Requirements

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
