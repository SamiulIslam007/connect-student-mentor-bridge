# Spec Delta

## MODIFIED Requirements

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

## REMOVED Requirements

### Requirement: Activation is not yet gated on the agreements

This release SHALL activate a mentor without requiring `VOLUNTEER_AGREEMENT` or `COMMUNITY_GUIDELINES` consent, because no route records those consents yet; the omission SHALL be tracked as debt with a named owning change.

#### Scenario: Level 1 and second factor without agreements

- **WHEN** a mentor holds Level 1 and an enrolled second factor and holds only the `TERMS` and `PRIVACY_NOTICE` consents
- **THEN** the profile status is `ACTIVE`

**Reason**: The consents this requirement said no route could record now exist. `VOLUNTEER_AGREEMENT`, `COMMUNITY_GUIDELINES` and the orientation acknowledgement are recorded by `trust/consent-purposes`, and the activation predicate refuses to reach `ACTIVE` without them. `DEBT-18` is closed by this change.

**Migration**: A mentor accepts the two agreements and the orientation on the consent page; the predicate change in the requirement above then applies at the next activation or re-evaluation event. Already-`ACTIVE` profiles keep their status until such an event runs, because this change ships no backfill.

## ADDED Requirements

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
