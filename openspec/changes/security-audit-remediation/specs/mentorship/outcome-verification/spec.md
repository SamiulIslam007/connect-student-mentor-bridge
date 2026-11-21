# Spec Delta

## ADDED Requirements

### Requirement: Reporting is limited to a recently ended mentorship

The student SHALL report only while the mentorship is `ACTIVE` or `COMPLETED` and, for a completed mentorship, within 90 days of its ending instant; `occurred_on` SHALL be between the mentorship start date and today. A refusal SHALL be `409 MENTORSHIP_NOT_REPORTABLE` or `422 OCCURRED_ON_OUT_OF_RANGE` and SHALL write nothing.

#### Scenario: An active mentorship can report

- **WHEN** the mentorship is `ACTIVE` and the date is between its start and today
- **THEN** the outcome is created exactly as before

#### Scenario: A recently ended mentorship can report

- **WHEN** the mentorship is `COMPLETED` and ended within 90 days
- **THEN** the outcome is created

#### Scenario: An old mentorship cannot report

- **WHEN** the mentorship completed more than 90 days ago
- **THEN** the response is `409 MENTORSHIP_NOT_REPORTABLE` and no outcome, event or email is written

#### Scenario: A future date is refused

- **WHEN** `occurred_on` is tomorrow or later
- **THEN** the response is `422` naming `occurred_on` and no outcome is written

#### Scenario: A date before the start is refused

- **WHEN** `occurred_on` is earlier than the mentorship start date
- **THEN** the response is `422` and nothing is written

#### Scenario: The window is configuration

- **WHEN** the configured ending window changes
- **THEN** the next report is evaluated against the new value without a code change
