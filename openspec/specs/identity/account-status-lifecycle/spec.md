# identity/account-status-lifecycle Specification

## Purpose

Defines how an account moves between `PENDING`, `ACTIVE`, `SUSPENDED`, and `DEACTIVATED`, what each movement does to existing sessions, and which sign-up attempts are refused because of an earlier under-18 block.

## Requirements

### Requirement: Activation on email verification

Opening a valid verification link SHALL move an account from `PENDING` to `ACTIVE`, and activation SHALL apply only to a `PENDING` account.

#### Scenario: Verification activates the account

- **WHEN** a `PENDING` account opens a valid verification link
- **THEN** its `account_status` becomes `ACTIVE` and a later sign-in with the correct password succeeds

#### Scenario: Activation is idempotent

- **WHEN** the same verification link is opened a second time
- **THEN** the account stays `ACTIVE`, no other account changes, and no second activation is recorded

#### Scenario: Activation never reverses another state

- **WHEN** activation is applied to an account that is `SUSPENDED`, `DEACTIVATED`, `DELETION_PENDING`, or `ANONYMIZED`
- **THEN** the status does not change to `ACTIVE` and the existing sessions are not restored

### Requirement: Sign-in requires an active account

The system SHALL evaluate account status only after the submitted password is accepted, and SHALL refuse sign-in unless the status is `ACTIVE`.

#### Scenario: Unverified account refused

- **WHEN** a `PENDING` account submits the correct password
- **THEN** the request is refused with `403` and code `EMAIL_NOT_VERIFIED`, and no session row is created

#### Scenario: Suspended account refused

- **WHEN** a `SUSPENDED` account submits the correct password
- **THEN** the request is refused with `403` and code `ACCOUNT_SUSPENDED`, and no session row is created

#### Scenario: Status is not revealed to a wrong password

- **WHEN** a `SUSPENDED` account submits a wrong password
- **THEN** the response is the same `401` body returned for an unknown email, with no status information

#### Scenario: Any other non-active status refused

- **WHEN** an account in `DELETION_PENDING` or `ANONYMIZED` submits the correct password
- **THEN** the request is refused with `403` and no session row is created

### Requirement: Suspension revokes every session

Suspending an account SHALL set its status to `SUSPENDED` and revoke every session row for that account in the same transaction.

#### Scenario: Existing session stops working

- **WHEN** an account is suspended while one of its sessions is still open
- **THEN** the next request with that session is rejected with `401`, even though the token has not expired

#### Scenario: Session revocation and status change are atomic

- **WHEN** the suspension write fails partway
- **THEN** neither the status change nor the session revocation is visible, and the account keeps its previous status and sessions

#### Scenario: Suspension needs no user action

- **WHEN** a suspended account takes any authenticated action
- **THEN** the action is refused because every session was already revoked, and the refusal does not require a separate status check per endpoint

### Requirement: Self-deactivation revokes every session

A signed-in user SHALL be able to deactivate their own account, which SHALL set the status to `DEACTIVATED` and revoke every session row for that account.

#### Scenario: User deactivates

- **WHEN** a signed-in user calls `POST /v1/me/deactivate`
- **THEN** the status becomes `DEACTIVATED`, every session for that account fails on its next request, and the response confirms the change

#### Scenario: Deactivation is not available without a session

- **WHEN** the deactivation request carries no valid session
- **THEN** it is rejected with `401` and no status changes

#### Scenario: Deactivation hides the profile

- **WHEN** an account is `DEACTIVATED`
- **THEN** no endpoint returns its profile data to another user

### Requirement: Deactivation is reversible by signing in

A `DEACTIVATED` account that signs in with the correct password SHALL return to `ACTIVE` and be granted a session. (Owner-confirmed 2026-11-03; D-36.)

#### Scenario: Signing in after deactivation

- **WHEN** a `DEACTIVATED` account submits the correct password
- **THEN** the status becomes `ACTIVE`, a new session is created, and a sign-in success is recorded

#### Scenario: Wrong password after deactivation

- **WHEN** a `DEACTIVATED` account submits a wrong password
- **THEN** the request is refused with `401` and the status stays `DEACTIVATED`

### Requirement: Blocked email refuses registration

Registration SHALL refuse an email that has an unexpired `signup_blocks` entry, and the refusal SHALL happen before the age gate is evaluated.

#### Scenario: Blocked email refused

- **WHEN** a visitor registers with an email that has an unexpired block entry, whatever date of birth is submitted
- **THEN** registration is refused with `422` and code `UNDER_MINIMUM_AGE`, and no account, consent record, or audit entry for a registration is written

#### Scenario: Expired block allows registration

- **WHEN** a visitor registers with an email whose block entry has expired
- **THEN** registration proceeds normally, subject to the age gate

#### Scenario: Block check stores no address

- **WHEN** the block check runs
- **THEN** it compares a keyed hash of the submitted email and neither reads nor writes a plaintext address

### Requirement: The account status is the only activation state

Email verification and the age gate SHALL stay separate fields, and `account_status` SHALL NOT gain a value for verification progress.

#### Scenario: Status enum unchanged

- **WHEN** the schema and the documented enum are compared after this change
- **THEN** `account_status` holds exactly `PENDING`, `ACTIVE`, `SUSPENDED`, `DEACTIVATED`, `DELETION_PENDING`, and `ANONYMIZED`

### Requirement: Verified-PENDING repair at sign-in

When a verified account is still `PENDING` because its activation write failed, a successful password sign-in SHALL repair it to `ACTIVE` and grant the session, without reviving a suspended or anonymized account.

#### Scenario: Repair activates the account

- **WHEN** an account with `email_verified = true` and `status = PENDING` submits the correct password
- **THEN** the status becomes `ACTIVE`, one session is created, and one `ACCOUNT_ACTIVATED` entry with `from_status: PENDING` is appended

#### Scenario: Repair is idempotent

- **WHEN** the same repaired account signs in again
- **THEN** no second activation is written and the session is created normally

#### Scenario: Repair never revives a suspended account

- **WHEN** a `SUSPENDED` account submits the correct password
- **THEN** it stays `SUSPENDED`, no session is created, and no activation entry is written

#### Scenario: Repair activation is correlated

- **WHEN** a repair activation happens during sign-in
- **THEN** its audit entry carries the same request id as the sign-in response
