# Spec Delta

## MODIFIED Requirements

### Requirement: The thread is participant-only

The thread SHALL be readable and writable by the mentorship's two participants only through the participant routes, SHALL reject any other account with `404` on those routes, and SHALL list messages oldest first with a keyset cursor. The thread SHALL be readable by an account outside the pair only through the audited break-glass read defined by the next requirement, and by no other path.

#### Scenario: Both participants read the thread

- **WHEN** either participant lists the messages
- **THEN** the response is `200` with the messages ordered oldest first and a `next_cursor` that is null on the last page

#### Scenario: A third account is refused

- **WHEN** an account that is neither participant lists the messages
- **THEN** the response is `404` and no message body is disclosed

#### Scenario: A third account cannot post

- **WHEN** an account that is neither participant posts a message
- **THEN** the response is `404` and no message row is written

## ADDED Requirements

### Requirement: A platform admin reads a thread only through audited break-glass

The system SHALL allow an account holding `PLATFORM_ADMIN` with an enrolled second factor to read a mentorship's thread, its agreement and its session records through one route that requires a stated reason of at most 1000 characters, SHALL append exactly one audit entry carrying the acting account, the mentorship and the reason before any content is returned, and SHALL refuse every other caller.

#### Scenario: The read succeeds and is audited

- **WHEN** a platform admin with an enrolled second factor submits a reason for a mentorship they are not part of
- **THEN** the response is `200` with the messages oldest first, the agreement and the session records, and exactly one audit entry exists carrying the acting account, the mentorship id, the reason and the break-glass marker

#### Scenario: No content is returned without an audit entry

- **WHEN** any break-glass read returns content
- **THEN** its audit entry was already written, so a response without a matching entry cannot occur

#### Scenario: A missing or empty reason is refused

- **WHEN** the request carries no reason or a reason that is empty after trimming
- **THEN** the response is `422` naming the field, no audit entry is written, and no content is returned

#### Scenario: An over-long reason is refused

- **WHEN** the reason exceeds 1000 characters
- **THEN** the response is `422` with a message that states the limit, no audit entry is written, and no content is returned

#### Scenario: A caller without the role is refused

- **WHEN** a student, a mentor or an institution admin calls the break-glass route
- **THEN** the response is `403` with code `ROLE_REQUIRED`, no audit entry is written, and no content is returned

#### Scenario: A platform admin without a second factor is refused

- **WHEN** a platform admin with no enrolled second factor calls the break-glass route
- **THEN** the response is `403` with code `MFA_REQUIRED`, the request is refused before any write, no audit entry is written, and no content is returned

#### Scenario: An anonymous caller is refused

- **WHEN** a client with no session calls the break-glass route
- **THEN** the response is `401`, no audit entry is written, and no content is returned

#### Scenario: An unknown mentorship is not found

- **WHEN** the route names a mentorship id that does not exist
- **THEN** the response is `404`, no audit entry is written, and no content is returned

#### Scenario: The projection is the participant projection

- **WHEN** any break-glass response is returned
- **THEN** it carries the same thread, agreement and session shape a participant receives, and no outcome text, no profile text and no email address

#### Scenario: The response is not cacheable

- **WHEN** any break-glass response is returned
- **THEN** it carries `Cache-Control: no-store`
