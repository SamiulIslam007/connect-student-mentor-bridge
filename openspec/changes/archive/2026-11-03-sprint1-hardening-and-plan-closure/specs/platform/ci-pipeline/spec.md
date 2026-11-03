# Spec Delta

## ADDED Requirements

### Requirement: CI runs the database integration tests

The required `checks` job SHALL start a PostgreSQL service, create the `connect_test` database, and set `DATABASE_URL` before `pnpm test`. The API integration tests SHALL run against that database and SHALL NOT skip because no database is configured when `CI` is set.

#### Scenario: The checks job reaches the test database

- **WHEN** the `checks` job runs
- **THEN** `connect_test` exists, `DATABASE_URL` points at the service, and `pnpm test` reports zero skipped API tests

#### Scenario: A missing database fails the CI job

- **WHEN** `CI=true` and the test database is unreachable
- **THEN** the test run fails with a clear connection error instead of skipping the suite

#### Scenario: Required check names stay stable

- **WHEN** the workflow is compared with the `protect-main` ruleset
- **THEN** the job names are still `checks`, `images`, and `security`

#### Scenario: Local runs keep the loud skip

- **WHEN** a contributor runs `pnpm test` outside CI without a reachable test database
- **THEN** the integration tests skip with the reason printed, and the run exits 0
