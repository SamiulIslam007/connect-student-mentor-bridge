# platform/request-validation Specification

## Purpose
One input boundary for the API: every route accepts only the properties its contract documents, refuses anything else with a field-naming validation error, and never lets a body-supplied identifier or role influence whose data is read or written.

## Requirements

### Requirement: Unknown body properties are refused

The system SHALL reject any top-level request body property that the route's documented request schema does not define, SHALL answer `422` with code `VALIDATION_FAILED` and a field error naming the offending property, and SHALL NOT write, queue, or audit anything for that request.

#### Scenario: An undocumented property is refused

- **WHEN** a request body carries a property outside the route's documented schema
- **THEN** the response is `422` naming that property and no row, event, email, or audit entry is written

#### Scenario: A documented accepted no-op still succeeds

- **WHEN** a profile or registration body carries `account_status`, which the contract documents as accepted and ignored
- **THEN** the request succeeds, the value has no effect, and no validation error is raised for it

#### Scenario: A clean body is unaffected

- **WHEN** a request body carries exactly the documented properties
- **THEN** the request behaves as the route describes, including its existing `422` field validations for wrong values

### Requirement: A body-supplied identity is refused, not applied

The system SHALL resolve the acting account from the session only, SHALL refuse a body property that names an account, a profile, a student, a mentor, a field, or a role that the route does not document, and SHALL refuse rather than silently ignore it.

#### Scenario: An actor id in the body is refused

- **WHEN** a body carries `user_id`, `student_id`, `mentor_id`, `role`, `roles`, or `actor_role` on a route that does not document it
- **THEN** the response is `422` naming the property, and the caller's own account is unchanged because nothing was written

#### Scenario: No route trusts a body identifier

- **WHEN** any route resolves the subject of a read or write
- **THEN** the subject comes from the session, and a contract test asserts that no request schema declares an account identifier property except where the route path already carries it

### Requirement: The body bound is enforced at the API boundary

The system SHALL refuse a request body above the configured size limit with `413` before parsing it into an object, so a large body cannot reach a controller.

#### Scenario: An oversized body is refused

- **WHEN** a request declares a body larger than the configured limit
- **THEN** the response is `413` and no controller or service is invoked

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
