# Spec Delta

## Purpose

Defines the minimal account record every new user gets at registration — display name, timezone, and account status — so later profile capabilities can extend it without redefining the account itself.

## ADDED Requirements

### Requirement: Account record created at registration

The system SHALL create one account record per registered user with a display name of 1 to 100 characters, a timezone defaulting to `Asia/Dhaka`, and `account_status = PENDING`.

#### Scenario: Unicode display name

- **WHEN** a user registers with a display name written in Bangla script
- **THEN** the account stores and returns the name unchanged, with no transliteration or lossy encoding

#### Scenario: Invalid display name

- **WHEN** a user registers with an empty display name or one longer than 100 characters
- **THEN** registration is rejected with a validation error and no account is created

### Requirement: No role profile at registration

Registration SHALL NOT create a student or mentor profile, and no endpoint SHALL expose profile fields beyond the account record itself until a later capability adds them.

#### Scenario: Registration leaves profiles empty

- **WHEN** a user completes registration
- **THEN** no student or mentor profile exists for that user and no profile endpoint returns data for them

### Requirement: Account status is readable but not self-assigned

The system SHALL expose the account status to the account owner and SHALL not let a user set or change their own `account_status`.

#### Scenario: User attempts to set status

- **WHEN** a request tries to set `account_status` during registration or profile update
- **THEN** the submitted value is ignored, the stored status stays `PENDING`, and no error is raised for the extra field
