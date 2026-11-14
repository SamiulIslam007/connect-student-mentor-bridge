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

### Requirement: A request draft is kept on the device until it is sent or expires

While a student fills the request form, the web application SHALL keep the typed field values on the same device under a key that identifies the mentor profile, SHALL restore them when the form reopens for that mentor, SHALL discard and remove a draft older than twenty-four hours, and SHALL clear it after a successful send. Storage SHALL contain those field values only — never a session token, a password, or an email address.

#### Scenario: A draft survives a reload

- **WHEN** a student types into the request form and reloads the page for the same mentor
- **THEN** the question, context summary, target outcome, timeframe, interaction type and application note are restored exactly as typed

#### Scenario: A draft is scoped to one mentor

- **WHEN** a draft was written for one mentor and the form opens for a different mentor
- **THEN** no field is restored from the other mentor's draft

#### Scenario: A successful send clears the draft

- **WHEN** the request is created and the response is a success
- **THEN** the stored draft for that mentor no longer exists

#### Scenario: A failed send keeps the draft

- **WHEN** the send fails with a validation or server error
- **THEN** the stored draft is unchanged and the page still shows the typed values

#### Scenario: A stale draft is discarded

- **WHEN** the stored draft is older than twenty-four hours
- **THEN** its values are not restored and the stored entry is removed

#### Scenario: Signing out removes drafts

- **WHEN** the user signs out
- **THEN** no request draft remains in browser storage

#### Scenario: Storage holds no credential

- **WHEN** the stored draft is read back
- **THEN** it contains the form field values only, and no access token, refresh token, session value, password, or email address

### Requirement: A storage failure never blocks sending a request

The form SHALL treat an unavailable, throwing, or quota-exceeded store as a missing draft: it SHALL still collect and submit the request, SHALL show no error to the user for the storage failure alone, and SHALL NOT throw from the helper.

#### Scenario: Storage is unavailable

- **WHEN** browser storage is absent or every call throws
- **THEN** the form submits normally and no unhandled error reaches the user

#### Scenario: The store is full

- **WHEN** a write fails because the quota is exceeded
- **THEN** the value is not stored, the page keeps working, and the send still succeeds

#### Scenario: A malformed stored value

- **WHEN** the stored entry is not valid JSON or is missing required fields
- **THEN** it is ignored, the form opens empty, and the stored entry is removed

### Requirement: A request is refused when the mentor's account is not active

The request creation path SHALL refuse a request to a mentor whose account status is not `ACTIVE` with the existing `MENTOR_UNAVAILABLE` conflict, SHALL use that same answer for a suspension, a self-deactivation, and an anonymized account so no cause is disclosed, SHALL write no `mentorship_requests` row, and SHALL keep the existing validation answer for an id that names no mentor profile at all.

#### Scenario: A suspended mentor cannot receive a new request

- **WHEN** a student sends a valid request to a mentor whose profile is `ACTIVE` and whose account status is `SUSPENDED`
- **THEN** the response is `409 MENTOR_UNAVAILABLE`, no request row is written, and no notification is queued

#### Scenario: The refusal names no cause

- **WHEN** the request to a suspended mentor is refused
- **THEN** the problem title is the same one a paused mentor returns, and a body the request validation refuses for its own reason (group office hours, a self-request, a below-Level-1 affiliation) keeps its documented answer for an inactive account too, so the caller cannot tell a suspension from a pause or a deactivation

#### Scenario: An unknown mentor id keeps its own answer

- **WHEN** the request names an id that is not a mentor profile
- **THEN** the response remains `422 VALIDATION_FAILED` naming `mentor_id`

#### Scenario: The request context is not served for an inactive account

- **WHEN** a signed-in caller reads `GET /v1/mentors/{id}` for a mentor whose account status is not `ACTIVE`
- **THEN** the response is `404`, so the request form cannot be opened for that mentor

#### Scenario: A request already sent stays as it is

- **WHEN** a request was sent before the mentor was suspended
- **THEN** the request keeps its status, its 48-hour window, and its accept and decline paths, and only new requests are refused

### Requirement: A request expires when the mentor becomes ineligible

A request that is still `PENDING` when its mentor's account loses its last verified affiliation SHALL become `EXPIRED` with `expiry_reason = 'MENTOR_INELIGIBLE'`, SHALL queue one notice to the student naming that reason, and SHALL NOT count against the mentor's response reliability.

#### Scenario: The student is told why

- **WHEN** a pending request expires because the mentor lost Level 1
- **THEN** the student receives one queued notice that the request expired because the mentor is no longer verified, and `GET /v1/requests` shows the status `EXPIRED` with that reason

#### Scenario: The mentor is not penalised

- **WHEN** response reliability is computed after an eligibility expiry
- **THEN** that request is absent from both `requests_decided_in_time` and `requests_late_or_expired`

#### Scenario: A deadline expiry still counts

- **WHEN** a request expires at 48 hours with no decision
- **THEN** it carries `expiry_reason = 'DEADLINE'` and counts as a non-response exactly as it does today

#### Scenario: The slot is freed for the student

- **WHEN** a pending request expires for ineligibility
- **THEN** it no longer counts toward the student's three-request cap and the student may send a new request to another mentor
