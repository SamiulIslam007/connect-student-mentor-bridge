# Spec Delta

## MODIFIED Requirements

### Requirement: Account status is readable but not self-assigned

The system SHALL expose the account status to its owner through `GET /v1/me`, and SHALL not let a user set `account_status` except through the deactivation transition in `identity/account-status-lifecycle`.

#### Scenario: Owner reads the account status

- **WHEN** a signed-in user calls `GET /v1/me`
- **THEN** the response contains that account's id, display name, email, verification state, `account_status`, and timezone, and no other user's data

#### Scenario: Account status is not readable without a session

- **WHEN** `GET /v1/me` is called with no valid session
- **THEN** it is rejected with `401` and returns no account data

#### Scenario: User attempts to set status

- **WHEN** a request tries to set `account_status` during registration or profile update
- **THEN** the submitted value is ignored, the stored status stays `PENDING`, and no error is raised for the extra field

#### Scenario: Only the deactivation transition changes status

- **WHEN** a signed-in user attempts any status value other than the deactivation transition
- **THEN** the value is ignored and the stored status is unchanged
