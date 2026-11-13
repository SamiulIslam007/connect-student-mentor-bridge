# profiles/mentor-onboarding Specification

## Purpose

Tells the platform whether a mentor is still applying or may operate: it records verification progress separately from the operating status, and it decides the operating status from Level 1 affiliation plus an enrolled second factor so no later change has to guess the rule.

## Requirements

### Requirement: Verification progress is stored separately from operating status

The system SHALL store a mentor's verification progress in `mentor_profiles.onboarding_status` (`APPLIED`, `EMAIL_VERIFIED`, `AFFILIATION_VERIFIED`) and the operating status in `mentor_profiles.status` (`DRAFT`, `PENDING`, `ACTIVE`, `SUSPENDED`, `REMOVED`), and SHALL NOT write progress into the operating enum.

#### Scenario: New mentor profile

- **WHEN** an account saves its first mentor profile
- **THEN** the stored operating status is `DRAFT` and the stored onboarding status is `APPLIED`

#### Scenario: Affiliated mentor

- **WHEN** a mentor profile's account holds a verified Level 1 affiliation
- **THEN** the onboarding status is `AFFILIATION_VERIFIED`

### Requirement: A mentor operates only with Level 1 and an enrolled second factor

The system SHALL hold a mentor profile at `PENDING` until its account holds a verified affiliation of at least Level 1, an enrolled second factor, a `VOLUNTEER_AGREEMENT` consent, a `COMMUNITY_GUIDELINES` consent and a recorded orientation acknowledgement, and SHALL move it to `ACTIVE` with `activated_at` set once when all five hold. Losing any of them SHALL return the profile to `PENDING` and SHALL leave `activated_at` at its first value.

#### Scenario: Both conditions hold

- **WHEN** a mentor has a verified Level 1 affiliation, an enrolled second factor, the volunteer agreement, the community guidelines and the orientation acknowledgement
- **THEN** the profile status is `ACTIVE` and `activated_at` is set

#### Scenario: No second factor

- **WHEN** a mentor has Level 1 but has not enrolled a second factor
- **THEN** the profile status is `PENDING` and `activated_at` stays null

#### Scenario: No affiliation

- **WHEN** a mentor enrolled a second factor but holds no verified affiliation
- **THEN** the profile status is `PENDING`

#### Scenario: Second factor removed

- **WHEN** an `ACTIVE` mentor disables its second factor
- **THEN** the profile status becomes `PENDING`, `activated_at` keeps its earlier value, and the response to the disabling request still succeeds

#### Scenario: Level 1 revoked

- **WHEN** an `ACTIVE` mentor's verified affiliation is revoked
- **THEN** the profile status becomes `PENDING` and `activated_at` keeps its earlier value

### Requirement: The caller can read its own onboarding state

The system SHALL report, in the response that returns the caller's own profiles, the mentor profile's `status` and `onboarding_status` and the account's affiliations with institution name, level, method, and status. It SHALL NOT report another account's affiliation.

#### Scenario: Own state is reported

- **WHEN** a signed-in mentor requests its own account state
- **THEN** the response carries `status`, `onboarding_status`, and the affiliation list

#### Scenario: Nobody else's state

- **WHEN** a request carries another account's identifier or a foreign affiliation id
- **THEN** the reported affiliation list contains only the caller's rows

### Requirement: An orientation acknowledgement is stored with the agreements

Accepting the volunteer agreement SHALL store `mentor_profiles.orientation_completed_at` once, SHALL append one `ORIENTATION_COMPLETED` audit entry in the same transaction, and SHALL NOT overwrite the timestamp on a later acceptance.

#### Scenario: The orientation is stamped once

- **WHEN** a mentor accepts the volunteer agreement twice, a day apart
- **THEN** `orientation_completed_at` holds the first timestamp and two audit entries exist

#### Scenario: Without the agreements a mentor stays pending

- **WHEN** a mentor holds Level 1 and an enrolled second factor and has accepted no agreement and no orientation
- **THEN** the profile status is `PENDING` and `activated_at` stays null

#### Scenario: An active mentor is not re-gated by the migration

- **WHEN** a mentor profile is already `ACTIVE` before this change and no re-evaluation event runs
- **THEN** its status and `activated_at` are unchanged
