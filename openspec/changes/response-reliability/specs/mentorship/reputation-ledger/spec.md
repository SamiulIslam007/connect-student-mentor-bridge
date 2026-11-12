# Spec Delta

## MODIFIED Requirements

### Requirement: The impact view reports counts only

`GET /v1/me/impact` and `GET /v1/mentors/{id}/impact` SHALL return counts of counted outcomes grouped by field and outcome type, SHALL omit any numeric score, and SHALL exclude every outcome that is not counted or is not eligible for mentor reputation. The own-impact read SHALL additionally return two integer counts of the caller's own requests, one for requests decided inside the decision window and one for requests decided late or expired; the public mentor-impact read SHALL NOT return them, and neither read SHALL return a percentage, a rate, a score, or a ranking.

#### Scenario: Counts appear after counting

- **WHEN** a mentor holds two counted outcomes in one field
- **THEN** the impact read reports a count of two in that field for that outcome type

#### Scenario: Non-counted states are excluded

- **WHEN** the same mentor has outcomes that are pending, confirmed but not yet counted, in platform review, withdrawn, or rejected
- **THEN** none of them appears in any count

#### Scenario: A platform-decided outcome is excluded

- **WHEN** a counted outcome has a platform-decision basis
- **THEN** it does not appear in the mentor's impact counts

#### Scenario: No score is exposed

- **WHEN** any client reads an impact response
- **THEN** the payload contains counts and no score, points, or ranking field

## ADDED Requirements

### Requirement: The own impact view reports request response counts

The own-impact read SHALL report exactly two integer counts over the caller's own mentorship requests: the number decided inside the decision window, and the number decided late or expired. A request counted in one bucket SHALL NOT be counted in the other, and a withdrawn or still-pending request SHALL be counted in neither. The counts SHALL contain no student identifier and SHALL be present only on the own-impact read.

#### Scenario: On-time decisions are counted

- **WHEN** a mentor holds three requests that were accepted or declined inside the decision window
- **THEN** the own-impact read reports a decided-inside-the-window count of three

#### Scenario: A timely decline is not penalised

- **WHEN** a mentor declines a request before the window closes
- **THEN** that request counts as decided inside the window and no count of late or expired requests changes

#### Scenario: An expired request counts once

- **WHEN** a request passes its expiry without a decision
- **THEN** it increments the late-or-expired count and not the decided-inside-the-window count

#### Scenario: A late decision is not double counted

- **WHEN** a mentor decides a request after the window has passed but before the sweeper expired it
- **THEN** it increments the late-or-expired count exactly once and the decided-inside-the-window count does not change

#### Scenario: Withdrawn and pending requests count in neither bucket

- **WHEN** the mentor's requests include one the student withdrew and one still awaiting a decision
- **THEN** neither of them increments either count

#### Scenario: The public read carries no such counts

- **WHEN** a client reads the public mentor-impact route
- **THEN** the payload carries the outcome counts only, with no decided-in-time count, no late-or-expired count, and no percentage or rate

#### Scenario: No percentage is sent

- **WHEN** any client reads either impact route
- **THEN** the payload contains no response rate, percentage, score, points, tier or ranking key
