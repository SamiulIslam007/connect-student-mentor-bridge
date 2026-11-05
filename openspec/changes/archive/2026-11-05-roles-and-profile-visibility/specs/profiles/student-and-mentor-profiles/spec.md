# Spec Delta

## MODIFIED Requirements

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
