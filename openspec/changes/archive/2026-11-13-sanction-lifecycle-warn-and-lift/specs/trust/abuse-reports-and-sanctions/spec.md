# Spec Delta

## ADDED Requirements

### Requirement: A warning is recorded and notifies the account

The system SHALL let a platform admin with an enrolled second factor warn an account by id with a required reason, SHALL append one audit entry naming the admin, the account and the reason, SHALL queue one notice email carrying the reason, and SHALL NOT change the account status, the end date, or any session.

#### Scenario: A warning changes no status

- **WHEN** an admin warns an `ACTIVE` account
- **THEN** the status stays `ACTIVE`, the end date stays null, every open session still works, one audit entry exists and one notice is queued

#### Scenario: The reason is required

- **WHEN** a warning request omits the reason or sends an empty one
- **THEN** the response is `422 VALIDATION_FAILED` naming `reason` and no audit entry is written

#### Scenario: Warnings accumulate

- **WHEN** the same account is warned twice
- **THEN** two audit entries exist and the account's warning count reads two

#### Scenario: The notice names no reporter

- **WHEN** the warning notice is queued
- **THEN** it carries the reason and names no reporter, no report id, and no other user

### Requirement: A platform admin lifts a suspension with a reason

The system SHALL let a platform admin with an enrolled second factor return a `SUSPENDED` account to `ACTIVE` with a required reason, SHALL clear the stored end date, SHALL append one audit entry, and SHALL queue one notice, all in one transaction. A lift SHALL apply only to a `SUSPENDED` account.

#### Scenario: A suspension is lifted

- **WHEN** an admin lifts a suspension with a reason
- **THEN** the status is `ACTIVE`, the end date is null, one audit entry names the admin and the reason, and one notice is queued

#### Scenario: An account that is not suspended is refused

- **WHEN** an admin lifts an account that is `ACTIVE`, `DEACTIVATED` or `ANONYMIZED`
- **THEN** the response is `409 ACCOUNT_NOT_SUSPENDED` and nothing is written

#### Scenario: A lift does not create a session

- **WHEN** a suspension is lifted
- **THEN** no session row exists for the account and the account signs in with its own password

#### Scenario: A mentor caller is refused

- **WHEN** a mentor or an institution admin calls the lift route
- **THEN** the response is `403` and nothing is written

### Requirement: A passed end date lifts a suspension on a schedule

A scheduled job SHALL lift every suspension whose stored end date is in the past, SHALL NOT lift a suspension with no end date, SHALL append one audit entry and queue one notice per lifted account, SHALL be bounded per run, and SHALL change nothing on a second run.

#### Scenario: A passed end date is lifted

- **WHEN** the job runs and an account is `SUSPENDED` with an end date in the past
- **THEN** the account becomes `ACTIVE`, the end date is null, one audit entry exists naming the job as the actor, and one notice is queued

#### Scenario: An indefinite suspension is untouched

- **WHEN** the job runs and an account is `SUSPENDED` with no end date
- **THEN** the account stays `SUSPENDED` and no audit entry is written for it

#### Scenario: A future end date is untouched

- **WHEN** the job runs and an account's end date is still in the future
- **THEN** the account stays `SUSPENDED`

#### Scenario: A second run changes nothing

- **WHEN** the job runs twice over the same data
- **THEN** the second run writes no audit entry, queues no notice and changes no status

#### Scenario: A concurrent suspension wins

- **WHEN** an account is suspended again at the moment the job tries to lift the earlier suspension
- **THEN** exactly one of the two writes applies, and the account's status matches the write that won
