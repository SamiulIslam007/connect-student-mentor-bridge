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

### Requirement: A confirmed outcome is selected for audit before it counts

The system SHALL select `CONFIRMED` outcomes for audit by a configured sample rate, SHALL hold every selected outcome through the existing audit-hold action before its cooling period ends, SHALL append exactly one audit entry per hold, and SHALL leave every unselected outcome on its normal counting path.

#### Scenario: A sampled outcome is held before it counts

- **WHEN** the sampling job runs and an outcome in `CONFIRMED` with an unexpired cooling period is selected
- **THEN** its status is `IN_PLATFORM_REVIEW`, one `CASE_OPENED` event and one `OUTCOME_AUDIT_HELD` audit entry exist for it, and the counting job no longer sees it

#### Scenario: A cooled outcome is never considered

- **WHEN** an outcome's cooling period has already ended
- **THEN** the job does not select it, and its counting is unaffected

#### Scenario: A counted outcome is never pulled back

- **WHEN** the job evaluates an outcome in `COUNTED`
- **THEN** nothing is written, and the existing `COUNTED` state and its ledger rows are unchanged

#### Scenario: A selected outcome costs the mentor nothing until a reviewer decides

- **WHEN** an outcome is held for audit
- **THEN** no reputation event exists for it, and it earns reputation only if a reviewer decides it valid

### Requirement: The audit sample is deterministic and idempotent

The selection SHALL be a stable function of the outcome id, so the same outcome is always in or out, and a repeated or concurrent run SHALL write no second event, audit entry or status change for an outcome it already held.

#### Scenario: The draw is stable for the same outcome

- **WHEN** the same outcome is evaluated by two runs of the job
- **THEN** both runs reach the same in-or-out answer

#### Scenario: A second run holds nothing twice

- **WHEN** the job runs again after a selected outcome was held
- **THEN** no second event, no second audit entry and no status change are written for it

#### Scenario: A raced decision leaves the outcome as the other actor left it

- **WHEN** the outcome changes state between the job's select and its hold
- **THEN** the hold is refused with `409 OUTCOME_INVALID_STATE`, the batch continues with the next outcome, and nothing is written for the raced one

### Requirement: The always-sampled outcome types are held on every run

While every reputation difficulty weight is a placeholder, the system SHALL always select `ADMISSION`, `INTERNSHIP` and `JOB_OFFER` outcomes for audit, independently of the sample rate.

#### Scenario: An always-sampled outcome type is always held

- **WHEN** a `CONFIRMED` `ADMISSION`, `INTERNSHIP` or `JOB_OFFER` outcome with an unexpired cooling period exists
- **THEN** it is held on the next run regardless of the random draw

#### Scenario: The rate does not apply to those types

- **WHEN** the sample rate is set to `0`
- **THEN** an always-sampled type is still selected and held

### Requirement: The review queue reports and filters the kind of case

The review queue SHALL report a `case_kind` of `mentor_dispute`, `conflict_of_interest`, `escalated_d7` or `audit_hold` for every open case, SHALL accept one optional `case_kind` filter, and SHALL refuse an unknown kind with `422` rather than returning an empty page.

#### Scenario: A held-for-audit case is reported as an audit hold

- **WHEN** a platform admin reads the queue containing a case opened by the audit hold
- **THEN** that case carries `case_kind` `audit_hold`, not `escalated_d7`

#### Scenario: The filter narrows the page

- **WHEN** a platform admin reads the queue with `case_kind=audit_hold`
- **THEN** every returned case has that kind and no case of another kind appears

#### Scenario: The unfiltered queue is unchanged

- **WHEN** a platform admin reads the queue with no filter
- **THEN** the same cases, order and keyset cursor behaviour as before this change apply

#### Scenario: An unknown kind is refused

- **WHEN** the filter names a value outside the four kinds
- **THEN** the response is `422` naming the parameter, and no page is returned

#### Scenario: The filter needs the same authority as the queue

- **WHEN** a student, a mentor or an institution admin calls the filtered queue
- **THEN** the response is `403` with code `ROLE_REQUIRED`, exactly as the unfiltered route answers

#### Scenario: The action a hold writes is filterable in the audit log

- **WHEN** a platform admin filters `GET /v1/admin/audit` by `OUTCOME_AUDIT_HELD`
- **THEN** the response is `200` and carries the hold rows, so the sampler's effect is visible without a new action name

### Requirement: A reviewer is never a participant

The system SHALL refuse a platform review decision with `403 OUTCOME_REVIEW_CONFLICT` when the acting platform admin is the outcome's student or its mentor, SHALL write one `PERMISSION_DENIED` audit row for the attempt, and SHALL NOT change the status, the ledger, a verification record, or an email.

#### Scenario: The student cannot review their own outcome

- **WHEN** the platform admin who is the outcome's student submits a review decision
- **THEN** the response is `403 OUTCOME_REVIEW_CONFLICT`, the status is unchanged, and one denial row names that admin and the outcome

#### Scenario: The mentor cannot review their own outcome

- **WHEN** the platform admin who is the outcome's mentor submits a review decision
- **THEN** the response is `403 OUTCOME_REVIEW_CONFLICT` and no verification or ledger row is written

#### Scenario: An unrelated admin still decides

- **WHEN** a platform admin who is neither participant decides a case with a valid reason
- **THEN** the existing review path proceeds unchanged

#### Scenario: The check is inside the transaction

- **WHEN** the outcome's participants change between the read and the decision
- **THEN** the decision is evaluated against the locked row and either succeeds once or refuses with the conflict code

#### Scenario: The refusal is auditable

- **WHEN** a participant admin is refused
- **THEN** exactly one `PERMISSION_DENIED` row carries the admin, the outcome and the request id, and no `OUTCOME_REVIEWED` row exists
