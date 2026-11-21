# platform/ci-pipeline Specification

## Purpose

Defines the automated checks that every change must pass before it can be merged, so lint, types, tests, builds, image builds, and security scans are enforced by the repository rather than by convention.

## Requirements

### Requirement: Every pull request runs the full check suite

CI SHALL run on every pull request and on every push to the default branch, performing a frozen-lockfile install, lint, type-check, unit tests, and a production build of every workspace member, and SHALL fail the run when any step fails.

#### Scenario: Clean change passes

- **WHEN** a pull request changes source and every workspace command succeeds
- **THEN** the run reports success and all checks are green

#### Scenario: Failing check blocks the change

- **WHEN** lint, type-check, a unit test, or a build fails
- **THEN** the run fails and the failing step is identifiable in the log

#### Scenario: Lockfile drift is rejected

- **WHEN** a dependency is added or changed without updating the lockfile
- **THEN** the install step fails instead of resolving a different dependency tree

### Requirement: CI builds the deployable images

CI SHALL build the web image and the API image from the same definitions the local stack uses, and SHALL fail when an image cannot be built.

#### Scenario: Image build failure fails the run

- **WHEN** a Dockerfile or its build context is broken
- **THEN** CI fails on the image build step rather than only on application checks

### Requirement: CI scans dependencies, images, and secrets

CI SHALL scan dependency vulnerabilities, scan the built images for vulnerabilities, and scan the change for committed secrets. A finding at the configured blocking severity SHALL fail the run and name the affected package, image layer, or file.

#### Scenario: Known vulnerable dependency is reported

- **WHEN** a dependency with an advisory at or above the configured blocking severity is present
- **THEN** the dependency scan fails and names the package and advisory

#### Scenario: Committed credential is blocked

- **WHEN** a change contains a credential or private key
- **THEN** the secret scan fails and names the file without printing the secret value

### Requirement: Green CI is required to merge

The default branch SHALL require the CI checks to pass before a merge, and SHALL not accept a direct push that bypasses review.

#### Scenario: Red run cannot merge

- **WHEN** a pull request has a failing required check
- **THEN** the branch protection rule prevents merging

#### Scenario: Agents cannot merge to the default branch

- **WHEN** an automated agent completes work on a feature branch
- **THEN** it can commit and open a pull request but cannot push to or merge the default branch

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

### Requirement: CI runs one end-to-end path through a browser

CI SHALL run, on every pull request and on every push to the default branch, one end-to-end test that drives a real browser against a running web app and API, covering sign-up, email verification, a structured request, a mentor decision, a thread message, an outcome report and a mentor confirmation, and SHALL fail the run when that test fails.

#### Scenario: The path runs on every change

- **WHEN** a pull request is opened against the default branch
- **THEN** an `e2e` job runs the browser path against a freshly started stack and reports its own result, separate from the unit and contract suites

#### Scenario: A failure in the browser path fails the run

- **WHEN** any step of the path fails in the browser
- **THEN** the job fails, names the step, and attaches a screenshot and a trace to the run

#### Scenario: The path proves the counted outcome

- **WHEN** the path reaches the mentor's confirmation
- **THEN** the student's reported outcome appears as counted on the mentor's impact read, so the test fails if the reputation path silently stops counting

#### Scenario: The path refuses a non-test database

- **WHEN** the configured database name does not end in `_test`
- **THEN** the suite refuses to start and no browser is launched, so a misdirected run cannot write into a development database
