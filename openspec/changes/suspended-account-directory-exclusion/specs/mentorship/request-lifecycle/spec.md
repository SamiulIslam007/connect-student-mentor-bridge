# Spec Delta

## ADDED Requirements

### Requirement: A request is refused when the mentor's account is not active

The request creation path SHALL refuse a request to a mentor whose account status is not `ACTIVE` with the existing `MENTOR_UNAVAILABLE` conflict, SHALL use that same answer for a suspension, a self-deactivation, and an anonymized account so no cause is disclosed, SHALL write no `mentorship_requests` row, and SHALL keep the not-found answer for an id that names no mentor profile at all.

#### Scenario: A suspended mentor cannot receive a new request

- **WHEN** a student sends a valid request to a mentor whose profile is `ACTIVE` and whose account status is `SUSPENDED`
- **THEN** the response is `409 MENTOR_UNAVAILABLE`, no request row is written, and no notification is queued

#### Scenario: The refusal names no cause

- **WHEN** the request to a suspended mentor is refused
- **THEN** the problem title is the same one a paused mentor returns, so the caller cannot tell a suspension from a pause or a deactivation

#### Scenario: An unknown mentor id keeps its own answer

- **WHEN** the request names an id that is not a mentor profile
- **THEN** the response remains `422 VALIDATION_FAILED` naming `mentor_id`

#### Scenario: The request context is not served for an inactive account

- **WHEN** a signed-in caller reads `GET /v1/mentors/{id}` for a mentor whose account status is not `ACTIVE`
- **THEN** the response is `404`, so the request form cannot be opened for that mentor

#### Scenario: A request already sent stays as it is

- **WHEN** a request was sent before the mentor was suspended
- **THEN** the request keeps its status, its 48-hour window, and its accept and decline paths, and only new requests are refused
