# Spec Delta

## MODIFIED Requirements

### Requirement: An outcome is a report against one mentorship

Reporting SHALL create one outcome in `PENDING_CONFIRMATION` carrying the mentorship id, the field copied from the mentorship, an outcome type, a required description, the student's claimed contribution level, and `mentor_decision_due_at` seven days after creation.

#### Scenario: A valid report is created

- **WHEN** the mentorship's student reports an outcome with a type, a description, and a claimed contribution level
- **THEN** one outcome exists in `PENDING_CONFIRMATION` with `mentor_decision_due_at` seven days ahead, one `REPORTED` event, and one email queued to the mentor

#### Scenario: The field comes from the mentorship

- **WHEN** the request body names a `field_id` or any other property outside the documented report schema
- **THEN** the response is `422` naming that property and no outcome row is written

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
- **THEN** the response is `422` naming that property and no outcome row is written
