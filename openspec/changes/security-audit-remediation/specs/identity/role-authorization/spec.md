# Spec Delta

## ADDED Requirements

### Requirement: Mentor routes require a second factor

Every mentor-only state-changing route SHALL require an enrolled second factor and SHALL refuse with `403 MFA_REQUIRED` when the account has no active factor; the role alone SHALL continue to grant no visibility, activation or discoverability.

#### Scenario: An unenrolled mentor is refused

- **WHEN** a mentor without an enrolled factor sends a message, schedules a session, completes a mentorship, or confirms or disputes an outcome
- **THEN** the response is `403 MFA_REQUIRED`, no row or email is written, and no state changes

#### Scenario: An enrolled mentor proceeds

- **WHEN** the same mentor has an active factor
- **THEN** the route behaves exactly as it does today

#### Scenario: The role alone still grants nothing

- **WHEN** an account holds the mentor role but has no profile, affiliation or factor
- **THEN** it remains invisible to students, appears in no list and can receive no request

#### Scenario: The policy has one source

- **WHEN** a new mentor route is added
- **THEN** a test fails unless the route declares the second-factor requirement

### Requirement: Role grants are atomic and attributable

A role grant SHALL write the assignment, its `ROLE_GRANTED` audit row and any activation sync in one transaction, SHALL record the acting role rather than `USER`, and SHALL refuse a platform admin granting institution-admin scope to their own account with `403 SELF_GRANT_FORBIDDEN`.

#### Scenario: A failed audit rolls the grant back

- **WHEN** the audit insert fails during a grant
- **THEN** no assignment exists, no activation changed, and the caller receives a generic server error

#### Scenario: The actor role is true

- **WHEN** a platform admin grants another account the institution-admin role
- **THEN** the audit row records `PLATFORM_ADMIN` as the actor role and the target account as the object

#### Scenario: Self-grant of institution scope is refused

- **WHEN** a platform admin names their own email as the institution-admin target
- **THEN** the response is `403 SELF_GRANT_FORBIDDEN` and no assignment is written

#### Scenario: A repeat is still idempotent

- **WHEN** the same grant is attempted twice
- **THEN** one assignment and one audit row exist, and the second response is the same success
