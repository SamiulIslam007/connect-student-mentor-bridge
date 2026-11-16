# trust/evidence-retention Specification

## Purpose
Keeps the privacy notice's retention promise: an outcome's evidence file is deleted once its outcome has settled for longer than the configured window, while the row that names the file — its SHA-256, size, content type and deletion instant — survives so the outcome and its ledger history stay auditable. Deletion is off until an operator turns it on.

## Requirements

### Requirement: An evidence file is deleted after its outcome settles

The system SHALL delete the stored object of every evidence file whose outcome is `COUNTED` or `REJECTED` once the configured retention window has passed since that terminal transition, SHALL keep the evidence row with its SHA-256, size, content type and a deletion instant, and SHALL NOT touch a file whose outcome is in any other state.

#### Scenario: A counted outcome's file is deleted after the window

- **WHEN** an outcome has been `COUNTED` for longer than the retention window and its evidence object still exists
- **THEN** the object is deleted, the evidence row remains with its SHA-256 and a `deleted_at` instant, and exactly one `EVIDENCE_RETENTION_DELETED` audit entry exists for it

#### Scenario: A rejected outcome's file is deleted after the window

- **WHEN** an outcome has been `REJECTED` for longer than the retention window
- **THEN** its evidence object is deleted on the same clock, whatever the scan result was

#### Scenario: A live outcome keeps its file

- **WHEN** an outcome is `PENDING_CONFIRMATION`, `CONFIRMED`, `IN_PLATFORM_REVIEW`, `WITHDRAWN` or `REVERSED`
- **THEN** its evidence object is never deleted, however old it is

#### Scenario: The window is measured from the terminal transition

- **WHEN** an outcome was counted within the retention window
- **THEN** its file is not deleted, and it becomes eligible on the first run after the window passes

#### Scenario: A deleted file is not deleted again

- **WHEN** the job runs again over a row that already carries `deleted_at`
- **THEN** nothing is deleted, no second audit entry is written, and the row is unchanged

#### Scenario: A storage failure leaves the row eligible

- **WHEN** the object delete fails
- **THEN** the row keeps `deleted_at` null, no audit entry is written for it, and the next run attempts it again

#### Scenario: The metadata survives the file

- **WHEN** a file has been deleted
- **THEN** the evidence row still reports its SHA-256, its size and its content type, so the outcome and its ledger history remain auditable

### Requirement: Deletion is off until an operator turns it on

The system SHALL run the retention job in a dry-run mode that deletes nothing and writes no audit entry unless the operator's setting is exactly the value that enables deletion, and SHALL report what a real run would delete.

#### Scenario: The default deletes nothing

- **WHEN** the setting is absent, empty or any value other than the enabling value
- **THEN** the job deletes no object, writes no audit entry, and reports the count of files a real run would delete

#### Scenario: The enabling value deletes

- **WHEN** the setting is exactly the enabling value and the window has passed
- **THEN** the job deletes, updates the row and writes one audit entry per file

#### Scenario: A dry run is idempotent

- **WHEN** the dry-run job runs twice
- **THEN** the reported count is the same both times and nothing in the database or the store changed

#### Scenario: Every deletion is auditable

- **WHEN** a real run deletes a file
- **THEN** exactly one `EVIDENCE_RETENTION_DELETED` audit entry names the outcome, the evidence row and the actor role, and a platform admin can filter the audit log by that action
