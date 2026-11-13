# Spec Delta

## ADDED Requirements

### Requirement: An institution admin is assigned by email from the institution page

The system SHALL let a platform admin with an enrolled second factor assign the `INSTITUTION_ADMIN` role for one institution by submitting an email address, SHALL refuse an address that belongs to no account with a field error naming the email, and SHALL NOT send an invitation or create an account.

#### Scenario: An existing account is granted the role

- **WHEN** a platform admin submits the email of a registered account for one institution
- **THEN** the response names `INSTITUTION_ADMIN`, one role assignment row exists scoped to that institution, and one audit row names the acting admin

#### Scenario: An email with no account is refused

- **WHEN** the submitted email belongs to no account
- **THEN** the response is `422 VALIDATION_FAILED` naming `email`, no role assignment is written, and no invitation is sent

#### Scenario: The role stays scoped to one institution

- **WHEN** an admin is assigned to institution A
- **THEN** the attestation queue and the institution list of institution B remain unreadable to that account

#### Scenario: A caller without the role is refused

- **WHEN** a mentor, a student, or an institution admin calls the assignment route
- **THEN** the response is `403` and no role assignment is written

#### Scenario: The page offers the control per institution

- **WHEN** the institution page renders with at least one institution
- **THEN** each row offers an email field and a submit for the assignment, and the page shows the returned roles on success and a readable error on refusal
