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

### Requirement: Privileged sessions have idle and absolute limits

A session for `PLATFORM_ADMIN` or `INSTITUTION_ADMIN` SHALL expire after 30 minutes without a request and SHALL never outlive 12 hours from creation; a request after either limit SHALL answer `401 SESSION_EXPIRED` and the row SHALL be revoked. Student and mentor sessions keep the existing 30-day policy.

#### Scenario: An idle admin session expires

- **WHEN** an admin session has made no request for more than 30 minutes
- **THEN** its next request is `401 SESSION_EXPIRED`, no handler runs, and the row is revoked

#### Scenario: An old admin session expires even when active

- **WHEN** an admin session was created more than 12 hours ago
- **THEN** its next request is `401 SESSION_EXPIRED`, whatever its last-seen time

#### Scenario: A fresh admin session works

- **WHEN** an admin session is inside both limits
- **THEN** the request proceeds normally

#### Scenario: A student or mentor keeps the long policy

- **WHEN** a student or mentor session is older than the admin idle limit
- **THEN** it continues under the documented 30-day policy

#### Scenario: The numbers are configuration

- **WHEN** the configured idle or absolute value changes
- **THEN** the next request is evaluated against the new value without a code change
