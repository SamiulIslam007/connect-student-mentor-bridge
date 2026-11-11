# Spec Delta

## MODIFIED Requirements

### Requirement: No admin decision surface exists in this release

The system SHALL expose affiliation approval only through the institution-scoped decision route this capability now defines, SHALL refuse a caller without the institution-admin role, and SHALL NOT expose any other endpoint, page, or command that approves or rejects an affiliation claim.

#### Scenario: No approve path

- **WHEN** a caller without an active institution-admin role for the claim's institution calls an affiliation-approval path
- **THEN** the response is `403` with code `ROLE_REQUIRED` and no affiliation row changes

## ADDED Requirements

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
