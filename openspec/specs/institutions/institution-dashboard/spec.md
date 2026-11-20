# institutions/institution-dashboard Specification

## Purpose
Gives the institution that signed the MoU the aggregate evidence `FR-INST-02` describes — counts of verified alumni, mentor participation, request traffic, response timeliness, outcome reporting and confirmation, and counted outcomes by field — scoped to its own institution, with every slice below the settled floor of five withheld. It carries no student-level row and no rate.

## Requirements

### Requirement: An institution admin reads the aggregate counts of one institution

The system SHALL return the `FR-INST-02` aggregate counts for the institution named in a required `institution_id` to a caller holding `INSTITUTION_ADMIN` with an enrolled second factor and an assignment for that institution, SHALL report each count as an integer, and SHALL return `404` for an institution the caller does not administer.

#### Scenario: The caller reads the institution it administers

- **WHEN** an institution admin whose assignment names one institution requests the aggregates for that institution
- **THEN** the response carries the verified-alumni, active-mentor, request, response-timeliness, outcome and by-field counts for that institution only

#### Scenario: Another institution answers 404

- **WHEN** the same caller requests the aggregates for an institution it does not administer, or for an id that exists nowhere
- **THEN** both responses are `404` with the same problem body and no count is disclosed

#### Scenario: A caller without the role reads nothing

- **WHEN** a student, a mentor, a platform admin without the institution assignment, or an anonymous client requests the aggregates
- **THEN** the response is `403` or `401` and no count is disclosed

#### Scenario: The payload counts and never rates

- **WHEN** the aggregates are read for an institution with activity
- **THEN** every metric is a whole number, the payload carries no percentage, share, score or ranking, and it carries no student identifier

### Requirement: A count below the cohort floor is withheld

The system SHALL withhold every aggregate below the cohort floor of five by omitting its value and naming it in a `suppressed` list, SHALL omit a by-field row whose counted total is below the floor, and SHALL NOT let a withheld value be inferred from another field.

#### Scenario: A slice of four is withheld

- **WHEN** an institution has four verified alumni
- **THEN** the verified-alumni count is absent from the payload, `verified_alumni` appears in the `suppressed` list, and no other field restates it

#### Scenario: A slice of five is reported

- **WHEN** an institution has five verified alumni
- **THEN** the verified-alumni count is five and the metric is absent from the `suppressed` list

#### Scenario: A small field is absent from the breakdown

- **WHEN** one field has four counted outcomes and another has five
- **THEN** the by-field breakdown carries the field with five only, and the suppressed list names no field id
