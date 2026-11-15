# Spec Delta

## ADDED Requirements

### Requirement: Configuration is stored as immutable versions

The system SHALL store every configuration version as an immutable row carrying a monotonically increasing version number, one payload of the runtime tunables, a digest of that payload, the reason it was created and the account that created it, and SHALL seed version 1 from the values in force when the table is created.

#### Scenario: Version 1 exists after the migration

- **WHEN** the migration that creates the table has run
- **THEN** exactly one version exists, its number is `1`, and its payload carries the cooling period, the difficulty weights, the tier multipliers, the contribution multipliers and the audit sample rate in force before the change

#### Scenario: A new version is appended, never edited

- **WHEN** a new version is created
- **THEN** its number is one greater than the highest existing number, the earlier rows are unchanged, and its digest matches its payload

#### Scenario: The active version is the highest

- **WHEN** any reader asks for the active configuration
- **THEN** it receives the row with the highest number, its payload and its digest

#### Scenario: An empty table is not a valid state

- **WHEN** the table has no rows
- **THEN** the readers report that no configuration is active rather than inventing one, and a job that needs one does not run

### Requirement: Only a platform admin with a second factor changes configuration

The system SHALL allow an account holding `PLATFORM_ADMIN` with an enrolled second factor to read the current version and its history and to create the next version, SHALL require a stated reason of a bounded length, SHALL append exactly one `CONFIGURATION_CHANGED` audit entry in the same transaction, and SHALL refuse every other caller.

#### Scenario: A version is created and audited

- **WHEN** a platform admin with an enrolled second factor posts a valid payload with a reason
- **THEN** the response is `201` with the new version, exactly one audit entry with action `CONFIGURATION_CHANGED` exists, and the previous version is unchanged

#### Scenario: The history is readable

- **WHEN** a platform admin reads the configuration
- **THEN** the response carries the active version and the earlier versions newest first, each with its number, digest, reason and creator, and no other account can read them

#### Scenario: A caller without the role is refused

- **WHEN** a student, a mentor or an institution admin calls either route
- **THEN** the response is `403` with code `ROLE_REQUIRED`, no audit entry is written and nothing changes

#### Scenario: A platform admin without a second factor is refused

- **WHEN** a platform admin with no enrolled second factor calls either route
- **THEN** the response is `403` with code `MFA_REQUIRED`, no audit entry is written and nothing changes

#### Scenario: A missing reason is refused

- **WHEN** the request carries no reason or a reason that is empty after trimming
- **THEN** the response is `422` naming the field, no version is created and no audit entry is written

#### Scenario: An out-of-range value is refused

- **WHEN** the payload sets a cooling period, a multiplier or a rate outside its documented range
- **THEN** the response is `422` naming the offending field, no version is created and no audit entry is written

#### Scenario: An undocumented payload key is refused

- **WHEN** the payload carries a top-level key the contract does not document
- **THEN** the response is `422` naming that key and nothing is created

### Requirement: The audit log filters the configuration change

`CONFIGURATION_CHANGED` SHALL be an action every writer may store and every reader may filter, so an admin can list configuration changes from the audit log.

#### Scenario: A configuration change is filterable

- **WHEN** a platform admin filters `GET /v1/admin/audit` by `CONFIGURATION_CHANGED`
- **THEN** the response is `200` and carries the rows for each version created since the change landed
