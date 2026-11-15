# Spec Delta

## ADDED Requirements

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
