# mentorship/outcome-verification Specification

## Purpose
Turns a mentorship into a record of what it produced: a student's reported outcome, the mentor's separate confirmation of the fact and of the contribution, the dispute or conflict path that sends a case to platform review, and an append-only history of every step.

## Requirements

### Requirement: An outcome is a report against one mentorship

Reporting SHALL create one outcome in `PENDING_CONFIRMATION` carrying the mentorship id, the field copied from the mentorship, an outcome type, a required description, the student's claimed contribution level, and `mentor_decision_due_at` seven days after creation.

#### Scenario: A valid report is created

- **WHEN** the mentorship's student reports an outcome with a type, a description, and a claimed contribution level
- **THEN** one outcome exists in `PENDING_CONFIRMATION` with `mentor_decision_due_at` seven days ahead, one `REPORTED` event, and one email queued to the mentor

#### Scenario: The field comes from the mentorship

- **WHEN** the request body names a different field
- **THEN** the stored `field_id` is the mentorship's field and the body value has no effect

#### Scenario: A missing description is refused

- **WHEN** the description is absent or empty
- **THEN** the response is `422` with a field error naming `description` and no outcome row is written

#### Scenario: An unknown outcome type is refused

- **WHEN** the type is outside `ADMISSION`, `INTERNSHIP`, `JOB_OFFER`, `SKILL_MILESTONE`, `INTERVIEW`
- **THEN** the response is `422` and no outcome row is written

### Requirement: Only the mentorship's student reports an outcome

Only the mentorship's student SHALL report an outcome for that mentorship; the mentor and any third account SHALL receive `404`, and the body SHALL NOT be able to attach the outcome to another account's mentorship.

#### Scenario: The mentor cannot report

- **WHEN** the mentor of the mentorship submits the report
- **THEN** the response is `404` and no outcome row is written

#### Scenario: A third account cannot report

- **WHEN** an account that is neither participant names the mentorship
- **THEN** the response is `404` and nothing is disclosed

#### Scenario: A foreign id in the body has no effect

- **WHEN** the body carries a `student_id` naming another account
- **THEN** that property is ignored and the outcome belongs to the caller's own mentorship

### Requirement: The mentor confirms the fact and the contribution separately

The mentorship's mentor SHALL confirm an outcome in `PENDING_CONFIRMATION` by recording that it happened and a contribution level independently of the student's claim, which SHALL set `CONFIRMED`, `confirmed_at`, and `cooling_ends_at` and SHALL NOT set any counted state.

#### Scenario: Confirming sets the cooling deadline

- **WHEN** the mentor confirms a pending outcome
- **THEN** the status is `CONFIRMED`, `confirmed_at` is set, `cooling_ends_at` equals the confirmation time plus the configured cooling period, and no counted state or reputation row exists

#### Scenario: The confirmed contribution may differ from the claim

- **WHEN** the mentor confirms with a contribution level lower or higher than the student's claim
- **THEN** both values are stored separately and the response reports the mentor's value as the confirmed one

#### Scenario: Confirming twice is refused

- **WHEN** the mentor confirms an outcome that is no longer `PENDING_CONFIRMATION`
- **THEN** the response is `409 OUTCOME_INVALID_STATE` and nothing changes

#### Scenario: The student cannot confirm

- **WHEN** the student who reported the outcome calls confirm
- **THEN** the response is `404` and nothing changes

### Requirement: A dispute or a declared conflict opens platform review

The mentor SHALL dispute an outcome with a required reason, or declare a conflict of interest while confirming; either SHALL move the outcome to `IN_PLATFORM_REVIEW`, write a verification record carrying the reason, and set `coi_declared` when a conflict was named.

#### Scenario: A dispute enters review

- **WHEN** the mentor disputes a pending outcome with a reason
- **THEN** the status is `IN_PLATFORM_REVIEW`, one `MENTOR_DISPUTE` verification record carries the reason, and one email is queued to the student

#### Scenario: A dispute without a reason is refused

- **WHEN** the mentor disputes with an empty reason
- **THEN** the response is `422` naming `reason` and nothing changes

#### Scenario: A declared conflict is recorded and routed

- **WHEN** the mentor declares a relationship kind while confirming
- **THEN** the status is `IN_PLATFORM_REVIEW`, `coi_declared` is true, and the decision is not stored as a confirmation

#### Scenario: A reviewed outcome never earns reputation

- **WHEN** an outcome is in `IN_PLATFORM_REVIEW` because of a dispute or a declared conflict
- **THEN** the reputation-eligibility rule answers false for it, whatever a reviewer decides later

### Requirement: A platform-decided outcome never earns mentor reputation

An outcome whose basis is a platform decision SHALL NOT produce reputation for the mentor, even when a reviewer later finds it valid; it may count for the student's progress and for aggregates only, and reads SHALL label it as platform-decided.

#### Scenario: The eligibility rule refuses a platform decision

- **WHEN** the eligibility rule is asked about an outcome with a platform-decision basis
- **THEN** it answers false for the mentor

#### Scenario: Only a mentor confirmation without a conflict is eligible

- **WHEN** the rule is asked about an outcome the mentor confirmed and no conflict was declared
- **THEN** it answers true for the mentor

#### Scenario: A declared conflict blocks eligibility

- **WHEN** the rule is asked about an outcome with `coi_declared` true
- **THEN** it answers false, even if the mentor had confirmed the fact

### Requirement: The student withdraws an outcome

The reporting student SHALL withdraw an outcome in `PENDING_CONFIRMATION`, `CONFIRMED`, or `IN_PLATFORM_REVIEW`, moving it to `WITHDRAWN`, and a withdrawn outcome SHALL never count.

#### Scenario: Withdrawing from each open state

- **WHEN** the student withdraws an outcome that is pending, confirmed, or in platform review
- **THEN** the status is `WITHDRAWN`, one `WITHDRAWN` event is appended, and the reputation-eligibility rule answers false

#### Scenario: A closed outcome cannot be withdrawn

- **WHEN** the student withdraws an outcome that is `WITHDRAWN`, `REJECTED`, or `COUNTED`
- **THEN** the response is `409 OUTCOME_INVALID_STATE` and nothing changes

#### Scenario: The mentor cannot withdraw

- **WHEN** the mentor calls withdraw
- **THEN** the response is `404` and nothing changes

### Requirement: Illegal transitions are refused

Every outcome transition SHALL be decided by one pure transition function, and any move not listed in `docs/data-model.md` §4.4 SHALL answer `409 OUTCOME_INVALID_STATE` and write nothing.

#### Scenario: A transition from a terminal state

- **WHEN** any actor attempts a move on a `WITHDRAWN`, `REJECTED`, or `COUNTED` outcome other than the listed ones
- **THEN** the response is `409 OUTCOME_INVALID_STATE` and no event is appended

#### Scenario: Disputing a confirmed outcome is refused

- **WHEN** the mentor disputes an outcome that is already `CONFIRMED`
- **THEN** the response is `409 OUTCOME_INVALID_STATE`, because a dispute applies only while pending

#### Scenario: Counting has no route in this change

- **WHEN** any client requests a counted state
- **THEN** the response is `404` because no such endpoint exists, and the stored status is unchanged

### Requirement: Every transition appends an event and an audit entry

Each successful transition SHALL append exactly one `outcome_events` row with a gap-free `seq` and one audit entry in the same transaction, and both tables SHALL be insert-and-select only for the application role.

#### Scenario: The event sequence is gap-free

- **WHEN** an outcome goes through report, confirm, and withdraw
- **THEN** its events carry `seq` 1, 2, and 3 with the matching event types and no gap

#### Scenario: Each transition is audited

- **WHEN** any transition succeeds
- **THEN** one audit entry exists naming the actor, the outcome, and an outcome-specific action

#### Scenario: The ledger is not rewritable

- **WHEN** the application role attempts to update or delete an outcome event or a verification record
- **THEN** the database refuses the operation and the original row is unchanged

### Requirement: Reminders at day 3 and day 5 and escalation at day 7

An outcome awaiting a mentor decision SHALL receive one reminder at day 3 and one at day 5 and SHALL escalate to `IN_PLATFORM_REVIEW` at day 7, driven by a sweeper that is safe to run repeatedly and leaves decided outcomes untouched.

#### Scenario: The day-3 reminder

- **WHEN** the sweeper runs after day 3 on a still-pending outcome
- **THEN** one `REMINDER_D3_SENT` event is appended and exactly one email is queued

#### Scenario: The sweeper runs twice

- **WHEN** the sweeper runs again on the same outcome
- **THEN** no second day-3 reminder is written

#### Scenario: The day-7 escalation

- **WHEN** the sweeper runs after day 7 with no mentor decision
- **THEN** the status is `IN_PLATFORM_REVIEW`, one `ESCALATED_D7` event is appended, and the outcome is reported as awaiting review

#### Scenario: A decided outcome is untouched

- **WHEN** the sweeper runs on an outcome that is `CONFIRMED`, `WITHDRAWN`, or `IN_PLATFORM_REVIEW`
- **THEN** its status and timestamps are unchanged

### Requirement: The outcome screens let each side act

The mentorship page SHALL let the student report an outcome and let the mentor confirm, dispute, or declare a conflict, SHALL use the string catalog for every label, and SHALL render loading, empty, error, and saved states.

#### Scenario: The student reports from the page

- **WHEN** the student submits the report form with valid values
- **THEN** the outcome appears in the page's outcome section with the pending status

#### Scenario: The mentor decides from the page

- **WHEN** the mentor confirms or disputes a pending outcome
- **THEN** the section shows the new status and no other action is offered for that outcome

#### Scenario: A refused report is explained

- **WHEN** the API refuses the report with `422`
- **THEN** the page keeps the entered text, shows the string-catalog problem, and does not claim the report was saved

#### Scenario: A non-participant sees no outcome controls

- **WHEN** an account that is not a participant opens the page
- **THEN** no report or decision control is rendered
