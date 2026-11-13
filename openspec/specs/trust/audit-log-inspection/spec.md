# trust/audit-log-inspection Specification

## Purpose
Lets a platform admin read the append-only audit log by actor, action, object and time, so an incident or a dispute can be reviewed from the product rather than from a database console.

## Requirements

### Requirement: A platform admin with a second factor reads the audit log

The system SHALL serve the audit log to a caller holding `PLATFORM_ADMIN` with an enrolled second factor, SHALL refuse every other caller with the same refusal as the other admin routes, and SHALL NOT accept the read from a session without an enrolled second factor.

#### Scenario: A platform admin reads the log

- **WHEN** a platform admin with an enrolled second factor requests the audit log
- **THEN** the response is `200` with a page of entries ordered by occurrence time descending, then by id descending

#### Scenario: A mentor is refused

- **WHEN** a mentor requests the audit log
- **THEN** the response is `403` and no entry is returned

#### Scenario: An institution admin is refused

- **WHEN** an institution admin requests the audit log
- **THEN** the response is `403 ROLE_REQUIRED` and no entry is returned

#### Scenario: A platform admin without a second factor is refused

- **WHEN** a platform admin with no enrolled second factor requests the audit log
- **THEN** the response is `403 MFA_REQUIRED` and no entry is returned

### Requirement: The read projection excludes free text the log holds

The response SHALL carry, per entry, its id, its occurrence time, the acting account id, the acting role, the action, the object type, the object id, the request id, the break-glass flag and the reason, and SHALL NOT carry the metadata object, the hash chain fields, or any request body.

#### Scenario: The key set is fixed

- **WHEN** any page of the response is read
- **THEN** every entry carries exactly the ten documented keys and no metadata key

#### Scenario: A break-glass row is identifiable

- **WHEN** a thread break-glass read appears in the page
- **THEN** its entry carries the break-glass flag true and the reason text that was stated

#### Scenario: No request body appears

- **WHEN** an entry for a profile save is read
- **THEN** the entry carries no profile field value and no message body

### Requirement: The log is filtered by actor, action, object and time

The system SHALL accept optional `actor`, `action`, `object_type`, `object_id`, `from` and `to` filters and combine them with AND, SHALL refuse a value outside the documented sets with a field error, SHALL paginate by keyset with a default of 50 and a maximum of 100 entries, and SHALL return a cursor only when more entries exist.

#### Scenario: Two filters combine

- **WHEN** the caller filters by one actor and one action
- **THEN** every returned entry carries both, and an entry with either alone is absent

#### Scenario: A date range bounds the page

- **WHEN** the caller filters from one instant to another
- **THEN** every returned entry occurred inside that range

#### Scenario: An unknown action is refused

- **WHEN** the action filter names a value outside the documented set
- **THEN** the response is `422 VALIDATION_FAILED` naming the parameter and no page is returned

#### Scenario: Pagination is stable while rows are appended

- **WHEN** a page is read, an audited action occurs, and the next page is read with the returned cursor
- **THEN** no entry from the first page appears again and no older entry is skipped

### Requirement: Reading the log writes nothing

The read SHALL append no audit entry and SHALL write no row of any kind.

#### Scenario: A read leaves the table unchanged

- **WHEN** an admin reads two pages of the log
- **THEN** the row count and the newest entry are the same before and after

#### Scenario: The reading is not itself recorded

- **WHEN** the log is read and then filtered by the action that would record a read
- **THEN** no entry exists for the read
