# Spec Delta

## ADDED Requirements

### Requirement: The product runs from an image CI produced

The system SHALL run in at least one deployed environment whose web, API and worker processes start from the same container images the CI pipeline built from the default branch, SHALL deploy only a commit whose checks passed, and SHALL run database migrations as a separate step that completes before the new application version takes traffic.

#### Scenario: A deployment starts from a tested image

- **WHEN** a release is deployed
- **THEN** the image tag matches a commit whose CI run is green, and no image built outside CI is deployed

#### Scenario: A failed migration stops the release

- **WHEN** the migration step fails
- **THEN** the new application version does not start and the previous version keeps serving

#### Scenario: The worker runs beside the API

- **WHEN** the environment is healthy
- **THEN** the worker process runs from the API image with its own command, and the outbox, the sweeps and the retention job are scheduled

### Requirement: Errors are reported with personal data removed

The system SHALL report unhandled errors from the web app, the API and the worker to an error-tracking service when a data source name is configured, SHALL leave every process fully functional when it is not, and SHALL remove authorization headers, cookies, message bodies, email bodies and evidence content from every report before it leaves the process.

#### Scenario: An error is reported

- **WHEN** an unhandled error occurs in any of the three processes with a configured data source name
- **THEN** one report reaches the tracker carrying the error, the environment and the release, and no token, cookie or message body

#### Scenario: No data source name is inert

- **WHEN** the data source name is absent, as in local development and CI
- **THEN** no report is sent and no process fails to start

#### Scenario: The scrub list is enforced

- **WHEN** an error carries a request whose headers include a session cookie and whose body includes a message
- **THEN** the report contains neither, and a test fails if either is present

### Requirement: Failure is noticed without a user reporting it

The system SHALL be monitored by an external check of the API's health endpoint and of the sign-in page at an interval of five minutes or less, SHALL alert the owner by email when either fails twice in a row, and SHALL document the check and the alert path in the runbook.

#### Scenario: An outage alerts

- **WHEN** the API's health endpoint fails twice in a row
- **THEN** an alert reaches the owner's configured address and the runbook's incident section names the check

#### Scenario: A recovery is visible

- **WHEN** the failing check recovers
- **THEN** the monitor records the recovery and no further alert is sent for that incident

### Requirement: Backups exist and a restore has been performed

The system SHALL back up the database daily with point-in-time recovery enabled, SHALL store evidence objects in a private bucket with its own retention, and SHALL have performed at least one restore from a backup into a scratch database before any real user is onboarded, recorded with the date, the duration, the result and the operator.

#### Scenario: A restore is recorded

- **WHEN** the restore drill has been performed
- **THEN** the runbook's record names the source, the target, the date, the duration, the operator and the verification that was run

#### Scenario: The restore is verified, not assumed

- **WHEN** a restore completes
- **THEN** row counts for three chosen tables and one read through the API match the source, and the comparison is recorded

#### Scenario: No record means not ready

- **WHEN** someone asks whether a restore has been performed and the record table is empty
- **THEN** the answer is no, and the gate that requires it stays unmet
