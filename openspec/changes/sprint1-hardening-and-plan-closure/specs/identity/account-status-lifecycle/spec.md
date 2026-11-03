# Spec Delta

## ADDED Requirements

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
