# platform/rate-limits Specification

## Purpose
A predictable throttle on the routes that cost the most when abused, and a rate-limit refusal a client can act on, without adding a second data store to the MVP.

## Requirements

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

### Requirement: The throttled credential routes also carry an account bucket

The system SHALL enforce a second request limit on the sign-in, forgot-password and reset-password routes, keyed by the account the request names rather than by the caller's address. The account key SHALL be derived from the body's account identifier when present, otherwise from a session credential, otherwise from the caller's address, and SHALL NOT contain a raw email address.

#### Scenario: One account from many addresses is capped

- **WHEN** one account is submitted from several different addresses and the account bucket's limit is reached
- **THEN** further attempts for that account answer `429 RATE_LIMITED` with a numeric `Retry-After`, whatever address they come from

#### Scenario: The key follows the account, not the address

- **WHEN** the same account identifier is read from two different client addresses
- **THEN** both requests resolve to the same account key

#### Scenario: A different account is unaffected

- **WHEN** one account is throttled
- **THEN** a different account is served in the same window, even from the same address

#### Scenario: A key never carries personal data

- **WHEN** any account key is derived
- **THEN** it contains no at-sign and no readable email address

#### Scenario: A request with no account identifier falls back

- **WHEN** a route is called with no body account identifier and no session credential
- **THEN** the request is keyed by the caller's address and is not refused for a missing key

#### Scenario: The existing behaviour is unchanged

- **WHEN** the credential routes are called within every configured limit
- **THEN** they answer as they did before this change, and the existing address bucket still applies on its own window

### Requirement: Anonymous limits use a trusted client identity

The system SHALL key an anonymous credential or write limit on a client identity that the edge or BFF derives from the transport peer, SHALL forward that key only over the trusted BFF-to-API link, SHALL NOT trust a client-supplied forwarding header on the public side, and SHALL keep the per-account bucket as a second key.

#### Scenario: Two users behind one BFF have separate buckets

- **WHEN** two different browsers send credential requests through the same BFF address
- **THEN** each receives its own address bucket, and exhausting one does not answer `429` to the other

#### Scenario: A spoofed forwarding header changes nothing

- **WHEN** a public caller sends a forwarding header naming another address
- **THEN** the API ignores it, and the limit is keyed on the trusted peer or the BFF key

#### Scenario: A request without a trusted key falls back

- **WHEN** a direct caller reaches the API without a trusted client key
- **THEN** the request is keyed by its peer address and is not refused for a missing key

#### Scenario: The shared BFF address is not the only key

- **WHEN** the API sees many requests from one BFF container
- **THEN** a single anonymous bucket for that container does not exist

### Requirement: Account throttling resists targeted lockout

The system SHALL combine the account identifier with a source signal for the account bucket, SHALL NOT let an unauthenticated caller spend the only bucket belonging to a victim, and SHALL either admit a correct credential after a challenge or answer a retryable challenge instead of an unconditional hour-long block.

#### Scenario: An attacker cannot lock the victim out

- **WHEN** an attacker spends the account bucket for a victim's email from one source
- **THEN** a correct credential from another source is admitted after the configured challenge, and the attacker's source remains limited

#### Scenario: The source remains accountable

- **WHEN** one source repeats failures for one account
- **THEN** that source continues to answer `429 RATE_LIMITED` with a numeric `Retry-After`

#### Scenario: A key carries no personal data

- **WHEN** any account or source key is derived
- **THEN** it contains no at-sign, no readable email address and no raw session token

### Requirement: A sign-up intent is signed and single-use

The system SHALL issue a sign-up intent that is signed with a server secret and contains an issue time and a nonce, SHALL accept it once inside the two-second to one-hour window, and SHALL reject a forged, replayed or unsigned value before any upstream call.

#### Scenario: A forged marker is refused

- **WHEN** a caller sends an unsigned or altered intent cookie
- **THEN** registration answers `422 REGISTRATION_REFUSED`, the API is never called, and no row is written

#### Scenario: A replayed marker is refused

- **WHEN** a valid marker has already been consumed
- **THEN** a second registration with it is refused, and the first account is unchanged

#### Scenario: A valid marker is accepted once

- **WHEN** a person submits inside the time window with an unused valid marker and an empty honeypot
- **THEN** registration proceeds, and the marker is consumed

#### Scenario: The refusal does not name the check

- **WHEN** any sign-up check refuses
- **THEN** the response is the same generic refusal and no email address is logged
