# Spec Delta

## MODIFIED Requirements

### Requirement: The mentor access mode is one of three stored values

The mentor profile SHALL carry an access mode of `OPEN`, `APPLICATION_ONLY`, or `PAUSED`, defaulting to `OPEN`, SHALL let the mentor set `OPEN` or `APPLICATION_ONLY` when saving the profile, SHALL let the mentor pause and resume without resaving the profile, SHALL default a resume to `OPEN` when no mode is named, and SHALL refuse a resume with `409 CAPACITY_BELOW_ACTIVE`, leaving the mode `PAUSED`, when the mentor's live `ACTIVE` mentorships are at or above `weekly_capacity`.

#### Scenario: A new mentor profile is open

- **WHEN** a mentor profile is created without naming an access mode
- **THEN** its access mode is `OPEN`

#### Scenario: Choosing application-only

- **WHEN** a mentor saves the profile with `APPLICATION_ONLY`
- **THEN** the stored mode is `APPLICATION_ONLY` and every other profile field is unchanged

#### Scenario: Pause and resume

- **WHEN** a mentor pauses and then resumes naming `APPLICATION_ONLY`
- **THEN** the mode is `PAUSED` after the pause and `APPLICATION_ONLY` after the resume

#### Scenario: Resume without a mode

- **WHEN** a mentor resumes without naming a mode
- **THEN** the mode is `OPEN`

#### Scenario: Pause is idempotent

- **WHEN** a mentor who is already paused pauses again
- **THEN** the response is a success and the mode is unchanged

#### Scenario: Pausing is not a capacity decision

- **WHEN** a mentor pauses
- **THEN** no capacity check runs and the response never reports `CAPACITY_BELOW_ACTIVE`

#### Scenario: Resume at capacity is refused

- **WHEN** a paused mentor whose live `ACTIVE` mentorships are at or above `weekly_capacity` resumes
- **THEN** the response is `409 CAPACITY_BELOW_ACTIVE`, the mode stays `PAUSED`, and the message names the capacity bound

#### Scenario: Resume with room succeeds

- **WHEN** a paused mentor whose live `ACTIVE` mentorships are below `weekly_capacity` resumes
- **THEN** the mode becomes the requested mode and the response is a success

#### Scenario: Resume below capacity counts only live mentorships

- **WHEN** a mentor has completed mentorships and fewer live `ACTIVE` mentorships than `weekly_capacity`
- **THEN** the resume succeeds, because completed and ended mentorships are not counted
