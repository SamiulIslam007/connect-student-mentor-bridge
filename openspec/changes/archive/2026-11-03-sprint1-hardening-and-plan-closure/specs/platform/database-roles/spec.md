# Spec Delta

## Purpose

Defines the database roles the application uses, the exact privileges each holds, and how the append-only ledger stays insert-only without granting the application role ownership.

## ADDED Requirements

### Requirement: Application role can use every application table

The database SHALL provide a non-owner application role, `connect_app`, with exactly `SELECT`, `INSERT`, `UPDATE`, and `DELETE` on `fields`, `student_profiles`, `student_field_interests`, `mentor_profiles`, and `mentor_fields`, in addition to the tables granted by the baseline migration.

#### Scenario: All four operations succeed on every profile table

- **WHEN** a test runs `SET ROLE connect_app` and performs `SELECT`, `INSERT`, `UPDATE`, and `DELETE` on each of the five profile tables
- **THEN** every operation succeeds and the rows are visible to the owner role

#### Scenario: A table outside the grant set is refused

- **WHEN** `connect_app` attempts an operation on a table it was not granted
- **THEN** the database refuses the operation with a permission error

### Requirement: Append-only tables stay insert-and-select only

`connect_app` SHALL have `SELECT` and `INSERT`, and SHALL NOT have `UPDATE` or `DELETE`, on `consent_records` and `audit_logs`.

#### Scenario: Consent and audit inserts succeed

- **WHEN** `connect_app` inserts a consent row and an audit row
- **THEN** both inserts succeed and the rows are readable

#### Scenario: Consent and audit rewrites are refused

- **WHEN** `connect_app` attempts `UPDATE` or `DELETE` on `consent_records` or `audit_logs`
- **THEN** the database refuses the operation and the original rows are unchanged

### Requirement: The application role is not a login role

`connect_app` SHALL be `NOLOGIN`. A deployed environment SHALL create a login role, grant `connect_app` to it, and connect the API and worker with that login role. Local development MAY connect as the database owner.

#### Scenario: The application role cannot log in directly

- **WHEN** a client attempts to authenticate as `connect_app`
- **THEN** the database refuses the connection

#### Scenario: A login role with membership can use the grants

- **WHEN** a login role is granted `connect_app` and connects with it
- **THEN** the application tables are usable under the inherited grants

#### Scenario: The deployment step is documented

- **WHEN** an operator reads `docs/local-setup.md`
- **THEN** the login-role and membership step is stated, and the document warns against using the database owner outside local development

### Requirement: Ledger deletion is restricted

Every foreign key from an append-only table to `users` SHALL use `ON DELETE RESTRICT`, so a user with ledger rows cannot be hard-deleted.

#### Scenario: Deleting a user with an audit row fails

- **WHEN** an owner deletes a `users` row that is referenced by `audit_logs.actor_user_id`
- **THEN** the delete fails with a foreign-key violation and both rows remain

#### Scenario: Deleting a user with a consent row fails

- **WHEN** an owner deletes a `users` row that is referenced by `consent_records.user_id`
- **THEN** the delete fails with a foreign-key violation and both rows remain

#### Scenario: Pseudonymization is the deletion path

- **WHEN** a user requests deletion
- **THEN** the privacy change pseudonymizes the user instead of hard-deleting a row with ledger references
