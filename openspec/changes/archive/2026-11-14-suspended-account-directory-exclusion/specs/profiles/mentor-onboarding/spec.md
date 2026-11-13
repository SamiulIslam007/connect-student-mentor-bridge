# Spec Delta

## ADDED Requirements

### Requirement: The activation sync never overwrites a status another actor wrote

`syncMentorActivation` SHALL apply its status update only when the stored operating status is still the value it read in the same call, SHALL skip the write otherwise, and SHALL leave the row to the next trigger rather than retrying, so a suspension, a removal, or any other concurrent status change is never clobbered by an activation pass.

#### Scenario: A concurrent status change wins

- **WHEN** the profile status changes between the sync's read and its write
- **THEN** the update affects no row, the stored status remains the one the other actor wrote, and the sync returns without error

#### Scenario: The next trigger recomputes from the stored row

- **WHEN** a later sync runs on that profile
- **THEN** it reads the status the other actor wrote and applies the pure activation rule to it

#### Scenario: The ordinary path still writes

- **WHEN** the status is unchanged between the read and the write
- **THEN** the update applies exactly as before, including the onboarding status and the activated timestamp
