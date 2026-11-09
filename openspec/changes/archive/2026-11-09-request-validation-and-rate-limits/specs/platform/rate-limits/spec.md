# Spec Delta

## Purpose

A predictable throttle on the routes that cost the most when abused, and a rate-limit refusal a client can act on, without adding a second data store to the MVP.

## ADDED Requirements

### Requirement: Sensitive routes are throttled per caller and address

The system SHALL apply a request limit to `POST /v1/auth/register`, `POST /v1/auth/sign-in`, `POST /v1/auth/forgot-password`, `POST /v1/auth/reset-password`, and the write routes that enqueue email or create ledger rows, keyed by the caller's address and, where a session or a body account exists, by that account, and SHALL leave `GET /healthz` and `GET /readyz` unthrottled.

#### Scenario: Repeated sign-in attempts are refused

- **WHEN** one address (or one account) exceeds the configured sign-in limit inside the window
- **THEN** further attempts answer `429 RATE_LIMITED` until the window resets, and no session is created

#### Scenario: A different caller is unaffected

- **WHEN** one caller is throttled
- **THEN** a different address and a different account continue to be served

#### Scenario: The operational probes stay unthrottled

- **WHEN** a monitoring client polls `GET /healthz` or `GET /readyz` continuously
- **THEN** no `429` is returned

### Requirement: A refusal names the code and the wait

The system SHALL answer a throttled request with `429`, the `RATE_LIMITED` problem code, and a `Retry-After` header stating the remaining window in seconds, and SHALL NOT answer a throttle with `500`.

#### Scenario: The problem shape is the documented one

- **WHEN** a request is throttled
- **THEN** the body is the standard problem detail with code `RATE_LIMITED`, the status is `429`, and `Retry-After` is present and numeric

#### Scenario: A library throttle is translated

- **WHEN** the identity library refuses a request with its own rate limit
- **THEN** the response is the same `429 RATE_LIMITED` problem shape rather than a generic `500`

### Requirement: The limits are configuration with documented defaults

The system SHALL hold the window and each route's limit as configuration with a documented default, SHALL state in the docs that the values are a starting point to be tuned after pilot traffic, and SHALL NOT require a deployment change to tune them.

#### Scenario: A changed limit applies without code changes

- **WHEN** the configured limit for a route changes
- **THEN** the next request is throttled according to the new value

### Requirement: The throttle state is per instance in the MVP

The throttle SHALL be enforced in process memory, and the docs SHALL state that a multi-instance deployment would enforce the limit per instance until a shared store is approved.

#### Scenario: The single-instance limitation is documented

- **WHEN** a reader looks for the throttle behaviour under horizontal scaling
- **THEN** `docs/security-requirements.md` states the per-instance limitation and names the shared-store decision as post-pilot work
