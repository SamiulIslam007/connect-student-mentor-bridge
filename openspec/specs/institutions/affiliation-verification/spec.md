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

The claim endpoint SHALL resolve the subject from the session only and SHALL refuse any account-level property in the body, including `user_id`, with a `422` naming that property rather than ignoring it.

#### Scenario: A body `user_id` is ignored

- **WHEN** a signed-in account submits a claim whose body names another account's `user_id`
- **THEN** the response is `422` naming `user_id`, no affiliation row is created or changed for the other account, and the property never influences which account the claim is written for

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

The system SHALL expose affiliation approval only through the institution-scoped decision route this capability now defines, SHALL refuse a caller without the institution-admin role, and SHALL NOT expose any other endpoint, page, or command that approves or rejects an affiliation claim.

#### Scenario: No approve path

- **WHEN** a caller without an active institution-admin role for the claim's institution calls an affiliation-approval path
- **THEN** the response is `403` with code `ROLE_REQUIRED` and no affiliation row changes

### Requirement: An institution admin reads the pending claims of its own institutions

The system SHALL return only claims with `status = PENDING` whose institution is one the caller actively administers, SHALL exclude claims with no institution, and SHALL answer `404` for a claim id outside the caller's scope rather than `403`.

#### Scenario: The queue lists only the caller's institution

- **WHEN** an institution admin for institution A reads the queue and institution B holds pending claims
- **THEN** the response contains every pending claim of A and no claim of B

#### Scenario: A claim outside the scope is not disclosed

- **WHEN** an institution admin for A requests a decision on a claim belonging to B
- **THEN** the response is `404` and no row changes

#### Scenario: A decided claim leaves the queue

- **WHEN** a claim has status `VERIFIED` or `REJECTED`
- **THEN** it does not appear in the queue

#### Scenario: An organization claim is excluded

- **WHEN** a pending claim carries an organization name and no institution
- **THEN** it never appears in an institution queue

### Requirement: Verification is one transaction that grants Level 1

Verifying a pending claim SHALL set `status = VERIFIED`, `level = LEVEL_1`, `method = ADMIN_ATTESTATION`, `decided_by_user_id`, `decision_reason` and `verified_at` in one transaction, SHALL revoke any other verified affiliation of that account in the same transaction, SHALL append one audit entry, SHALL queue one notice email, and SHALL re-evaluate the mentor activation gate before the response.

#### Scenario: A pending claim becomes Level 1

- **WHEN** an institution admin verifies a pending claim
- **THEN** the row carries `status` verified, `level` level 1, `method` admin attestation, the deciding account id, the reason, and a verification timestamp, and the response reports the decided claim

#### Scenario: The applicant already holds a verified affiliation

- **WHEN** the applicant holds a `VERIFIED` affiliation and a pending claim at another institution is verified
- **THEN** the earlier row becomes `REVOKED` with a revocation timestamp in the same transaction, and exactly one row for that account is `VERIFIED`

#### Scenario: A mentor becomes active on verification

- **WHEN** the applicant holds the mentor role, an enrolled second factor, and no verified affiliation before this decision
- **THEN** the mentor profile becomes `ACTIVE` in the same transaction and is discoverable immediately after the response

#### Scenario: The applicant is notified

- **WHEN** a claim is verified
- **THEN** exactly one notice email is queued for the applicant, carrying the institution name and the decision, and no reason text that names the reviewer

### Requirement: A rejection grants no level and requires a reason

Rejecting a pending claim SHALL set `status = REJECTED` with a required `decision_reason`, SHALL leave the account's level unchanged, SHALL append one audit entry, and SHALL queue one notice email to the applicant.

#### Scenario: A rejection needs a reason

- **WHEN** a decision request carries `decision` reject and no `reason`
- **THEN** the response is `422 VALIDATION_ERROR` naming the reason and no affiliation row changes

#### Scenario: A rejected claim grants nothing

- **WHEN** a pending claim is rejected
- **THEN** `status` is `REJECTED`, the level remains what the email domain supported, and the applicant is not activated

#### Scenario: A rejected claim may be claimed again

- **WHEN** an applicant whose claim was rejected claims the same institution again and the domain still does not match
- **THEN** a new pending claim exists and the rejected row is kept as history

### Requirement: A claim is decided exactly once

A decision SHALL apply only to a claim whose status is `PENDING`, and a second decision on the same claim SHALL be refused with `409 CLAIM_ALREADY_DECIDED` without changing any row.

#### Scenario: Two reviewers decide at once

- **WHEN** two decisions for the same claim are submitted and the first has committed
- **THEN** the second response is `409` with code `CLAIM_ALREADY_DECIDED` and the row keeps the first decision

#### Scenario: The decision is conditional, not check-then-write

- **WHEN** the update matches no `PENDING` row
- **THEN** the transaction performs no audit write, queues no email, and returns `409`

### Requirement: An institution admin cannot decide their own claim

The system SHALL refuse a decision when the claim belongs to the acting account's own user id, and SHALL answer `403 FORBIDDEN` without changing any row.

#### Scenario: Self-decision is refused

- **WHEN** an institution admin submits a decision on a pending claim that they themselves created
- **THEN** the response is `403` with code `FORBIDDEN`, the claim stays `PENDING`, and no audit entry is written

#### Scenario: Holding more than one role does not help

- **WHEN** an account holds both the institution-admin and the mentor role and decides its own claim
- **THEN** the decision is refused, and the account may still read the queue

### Requirement: An institution admin role is granted for one institution by a platform admin

The system SHALL grant `INSTITUTION_ADMIN` for exactly one named institution to a named account, only to a caller holding `PLATFORM_ADMIN` with an enrolled second factor, writing one `role_assignments` row carrying the institution and one `ROLE_GRANTED` audit entry. A repeated grant SHALL change nothing and write no second entry.

#### Scenario: A platform admin grants the role

- **WHEN** a platform admin with an enrolled second factor grants institution-admin for institution A to an account
- **THEN** exactly one active `role_assignments` row for that account, role and institution exists and one audit entry names the actor and the role

#### Scenario: The target is unknown

- **WHEN** the grant names an email with no account
- **THEN** the response is `422 VALIDATION_ERROR` naming the field and no row is written

#### Scenario: The institution is unknown

- **WHEN** the grant names an institution id that does not exist
- **THEN** the response is `404` and no row is written

#### Scenario: A repeated grant is idempotent

- **WHEN** the same grant is submitted twice
- **THEN** both responses are `200`, one active row exists, and exactly one audit entry exists

#### Scenario: A caller without the platform-admin role

- **WHEN** an institution admin calls the grant route
- **THEN** the response is `403` with code `ROLE_REQUIRED` and no row is written

### Requirement: The attestation queue carries no profile text

A queue entry SHALL carry the claim id, the applicant's display name, the applicant's email domain only, the claim kind, department, program, batch year, and the claim timestamp. It SHALL NOT carry the applicant's email local part, biography, goals, availability, capacity, or any other profile content.

#### Scenario: The projection is fixed

- **WHEN** any queue entry is read
- **THEN** its keys are exactly the documented set, and no entry contains an at-sign, a biography, a goal, or an availability window

#### Scenario: Adding a field fails a test

- **WHEN** a field is added to the queue projection without updating the documented key set
- **THEN** the integration test that freezes the key set fails
