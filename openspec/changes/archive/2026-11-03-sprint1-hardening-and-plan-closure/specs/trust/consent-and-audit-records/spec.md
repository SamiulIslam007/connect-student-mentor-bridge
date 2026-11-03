# Spec Delta

## ADDED Requirements

### Requirement: Audit write failures fail closed

If the success audit entry cannot be written after the identity library created a session, the system SHALL revoke that session before returning the server error, so no live session is left behind by a failed sign-in response.

#### Scenario: Audit failure leaves no live session

- **WHEN** the `SIGN_IN_SUCCEEDED` insert fails after the session row was created
- **THEN** the new session is revoked, the response is a generic `500`, and the token cannot authenticate a later request

#### Scenario: A failed revocation is logged, not hidden

- **WHEN** the session revocation also fails
- **THEN** the failure is logged with the request id and the response is still a generic `500`

### Requirement: Audit writes carry the request identifier

Every audit entry SHALL carry the request identifier of the request that caused it, including entries written from identity-library callbacks. Activation and reactivation entries written during sign-in SHALL carry the same request id as the sign-in response.

#### Scenario: Reactivation audit is correlated

- **WHEN** a deactivated account signs in and is reactivated
- **THEN** its `ACCOUNT_ACTIVATED` entry's `request_id` equals the response `X-Request-Id`

#### Scenario: Verification audit is correlated

- **WHEN** a verification link is opened
- **THEN** the `EMAIL_VERIFIED` and `ACCOUNT_ACTIVATED` entries share that request's id

### Requirement: Append-only deletion is restricted

A user referenced by an audit or consent row SHALL NOT be hard-deleted. The foreign keys from `audit_logs` and `consent_records` to `users` SHALL use `ON DELETE RESTRICT`, and user deletion SHALL be implemented as pseudonymization in the privacy change.

#### Scenario: Deleting a referenced user is refused

- **WHEN** an owner deletes a `users` row referenced by an audit or consent row
- **THEN** the database refuses the delete and both rows remain unchanged

#### Scenario: The restriction is not a trigger

- **WHEN** the schema is inspected
- **THEN** the append-only guarantee is the `connect_app` grant set plus `ON DELETE RESTRICT`, with no trigger performing the same job
