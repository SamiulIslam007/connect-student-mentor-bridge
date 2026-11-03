# trust/consent-and-audit-records Specification

## Purpose

Records the two trust artifacts every account must produce from its first interaction — append-only consent decisions and append-only audit entries for authentication events — so consent and accountability exist before any mentorship activity does.

## Requirements

### Requirement: Consent recorded at registration

Registration SHALL write an append-only consent record for the terms of service and one for the privacy notice, each naming the document version shown to the user.

#### Scenario: Registration writes consent records

- **WHEN** a visitor completes registration
- **THEN** two `GRANTED` consent records exist for that user with distinct purposes, the same document version, and the time of consent

#### Scenario: Registration rejected writes no consent

- **WHEN** registration fails validation, the age gate, or duplicate email
- **THEN** no consent record is written for that attempt

### Requirement: Consent records are append-only

Stored consent records SHALL never be updated or deleted by application code, and a later decision SHALL be expressed as a new record.

#### Scenario: Update is refused

- **WHEN** application code attempts to update or delete an existing consent record
- **THEN** the database refuses the operation and the original row is unchanged

### Requirement: Authentication events are audited

The system SHALL append an audit entry for registration, email verification, account activation, sign-in success, sign-in failure, password reset request, password reset completion, self-deactivation, suspension, sign-out, and sign-out-everywhere, each carrying the time, the acting user when known, the action, the affected object, and the request identifier. A refused sign-up SHALL produce no audit entry that names the submitted address.

#### Scenario: Successful sign-in

- **WHEN** a user signs in successfully
- **THEN** one audit entry is appended with that user as actor and the session as the affected object

#### Scenario: Failed sign-in leaks nothing

- **WHEN** a sign-in attempt fails
- **THEN** an audit entry is appended with no acting user and metadata containing no password, hash, token, or raw email address

#### Scenario: Suspension is attributable

- **WHEN** an account is suspended
- **THEN** one audit entry is appended naming the sanctioning actor, the suspended account, and the reason, and no session token appears in its metadata

#### Scenario: Activation is recorded once

- **WHEN** an account becomes `ACTIVE` through email verification
- **THEN** one activation entry is appended, and reopening the same verification link appends no second entry

### Requirement: Audit entries are append-only

Audit entries SHALL be insert-only: no application path SHALL update or delete an existing entry.

#### Scenario: Application role cannot rewrite history

- **WHEN** application code attempts to update or delete an audit entry
- **THEN** the database refuses the operation and the original entry is unchanged

### Requirement: Audit write failures fail closed

If the success audit entry cannot be written after the identity library created a session, the system SHALL revoke that session before returning the server error, so no live session is left behind by a failed sign-in response.

#### Scenario: Audit failure leaves no live session

- **WHEN** the `SIGN_IN_SUCCEEDED` insert fails after the session row was created
- **THEN** the new session is revoked, the response is a generic `500`, and the token cannot authenticate a later request

#### Scenario: A failed revocation is logged, not hidden

- **WHEN** the session revocation also fails
- **THEN** the failure is logged with the request id and the response is still a generic `500`

### Requirement: Audit writes carry the request identifier

Every audit entry SHALL carry the request identifier of the request that caused it, including entries written from identity-library callbacks. Activation and reactivation entries written during sign-in SHALL carry the same request id as the sign-in response.

#### Scenario: Reactivation audit is correlated

- **WHEN** a deactivated account signs in and is reactivated
- **THEN** its `ACCOUNT_ACTIVATED` entry's `request_id` equals the response `X-Request-Id`

#### Scenario: Verification audit is correlated

- **WHEN** a verification link is opened
- **THEN** the `EMAIL_VERIFIED` and `ACCOUNT_ACTIVATED` entries share that request's id

### Requirement: Append-only deletion is restricted

A user referenced by an audit or consent row SHALL NOT be hard-deleted. The foreign keys from `audit_logs` and `consent_records` to `users` SHALL use `ON DELETE RESTRICT`, and user deletion SHALL be implemented as pseudonymization in the privacy change.

#### Scenario: Deleting a referenced user is refused

- **WHEN** an owner deletes a `users` row referenced by an audit or consent row
- **THEN** the database refuses the delete and both rows remain unchanged

#### Scenario: The restriction is not a trigger

- **WHEN** the schema is inspected
- **THEN** the append-only guarantee is the `connect_app` grant set plus `ON DELETE RESTRICT`, with no trigger performing the same job
