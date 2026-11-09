# mentorship/platform-review Specification

## Purpose
The platform review queue: the only way out of `IN_PLATFORM_REVIEW`, the reviewer's written decision, what both participants can read afterwards, and the clawback that reverses an already-counted outcome without editing history.

## Requirements

### Requirement: The review queue lists every open case for a platform admin

The system SHALL expose `GET /v1/review-queue` to an account holding `PLATFORM_ADMIN` with an enrolled second factor, SHALL return only outcomes in `IN_PLATFORM_REVIEW`, ordered oldest first by `mentor_decision_due_at`, and SHALL return per case the outcome id, mentorship id, outcome type, description, field, student name, mentor name, case kind, the reason that opened the case, when it opened, and how many days it has waited.

#### Scenario: An admin reads the queue

- **WHEN** a platform admin with an active second factor reads the queue
- **THEN** every outcome in `IN_PLATFORM_REVIEW` appears once, with its case kind and the reason that opened it

#### Scenario: Cases are ordered by age

- **WHEN** two cases are open
- **THEN** the one whose `mentor_decision_due_at` is earlier appears first, and a cursor returns the next page without repeating or skipping a case

#### Scenario: A non-admin is refused

- **WHEN** a student, a mentor, an institution admin, or an anonymous caller reads the queue
- **THEN** the response is `403` or `401` with no case data

#### Scenario: An admin without a second factor is refused

- **WHEN** a platform admin with no active second factor reads the queue or submits a decision
- **THEN** the response is `403 MFA_REQUIRED` and nothing is disclosed or written

### Requirement: A reviewer decides a case once, with a written reason

The system SHALL decide a case only through `POST /v1/outcomes/{id}/review` with `decision` of `valid` or `invalid` and a required `reason` of 1 to 1000 characters, SHALL move an outcome in `IN_PLATFORM_REVIEW` to `COUNTED` on `valid` and to `REJECTED` on `invalid`, SHALL refuse a missing or over-long reason with `422` and write nothing, and SHALL answer `409 OUTCOME_INVALID_STATE` for any state outside the listed transitions.

#### Scenario: A valid decision counts the outcome

- **WHEN** an admin decides `valid` on an outcome in `IN_PLATFORM_REVIEW`
- **THEN** the status is `COUNTED`, `counted_at` and `counted_basis = 'PLATFORM_DECISION'` are set, one `CASE_RESOLVED` outcome event and one `PLATFORM_DECISION` verification record carrying the reason are written, and one audit row and one queued email exist

#### Scenario: A platform-decided outcome earns no mentor reputation

- **WHEN** a `valid` decision counts an outcome
- **THEN** no `reputation_events` row is written for the mentor and its impact counts stay unchanged

#### Scenario: An invalid decision rejects the outcome

- **WHEN** an admin decides `invalid` on an outcome in `IN_PLATFORM_REVIEW`
- **THEN** the status is `REJECTED`, one `REJECTED` outcome event and one `PLATFORM_DECISION` verification record carrying the reason are written, and the outcome never counts

#### Scenario: A decision without a reason is refused

- **WHEN** the reason is absent, empty, or longer than 1000 characters
- **THEN** the response is `422` naming `reason`, and the outcome status, its events, and the ledger are unchanged

#### Scenario: A second decision is refused

- **WHEN** an admin submits a decision for an outcome that is no longer in a decidable state
- **THEN** the response is `409 OUTCOME_INVALID_STATE` and nothing is written

#### Scenario: A rejected outcome can be reported again

- **WHEN** the student reports a new outcome for the same mentorship after a `REJECTED` decision
- **THEN** the new report is accepted as a separate outcome, and the rejected row stays terminal and unchanged

### Requirement: Both participants read the decision and its reason

The system SHALL include every platform decision and its reason in the participant-facing outcome read, SHALL return it to the mentorship's student and mentor only, and SHALL label a platform-counted outcome as platform-decided.

#### Scenario: The student reads the decision

- **WHEN** the mentorship's student reads the outcome after a decision
- **THEN** the response carries the decision (`valid` or `invalid`), the reason, and the decision time

#### Scenario: A non-participant reads nothing

- **WHEN** an account that is neither participant reads the outcome
- **THEN** the response is `404` and no decision or reason is disclosed

### Requirement: A counted outcome can be clawed back without editing history

The system SHALL reverse an already `COUNTED` outcome through the same review route with `invalid`, SHALL set the status `REVERSED` and `reversed_at`, SHALL append one compensating `REVERSAL` reputation event carrying the negated points of the original event, SHALL decrement the affected field snapshot by one count and the same points, and SHALL NOT update or delete the original event.

#### Scenario: A clawback appends a compensating event

- **WHEN** an admin decides `invalid` on a `COUNTED` outcome
- **THEN** the status is `REVERSED`, the original `COUNTED` event is unchanged, exactly one `REVERSAL` event exists for the outcome with negative points, and the snapshot total has decreased by exactly that amount

#### Scenario: Replay still reproduces the snapshot after a reversal

- **WHEN** the snapshot is recomputed from the ledger after a reversal
- **THEN** every stored total matches the recomputed value, with the reversal subtracted

#### Scenario: A counted outcome cannot be "decided valid"

- **WHEN** an admin submits `valid` for an outcome that is already `COUNTED`
- **THEN** the response is `409 OUTCOME_INVALID_STATE` and nothing changes

#### Scenario: A reversal is not repeated

- **WHEN** a second `invalid` decision is submitted for the same reversed outcome
- **THEN** the response is `409 OUTCOME_INVALID_STATE`, no second `REVERSAL` event exists, and the snapshot is unchanged
