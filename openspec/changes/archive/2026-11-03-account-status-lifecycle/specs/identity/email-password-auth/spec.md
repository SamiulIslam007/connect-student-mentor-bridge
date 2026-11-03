# Spec Delta

## MODIFIED Requirements

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

### Requirement: Sign-in and sign-out

The system SHALL authenticate with email and password, SHALL not reveal whether an email exists on failure, SHALL evaluate account status only after the password is accepted, and SHALL support signing out of the current session and of every session.

#### Scenario: Wrong password

- **WHEN** a user submits a valid email with a wrong password
- **THEN** the request is rejected with `401` and the same error body returned for an unknown email

#### Scenario: Non-active account refused after the password

- **WHEN** a user submits the correct password for an account whose status is not `ACTIVE` and is not `DEACTIVATED`
- **THEN** the request is refused with `403` and a status code, no session is created, and the refusal is distinguishable from a wrong password

#### Scenario: Sign-in reports the status

- **WHEN** an `ACTIVE` account signs in successfully
- **THEN** the response includes the account's `account_status` alongside the session, so the client never has to guess it

#### Scenario: Sign out everywhere

- **WHEN** a signed-in user chooses to sign out of all sessions
- **THEN** every session row for that user is revoked and each other session fails on its next request
