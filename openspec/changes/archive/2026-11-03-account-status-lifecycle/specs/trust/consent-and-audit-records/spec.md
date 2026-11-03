# Spec Delta

## MODIFIED Requirements

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
