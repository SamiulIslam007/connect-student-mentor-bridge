# Spec Delta

## ADDED Requirements

### Requirement: Field names strip format characters and require a letter or number

After NFKC normalization and separator collapsing, the normalizer SHALL remove Unicode `Cf` format characters. A field name SHALL be refused when the normalized slug contains no Unicode letter or number. NFKC compatibility folding remains in force.

#### Scenario: Zero-width-only name is refused

- **WHEN** a profile is saved with a field name made only of zero-width space characters
- **THEN** the request is refused with `422 VALIDATION_FAILED` and no field row is created

#### Scenario: Format characters are stripped

- **WHEN** a profile is saved with `AI` plus zero-width characters between the letters
- **THEN** the normalized slug is `ai` and the field resolves to the same row as `AI`

#### Scenario: A symbol-only name is refused

- **WHEN** a profile is saved with a field name containing only punctuation or emoji and no letter or number
- **THEN** the request is refused with `422` and no field row is created

#### Scenario: Punctuation with a letter stays valid

- **WHEN** a profile is saved with `C++`
- **THEN** the field is accepted because the normalized slug contains a letter

## MODIFIED Requirements

### Requirement: The field taxonomy is listed, never hard-coded

`GET /v1/fields` SHALL return the active field taxonomy to a signed-in user, ordered by normalized slug, and SHALL return each field's id and name plus a `next_cursor` for the next page. It SHALL accept `limit` (default 100, maximum 200) and `cursor` (the last slug of the previous page). The system SHALL NOT ship a seeded or hard-coded field list.

#### Scenario: Taxonomy starts empty

- **WHEN** no profile has been saved yet and a signed-in user calls `GET /v1/fields`
- **THEN** the response is an empty list and `next_cursor` is null

#### Scenario: Created fields are listed

- **WHEN** a profile save creates a field and a signed-in user later calls `GET /v1/fields`
- **THEN** the response contains that field's id and name

#### Scenario: Fields need a session

- **WHEN** `GET /v1/fields` is called with no valid session
- **THEN** it is rejected with `401` and returns no taxonomy data

#### Scenario: A retired field is not offered

- **WHEN** a field's status is `RETIRED`
- **THEN** `GET /v1/fields` omits it, while every existing profile reference to it stays readable

#### Scenario: The page size is bounded

- **WHEN** a client requests `limit=201` or a non-integer limit
- **THEN** the request is refused with `422 VALIDATION_FAILED`

#### Scenario: The cursor returns the next page

- **WHEN** a client requests the default page and receives more than 100 fields
- **THEN** `next_cursor` is the last returned slug and a request with that cursor returns the following fields without duplicates
