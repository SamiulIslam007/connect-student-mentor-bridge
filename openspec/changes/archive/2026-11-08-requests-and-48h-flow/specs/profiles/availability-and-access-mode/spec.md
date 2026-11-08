# Spec Delta

## ADDED Requirements

### Requirement: APPLICATION_ONLY requires an application note

The system SHALL require a non-empty `application_note` on a request addressed to an `APPLICATION_ONLY` mentor, SHALL refuse the request without one, and SHALL otherwise let the request proceed like any other, so the mode gates the request's content rather than the mentor's availability.

#### Scenario: Application-only requires a note

- **WHEN** a student submits a request to an `APPLICATION_ONLY` mentor with no application note
- **THEN** the response is `422 VALIDATION_FAILED` with a field error naming `application_note`, and no request row is written

#### Scenario: Application-only with a note

- **WHEN** a student submits a request to an `APPLICATION_ONLY` mentor with a non-empty note
- **THEN** the request is created `PENDING`, the note is stored on it, and the mentor's notification is queued

#### Scenario: The mode does not block the request

- **WHEN** a student submits a valid request to an `APPLICATION_ONLY` mentor
- **THEN** the request is created rather than refused or auto-declined

#### Scenario: The UI states the requirement

- **WHEN** the mentor selects `APPLICATION_ONLY`
- **THEN** the copy states that students must send a short application note with each request

#### Scenario: An open mentor needs no note

- **WHEN** a student submits a request to an `OPEN` mentor with no application note
- **THEN** the request is created and the note stays empty

## REMOVED Requirements

### Requirement: APPLICATION_ONLY has no enforcement in this change

The system SHALL store and validate `APPLICATION_ONLY` and SHALL NOT change any other behaviour because of it: no route, list, or request path SHALL be gated by it until the request flow lands.

#### Scenario: Application-only changes nothing but the stored value

- **WHEN** a mentor sets `APPLICATION_ONLY`
- **THEN** the profile reads back that value and no other endpoint behaves differently

#### Scenario: The UI does not promise enforcement

- **WHEN** the mentor selects `APPLICATION_ONLY`
- **THEN** the copy states that student applications are not built yet and that the setting is recorded for when they are

**Reason**: The request flow has landed, which is the exact condition this requirement set for its own replacement: the mode must now gate requests instead of staying inert. Its scenarios assert the opposite of the required behaviour, so it cannot be kept as written.

**Migration**: The enforcing behaviour is specified by the new requirement `APPLICATION_ONLY requires an application note` in this capability, and by the request-creation rules in `mentorship/request-lifecycle`. The stored values, the save path, and pause/resume are unchanged.
