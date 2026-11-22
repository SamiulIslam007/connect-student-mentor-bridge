# trust/evidence-retention Specification

## Purpose
Keeps the privacy notice's retention promise: an outcome's evidence file is deleted once its outcome has settled for longer than the configured window, while the row that names the file — its SHA-256, size, content type and deletion instant — survives so the outcome and its ledger history stay auditable. Deletion is off until an operator turns it on.

## Requirements

### Requirement: An evidence file is deleted after its outcome settles

The system SHALL delete the stored object of every evidence file whose outcome is `COUNTED`, `REJECTED`, `REVERSED` or `WITHDRAWN` once the configured retention window has passed since that state's own transition instant, SHALL also delete a file whose outcome remains unsettled longer than the maximum unsettled window, SHALL keep the evidence row with its SHA-256, size, content type and a deletion instant, and SHALL NOT touch a file whose outcome is in any other state before that maximum window.

#### Scenario: A counted outcome's file is deleted after the window

- **WHEN** an outcome has been `COUNTED` for longer than the retention window and its evidence object still exists
- **THEN** the object is deleted, the evidence row remains with its SHA-256 and a `deleted_at` instant, and exactly one `EVIDENCE_RETENTION_DELETED` audit entry exists for it

#### Scenario: A rejected outcome's file is deleted after the window

- **WHEN** an outcome has been `REJECTED` for longer than the retention window
- **THEN** its evidence object is deleted on the same clock, whatever the scan result was

#### Scenario: A live outcome keeps its file

- **WHEN** an outcome is `PENDING_CONFIRMATION`, `CONFIRMED` or `IN_PLATFORM_REVIEW` and the upload is inside the maximum unsettled window
- **THEN** its evidence object is not deleted

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

### Requirement: A reversal or a withdrawal starts the clock at its own instant

Reaching `REVERSED` or `WITHDRAWN` SHALL start the retention window at that transition's own instant (`reversed_at`, `withdrawn_at`) and never at an earlier count or rejection, so a clawback neither deletes the material it was decided on nor inherits an older clock.

#### Scenario: A reversal restarts the window

- **WHEN** an outcome counted a year ago was reversed yesterday and its file still exists
- **THEN** the file is not due, and it becomes due only after the window passes from the reversal instant

#### Scenario: A withdrawal restarts the window

- **WHEN** an outcome was withdrawn longer ago than the window and its file still exists
- **THEN** the file is due on the withdrawal instant's clock, exactly as a counted one is on its own

#### Scenario: A settled row with no instant is never due

- **WHEN** a row reports one of the four states but its matching instant is null
- **THEN** nothing is deleted for it, because a missing instant is a projection defect, not a licence to delete

### Requirement: A consent withdrawal starts the clock for the files behind it

Withdrawing `INSTITUTION_DATA_SHARING` consent SHALL start the retention window for the evidence of that student's settled outcomes at the withdrawal instant whenever that instant is earlier than the outcome's own settle instant, and SHALL NOT delay any file whose window had already started earlier.

#### Scenario: An early withdrawal brings a later-settled file due sooner

- **WHEN** a student withdraws institution-sharing consent and their outcome settles months later
- **THEN** the file's window is measured from the withdrawal instant, so it is due sooner than the settle instant alone would make it

#### Scenario: A later withdrawal changes nothing

- **WHEN** the withdrawal instant is later than the outcome's settle instant
- **THEN** the settle instant still governs and the file's due date does not move

#### Scenario: Only the reporting student's withdrawal counts

- **WHEN** the mentor of the same mentorship withdraws their own institution-sharing consent
- **THEN** the student's evidence clock is unchanged

### Requirement: An unsettled evidence file has a maximum retention

The system SHALL delete an evidence object whose outcome has never settled once 90 days have passed since upload, SHALL keep the evidence row and its metadata, SHALL write one `EVIDENCE_RETENTION_DELETED` audit entry per object, and SHALL keep the existing dry-run switch as the deployment gate.

#### Scenario: An old pending file becomes due

- **WHEN** an outcome is still `PENDING_CONFIRMATION`, `CONFIRMED`, `DISPUTED` or `IN_PLATFORM_REVIEW` and its upload is older than 90 days
- **THEN** the object is deleted, the row keeps its metadata and `deleted_at`, and one audit row names the outcome and the evidence

#### Scenario: A young pending file is untouched

- **WHEN** the same outcome is inside 90 days from upload
- **THEN** the object is not deleted and the row is unchanged

#### Scenario: The dry run reports without deleting

- **WHEN** the enabling setting is not exactly the value that turns deletion on
- **THEN** no object is deleted, no audit row is written, and the result reports the count that a real run would delete

#### Scenario: The settled rule still wins when earlier

- **WHEN** an outcome settles before the 90-day upload clock and its own window is already due
- **THEN** the existing settled-state clock applies, not the maximum
