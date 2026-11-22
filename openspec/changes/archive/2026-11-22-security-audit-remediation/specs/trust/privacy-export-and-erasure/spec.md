# Spec Delta

## ADDED Requirements

### Requirement: Deletion removes non-ledger personal data

Account deletion SHALL delete the evidence rows and stored objects for the user's outcomes, delete the user's affiliations, abuse reports and verification records, delete queued outbox payloads addressed to the user, delete the old email's verification rows and the user's idempotency keys, and SHALL leave every outcome, outcome event, reputation event, consent record and audit row unchanged. The ledger free-text question is not decided by this requirement.

#### Scenario: Evidence is gone after deletion

- **WHEN** a user with a counted outcome and a clean evidence file deletes their account
- **THEN** the evidence row is deleted, the object is deleted, and no other participant can read it

#### Scenario: Non-ledger personal rows are gone

- **WHEN** the same user had an affiliation, a report, a queued email, an old verification row and an idempotency response
- **THEN** those rows are deleted, and the deletion is idempotent

#### Scenario: The ledger is untouched

- **WHEN** the deletion completes
- **THEN** every `outcomes`, `outcome_events`, `verification_records`, `reputation_events`, `consent_records` and `audit_logs` row is byte-for-byte unchanged

#### Scenario: A failed object delete is visible

- **WHEN** the object store refuses one delete
- **THEN** the transaction still records the privacy request, the object remains listed for a retry, and the failure is logged without content

### Requirement: Sensitive privacy actions need recent proof

Export and delete SHALL require a password or TOTP proof no older than 10 minutes, SHALL answer `403 REAUTH_REQUIRED` when the proof is stale or absent, and SHALL NOT accept the email confirmation alone as the proof for deletion.

#### Scenario: A stale session cannot export

- **WHEN** a session older than 10 minutes calls export without a fresh proof
- **THEN** the response is `403 REAUTH_REQUIRED` and no document is produced

#### Scenario: A fresh proof allows the action

- **WHEN** the user re-enters the password or a TOTP code inside 10 minutes
- **THEN** export or delete proceeds under the existing ownership checks

#### Scenario: The email is not a proof

- **WHEN** the caller knows the account email but has no fresh proof
- **THEN** delete still answers `403 REAUTH_REQUIRED`

#### Scenario: The action is audited

- **WHEN** a re-authenticated export or delete succeeds
- **THEN** the existing audit row is written once with the request id
