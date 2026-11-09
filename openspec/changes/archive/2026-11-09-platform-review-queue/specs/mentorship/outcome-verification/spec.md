# Spec Delta

## MODIFIED Requirements

### Requirement: Illegal transitions are refused

Every outcome transition SHALL be decided by one pure transition function, and any move not listed in `docs/data-model.md` §4.4 SHALL answer `409 OUTCOME_INVALID_STATE` and write nothing.

#### Scenario: A transition from a terminal state

- **WHEN** any actor attempts a move on a `WITHDRAWN`, `REJECTED`, or `COUNTED` outcome other than the listed ones
- **THEN** the response is `409 OUTCOME_INVALID_STATE` and no event is appended

#### Scenario: Disputing a confirmed outcome is refused

- **WHEN** the mentor disputes an outcome that is already `CONFIRMED`
- **THEN** the response is `409 OUTCOME_INVALID_STATE`, because a dispute applies only while pending

#### Scenario: Counting has no route in this change

- **WHEN** a client requests a counted, rejected, or reversed state directly, without the review route
- **THEN** the response is `404` because no such endpoint exists, and the stored status is unchanged
