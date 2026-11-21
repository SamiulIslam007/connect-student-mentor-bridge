# Spec Delta

## ADDED Requirements

### Requirement: Actions are pinned and package releases age

Every third-party GitHub Action SHALL be referenced by a full commit SHA with a comment naming its version, and the workspace SHALL set a minimum package-release age, block exotic subdependencies and record a trust policy or its documented equivalent. A dependency or action update SHALL be reviewed like code.

#### Scenario: A tag reference fails the policy

- **WHEN** an action is referenced by a mutable tag
- **THEN** the CI policy test fails and names the action and line

#### Scenario: A SHA reference passes

- **WHEN** every action is a full SHA
- **THEN** the policy test passes, and the comment still names the human-readable version

#### Scenario: A new release waits out the age

- **WHEN** a package version is younger than the configured minimum age
- **THEN** install refuses it unless the change records a vulnerability exception

#### Scenario: A compromised dependency cannot execute an install script

- **WHEN** a dependency declares an install script that is not explicitly allowed
- **THEN** the install fails and names the package

#### Scenario: The image scan still blocks

- **WHEN** a built image carries a HIGH or CRITICAL finding
- **THEN** the existing image job fails the run
