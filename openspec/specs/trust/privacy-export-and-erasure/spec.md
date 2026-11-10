# trust/privacy-export-and-erasure Specification

## Purpose

Defines how a user takes their data out and how a user leaves, in a product whose credibility rests on an append-only ledger. The export is the caller's own record in one document. Deletion is a tombstone: identifiers and personal prose are erased, while every outcome event, verification record, reputation event, and audit entry stays exactly as written, so a counted outcome remains auditable after the person behind it is gone.

## Requirements


### Requirement: Deletion tombstones the account and leaves the ledger intact

Deleting an account SHALL, in one transaction, set the account status to `ANONYMIZED`, replace the account's identifiers with neutral values, delete every session row for that account, and append exactly one deletion audit entry. It SHALL NOT update or delete any row in `outcome_events`, `verification_records`, `reputation_events`, or `audit_logs`, and every foreign key from those tables to the tombstoned user SHALL still resolve.

#### Scenario: The ledger survives a deletion

- **WHEN** a user whose outcome was counted deletes their account
- **THEN** the `outcomes`, `outcome_events`, `verification_records`, and `reputation_events` rows are byte-for-byte unchanged, the `field_impact_snapshots` counts are unchanged, the audit log still lists the earlier entries, and a query joining each ledger row to its user succeeds

#### Scenario: Deletion is one transaction

- **WHEN** the deletion fails at any step
- **THEN** no identifier is erased, no session is removed, and the account is unchanged

#### Scenario: Deletion is idempotent

- **WHEN** the same account submits deletion twice
- **THEN** the second request changes no row, appends no second audit entry, and answers the same success response as the first

#### Scenario: A deleted account cannot sign in and holds no live session

- **WHEN** a deleted account submits the correct password, or a session token issued before the deletion is used
- **THEN** sign-in is refused with `403` for the `ANONYMIZED` status, the old token authenticates nothing, and no session row exists for the account

### Requirement: Deletion erases the account's identifiers

Deletion SHALL replace the stored email with the application's existing keyed hash, replace the display name and personal profile text with a neutral placeholder, and replace the body of every message the deleted user wrote with a fixed tombstone string. Columns that are `NOT NULL` SHALL receive a placeholder rather than `NULL`. A deleted mentor's profile SHALL become `REMOVED` so it leaves discovery. Institution, field, ledger, and structural rows SHALL keep their identifiers and values.

#### Scenario: Identifiers are gone and no read breaks

- **WHEN** the tombstoned account row and its profiles are read by the owner role
- **THEN** the email is a hash that does not contain the address, the display name and bio-like columns hold the placeholder, the message bodies the user wrote hold the tombstone string, and every `NOT NULL` constraint still holds

#### Scenario: The counterpart's content is untouched

- **WHEN** a deleted user's mentorship is read by the other participant
- **THEN** the counterpart's own messages, profile, and outcomes are unchanged, and only the deleted user's messages show the tombstone string

#### Scenario: A deleted mentor leaves the directory

- **WHEN** a mentor with an `ACTIVE` profile deletes their account
- **THEN** `mentor_profiles.status` becomes `REMOVED`, the mentor directory and the single-mentor read no longer return the profile, and no request can be created against it

#### Scenario: A second deletion request finds nothing to erase

- **WHEN** an already-anonymized account submits deletion again
- **THEN** no hash is computed twice, no placeholder overwrites another user's data, and the response is the documented success

### Requirement: The caller exports their own data as one document

A signed-in user SHALL be able to request an export and receive one JSON document containing that user's own rows from a fixed allowlist of tables and columns, returned with `Cache-Control: no-store` and `Content-Disposition: attachment`. The document SHALL contain no password hash, no second-factor secret or backup code, no session token, no provider token, and no other user's personal rows.

#### Scenario: The export holds only the caller's rows

- **WHEN** a user with a profile, an affiliation, a request, a mentorship, a message, and a counted outcome exports their data
- **THEN** the document contains those rows, names the document version of the consent records, and contains no row belonging to any other user

#### Scenario: The export carries no secret

- **WHEN** the exported document is searched for a password hash, a TOTP secret, a backup code, a session token, or an OAuth token
- **THEN** none is present, and the user's credential-bearing rows appear only as metadata such as the provider name

#### Scenario: A suspended or deleted account cannot export

- **WHEN** a `SUSPENDED`, `ANONYMIZED`, or `DEACTIVATED` account requests an export
- **THEN** the request is refused with `403` and no document is produced

#### Scenario: The export is not cacheable

- **WHEN** the export response is returned
- **THEN** it carries `Cache-Control: no-store` and an attachment disposition

### Requirement: A privacy request is recorded

Every export and deletion request SHALL write one `privacy_requests` row naming the kind, the requesting user, the status, and the requested and completed timestamps, in the same transaction as the work it describes.

#### Scenario: The export is recorded

- **WHEN** an export succeeds
- **THEN** exactly one `privacy_requests` row exists for that user with kind `EXPORT` and a completion timestamp

#### Scenario: The deletion is recorded

- **WHEN** a deletion succeeds
- **THEN** exactly one `privacy_requests` row exists for that user with kind `DELETE` and a completion timestamp, and that row still resolves to the tombstoned user
