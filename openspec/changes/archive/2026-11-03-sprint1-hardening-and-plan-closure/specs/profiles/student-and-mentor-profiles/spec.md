# Spec Delta

## ADDED Requirements

### Requirement: Profile size bounds

A mentor profile SHALL have at most 5 fields in total (the primary field plus up to 4 additional fields). A student or mentor profile SHALL have at most 5 mentoring languages after case-folding and de-duplication. A save above either bound SHALL be refused with `422 VALIDATION_FAILED` and SHALL write nothing.

#### Scenario: Mentor five fields accepted

- **WHEN** a mentor saves one primary field and four additional fields
- **THEN** the profile is saved with all five references

#### Scenario: Mentor six fields refused

- **WHEN** a mentor saves one primary field and five additional fields
- **THEN** the request is refused with `422` and no profile or field row is written

#### Scenario: Student five languages accepted

- **WHEN** a student saves five distinct language codes
- **THEN** the profile is saved with those five codes

#### Scenario: Student six languages refused

- **WHEN** a student saves six language codes
- **THEN** the request is refused with `422` and the previous profile is unchanged

#### Scenario: Duplicate languages count once

- **WHEN** a student submits `EN`, `en`, and `bn`
- **THEN** the stored list is `en`, `bn` and the save is accepted

#### Scenario: Mentor six languages refused

- **WHEN** a mentor saves six language codes
- **THEN** the request is refused with `422` and the previous profile is unchanged
