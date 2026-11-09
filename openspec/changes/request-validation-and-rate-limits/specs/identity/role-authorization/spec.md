# Spec Delta

## MODIFIED Requirements

### Requirement: Roles are resolved per request

The system SHALL read the acting account's active role assignments from the database on every authenticated request, SHALL NOT accept a role from a token, a header, a request body, or a client cookie, and SHALL apply a revocation immediately.

#### Scenario: Revocation takes effect on the next request

- **WHEN** a role assignment is revoked while a session is live
- **THEN** the next request that requires that role is refused, with no re-sign-in needed

#### Scenario: A body-supplied role is ignored

- **WHEN** a request body contains a `role`, `roles`, or `actor_role` property
- **THEN** the response is `422` naming that property, nothing is read or written under the named role, and the request is otherwise decided from the stored assignments
