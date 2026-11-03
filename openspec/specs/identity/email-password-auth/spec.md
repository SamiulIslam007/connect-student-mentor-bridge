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

The system SHALL verify an account through a verification link that expires within 24 hours, and SHALL keep unverified accounts out of restricted actions while still allowing sign-in.

#### Scenario: Verification link opened

- **WHEN** an unverified user opens a valid verification link
- **THEN** the account is marked verified and is allowed to send requests or report outcomes

#### Scenario: Expired link

- **WHEN** a user opens a verification link after it has expired
- **THEN** the request is rejected with a problem-details error and the account stays unverified

#### Scenario: Link opened twice

- **WHEN** a user opens the same verification link a second time before it expires
- **THEN** the account stays verified, no other account is affected, and no error is shown to the user

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

The system SHALL authenticate with email and password, SHALL not reveal whether an email exists on failure, and SHALL support signing out of the current session and of every session.

#### Scenario: Wrong password

- **WHEN** a user submits a valid email with a wrong password
- **THEN** the request is rejected with `401` and the same error body returned for an unknown email

#### Scenario: Sign out everywhere

- **WHEN** a signed-in user chooses to sign out of all sessions
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
