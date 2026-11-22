# platform/observability Specification

## Purpose
Defines the diagnostic data the API may write to a response, a log or an error report, so an outage can be investigated without copying personal data, SQL parameters or credentials into a second system.

## Requirements

### Requirement: A server error carries bounded diagnostics

A `500` response SHALL keep the standard problem shape with a request id and a generic code, and its server log SHALL name the route, method, request id and an error class, and SHALL NOT include SQL text, query parameters, a token, a query string, a message body or an evidence body.

#### Scenario: A database failure logs no SQL

- **WHEN** a Drizzle query fails while accepting a request
- **THEN** the log carries the request id and `api.request_failed`, and the SQL text and parameter array are absent

#### Scenario: The response is unchanged

- **WHEN** the same failure reaches the client
- **THEN** the body is the standard `INTERNAL_ERROR` problem, with no stack, SQL, token or account detail

#### Scenario: A token URL is redacted

- **WHEN** a verification or reset route fails and its URL carries a token
- **THEN** the logged path contains no query string and no token

#### Scenario: The log is useful

- **WHEN** an operator reads the line
- **THEN** the route, method, request id and a bounded error class identify where to look

### Requirement: Error reports scrub exception values and contexts

The error-reporting hook SHALL scrub exception values, stack-frame variables, `contexts`, `tags`, `extra`, breadcrumb data and `user.username` in addition to headers, cookies, request data and the query string, and SHALL keep the report useful enough to identify the failing route and error class.

#### Scenario: An exception value is scrubbed

- **WHEN** an error message contains a token or a SQL parameter
- **THEN** the captured event has the value replaced and the original string appears nowhere in the serialized event

#### Scenario: Context and tags are scrubbed

- **WHEN** extra context or a tag carries an email, a message or a token
- **THEN** the captured event replaces it and keeps the non-personal keys

#### Scenario: The username is removed

- **WHEN** the event carries `user.username`
- **THEN** it is removed, together with the existing email and IP removal

#### Scenario: The scrubber is tested directly

- **WHEN** the pure scrub test runs a Drizzle-shaped error and a token URL
- **THEN** the serialized result contains neither value and the test fails if one field is removed from the scrub list

#### Scenario: A report without a DSN stays inert

- **WHEN** no DSN is configured
- **THEN** no report is sent and the existing behavior is unchanged
