# Spec Delta

## ADDED Requirements

### Requirement: Admin evidence reading is case-scoped

A platform admin SHALL read evidence only when the outcome is in `IN_PLATFORM_REVIEW` or has an open review case linked to it, SHALL supply a reason, and SHALL write `EVIDENCE_VIEWED` with the case and reason before the link is produced. An unrelated counted, pending or rejected outcome SHALL answer `403 EVIDENCE_ACCESS_DENIED`; a participant's own read is unchanged.

#### Scenario: An unrelated admin is refused

- **WHEN** a platform admin with a factor asks for evidence on a `COUNTED` outcome with no open case
- **THEN** the response is `403 EVIDENCE_ACCESS_DENIED`, no link is produced, and no audit row is written

#### Scenario: A case-linked read is allowed

- **WHEN** the outcome is in `IN_PLATFORM_REVIEW` and the admin supplies a reason
- **THEN** the link is produced and exactly one `EVIDENCE_VIEWED` row carries the reason and the case

#### Scenario: A reason is required

- **WHEN** the admin supplies no reason or one longer than 1,000 characters
- **THEN** the response is `422` and no link or audit row is produced

#### Scenario: The participant read is unchanged

- **WHEN** the reporting student or the mentorship's mentor reads their own evidence
- **THEN** the response is `200` with a short-lived link and no admin audit row

#### Scenario: The case is rechecked at read time

- **WHEN** the review case closes between the admin's page load and the read
- **THEN** the read is refused with the same `403` and nothing is disclosed
