# Spec Delta

## ADDED Requirements

### Requirement: Every ledger event records the configuration version it used

Every row the counting job writes to the reputation ledger SHALL carry the identifier of the configuration version whose values priced it, SHALL be written with the version read once at the start of that run, and SHALL NOT be written at all when no version is active.

#### Scenario: A counted outcome records its version

- **WHEN** an outcome is counted
- **THEN** its ledger row carries the active version's identifier, and the multipliers on the row are the ones that version holds

#### Scenario: A reversal records the version that priced it

- **WHEN** a counted outcome is reversed and a compensating row is written
- **THEN** that row also carries a version identifier

#### Scenario: No active version means no count

- **WHEN** the counting job runs and no configuration version exists
- **THEN** it writes no ledger row, leaves the outcome in `CONFIRMED`, and logs the refusal, so no unattributed event is ever created

#### Scenario: History is not rewritten by a later version

- **WHEN** a new configuration version is created after outcomes were counted
- **THEN** every earlier ledger row keeps its own version identifier and its own multipliers, and the replay still reproduces the stored snapshot
