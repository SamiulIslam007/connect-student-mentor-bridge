# Spec Delta

## MODIFIED Requirements

### Requirement: No role profile at registration

Registration SHALL NOT create a student or mentor profile. A profile SHALL be created only when its owner saves one, and a profile endpoint SHALL return only the caller's own profile data.

#### Scenario: Registration leaves profiles empty

- **WHEN** a user completes registration
- **THEN** no student or mentor profile exists for that user and `GET /v1/me` returns both profile properties as null

#### Scenario: A profile appears only after an explicit save

- **WHEN** the same user signs in and saves a student profile
- **THEN** that profile is returned by `GET /v1/me`, and no profile for any other account is created or changed

### Requirement: Account status is readable but not self-assigned

The system SHALL expose the account status to its owner through `GET /v1/me`, SHALL not let a user set `account_status` except through the deactivation transition in `identity/account-status-lifecycle`, and SHALL ignore any status value submitted with a profile save.

#### Scenario: Owner reads the account status

- **WHEN** a signed-in user calls `GET /v1/me`
- **THEN** the response contains that account's id, display name, email, verification state, `account_status`, and timezone, and no other user's data

#### Scenario: Account status is not readable without a session

- **WHEN** `GET /v1/me` is called with no valid session
- **THEN** it is rejected with `401` and returns no account data

#### Scenario: User attempts to set status

- **WHEN** a request tries to set `account_status` during registration
- **THEN** the submitted value is ignored, the stored status stays `PENDING`, and no error is raised for the extra field

#### Scenario: User attempts to set status through a profile save

- **WHEN** a signed-in user submits `account_status` with a student or mentor profile save
- **THEN** the submitted value is ignored, the stored status is unchanged, the profile is saved, and no error is raised for the extra field

#### Scenario: Only the deactivation transition changes status

- **WHEN** a signed-in user attempts any status value other than the deactivation transition
- **THEN** the value is ignored and the stored status is unchanged
