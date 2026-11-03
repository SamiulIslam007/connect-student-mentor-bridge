# profiles/dynamic-fields Specification

## Purpose
Defines how a typed Field name becomes one canonical Field row, which spellings collide, and how the taxonomy is listed, so profiles and later matching share one key per concept instead of drifting into duplicate labels.

## Requirements

### Requirement: Field names normalize to one canonical slug

The system SHALL derive a field's `normalized_slug` from its submitted display name by NFKC normalization, trimming, case-folding, and collapsing each run of whitespace, hyphen, or underscore into a single space. Two names with the same normalized slug SHALL resolve to the same field.

#### Scenario: Case and separators collide

- **WHEN** one profile is saved with the field name `Data science` and another with `data-science`
- **THEN** exactly one `fields` row exists, and both profiles reference it

#### Scenario: Separator runs collapse

- **WHEN** a profile is saved with the field name `  Data___Science  `
- **THEN** the stored normalized slug is `data science`

#### Scenario: Unicode name stays meaningful

- **WHEN** a profile is saved with the Bangla field name `ডাটা সায়েন্স`
- **THEN** the stored slug is non-empty, contains the same characters case-folded and separator-collapsed, and the display name is returned unchanged

#### Scenario: Compatibility forms unify

- **WHEN** a profile is saved with the full-width name `ＡＩ`
- **THEN** it resolves to the same field as `AI`

#### Scenario: Punctuation is preserved

- **WHEN** profiles are saved with `C++` and `C`
- **THEN** two distinct fields exist, because punctuation is not a separator

### Requirement: Field names are bounded and non-empty

A field name SHALL be accepted only when its trimmed display name contains between 1 and 100 characters. A name outside that range SHALL be refused with `422 VALIDATION_FAILED` and SHALL create no field.

#### Scenario: Empty name refused

- **WHEN** a profile is saved with a field name of `"   "`
- **THEN** the request is refused with `422` and no field row is created

#### Scenario: Over-long name refused

- **WHEN** a profile is saved with a field name of 101 characters
- **THEN** the request is refused with `422` and no field row is created

#### Scenario: Boundary accepted

- **WHEN** a profile is saved with a field name of exactly 100 characters
- **THEN** the field is created and the profile is saved

### Requirement: Fields are created only as part of a profile save

The system SHALL create a field only while saving a student or mentor profile. It SHALL NOT expose a standalone field-creation endpoint. A first save stores the submitted display name; later saves with a different spelling of the same slug SHALL reuse the row without changing its stored display name.

#### Scenario: Unknown name creates one field

- **WHEN** a signed-in user saves a profile with a field name that does not exist
- **THEN** one `fields` row is created with `created_by_user_id` set to that user and the profile references it

#### Scenario: Existing name reuses the row

- **WHEN** a second user saves a profile with a name whose normalized slug already exists
- **THEN** no new field row is created and the display name stored by the first save is unchanged

#### Scenario: Concurrent saves create one row

- **WHEN** two profile saves submit the same new field name at the same time
- **THEN** both succeed, both profiles reference one field row, and no duplicate or uniqueness error surfaces to either caller

### Requirement: The field taxonomy is listed, never hard-coded

`GET /v1/fields` SHALL return the active field taxonomy to a signed-in user, sorted by display name, and SHALL return only each field's id and name. The system SHALL NOT ship a seeded or hard-coded field list.

#### Scenario: Taxonomy starts empty

- **WHEN** no profile has been saved yet and a signed-in user calls `GET /v1/fields`
- **THEN** the response is an empty list

#### Scenario: Created fields are listed

- **WHEN** a profile save creates a field and a signed-in user later calls `GET /v1/fields`
- **THEN** the response contains that field's id and name

#### Scenario: Fields need a session

- **WHEN** `GET /v1/fields` is called with no valid session
- **THEN** it is rejected with `401` and returns no taxonomy data

#### Scenario: A retired field is not offered

- **WHEN** a field's status is `RETIRED`
- **THEN** `GET /v1/fields` omits it, while every existing profile reference to it stays readable

### Requirement: Fields outlive profiles and accounts

The system SHALL keep a field row when a profile is replaced or its owner's account is removed, and SHALL set `created_by_user_id` to null in the latter case.

#### Scenario: Replacing a profile keeps an unused field

- **WHEN** a profile that referenced field A is replaced with a profile that no longer references it
- **THEN** field A still exists and is still listed

#### Scenario: Removing the creator keeps the field

- **WHEN** the user row that created a field is removed
- **THEN** the field row remains, with `created_by_user_id` null, and its slug is still reserved
