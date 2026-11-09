# Spec Delta

## MODIFIED Requirements

### Requirement: Weekly availability is stored per context

The system SHALL store a caller's availability as a set of weekly windows, each with a context (`STUDENT` or `MENTOR`), a weekday from 1 to 7, a start minute and an end minute from 0 to 1440, and an IANA time zone, and SHALL replace the whole set for one context in a single write.

#### Scenario: Saving windows replaces the set

- **WHEN** a signed-in account saves two mentor windows and later saves one
- **THEN** the account has exactly one mentor window afterwards, and its student windows are unchanged

#### Scenario: Contexts are independent

- **WHEN** an account saves mentor windows and student windows
- **THEN** reading either context returns only that context's windows

#### Scenario: Only the caller's own availability

- **WHEN** a request carries another account's user id in the path or a body property naming one
- **THEN** the response is `422` naming the property, and the caller's stored windows are unchanged

#### Scenario: Empty is a valid set

- **WHEN** an account saves an empty list for a context
- **THEN** that context's windows are cleared and the response is a success

#### Scenario: Windows come back in a stable order

- **WHEN** an account reads its availability
- **THEN** the windows are ordered by weekday, then start minute, then end minute
