# Spec Delta

## Purpose

Converts counted outcomes into an auditable, replayable record of verified impact: one append-only event per counted outcome, field-scoped totals that are derived rather than edited, and a counts-only view a mentor can show without exposing anyone's data.

## ADDED Requirements

### Requirement: Only an expired cooling period counts an outcome

A confirmed outcome SHALL become `COUNTED` only after its cooling deadline and only while it has no open review case; the counting step SHALL set `counted_at` and `counted_basis`, SHALL append one `COUNTED` event, and SHALL be safe to run repeatedly.

#### Scenario: A cooled confirmation counts

- **WHEN** the counting job runs after `cooling_ends_at` on a `CONFIRMED` outcome with no open case
- **THEN** the status is `COUNTED`, `counted_at` and `counted_basis` are set, and one `COUNTED` event is appended

#### Scenario: Counting before the deadline does nothing

- **WHEN** the job runs before `cooling_ends_at`
- **THEN** the outcome stays `CONFIRMED` and no reputation event is written

#### Scenario: An open case blocks counting

- **WHEN** the outcome is `IN_PLATFORM_REVIEW` at the moment the job runs
- **THEN** it is not counted and no reputation event is written

#### Scenario: A second run counts nothing twice

- **WHEN** the job runs again on an already `COUNTED` outcome
- **THEN** no second `COUNTED` event and no second reputation event exist

#### Scenario: No client can count

- **WHEN** any account sends a request that names the counted state
- **THEN** the response is `404` because no such endpoint exists, and the outcome stays in its stored state

### Requirement: Exactly one reputation event per counted outcome

Counting SHALL append exactly one `reputation_events` row for each counted outcome that is eligible for mentor reputation, carrying the mentor, student, field, outcome type, the applied multipliers, the pair factor, and the resulting points.

#### Scenario: An eligible counted outcome writes one event

- **WHEN** a mentor-confirmed outcome with no declared conflict becomes `COUNTED`
- **THEN** exactly one reputation event exists for it with the field copied from the outcome

#### Scenario: An ineligible counted outcome writes none

- **WHEN** a counted outcome with a platform-decision basis or a declared conflict is processed
- **THEN** no reputation event exists for it and the mentor's totals are unchanged

#### Scenario: The event is written once

- **WHEN** the same counted outcome is processed twice
- **THEN** exactly one reputation event exists, enforced by a unique constraint on the outcome id

### Requirement: The pair factor follows one over one plus n

The pair factor SHALL be `1 / (1 + n)`, where `n` is the number of earlier counted outcomes between the same mentor and student, so the second counted outcome for a pair uses `1/2` and a different student uses `1`.

#### Scenario: The second outcome for a pair

- **WHEN** a mentor and student have one earlier counted outcome
- **THEN** the new event's pair factor is `1/2`

#### Scenario: The third outcome for a pair

- **WHEN** the same pair has two earlier counted outcomes
- **THEN** the new event's pair factor is `1/3`

#### Scenario: A different student resets the factor

- **WHEN** the same mentor's counted outcome is with a student who has no earlier counted outcome
- **THEN** the pair factor is `1`

#### Scenario: Only counted outcomes raise n

- **WHEN** the same pair has a confirmed outcome that has not counted yet
- **THEN** it does not raise `n` for the next counted outcome

### Requirement: The reputation ledger is append-only and replayable

`reputation_events` SHALL be insert-and-select only for the application role, and recomputing a mentor's field totals from the events SHALL reproduce the stored `field_impact_snapshots` exactly.

#### Scenario: Replay reproduces the snapshot

- **WHEN** the snapshot for a mentor and field is recomputed from its reputation events
- **THEN** every stored total matches the recomputed value exactly

#### Scenario: The ledger is not rewritable

- **WHEN** the application role attempts to update or delete a reputation event or a snapshot row
- **THEN** the database refuses the operation and the stored row is unchanged

#### Scenario: Replay is deterministic

- **WHEN** the recomputation runs twice on the same events
- **THEN** both results are identical, with no dependence on row order

### Requirement: The impact view reports counts only

`GET /v1/me/impact` and `GET /v1/mentors/{id}/impact` SHALL return counts of counted outcomes grouped by field and outcome type, SHALL omit any numeric score, and SHALL exclude every outcome that is not counted or is not eligible for mentor reputation.

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

### Requirement: An impact read is signed-in and discloses no personal data

An impact read SHALL require a signed-in account, SHALL answer `404` for a mentor profile that does not exist or is not `ACTIVE`, and SHALL disclose no student identity, outcome description, or email address.

#### Scenario: An anonymous read is refused

- **WHEN** an unauthenticated client requests an impact response
- **THEN** the response is `401` and no count is disclosed

#### Scenario: An unknown or inactive mentor is not found

- **WHEN** the client requests impact for a mentor profile that does not exist or is not `ACTIVE`
- **THEN** the response is `404`

#### Scenario: The payload carries no student data

- **WHEN** any impact response is returned
- **THEN** it contains no student id, name, email, or outcome text

### Requirement: The profile page shows counted impact

The profile page SHALL show the signed-in account's counted outcomes by field and outcome type for a mentor, SHALL use the string catalog for every label, and SHALL render loading, empty, and error states.

#### Scenario: A mentor sees counts

- **WHEN** a mentor with counted outcomes opens the profile page
- **THEN** the impact section lists each field with its counts by outcome type

#### Scenario: An empty state

- **WHEN** an account has no counted outcomes
- **THEN** the section states that no counted outcomes exist yet and shows no zero-filled table of fields

#### Scenario: An error state

- **WHEN** the impact read fails
- **THEN** the section shows the string-catalog error and offers a retry, without claiming a count

#### Scenario: No numeric score is rendered

- **WHEN** the section renders
- **THEN** no score, points, percentage, tier, or ranking appears
