# institutions/affiliation-verification Specification

## Purpose

Lets a student or mentor claim one institution and receive Level 1 affiliation when their verified email domain belongs to a registered institution, keeps that claim auditable and revocable, and lets the pilot partner's affiliation be granted from checked-in source instead of an admin surface.

## Requirements

### Requirement: An affiliation is a stored, revocable claim

The system SHALL store each affiliation as a row in `affiliations` with `kind`, `level`, `method`, `status`, and timestamps, SHALL keep at most one `VERIFIED` affiliation per account in the MVP, and SHALL revoke a superseded affiliation by setting `status = 'REVOKED'` and `revoked_at` rather than deleting the row.

#### Scenario: A first claim is stored

- **WHEN** a signed-in account with no affiliation claims an institution
- **THEN** exactly one `affiliations` row exists for that account, and its id is returned in the response

#### Scenario: A superseded affiliation is kept as history

- **WHEN** a claim for a second institution is granted to an account that already holds a verified affiliation
- **THEN** the earlier row remains with `status = 'REVOKED'` and a `revoked_at` value, and only the new row is `VERIFIED`

### Requirement: A registered institutional email domain grants Level 1 automatically

The claim SHALL be granted `level = 'LEVEL_1'`, `method = 'INSTITUTIONAL_EMAIL'`, `status = 'VERIFIED'` when the domain of the caller's **verified** email address is a row in `institution_domains` for the claimed institution. An unverified email SHALL NOT grant any level.

#### Scenario: Domain matches

- **WHEN** an account whose email `a.student@example.edu.bd` is verified claims the institution that registered `example.edu.bd`
- **THEN** the response is `200` with `level: "level_1"`, `method: "institutional_email"`, and `status: "verified"`

#### Scenario: Unverified email claims

- **WHEN** an account whose email is not verified calls the claim endpoint
- **THEN** the response is `422` with code `AFFILIATION_EMAIL_UNVERIFIED` and no affiliation row is written

#### Scenario: Domain is not registered

- **WHEN** a verified account claims an institution whose registered domains do not include the caller's email domain
- **THEN** the affiliation is stored as `status: "pending"` and `level: "level_0"`, and no Level 1 is granted

#### Scenario: Case and surrounding whitespace do not matter

- **WHEN** the registered domain is `example.edu.bd` and the caller's verified address is `A.Student@EXAMPLE.EDU.BD`
- **THEN** the claim is granted Level 1

### Requirement: A reconfigured affiliation suspends Level 1 until re-verified

When an account that holds Level 1 claims a different institution, the system SHALL revoke the earlier affiliation, store the new claim at the level its own email supports, and report the account's resulting level without the earlier grant.

#### Scenario: Level 1 is lost on a claim the new domain cannot support

- **WHEN** an account with a verified affiliation at institution A claims institution B, and its email domain is not registered to B
- **THEN** the affiliation at A is `REVOKED` and the account's reported level is `level_0`

### Requirement: A claim is idempotent per institution

Repeating an identical claim for the same institution SHALL return the existing affiliation unchanged and SHALL NOT create a second row or a second audit-safe history entry.

#### Scenario: Repeated claim

- **WHEN** the same account claims the same institution twice
- **THEN** both responses are `200` with the same affiliation id and status, and the table holds one row for that account and institution

### Requirement: A claim acts only on the caller's own account

The claim endpoint SHALL resolve the subject from the session only and SHALL ignore any account-level property in the body, including `user_id`, without raising an error for it.

#### Scenario: A body `user_id` is ignored

- **WHEN** a signed-in account submits a claim whose body names another account's `user_id`
- **THEN** the response is `200` or `422` on its own merits, and no affiliation row is created or changed for the other account

### Requirement: The claim collects no identity document

The claim SHALL accept only `institution_id`, `kind`, `department`, `program`, and `batch_year`, and SHALL NOT store a government identifier, passport number, national ID, tax identifier, or uploaded document.

#### Scenario: A submitted national ID is not stored

- **WHEN** a claim body includes `nid` or `passport_number`
- **THEN** the response succeeds or fails on the documented fields only, and no such value exists in the stored row or the audit entry

### Requirement: The pilot affiliation is granted from the seed

The system SHALL grant Level 1 to named pilot accounts through a repeatable checked-in seed that writes `status = 'VERIFIED'`, `method = 'ADMIN_ATTESTATION'`, `level = 'LEVEL_1'` rows with a stated reason, and running it twice SHALL leave the same rows.

#### Scenario: Seed attestation runs

- **WHEN** the attestation seed runs against a database with the seeded institutions and the listed accounts exist
- **THEN** each listed account holds one `VERIFIED` affiliation with `method: "admin_attestation"` and a non-empty decision reason

#### Scenario: Seed rerun

- **WHEN** the attestation seed runs again with unchanged source data
- **THEN** no additional affiliation row is created and the row count is unchanged

#### Scenario: Listed account does not exist

- **WHEN** an attestation entry names an email with no account
- **THEN** the run reports that entry as skipped, inserts nothing for it, and does not fail the other entries

### Requirement: No admin decision surface exists in this release

The system SHALL provide no institution-admin or platform-admin endpoint, page, or command that approves or rejects an affiliation claim; a pending claim SHALL remain pending until a later change adds that surface.

#### Scenario: No approve path

- **WHEN** any client calls an affiliation-approval path
- **THEN** the response is `404` and no affiliation row changes
