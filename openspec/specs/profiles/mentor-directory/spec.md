# profiles/mentor-directory Specification

## Purpose
The public mentor directory: who appears in it, which attributes it may expose, how results are ordered and paginated, and how a mentor's access state is reported to a student deciding whom to ask.

## Requirements

### Requirement: The directory lists only mentors who may receive a request

The system SHALL return, from `GET /v1/mentors`, only mentor profiles whose operating status is `ACTIVE`, SHALL hide every profile whose access mode is `PAUSED`, and SHALL report a profile whose weekly slots are at or above its capacity as `full` rather than omitting it.

#### Scenario: Only active mentors appear

- **WHEN** any caller reads the directory
- **THEN** a `DRAFT`, `PENDING`, `SUSPENDED`, or `REMOVED` mentor profile is absent from every page and from every filter result

#### Scenario: A paused mentor is hidden

- **WHEN** a mentor with `access_mode = 'PAUSED'` exists and the caller filters by any access state, including `available`
- **THEN** that mentor is absent from the result

#### Scenario: A full mentor is listed and marked

- **WHEN** a mentor's slots in use are at or above its weekly capacity
- **THEN** the mentor appears with `access_state: "full"`, and a request to that mentor is still refused by the request path with `MENTOR_AT_CAPACITY`

#### Scenario: Slots in use follow the request rule

- **WHEN** the directory computes slots in use for a mentor
- **THEN** the value is the count of `PENDING` requests plus `ACCEPTED` requests decided inside the rolling seven-day window, computed by the same domain helper the request path uses

### Requirement: The directory exposes only already-public mentor attributes

The directory SHALL return, per mentor, exactly the mentor profile id, display name, headline, access mode, derived access state, primary field, field list, and languages, and SHALL NOT return an email address, an account id, a biography, an expertise summary, a scope statement, a weekly capacity, availability windows, or onboarding status.

#### Scenario: The payload carries no contact or private data

- **WHEN** any directory response is returned
- **THEN** its objects contain no email address, no `user_id`, no availability window, no capacity number, and no biography

#### Scenario: The key set is fixed

- **WHEN** the directory payload is built
- **THEN** each object's key set equals the documented allowlist exactly, and a test fails if a key is added or removed without updating the allowlist

#### Scenario: No numeric score or rank

- **WHEN** any directory response is returned
- **THEN** it contains no `match_score`, `points`, `tier`, `rank`, or reason field

### Requirement: Directory results are filtered, ordered, and paginated deterministically

The system SHALL accept `field`, `language`, `access_state`, `cursor`, and `limit`; SHALL match `field` against the mentor's primary field or any additional field; SHALL match `language` exactly and case-insensitively against one stored language; SHALL order results by mentor profile id ascending; SHALL return at most 50 results per page defaulting to 20; and SHALL return the last id of a full page as `next_cursor`.

#### Scenario: A field filter matches primary and additional fields

- **WHEN** the caller filters by a field id that is a mentor's primary field, and separately by one that only appears in the mentor's additional fields
- **THEN** the mentor appears in both results, once

#### Scenario: Pagination is stable across inserts

- **WHEN** a page is read, a new mentor is activated, and the next page is read with the returned cursor
- **THEN** no mentor from the first page appears again and no mentor between the cursor and the end is skipped

#### Scenario: An unknown filter value is refused

- **WHEN** `access_state` is outside `available`, `application_only`, `full`, or `limit` is outside 1 to 50
- **THEN** the response is `422` with a field error and no list is returned

#### Scenario: An unknown field id is an empty page

- **WHEN** `field` names an id that matches no field
- **THEN** the response is `200` with an empty `data` array, not `404`

### Requirement: The directory is readable without a session and the request action is not

The directory SHALL be readable by a caller with no session, and the request action it offers SHALL resolve to a signed-in route that refuses an anonymous caller.

#### Scenario: An anonymous visitor reads the list

- **WHEN** a client with no session calls `GET /v1/mentors`
- **THEN** the response is `200` with the public projection and no `401`

#### Scenario: An anonymous visitor cannot request

- **WHEN** an anonymous client opens the request form for a mentor named by the list
- **THEN** the form answers as signed out and no request is created

### Requirement: A day and window filter narrows the directory by availability

The public directory SHALL accept `available_weekday` (1 to 7), `available_start` and `available_end` (minute of day), and `available_timezone` (an IANA zone defaulting to `Asia/Dhaka`), SHALL return only mentors holding at least one `MENTOR`-context window that overlaps the requested window, and SHALL compare the two in UTC rather than by wall-clock minute.

#### Scenario: A covering window matches

- **WHEN** a mentor's stored window fully covers the requested weekday and window in the same zone
- **THEN** that mentor appears in the result

#### Scenario: A later window does not match

- **WHEN** a mentor's stored window starts after the requested window ends
- **THEN** that mentor does not appear

#### Scenario: The comparison is in UTC, not wall clock

- **WHEN** the viewer's zone and a mentor's zone differ by more than the requested window's length in hours
- **THEN** the mentor appears only when the two intervals genuinely overlap once converted, and never because the wall-clock hours happen to coincide

#### Scenario: A window crossing midnight matches both adjacent weekdays

- **WHEN** a mentor's stored window ends after 1440 minutes in converted terms, or the requested window crosses midnight in the viewer's zone
- **THEN** the mentor is matched on the weekday the window covers on the other side of midnight as well

#### Scenario: A mentor with no availability is excluded

- **WHEN** the availability filter is applied
- **THEN** a mentor with no `MENTOR`-context window is absent from the result, and present when the filter is not applied

### Requirement: A malformed availability filter is refused, not ignored

The directory SHALL refuse a partial window, an `available_end` that does not exceed `available_start` or exceeds 1440, a weekday outside 1 to 7, and a zone it cannot resolve, each as `422 VALIDATION_FAILED` naming the parameter, and SHALL NOT silently drop a filter it cannot interpret.

#### Scenario: A weekday without a window is refused

- **WHEN** the caller sends `available_weekday` with no start or end
- **THEN** the response is `422` naming the missing parameter and no list is returned

#### Scenario: An inverted window is refused

- **WHEN** `available_end` is less than or equal to `available_start`
- **THEN** the response is `422` naming `available_end`

#### Scenario: An unresolvable zone is refused

- **WHEN** `available_timezone` names no zone the runtime can resolve
- **THEN** the response is `422` naming `available_timezone`

#### Scenario: The day select is offered with the other filters

- **WHEN** a student opens the directory page
- **THEN** a weekday select, a start and end time, a zone defaulted from the browser, and a control that clears the filters are all present, and an empty result names the availability filter

### Requirement: A directory card requires an active account, not only an active profile

The public directory SHALL return a mentor only when the mentor's account status is `ACTIVE` as well as the profile's operating status, SHALL derive that condition from `users.status` on every read rather than from any profile column, and SHALL hide the mentor again for as long as the account is suspended, self-deactivated, deletion-pending, or anonymized.

#### Scenario: A suspended account is absent from every page and every filter

- **WHEN** a mentor whose profile is `ACTIVE` has an account status of `SUSPENDED`
- **THEN** the mentor appears on no page of the directory, under no `access_state`, field, language, or availability filter, and their id is not returned as a cursor target

#### Scenario: A removed or anonymized account is absent

- **WHEN** a mentor's account is `ANONYMIZED` and the profile is `REMOVED`
- **THEN** the mentor is absent from the directory

#### Scenario: Lifting the suspension restores the card with no profile write

- **WHEN** the same account returns to `ACTIVE` through the reinstate route or the scheduled sanction job
- **THEN** the mentor appears in the directory again, and the `mentor_profiles` row is byte-identical to the row read before the suspension

#### Scenario: The listing is derived, never stored

- **WHEN** the directory query is inspected
- **THEN** the account-status condition is present in the query itself, and no profile column is written by a suspension or by a lift
