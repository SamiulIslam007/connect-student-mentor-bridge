# profiles/student-and-mentor-profiles Specification

## Purpose
Defines the student and mentor profiles a user creates for themselves: what each profile contains, how a save replaces it, who may read or write it, and why an invalid value leaves nothing behind.

## Requirements

### Requirement: Student profile content

The system SHALL store a student profile with a goals statement, one primary field, up to two interest fields, and mentoring language codes. Goals and the primary field SHALL be required; interest fields and languages MAY be empty. Every text value SHALL accept Unicode and be returned unchanged.

#### Scenario: A complete student profile is saved

- **WHEN** a signed-in user saves goals, one primary field, two interest fields, and two language codes
- **THEN** the profile is stored and returned with all of those values

#### Scenario: Bangla text is preserved

- **WHEN** a student saves goals written in Bangla script
- **THEN** the stored and returned goals are identical to the submitted text

#### Scenario: Interest fields are optional

- **WHEN** a student saves only goals and a primary field
- **THEN** the profile is saved with an empty interest list and an empty language list

#### Scenario: Three interest fields are refused

- **WHEN** a student saves three interest fields
- **THEN** the request is refused with `422` and the profile is unchanged

#### Scenario: Interest field repeats the primary field

- **WHEN** an interest field resolves to the same field as the primary field
- **THEN** the request is refused with `422` and the profile is unchanged

#### Scenario: Duplicate interest fields collapse

- **WHEN** a student submits `AI` and `ai` as two interest fields
- **THEN** the profile stores one interest reference and the save succeeds

#### Scenario: Language codes are case-folded

- **WHEN** a student submits `EN` and `bn`
- **THEN** the profile stores `en` and `bn` once each

### Requirement: Saving a student profile replaces it

The system SHALL create or fully replace the signed-in user's student profile on `PUT /v1/me/student-profile`, deriving the user from the session only. The save SHALL remove interest references that are absent from the new submission and SHALL return the saved profile.

#### Scenario: First save creates the profile

- **WHEN** a signed-in user with no student profile calls the endpoint
- **THEN** one student profile is created for that user

#### Scenario: Second save replaces interests

- **WHEN** a student profile referencing fields A and B is saved again referencing only C
- **THEN** the profile references only C and the A and B interests are gone

#### Scenario: No session

- **WHEN** the endpoint is called with no valid session
- **THEN** it is rejected with `401` and nothing is written

#### Scenario: A body user id is ignored

- **WHEN** user A submits a body containing user B's id
- **THEN** the response is `422` naming that property, A's profile is unchanged, and B's profile is unchanged

#### Scenario: A revoked session cannot save

- **WHEN** an account whose sessions were revoked by deactivation calls the endpoint with its old token
- **THEN** it is rejected with `401` and nothing is written

### Requirement: Mentor profile content

The system SHALL store a mentor profile with a headline, bio, expertise summary, scope statement, one primary field, additional fields, mentoring language codes, and a weekly capacity. The text fields and the primary field SHALL be required; additional fields and languages MAY be empty. Saving a mentor profile SHALL require the caller to hold the `MENTOR` role, and the refusal SHALL be distinguishable from a validation failure.

#### Scenario: A complete mentor profile is saved

- **WHEN** a signed-in account holding the mentor role saves a headline, bio, expertise summary, scope statement, primary field, two additional fields, one language code, and a capacity
- **THEN** the profile is stored and returned with all of those values

#### Scenario: Additional fields are optional

- **WHEN** a mentor saves the required text fields and a primary field only
- **THEN** the profile is saved with an empty additional-field list

#### Scenario: An additional field repeats the primary field

- **WHEN** an additional field resolves to the same field as the primary field
- **THEN** the request is refused with `422` and the profile is unchanged

#### Scenario: Empty required text is refused

- **WHEN** a mentor saves a headline of `"   "`
- **THEN** the request is refused with `422` and no mentor profile is written

#### Scenario: Saving without the mentor role is refused

- **WHEN** a signed-in account that does not hold the mentor role saves a mentor profile
- **THEN** the request is refused with `403` and code `ROLE_REQUIRED`, no mentor profile is written, and the account is offered the mentor opt-in rather than a validation error

#### Scenario: The mentor role without a second factor can still save in this change

- **WHEN** an account holds the mentor role, has no enrolled second factor, and saves a mentor profile
- **THEN** the save succeeds in this change; the second-factor requirement for mentor role actions is applied by #5 when activation begins

### Requirement: Weekly capacity is bounded

The weekly capacity SHALL be an integer from 1 to 5 inclusive in this change. The maximum of 5 is a Proposed default and moves to versioned configuration in Sprint 7. A value outside the range, or a value that is not an integer, SHALL be refused with `422`.

#### Scenario: Lower bound

- **WHEN** a mentor saves a weekly capacity of 1
- **THEN** the profile is saved

#### Scenario: Upper bound

- **WHEN** a mentor saves a weekly capacity of 5
- **THEN** the profile is saved

#### Scenario: Zero and above-maximum refused

- **WHEN** a mentor saves a weekly capacity of 0 or 6
- **THEN** each request is refused with `422` and the profile is unchanged

#### Scenario: Fractional and string values refused

- **WHEN** a mentor saves a weekly capacity of `2.5` or `"3"`
- **THEN** each request is refused with `422` and the profile is unchanged

### Requirement: Saving a mentor profile replaces it

The system SHALL create or fully replace the signed-in user's mentor profile on `PUT /v1/me/mentor-profile`, deriving the user from the session only. The save SHALL remove additional-field references that are absent from the new submission and SHALL return the saved profile.

#### Scenario: First save creates the profile

- **WHEN** a signed-in user with no mentor profile calls the endpoint
- **THEN** one mentor profile is created for that user

#### Scenario: Second save replaces additional fields

- **WHEN** a mentor profile referencing fields A and B is saved again referencing only C
- **THEN** the profile references only C and the A and B references are gone

#### Scenario: No session

- **WHEN** the endpoint is called with no valid session
- **THEN** it is rejected with `401` and nothing is written

#### Scenario: A body user id is ignored

- **WHEN** user A submits a body containing user B's id
- **THEN** the response is `422` naming that property, A's profile is unchanged, and B's profile is unchanged

### Requirement: Profiles are readable only by their owner

`GET /v1/me` SHALL return the caller's `student_profile` and `mentor_profile` as nullable properties alongside the account record. It SHALL NOT return another user's profile, and no endpoint in this capability SHALL accept a user identifier from the request path or body.

#### Scenario: No profile yet

- **WHEN** a signed-in user with no role profile calls `GET /v1/me`
- **THEN** both `student_profile` and `mentor_profile` are null and the account record is unchanged

#### Scenario: Both profiles on one account

- **WHEN** a signed-in user holds both a student and a mentor profile
- **THEN** `GET /v1/me` returns both, and neither contains another user's data

#### Scenario: Profile endpoints need a session

- **WHEN** `GET /v1/me` is called with no valid session
- **THEN** it is rejected with `401` and returns no account or profile data

### Requirement: A refused save writes nothing

A profile save SHALL be atomic. When any submitted value is invalid, the request SHALL be refused with `422 VALIDATION_FAILED` and SHALL write no profile row, no interest or additional-field row, and no new field.

#### Scenario: Invalid capacity leaves no orphan field

- **WHEN** a mentor save submits a new field name together with a capacity of 6
- **THEN** the request is refused with `422` and the new field does not exist afterwards

#### Scenario: Invalid interest count leaves nothing behind

- **WHEN** a student save submits three interest fields
- **THEN** the request is refused with `422` and no student profile is written for that user

### Requirement: Profile saves cannot change the account

A profile save SHALL ignore `account_status`, `display_name`, `email`, and any other account-level property in the body without raising an error for them, and SHALL leave the account record unchanged.

#### Scenario: Status submitted with a profile

- **WHEN** a signed-in user submits `account_status: "SUSPENDED"` with a valid profile
- **THEN** the response is `200`, the profile is saved, and the stored account status is unchanged

#### Scenario: Display name submitted with a profile

- **WHEN** a signed-in user submits a new `display_name` with a valid profile
- **THEN** the response is `200` and the stored account display name is unchanged

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
