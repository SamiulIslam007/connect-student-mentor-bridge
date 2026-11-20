# Spec Delta

## MODIFIED Requirements

### Requirement: A platform admin lists the institutions with their domains

The system SHALL return institutions with their status and their domains to a caller holding `PLATFORM_ADMIN` with an enrolled second factor, ordered by name then id, SHALL accept an opaque `cursor` and a `limit` from 1 to 100 defaulting to 50, SHALL return at most `limit` rows with a `next_cursor` present unless the page is the last, and SHALL refuse a malformed cursor with `422`.

#### Scenario: The list carries domains and status

- **WHEN** a platform admin reads the list after creating two institutions
- **THEN** both appear, each with its status and its own domains only

#### Scenario: A caller without the role reads nothing

- **WHEN** an institution admin, a mentor or an anonymous client reads the list
- **THEN** the response is `403` or `401` and no institution is disclosed

#### Scenario: The order is stable

- **WHEN** the list is read twice with no intervening write, and again with the `next_cursor` of the first page
- **THEN** the first two responses are in the same order, and the second page continues after the last row of the first with no row repeated and none omitted
