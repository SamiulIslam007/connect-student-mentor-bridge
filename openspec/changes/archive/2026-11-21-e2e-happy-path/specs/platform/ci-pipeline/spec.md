# Spec Delta

## ADDED Requirements

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
