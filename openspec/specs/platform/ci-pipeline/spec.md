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
