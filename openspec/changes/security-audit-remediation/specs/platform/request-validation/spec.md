# Spec Delta

## ADDED Requirements

### Requirement: An evidence body is authenticated before it is buffered

The system SHALL authenticate and authorize an evidence upload before reading its body, SHALL scope the 5 MiB raw parser to the two evidence routes, SHALL refuse a body over 5 MiB with `413` without buffering it, and SHALL keep the 100 KiB JSON bound on every other route.

#### Scenario: An unauthenticated 5 MiB upload is refused before the body is read

- **WHEN** an anonymous caller sends a 5 MiB `image/png` body to an evidence completion route
- **THEN** the response is `401`, the body is not buffered, and no evidence row or object exists

#### Scenario: An oversize upload is refused at the edge

- **WHEN** any caller declares or streams a body larger than 5 MiB
- **THEN** the response is `413 PAYLOAD_TOO_LARGE` and no controller runs

#### Scenario: The authenticated bound still works

- **WHEN** the reporting student completes a valid upload at or below 5 MiB
- **THEN** the file is quarantined and the existing scan path runs unchanged

#### Scenario: The JSON bound is unchanged

- **WHEN** a non-evidence route receives a JSON body above 100 KiB
- **THEN** it is refused with `413` before parsing, exactly as before

#### Scenario: The BFF break-glass read is bounded

- **WHEN** a signed-in caller sends a break-glass body above 128 KiB
- **THEN** the BFF answers `413` and no clone of the body is held

### Requirement: Report details are bounded before persistence

A report's `details` SHALL be refused with `422 VALIDATION_FAILED` naming the field when it is longer than 2,000 characters, before the database check runs, and the refusal SHALL NOT log the report text or a SQL statement.

#### Scenario: An over-long report is a client error

- **WHEN** a caller submits 2,001 characters of `details`
- **THEN** the response is `422` naming `details`, no report row is written, and no `500` is logged

#### Scenario: The boundary is inclusive

- **WHEN** a caller submits exactly 2,000 characters
- **THEN** the report is created as before

#### Scenario: The refusal carries no content

- **WHEN** the over-long report is refused
- **THEN** the log line carries the request id and the field name, not the submitted text
