# institutions/affiliation-seed Specification

## Purpose

Supplies the institution and email-domain reference data that affiliation verification depends on, seeded idempotently so local and future deployed environments start from the same known rows.

## Requirements

### Requirement: Idempotent institution seed

The system SHALL provide a repeatable seed that inserts institution and institution-domain reference rows from a checked-in source, and running it twice SHALL leave the same rows without duplicates.

#### Scenario: First run

- **WHEN** the seed runs against an empty database
- **THEN** every institution in the source exists once, each with its registered domains, and a rerun reports no inserts

#### Scenario: Second run

- **WHEN** the seed runs again with unchanged source data
- **THEN** the row counts and values are identical and no constraint violation occurs

### Requirement: Email domains are unique and case-insensitive

Each institution email domain SHALL be stored once across the whole table and SHALL match case-insensitively.

#### Scenario: Duplicate domain in source

- **WHEN** the seed source lists the same domain for two institutions, or the same domain with different letter case
- **THEN** the seed fails loudly with the conflicting domain named, and the transaction leaves no partial rows
