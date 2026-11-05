# Spec Delta

## Purpose

Records when each account can meet and whether a mentor is currently accepting work, in a shape discovery and requests can read without interpretation — and states plainly which parts of that fact are inert until those changes land.

## ADDED Requirements

### Requirement: Weekly availability is stored per context

The system SHALL store a caller's availability as a set of weekly windows, each with a context (`STUDENT` or `MENTOR`), a weekday from 1 to 7, a start minute and an end minute from 0 to 1440, and an IANA time zone, and SHALL replace the whole set for one context in a single write.

#### Scenario: Saving windows replaces the set

- **WHEN** a signed-in account saves two mentor windows and later saves one
- **THEN** the account has exactly one mentor window afterwards, and its student windows are unchanged

#### Scenario: Contexts are independent

- **WHEN** an account saves mentor windows and student windows
- **THEN** reading either context returns only that context's windows

#### Scenario: Only the caller's own availability

- **WHEN** a request carries another account's user id or a body property naming one
- **THEN** that property has no effect and only the caller's windows are written

#### Scenario: Empty is a valid set

- **WHEN** an account saves an empty list for a context
- **THEN** that context's windows are cleared and the response is a success

#### Scenario: Windows come back in a stable order

- **WHEN** an account reads its availability
- **THEN** the windows are ordered by weekday, then start minute, then end minute

### Requirement: Availability is validated before it is written

The system SHALL refuse an availability set with `422` and write nothing when a weekday is outside 1 to 7, when a minute is outside 0 to 1440, when the end minute is not after the start minute, when two windows for the same context and weekday overlap, when the set exceeds the per-context cap, or when the time zone is not a valid IANA zone.

#### Scenario: End before start

- **WHEN** a window has an end minute at or before its start minute
- **THEN** the request is refused with `422` and no window is written

#### Scenario: Overlapping windows on one weekday

- **WHEN** two windows for the same context and weekday share any minute
- **THEN** the request is refused with `422` and the previously stored set is unchanged

#### Scenario: Adjacent windows are allowed

- **WHEN** one window ends at 10:00 and the next starts at 10:00 on the same weekday
- **THEN** both are accepted

#### Scenario: The cap

- **WHEN** a set exceeds the per-context window cap
- **THEN** the request is refused with `422`, and the cap value is named in the refusal detail

#### Scenario: An unknown time zone

- **WHEN** a window carries a time zone the runtime does not recognise
- **THEN** the request is refused with `422` and no window is written

#### Scenario: A refused save keeps the previous set

- **WHEN** a valid set is stored and a later save is refused
- **THEN** the stored set is exactly what it was before the refused save

### Requirement: The mentor access mode is one of three stored values

The mentor profile SHALL carry an access mode of `OPEN`, `APPLICATION_ONLY`, or `PAUSED`, defaulting to `OPEN`, SHALL let the mentor set `OPEN` or `APPLICATION_ONLY` when saving the profile, SHALL let the mentor pause and resume without resaving the profile, and SHALL default a resume to `OPEN` when no mode is named.

#### Scenario: A new mentor profile is open

- **WHEN** a mentor profile is created without naming an access mode
- **THEN** its access mode is `OPEN`

#### Scenario: Choosing application-only

- **WHEN** a mentor saves the profile with `APPLICATION_ONLY`
- **THEN** the stored mode is `APPLICATION_ONLY` and every other profile field is unchanged

#### Scenario: Pause and resume

- **WHEN** a mentor pauses and then resumes naming `APPLICATION_ONLY`
- **THEN** the mode is `PAUSED` after the pause and `APPLICATION_ONLY` after the resume

#### Scenario: Resume without a mode

- **WHEN** a mentor resumes without naming a mode
- **THEN** the mode is `OPEN`

#### Scenario: Pause is idempotent

- **WHEN** a mentor who is already paused pauses again
- **THEN** the response is a success and the mode is unchanged

#### Scenario: Pausing is not a capacity decision

- **WHEN** a mentor pauses or resumes
- **THEN** no active-mentorship capacity check runs in this change, and the response never reports `CAPACITY_BELOW_ACTIVE`

### Requirement: A paused or inactive mentor is not discoverable

The system SHALL provide a pure policy that answers whether a mentor profile may appear in discovery, and it SHALL answer false when the access mode is `PAUSED` and false when the operating status is not `ACTIVE`.

#### Scenario: Paused is hidden

- **WHEN** the policy is asked about a mentor whose access mode is `PAUSED`
- **THEN** it answers not discoverable, whatever the operating status is

#### Scenario: Application-only is discoverable

- **WHEN** the policy is asked about an `ACTIVE` mentor whose access mode is `APPLICATION_ONLY`
- **THEN** it answers discoverable

#### Scenario: A non-active mentor is hidden

- **WHEN** the policy is asked about a mentor whose operating status is `DRAFT`, `PENDING`, `SUSPENDED`, or `REMOVED`
- **THEN** it answers not discoverable, whatever the access mode is

#### Scenario: The policy is total

- **WHEN** the unit tests drive every combination of access mode and operating status
- **THEN** every combination has an expected answer and none falls through

### Requirement: APPLICATION_ONLY has no enforcement in this change

The system SHALL store and validate `APPLICATION_ONLY` and SHALL NOT change any other behaviour because of it: no route, list, or request path SHALL be gated by it until the request flow lands.

#### Scenario: Application-only changes nothing but the stored value

- **WHEN** a mentor sets `APPLICATION_ONLY`
- **THEN** the profile reads back that value and no other endpoint behaves differently

#### Scenario: The UI does not promise enforcement

- **WHEN** the mentor selects `APPLICATION_ONLY`
- **THEN** the copy states that student applications are not built yet and that the setting is recorded for when they are

### Requirement: The profile page edits availability and access mode

The profile page SHALL let a signed-in account edit weekly availability for the profile kinds it holds, SHALL let a mentor holding the `MENTOR` role select an access mode and pause or resume, SHALL use the string catalog for every label and message, and SHALL render loading, empty, error, and saved states.

#### Scenario: A student edits availability

- **WHEN** a signed-in student adds a Monday window and saves
- **THEN** the student availability section shows the saved window and a confirmation

#### Scenario: A mentor edits availability and pauses

- **WHEN** a mentor adds a window, saves, and pauses
- **THEN** the window is stored, the access mode shows `PAUSED`, and the resume action is offered

#### Scenario: A non-mentor sees no access-mode section

- **WHEN** an account without the mentor role opens the profile page
- **THEN** no access-mode control is rendered

#### Scenario: A refused save is explained

- **WHEN** the save is refused with `422`
- **THEN** the page keeps the entered windows, shows the problem detail from the string catalog, and does not claim the change was saved

#### Scenario: An empty state

- **WHEN** no availability is stored for a context
- **THEN** the section states that none is set and offers the first add action
