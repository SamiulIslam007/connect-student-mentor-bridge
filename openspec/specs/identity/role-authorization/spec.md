# identity/role-authorization Specification

## Purpose
Gives the platform a stored, auditable answer to "which roles does this account hold", resolves those roles on every request rather than trusting a token, and gives every privileged route one refusal path — so a role can be granted, checked, and enforced consistently before mentor activation depends on it.

## Requirements

### Requirement: Roles are stored as assignments

The system SHALL store every role as a row in `role_assignments` (`user_id`, `role`, optional `institution_id`, `granted_by_user_id`, `granted_at`, `revoked_at`), SHALL allow at most one active row per (`user_id`, `role`, `institution_id`), and SHALL revoke a role by setting `revoked_at` rather than deleting the row.

#### Scenario: One active row per role

- **WHEN** a grant is attempted for a role the account already holds actively at the same scope
- **THEN** no second row is created and the existing row is unchanged

#### Scenario: Revoked history is kept

- **WHEN** a role assignment is revoked
- **THEN** the row remains with a `revoked_at` value, and the role no longer authorizes anything

#### Scenario: Every account has a default role

- **WHEN** a new account is registered successfully
- **THEN** one `STUDENT` assignment is written in the same transaction as the consent rows, the age-gate fields, and the `USER_REGISTERED` audit entry, so an account never exists without a role

### Requirement: The mentor role is self-service opt-in

The system SHALL grant the `MENTOR` role through `POST /v1/me/roles/mentor` for the calling account only, SHALL be idempotent, SHALL write one `ROLE_GRANTED` audit entry on an actual grant, and SHALL NOT make the account discoverable, active, or visible in any way.

#### Scenario: First grant

- **WHEN** a signed-in account without the mentor role calls the endpoint
- **THEN** one `MENTOR` assignment is created for that account and one `ROLE_GRANTED` audit entry is written

#### Scenario: Repeated grant

- **WHEN** the same account calls the endpoint again
- **THEN** the response is the same success, no second assignment is created, and no second audit entry is written

#### Scenario: The role alone grants nothing

- **WHEN** an account holds the mentor role with no mentor profile, no affiliation, and no second factor
- **THEN** no other account or role can see it, it appears in no list, and it can receive no request

#### Scenario: Another account's roles cannot be granted

- **WHEN** a request attempts to grant a role for a different user id
- **THEN** the request is refused and no assignment is written

### Requirement: Roles are resolved per request

The system SHALL read the acting account's active role assignments from the database on every authenticated request, SHALL NOT accept a role from a token, a header, a request body, or a client cookie, and SHALL apply a revocation immediately.

#### Scenario: Revocation takes effect on the next request

- **WHEN** a role assignment is revoked while a session is live
- **THEN** the next request that requires that role is refused, with no re-sign-in needed

#### Scenario: A body-supplied role is ignored

- **WHEN** a request body contains a `role`, `roles`, or `actor_role` property
- **THEN** the response is `422` naming that property, nothing is read or written under the named role, and the request is otherwise decided from the stored assignments

### Requirement: The role guard refuses without the role

The system SHALL expose one authorization path that resolves the acting account and its roles and refuses with `403 ROLE_REQUIRED` when the required role is absent, when the role set is empty, or when no assignment exists for the required scope.

#### Scenario: Missing role

- **WHEN** an account without the required role calls a role-gated endpoint
- **THEN** the response is `403` with code `ROLE_REQUIRED`, no data is read or written, and no audit entry claims the action happened

#### Scenario: No roles at all

- **WHEN** an account with no active assignment calls a role-gated endpoint
- **THEN** the response is `403 ROLE_REQUIRED` — an empty role set is a refusal, never a pass

#### Scenario: Institution-scoped role at the wrong institution

- **WHEN** an account holds an institution-scoped role for one institution and calls an endpoint that requires that role at another institution
- **THEN** the response is `403 ROLE_REQUIRED`

#### Scenario: Ungated endpoints keep working

- **WHEN** an account holding only `STUDENT` calls an endpoint that requires no role
- **THEN** the request is processed as before, and no role check changes its response

### Requirement: The second factor requirement is keyed on the role

The system SHALL provide a pure policy that answers whether a role requires an enrolled second factor (`MENTOR`, `INSTITUTION_ADMIN`, `PLATFORM_ADMIN` require it; `STUDENT` and `EMPLOYER` do not), SHALL let a route declare that requirement, and SHALL refuse a route flagged that way with `403 MFA_REQUIRED` when the account has no active factor. Granting a role SHALL NOT gate sign-in, the account page, or the profile pages.

#### Scenario: Policy answers per role

- **WHEN** the policy is asked about each of the five roles
- **THEN** the mentor and both admin roles require a factor and the student and employer roles do not

#### Scenario: A flagged route refuses without a factor

- **WHEN** an account with the required role but no enrolled factor calls a route flagged as MFA-requiring
- **THEN** the response is `403` with code `MFA_REQUIRED` and no data is written

#### Scenario: A flagged route serves an enrolled account

- **WHEN** an account with the required role and an active factor calls a route flagged as MFA-requiring
- **THEN** the request proceeds

#### Scenario: Granting a role does not lock the account out

- **WHEN** an account is granted the mentor role and has not enrolled a factor
- **THEN** it can still sign in, read its account, and save its student profile

### Requirement: The caller can see its own roles

`GET /v1/me` SHALL include the caller's active roles, and SHALL NOT expose any other account's roles.

#### Scenario: Roles are returned

- **WHEN** a signed-in account reads `GET /v1/me`
- **THEN** the response includes its active roles, in a stable order

#### Scenario: No other account's roles

- **WHEN** two accounts read `GET /v1/me`
- **THEN** each response contains only its own roles
