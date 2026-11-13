# Spec Delta

## ADDED Requirements

### Requirement: A data export is audited

The system SHALL append exactly one `DATA_EXPORTED` audit entry inside the same transaction that produces the export and records its `privacy_requests` row, naming the caller as both actor and object, and SHALL write nothing when the export cannot be produced.

#### Scenario: An export appends one entry

- **WHEN** a signed-in account exports its data
- **THEN** one `DATA_EXPORTED` row exists with that account as actor and object, the request's identifier, and no personal data in its metadata

#### Scenario: The entry is not inside its own document

- **WHEN** the exported document is read
- **THEN** its audit section does not contain the `DATA_EXPORTED` row that the same call appends

#### Scenario: A failed export leaves neither row

- **WHEN** the audit insert fails
- **THEN** the transaction rolls back, so no `privacy_requests` row and no `DATA_EXPORTED` row remain
