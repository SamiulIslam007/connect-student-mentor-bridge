# Spec Delta

## MODIFIED Requirements

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
