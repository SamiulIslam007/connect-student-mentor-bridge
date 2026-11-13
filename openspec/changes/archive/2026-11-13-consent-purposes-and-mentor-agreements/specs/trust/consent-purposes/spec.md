# Spec Delta

## Purpose

Records, revokes and versions the consents a signed-in user gives beyond registration, and tells the user when a document they accepted has changed.

## ADDED Requirements

### Requirement: Three further purposes are recorded append-only

The system SHALL accept a signed-in caller's consent for `VOLUNTEER_AGREEMENT`, `COMMUNITY_GUIDELINES` and `INSTITUTION_DATA_SHARING`, SHALL append one `consent_records` row per call with the purpose, the action, the document version and the institution when the purpose is a data-sharing purpose, and SHALL NOT update or delete an existing row.

#### Scenario: A mentor accepts the volunteer agreement

- **WHEN** a signed-in mentor posts `VOLUNTEER_AGREEMENT` with `GRANTED` and the current document version
- **THEN** one `consent_records` row exists for that account, purpose, action and version, and the read reports that purpose as accepted

#### Scenario: A student grants institution sharing for one institution

- **WHEN** the caller posts `INSTITUTION_DATA_SHARING` with `GRANTED` and an institution id it can see
- **THEN** the appended row carries that institution id and no other institution's sharing state changes

#### Scenario: An unknown purpose or action is refused

- **WHEN** the body carries a purpose outside the five enum values, an action outside `GRANTED` and `WITHDRAWN`, or a data-sharing purpose without an institution id
- **THEN** the response is `422 VALIDATION_FAILED` naming the field and no row is written

#### Scenario: A signed-out caller is refused

- **WHEN** an anonymous caller posts a consent
- **THEN** the response is `401` and no row is written

#### Scenario: History is never rewritten

- **WHEN** the same purpose is granted, withdrawn and granted again
- **THEN** three rows exist in order and the read reports the latest one

### Requirement: A student withdraws institution sharing without losing an affiliation

Withdrawing `INSTITUTION_DATA_SHARING` for one institution SHALL append one `WITHDRAWN` row for that institution and SHALL NOT change any `affiliations` row, the caller's account status, or any other purpose.

#### Scenario: Withdrawal leaves verification alone

- **WHEN** a student with a verified Level 1 affiliation withdraws institution sharing for that institution
- **THEN** the consent read reports the purpose as withdrawn for that institution and the affiliation row is byte-identical to the row read before the call

#### Scenario: A withdrawal is itself consented history

- **WHEN** the withdrawal is read back
- **THEN** the `WITHDRAWN` row carries its own document version and timestamp, and the earlier `GRANTED` row is still present

### Requirement: A document version change asks for re-acceptance without blocking

The own account read SHALL report, for each purpose, the current document version and the version of the caller's latest accepted record, and SHALL NOT refuse any other request because the two differ.

#### Scenario: A stale version is signalled

- **WHEN** the current document version is newer than the caller's latest accepted version for a purpose
- **THEN** the own read reports the current version and the accepted version for that purpose

#### Scenario: Nothing is blocked

- **WHEN** a caller with a stale consent version saves a profile or sends a request
- **THEN** the action succeeds and no response is `403` or `422` because of the version

#### Scenario: Accepting the new version clears the signal

- **WHEN** the caller accepts the purpose again with the current version
- **THEN** the own read reports the accepted version equal to the current version

### Requirement: The consent screen serves every purpose the caller can hold

The web app SHALL serve one consent page that lists each purpose the signed-in caller can hold with its document title, its version, an accept control and a withdraw control, and SHALL reach it from the account and profile surfaces.

#### Scenario: A mentor sees the mentor purposes

- **WHEN** a mentor opens the consent page
- **THEN** the volunteer agreement and the community guidelines are listed with their state

#### Scenario: A student sees the sharing purpose

- **WHEN** a student with an affiliation opens the consent page
- **THEN** the institution data-sharing purpose is listed for that institution

#### Scenario: A stale version shows the prompt

- **WHEN** the caller's accepted version differs from the current one
- **THEN** the page and the account banner both link to the same consent page
