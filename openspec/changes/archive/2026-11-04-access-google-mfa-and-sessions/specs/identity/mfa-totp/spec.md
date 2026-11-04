# Spec Delta

## Purpose

Defines a time-based one-time-password second factor: how a user enrolls one, how a sign-in is held at the second step until a valid code or backup code is presented, and how the factor is removed.

## ADDED Requirements

### Requirement: Enroll a TOTP second factor

The system SHALL enroll a TOTP second factor for the signed-in account after the account password is confirmed, SHALL return an authenticator URI and a set of single-use backup codes exactly once, and SHALL NOT enable the factor until a valid code from the new secret is presented.

#### Scenario: Enrollment returns the secret once

- **WHEN** a signed-in user submits the correct password to `POST /v1/auth/mfa/enroll`
- **THEN** the response contains a TOTP URI for an authenticator application and a list of backup codes, the account is not yet protected by the factor, and no later response repeats those values

#### Scenario: Wrong password is refused

- **WHEN** a signed-in user submits a wrong password to the enrollment endpoint
- **THEN** the request is rejected with `422 VALIDATION_FAILED`, no secret is created, and no backup code is issued

#### Scenario: Enrollment code confirms the factor

- **WHEN** the user submits a valid current code from the enrolled secret to `POST /v1/auth/mfa/verify`
- **THEN** the account's second factor becomes active, a session is returned, and an audit entry records the enrollment

#### Scenario: Invalid enrollment code

- **WHEN** the user submits an invalid code to the enrollment verification step
- **THEN** the request is rejected with `401 UNAUTHENTICATED`, the factor stays inactive, and no secret or code appears in any log or audit row

### Requirement: Second factor holds the sign-in

The system SHALL withhold a session from a password sign-in when the account has an active second factor, and SHALL issue one only after a valid TOTP code or an unused backup code is verified for that sign-in attempt.

#### Scenario: Sign-in returns a challenge, not a session

- **WHEN** an account with an active second factor signs in with the correct password
- **THEN** the response contains `mfa_required` and an opaque `mfa_challenge`, contains no session token, and no session row exists for that attempt

#### Scenario: Valid code completes the sign-in

- **WHEN** the client submits the challenge with a valid current code
- **THEN** the response contains a session token and the account summary, and one audit entry records the successful second-factor verification

#### Scenario: Code is single-use per challenge

- **WHEN** the same challenge is submitted successfully and then submitted again
- **THEN** the second attempt is rejected with `401 UNAUTHENTICATED`, and the session issued by the first attempt still works

#### Scenario: A tampered challenge is refused

- **WHEN** a client submits a challenge value that was modified or was not issued by this system
- **THEN** the request is rejected with `401 UNAUTHENTICATED` and no session is created

#### Scenario: Backup code completes the sign-in once

- **WHEN** the client submits an unused backup code for the challenge
- **THEN** a session is issued and that backup code is refused on any later use

### Requirement: Second-factor attempts are rate-limited

The system SHALL limit repeated second-factor verification attempts for one challenge and for one account, and SHALL NOT let a locked-out account keep guessing.

#### Scenario: Repeated wrong codes

- **WHEN** more attempts than the configured per-challenge allowance are made with wrong codes
- **THEN** further attempts on that challenge are rejected, and the client must start a new sign-in

#### Scenario: Account lockout after repeated failures

- **WHEN** consecutive second-factor verifications fail beyond the account allowance
- **THEN** verification for that account is locked until the lockout window expires, and the rejection still reveals no secret material

### Requirement: Disable the second factor

The system SHALL remove the second factor only after the account password is confirmed, and SHALL record the removal as an audit entry.

#### Scenario: Disable with the password

- **WHEN** a signed-in user with an active second factor submits the correct password to `POST /v1/auth/mfa/disable`
- **THEN** the factor and its backup codes are deleted, the next password sign-in returns a session without a challenge, and one audit entry records the removal

#### Scenario: Disable with a wrong password

- **WHEN** a signed-in user submits a wrong password to the disable endpoint
- **THEN** the request is rejected with `422 VALIDATION_FAILED` and the second factor stays active

### Requirement: No secret material is disclosed or logged

The system SHALL keep the shared secret, the TOTP URI, the submitted codes, and the backup codes out of logs, audit metadata, error bodies, and every response after enrollment.

#### Scenario: Audit and logs carry no secret

- **WHEN** any enrollment, verification, failure, or disable completes
- **THEN** no log line or audit metadata contains a TOTP secret, a submitted code, a backup code, or a TOTP URI
