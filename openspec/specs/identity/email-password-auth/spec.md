# identity/email-password-auth Specification

## Purpose

Provides account creation, email verification, password-based sign-in and reset, and server-side session management for every connect user, behind a single identity seam that the rest of the product depends on instead of a vendor library.

## Requirements

### Requirement: Email and password registration

The system SHALL create exactly one account for a new email address after the password policy and the age gate are satisfied, and SHALL treat that email as unverified until the verification link is opened.

#### Scenario: Valid registration

- **WHEN** a visitor submits a unique email address and a password that meets the policy
- **THEN** one account row exists with `email_verified = false` and `account_status = PENDING`, a verification email is queued for that address, and the response is a success without a session

#### Scenario: Duplicate email

- **WHEN** a visitor registers with an email address that already has an account
- **THEN** no second account is created and the response does not reveal that the address is already registered

### Requirement: Email verification

The system SHALL verify an account through a verification link that expires within 24 hours, and SHALL keep unverified accounts out of every authenticated action by refusing sign-in until the email is verified.

#### Scenario: Verification link opened

- **WHEN** an unverified user opens a valid verification link
- **THEN** the account is marked verified, becomes `ACTIVE`, and is allowed to sign in and to send requests or report outcomes

#### Scenario: Expired link

- **WHEN** a user opens a verification link after it has expired
- **THEN** the request is rejected with a problem-details error and the account stays unverified

#### Scenario: Link opened twice

- **WHEN** a user opens the same verification link a second time before it expires
- **THEN** the account stays verified, no other account is affected, and no error is shown to the user

#### Scenario: Unverified account cannot sign in

- **WHEN** an unverified account submits the correct password
- **THEN** the request is refused with `403` and code `EMAIL_NOT_VERIFIED`, and the response offers no session

### Requirement: 18+ gate at registration

The system SHALL block registration when the submitted date of birth indicates the person is under 18, and SHALL never persist the date of birth.

#### Scenario: Under-18 attempt

- **WHEN** a visitor submits a date of birth under 18 years old
- **THEN** registration is rejected with `422` and code `UNDER_MINIMUM_AGE`, no account or profile is created, and only a keyed hash of the email with an expiry is stored in `signup_blocks`

#### Scenario: Successful age check

- **WHEN** a visitor submits a date of birth of 18 years or older
- **THEN** the account records `age_18_plus = true`, `age_gate_passed_at`, and the wording version, and no date of birth is written to any table or log

### Requirement: Password policy

The system SHALL accept passwords of at least 12 characters with no composition rules, SHALL accept long passphrases, and SHALL store only a salted hash.

#### Scenario: Short password rejected

- **WHEN** a registration or reset submits a password shorter than 12 characters
- **THEN** the request is rejected with a validation error naming the minimum length and no account or password change is written

#### Scenario: Password never logged

- **WHEN** any authentication request succeeds or fails
- **THEN** no log line, audit metadata, or error body contains the password or a password hash

### Requirement: Password reset

The system SHALL provide a reset flow that returns the same response whether or not the email exists, uses a single-use link, and revokes every existing session when the new password is set.

#### Scenario: Reset for an unknown email

- **WHEN** a visitor requests a reset for an address with no account
- **THEN** the response is identical to the known-address response and no email is sent

#### Scenario: Reset completes

- **WHEN** a user opens a valid reset link and submits a compliant new password
- **THEN** the password changes, the link cannot be reused, and all previously issued sessions for that user fail on their next request

### Requirement: Sign-in and sign-out

The system SHALL authenticate with email and password, SHALL not reveal whether an email exists on failure, SHALL evaluate account status only after the password is accepted, SHALL withhold a session when the account has an active second factor until that factor is verified, SHALL support signing out of the current session and of every session, and SHALL send the browser to the account page after a successful password sign-in, matching the provider callback.

#### Scenario: Wrong password

- **WHEN** a user submits a valid email with a wrong password
- **THEN** the request is rejected with `401` and the same error body returned for an unknown email

#### Scenario: Non-active account refused after the password

- **WHEN** a user submits the correct password for an account whose status is not `ACTIVE` and is not `DEACTIVATED`
- **THEN** the request is refused with `403` and a status code, no session is created, and the refusal is distinguishable from a wrong password

#### Scenario: Sign-in reports the status

- **WHEN** an `ACTIVE` account signs in successfully
- **THEN** the response includes the account's `account_status` alongside the session, so the client never has to guess it

#### Scenario: Second factor admits no session

- **WHEN** an `ACTIVE` account with an active second factor submits the correct password
- **THEN** no session row is created by the sign-in itself, and the response asks for the second step instead of returning a session token

#### Scenario: Successful sign-in lands on the account page

- **WHEN** the sign-in page receives a successful password sign-in response
- **THEN** the browser navigates to the account page, which is the same destination the provider callback uses

#### Scenario: A second-factor sign-in keeps the challenge step

- **WHEN** the sign-in response asks for the second factor instead of returning a session
- **THEN** the browser stays on the second-factor challenge page and no account page is rendered

#### Scenario: Sign out everywhere

- **WHEN** a signed-in user chooses to sign out of all sessions from the session list page
- **THEN** every session row for that user is revoked and each other session fails on its next request

### Requirement: Server-side session store

The system SHALL treat Postgres session rows as the source of truth for authentication, and SHALL reject any request whose session row is expired or revoked.

#### Scenario: Revoked session rejected

- **WHEN** a request arrives with a session that was revoked
- **THEN** the request is rejected with `401` before any handler runs, even if the token has not expired

#### Scenario: Session revoked by another action

- **WHEN** a session row was revoked by a password reset or by signing out everywhere
- **THEN** the request is rejected with `401` on its next use, even though its cookie has not expired

### Requirement: IdentityService seam

All identity operations SHALL be reached through a single identity interface that returns domain types, and no domain or feature module SHALL import the identity library directly.

#### Scenario: Vendor type does not leak

- **WHEN** a feature module consumes the identity interface
- **THEN** its inputs and outputs contain only the project's own types and no library-specific object

#### Scenario: Implementation is replaceable

- **WHEN** a second implementation of the identity interface is provided to the same feature code
- **THEN** the feature code compiles and its tests pass without modification

### Requirement: Browser authentication transport

The system SHALL keep browser sessions in httpOnly, Secure, SameSite=Lax cookies handled by the Next.js backend-for-frontend, and SHALL never expose a token to client-side storage.

#### Scenario: No token in browser storage

- **WHEN** a browser completes sign-in
- **THEN** `localStorage` and `sessionStorage` contain no access or refresh token, and the API is only called through the Next.js origin

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
