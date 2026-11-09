# Spec Delta

## MODIFIED Requirements

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
