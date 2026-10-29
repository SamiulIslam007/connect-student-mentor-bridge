# Spec Delta

## Purpose

Defines the single TypeScript workspace in which the web app, the API and worker, and the shared packages are installed, built, checked, and tested with one set of root commands that behave the same on a contributor machine and in CI.

## ADDED Requirements

### Requirement: One root command set covers the whole workspace

The workspace SHALL provide root commands to install, build, lint, type-check, and test every app, service, and package in one invocation, and each command SHALL exit non-zero when any workspace member fails.

#### Scenario: Fresh checkout installs and checks

- **WHEN** a contributor runs the documented install command on a fresh checkout and then runs the build, lint, type-check, and test commands
- **THEN** every workspace member is covered and each command exits with status 0

#### Scenario: A failing member fails the root command

- **WHEN** any app, service, or package contains a lint error, a type error, or a failing test
- **THEN** the corresponding root command reports that member's failure and exits non-zero

#### Scenario: An app, service, or package is not silently skipped

- **WHEN** a new app, service, or package is added to the workspace
- **THEN** the root commands include it without requiring a new root configuration entry

### Requirement: Shared packages stay framework-free

`packages/domain` SHALL contain only pure business logic with no framework, database, HTTP, or app imports; `packages/contracts` SHALL hold the OpenAPI source and shared schemas; `packages/config` SHALL hold shared constants, formulas, and labels. No app or service SHALL import from another app or service.

#### Scenario: Framework import in the domain package is rejected

- **WHEN** `packages/domain` imports a web, API, or database framework
- **THEN** lint fails with the boundary violation named

#### Scenario: Cross-app import is rejected

- **WHEN** `apps/web` imports code from `services/api`, or the reverse
- **THEN** lint fails with the boundary violation named

### Requirement: Configuration is external and example-only in the repository

Every runtime variable SHALL be supplied through environment variables, and the repository SHALL contain a single `.env.example` that lists every required variable with no real values. No secrets, credentials, or real user data SHALL be committed.

#### Scenario: Contributor starts from the example

- **WHEN** a contributor copies `.env.example` to a local environment file and fills in local-only values
- **THEN** every variable the stack requires is present and documented

#### Scenario: A committed secret is rejected

- **WHEN** a commit adds a credential or real value in an environment file or in source
- **THEN** the secret scan fails the change before it can be merged
