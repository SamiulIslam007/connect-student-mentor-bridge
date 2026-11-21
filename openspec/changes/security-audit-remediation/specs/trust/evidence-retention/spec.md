# Spec Delta

## MODIFIED Requirements

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

## ADDED Requirements

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
