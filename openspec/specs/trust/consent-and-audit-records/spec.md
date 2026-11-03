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

The system SHALL append an audit entry for registration, email verification, sign-in success, sign-in failure, password reset request, password reset completion, and sign-out-everywhere, each carrying the time, the acting user when known, the action, the affected object, and the request identifier.

#### Scenario: Successful sign-in

- **WHEN** a user signs in successfully
- **THEN** one audit entry is appended with that user as actor and the session as the affected object

#### Scenario: Failed sign-in leaks nothing

- **WHEN** a sign-in attempt fails
- **THEN** an audit entry is appended with no acting user and metadata containing no password, hash, token, or raw email address

### Requirement: Audit entries are append-only

Audit entries SHALL be insert-only: no application path SHALL update or delete an existing entry.

#### Scenario: Application role cannot rewrite history

- **WHEN** application code attempts to update or delete an audit entry
- **THEN** the database refuses the operation and the original entry is unchanged
