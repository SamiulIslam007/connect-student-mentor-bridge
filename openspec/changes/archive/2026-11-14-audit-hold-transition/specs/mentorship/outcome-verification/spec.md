# Spec Delta

## ADDED Requirements

### Requirement: An audit hold moves a confirmed outcome into review

The system SHALL provide one action that moves an outcome from `CONFIRMED` to `IN_PLATFORM_REVIEW` for an audit, SHALL append exactly one outcome event and one audit entry in the same transaction, SHALL block counting while the hold stands, and SHALL NOT create a second review state.

#### Scenario: A confirmed outcome is held

- **WHEN** the hold action is applied to an outcome in `CONFIRMED`
- **THEN** its status is `IN_PLATFORM_REVIEW`, one `outcome_events` row and one audit entry are appended, and the counting job skips it

#### Scenario: The hold is not applied twice

- **WHEN** the hold action is applied to an outcome that is already `IN_PLATFORM_REVIEW`
- **THEN** the response is `409 OUTCOME_INVALID_STATE` and nothing is written

#### Scenario: A held outcome is cleared through the existing review

- **WHEN** a platform admin decides `valid` on a held outcome
- **THEN** it becomes `COUNTED` with `counted_basis` `PLATFORM_DECISION`, exactly as a disputed outcome does today

#### Scenario: A hold is never reachable from another state

- **WHEN** the hold action is applied to an outcome in `PENDING_CONFIRMATION`, `REJECTED`, `WITHDRAWN`, `REVERSED` or `COUNTED`
- **THEN** the response is `409 OUTCOME_INVALID_STATE` and nothing is written

#### Scenario: The property test walks the new edge

- **WHEN** every (state, action) pair and every two- and three-step trace is walked
- **THEN** the hold transition appears exactly once, from `CONFIRMED` only, and no trace reaches `COUNTED` without a mentor confirmation or a review decision
