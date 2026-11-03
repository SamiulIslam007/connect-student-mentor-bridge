# Spec Delta

## ADDED Requirements

### Requirement: Invalid email is a client validation error

Register, forgot-password, and sign-in SHALL reject a malformed email address with `422 VALIDATION_FAILED` and SHALL NOT return a server error, before or after the identity library is called.

#### Scenario: Register rejects a malformed email

- **WHEN** a visitor submits `a@b..c` to `POST /v1/auth/register`
- **THEN** the response is `422` with code `VALIDATION_FAILED`, no account is created, and no server error is logged

#### Scenario: Forgot-password rejects a malformed email

- **WHEN** a visitor submits `a@b..c` to `POST /v1/auth/forgot-password`
- **THEN** the response is `422` with code `VALIDATION_FAILED` and no email is sent

#### Scenario: Sign-in rejects a malformed email

- **WHEN** a visitor submits `a@b..c` to `POST /v1/auth/sign-in`
- **THEN** the response is `422` with code `VALIDATION_FAILED` and no session is created

### Requirement: Registration does not reveal account existence by timing

The registration endpoint SHALL perform the same password-hashing work whether or not the submitted address already has an account, so the response body and response time do not reveal account existence.

#### Scenario: Existing and fresh addresses take comparable time

- **WHEN** the median response time is measured over 20 samples for an existing address and 20 samples for a fresh address
- **THEN** the medians differ by less than 1.5× and both return the same `200` body

#### Scenario: The existing-address path still writes nothing

- **WHEN** a visitor registers an address that already has an account
- **THEN** no second account, consent row, or registration audit row is written

### Requirement: Sign-in reports the post-transition status

After a successful library sign-in, the system SHALL re-read the account and SHALL return the post-transition `account_status`. A `DEACTIVATED` account that is resumed and a verified-`PENDING` account that is repaired SHALL both report `active`.

#### Scenario: Reactivation reports active

- **WHEN** a `DEACTIVATED` account signs in with the correct password
- **THEN** the response contains `account_status: "active"` and the database stores `ACTIVE`

#### Scenario: Verified-PENDING repair reports active

- **WHEN** an account with `email_verified = true` and `status = PENDING` signs in
- **THEN** the status is repaired to `ACTIVE` and the response contains `account_status: "active"`

#### Scenario: Activation audit carries the sign-in request id

- **WHEN** a sign-in triggers `ACCOUNT_ACTIVATED`
- **THEN** that audit row's `request_id` equals the `X-Request-Id` returned by the same sign-in response

### Requirement: Verify redirect uses the configured origin

The email-verification route handler SHALL build its redirect from the configured `BETTER_AUTH_URL` origin and SHALL allow only `http` and `https` schemes. It SHALL NOT use the request `Host` or `x-forwarded-proto` headers as the redirect origin.

#### Scenario: Spoofed Host does not change the redirect origin

- **WHEN** a request reaches the verify route with `Host: evil.example`
- **THEN** the redirect stays on the configured origin and never points at `evil.example`

#### Scenario: A non-HTTP scheme is rejected

- **WHEN** a request reaches the verify route with `x-forwarded-proto: javascript`
- **THEN** the route returns a safe error response and never emits a `javascript:` `Location`

### Requirement: Malformed session cookie is treated as no session

The BFF SHALL treat an undecodable `connect_session` cookie value as an absent session and SHALL return `401`, not `500`.

#### Scenario: Malformed cookie

- **WHEN** a request carries `Cookie: connect_session=%`
- **THEN** the BFF returns `401` and the API is not called

### Requirement: BFF limits request body size

The BFF SHALL reject a request body larger than 128 KiB with `413` before JSON parsing, and SHALL count bytes for a chunked body that has no `Content-Length`.

#### Scenario: Oversized body is rejected before parsing

- **WHEN** a client sends a body whose `Content-Length` exceeds 128 KiB to a BFF POST or PUT
- **THEN** the BFF returns `413` and does not forward the body to the API

#### Scenario: Chunked body is counted

- **WHEN** a client sends a chunked body larger than 128 KiB with no `Content-Length`
- **THEN** the BFF stops reading at the cap and returns `413`

### Requirement: Non-JSON upstream body becomes a 502 problem

When the API returns a non-JSON body on an error status, the BFF SHALL return a `502` problem response instead of an empty object or a misleading success.

#### Scenario: Upstream HTML error

- **WHEN** the API returns `500` with `text/html`
- **THEN** the BFF returns `502` with a problem body and does not pass the HTML through

### Requirement: Forgot-password web surface

The web app SHALL provide a forgot-password page linked from sign-in, SHALL submit the email through the existing BFF route, and SHALL show the same success message whether or not the address exists.

#### Scenario: Request a reset link

- **WHEN** a user opens the forgot-password page, enters an email, and submits
- **THEN** the page shows a success message that does not reveal whether an account exists

#### Scenario: Invalid email is shown inline

- **WHEN** the submitted address is malformed
- **THEN** the page shows an inline validation message and does not claim that a link was sent

### Requirement: Under-18 rejection is shown clearly

The sign-up page SHALL show a clear under-18 message when the API returns `UNDER_MINIMUM_AGE`, distinct from generic validation and network errors.

#### Scenario: Under-18 submission

- **WHEN** the API returns `422 UNDER_MINIMUM_AGE` to the sign-up page
- **THEN** the page displays the message that the user must be 18 or older, keeps the non-password values, and does not show a generic failure only

#### Scenario: Generic validation stays distinct

- **WHEN** the API returns `422 VALIDATION_FAILED` for a different field
- **THEN** the page shows a validation message and not the under-18 message
