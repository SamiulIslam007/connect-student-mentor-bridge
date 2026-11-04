# identity/session-management Specification

## Purpose
Gives a signed-in account visibility of, and control over, its own active sessions so a lost or leaked device can be cut off without signing out of everything.

## Requirements

### Requirement: List own sessions

The system SHALL list the caller's own unexpired sessions with safe metadata only, and SHALL never return a session token, a token hash, or another account's session.

#### Scenario: List returns own active sessions

- **WHEN** a signed-in user requests their session list
- **THEN** the response lists only that account's unexpired sessions, each with an id, creation time, last-seen time, expiry, and the recorded client metadata, and marks which one is the caller's current session

#### Scenario: Expired sessions are omitted

- **WHEN** one of the account's session rows has an expiry in the past
- **THEN** that row does not appear in the list

#### Scenario: No token in the response

- **WHEN** the list is returned
- **THEN** no response field contains a session token value or a token hash

#### Scenario: Another account sees nothing of it

- **WHEN** a second account requests its own session list
- **THEN** the first account's sessions do not appear

### Requirement: Revoke one session idempotently

The system SHALL revoke one of the caller's own sessions by id, SHALL treat a repeated or already-expired revocation as success, and SHALL NOT reveal whether another account's session id exists.

#### Scenario: Revoke an active session

- **WHEN** the caller revokes another of their own active session ids
- **THEN** that session row is deleted, its next request is rejected with `401`, and one audit entry records the revocation

#### Scenario: Revoke twice

- **WHEN** the caller repeats the revocation of the same session id
- **THEN** the response is the same success status, no second audit entry is written, and no error is returned

#### Scenario: Revoke an expired session

- **WHEN** the caller revokes one of their own sessions that has already expired
- **THEN** the response is a success and no error is returned

#### Scenario: Revoke another account's session

- **WHEN** the caller revokes a session id that belongs to a different account
- **THEN** the response is `404 NOT_FOUND`, that session is unchanged, and no audit entry names it

#### Scenario: Revoking the current session is allowed

- **WHEN** the caller revokes the session id they are currently using
- **THEN** the response is a success, the session ends, and the caller's next request is rejected with `401`
