# mentorship/request-lifecycle Specification

## Purpose

Turns a student's structured ask into a decision the mentor must make within 48 hours, with the eligibility, capacity, and timer rules that make the promise auditable rather than aspirational.

## Requirements

### Requirement: A request is a structured record

Creating a request SHALL require a mentor, a question, a context summary, a target outcome, and an expected timeframe, SHALL record the interaction type, and SHALL refuse missing or over-length fields with field-level errors.

#### Scenario: A valid request is created

- **WHEN** a student submits every required field within its bounds
- **THEN** one request exists in `PENDING` with `expires_at` 48 hours after creation, and the mentor's notification is queued once

#### Scenario: A required field is missing

- **WHEN** the question is absent
- **THEN** the response is `422` with a field error naming `question` and no request row is written

#### Scenario: Group office hours is refused

- **WHEN** the interaction type is `GROUP_OFFICE_HOURS`
- **THEN** the response is `422` and no request is written

#### Scenario: An over-length field is refused

- **WHEN** the context summary exceeds its documented maximum
- **THEN** the response is `422` with a field error and nothing is written

### Requirement: Only an operating, verified mentor can receive a request

Creation SHALL require the addressee to hold an `ACTIVE` mentor profile with a verified affiliation of at least Level 1, SHALL require the caller and the mentor to be different accounts, and SHALL refuse a mentor whose access mode is `PAUSED`.

#### Scenario: Mentor below Level 1

- **WHEN** a student requests a mentor with no verified affiliation
- **THEN** the response is `409 MENTOR_NOT_VERIFIED` and no request is written

#### Scenario: Paused mentor

- **WHEN** a student requests a mentor whose access mode is `PAUSED`
- **THEN** the response is `409 MENTOR_UNAVAILABLE` and no request is written

#### Scenario: Requesting oneself

- **WHEN** a mentor's own account requests that mentor
- **THEN** the response is `422` and no request is written

### Requirement: Capacity is counted and cannot be overshot

Slots in use SHALL be the count of the mentor's accepted requests decided within the last 7 days plus the mentor's `PENDING` requests, and creation and acceptance SHALL both refuse when slots in use would exceed the mentor's `weekly_capacity`. The count and the write SHALL happen under one row lock on the mentor profile.

#### Scenario: At capacity

- **WHEN** slots in use equal `weekly_capacity`
- **THEN** the response is `409 MENTOR_AT_CAPACITY` and no request is written

#### Scenario: Concurrent submissions

- **WHEN** two students submit to the same mentor at the same moment with one slot free
- **THEN** exactly one request is created and the other is refused with `MENTOR_AT_CAPACITY`

#### Scenario: A withdrawal frees the slot

- **WHEN** a `PENDING` request is withdrawn
- **THEN** the mentor's slots in use decrease by one

### Requirement: Duplicate and excessive requests are refused

The system SHALL allow at most one `PENDING` request per student and mentor pair, and at most 3 `PENDING` requests per student, and SHALL refuse a second submission of the same pending request without creating a row.

#### Scenario: Second pending request to the same mentor

- **WHEN** a student submits to a mentor who already has that student's pending request
- **THEN** the response is `409 DUPLICATE_PENDING_REQUEST` and the existing request is unchanged

#### Scenario: Third pending request

- **WHEN** a student with 3 pending requests submits a fourth
- **THEN** the response is `409 REQUEST_LIMIT_REACHED` and no request is written

### Requirement: A mentor decides a pending request exactly once

Accept and decline SHALL each apply to a `PENDING` request only, SHALL record the decision and its timestamp, SHALL move the request out of `PENDING` in a single conditional update, and SHALL queue exactly one email to the student. An accept SHALL also create exactly one mentorship for the request in the same transaction, and a decline SHALL create none.

#### Scenario: Accept

- **WHEN** the addressee accepts a pending request
- **THEN** the status is `ACCEPTED`, `decided_at` is set, and one email to the student is queued

#### Scenario: Decline with a reason

- **WHEN** the addressee declines with a reason
- **THEN** the status is `DECLINED`, the reason is stored as the decision note, and one email to the student is queued

#### Scenario: Deciding twice

- **WHEN** the addressee acts on a request that is no longer `PENDING`
- **THEN** the response is `409 REQUEST_INVALID_STATE` and nothing changes

#### Scenario: A non-addressee decides

- **WHEN** an account other than the addressee accepts or declines
- **THEN** the response is `403` and nothing changes

#### Scenario: Accept creates the mentorship

- **WHEN** the addressee accepts a pending request
- **THEN** exactly one mentorship exists for that request with status `ACTIVE`, the request id recorded, and the field copied from the request

#### Scenario: A failed mentorship insert leaves the request pending

- **WHEN** the mentorship insert fails while accepting
- **THEN** the transaction rolls back, the request status is still `PENDING`, and no email to the student is queued

#### Scenario: Decline creates no mentorship

- **WHEN** the addressee declines a pending request
- **THEN** no mentorship exists for that request

### Requirement: A student withdraws a pending request

The sender SHALL be able to withdraw a `PENDING` request, which moves it to `WITHDRAWN` and frees the mentor's slot.

#### Scenario: Withdraw

- **WHEN** the sender withdraws a pending request
- **THEN** the status is `WITHDRAWN` and the mentor's slot count decreases

#### Scenario: Withdraw a decided request

- **WHEN** the sender withdraws an `ACCEPTED` or `DECLINED` request
- **THEN** the response is `409 REQUEST_INVALID_STATE` and nothing changes

### Requirement: An ignored request is reminded once and then expires

An undecided request SHALL receive exactly one reminder 24 hours after creation and SHALL become `EXPIRED` 48 hours after creation, driven by a sweeper that is safe to run repeatedly.

#### Scenario: Reminder

- **WHEN** the sweeper runs after 24 hours on a still-`PENDING` request
- **THEN** one reminder email is queued once and `reminder_sent_at` is set

#### Scenario: Reminder runs twice

- **WHEN** the sweeper runs again on the same request
- **THEN** no second reminder is queued

#### Scenario: Expiry

- **WHEN** the sweeper runs after 48 hours on a still-`PENDING` request
- **THEN** the status is `EXPIRED` and exactly one expiry email is queued to the student

#### Scenario: A decided request is untouched by the timer

- **WHEN** the sweeper runs on a request that is `ACCEPTED`, `DECLINED`, or `WITHDRAWN`
- **THEN** its status and timestamps are unchanged

### Requirement: Only the participants can read a request

`GET /v1/requests` SHALL return the caller's own sent or received requests only, and a single request SHALL be readable only by its sender or addressee.

#### Scenario: Another account's request

- **WHEN** an unrelated account requests a request by id
- **THEN** the response is `404` and no content is disclosed
