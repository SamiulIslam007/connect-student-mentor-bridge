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
