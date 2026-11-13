# Spec Delta

## ADDED Requirements

### Requirement: A denial on a sensitive action is audited

The system SHALL append one `PERMISSION_DENIED` audit entry when a caller is refused on a platform-admin or institution-admin route, naming the caller, the required role and the route, and SHALL append none for a refusal on any other role route.

#### Scenario: A missing second factor is recorded

- **WHEN** a platform admin without an enrolled second factor calls an admin route
- **THEN** the response is `403 MFA_REQUIRED` and one `PERMISSION_DENIED` row names that account and that route

#### Scenario: A missing admin role is recorded

- **WHEN** an account without the platform-admin role calls an admin route
- **THEN** the response is `403 ROLE_REQUIRED` and one `PERMISSION_DENIED` row names that account

#### Scenario: An ordinary role refusal is not recorded

- **WHEN** a mentor calls a student-only route and is refused
- **THEN** no `PERMISSION_DENIED` row is written

#### Scenario: A failed entry does not change the refusal

- **WHEN** the denial entry cannot be written
- **THEN** the `403` response is unchanged and the failure is logged with the request identifier

### Requirement: The readable action list matches the actions the writers emit

The audit read SHALL accept every action value any writer stores, so a filter names an existing action rather than a typo, and SHALL continue to refuse an unknown value with `422`.

#### Scenario: A warning is filterable

- **WHEN** an admin filters by `ACCOUNT_WARNED` or `ACCOUNT_REINSTATED`
- **THEN** the response is `200` with the matching rows

#### Scenario: A new action is filterable

- **WHEN** an admin filters by `DATA_EXPORTED` or `PERMISSION_DENIED`
- **THEN** the response is `200` with the matching rows

#### Scenario: An unknown action is still refused

- **WHEN** an admin filters by a value no writer stores
- **THEN** the response remains `422 VALIDATION_FAILED`
