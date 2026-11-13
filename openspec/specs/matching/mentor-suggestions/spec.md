# matching/mentor-suggestions Specification

## Purpose
Ranks the mentors a student may ask and explains each suggestion in plain language, using only declared profile facts and the documented matching factors, so a student chooses from an ordered shortlist instead of an alphabetical list.

## Requirements

### Requirement: A student's suggestions are ranked eligible mentors

The system SHALL return suggestions only to a signed-in account holding the student role, SHALL return at most five mentors per request, and SHALL refuse an account with no student profile with the code `STUDENT_PROFILE_REQUIRED` rather than returning an arbitrary list.

#### Scenario: A student receives an ordered shortlist

- **WHEN** a signed-in student with a complete student profile requests suggestions
- **THEN** the response is `200`, carries at most five mentors, and each entry carries the mentor profile id, display name, headline, access mode, derived access state, primary field, fields, languages, one to three reasons, and a `limited_information` flag

#### Scenario: More eligible mentors exist than the page holds

- **WHEN** more than five mentors are eligible for the student
- **THEN** exactly five are returned, and they are the five with the highest scores under the ordering rule

#### Scenario: No session

- **WHEN** a request arrives with no valid session
- **THEN** the response is `401` with code `SESSION_INVALID` and no mentor data is returned

#### Scenario: A mentor account asks for suggestions

- **WHEN** a signed-in account that does not hold the student role requests suggestions
- **THEN** the response is `403` with code `ROLE_REQUIRED`

#### Scenario: A student without a profile

- **WHEN** a signed-in student with no student profile requests suggestions
- **THEN** the response is `422` with code `STUDENT_PROFILE_REQUIRED` and no mentor is returned

### Requirement: Eligibility filters remove a mentor before any score is computed

A mentor SHALL be eligible only when the profile status is `ACTIVE`, the access mode is `OPEN`, the remaining weekly capacity is greater than zero by the request capacity rule, at least one field is shared with the student, and the mentor is not the student's own account. An ineligible mentor SHALL be absent from suggestions rather than ranked low.

#### Scenario: A full mentor is not suggested

- **WHEN** a mentor's slots in use are at or above the weekly capacity
- **THEN** that mentor does not appear in the suggestion set, and the same mentor still appears in the directory with access state `full`

#### Scenario: An application-only mentor is not suggested

- **WHEN** a mentor's access mode is `APPLICATION_ONLY`
- **THEN** that mentor does not appear in suggestions and remains requestable from the directory

#### Scenario: No shared field

- **WHEN** a mentor shares no field with the student's primary or interest fields
- **THEN** that mentor does not appear in suggestions and still appears in the unfiltered directory

#### Scenario: A mentor below Level 1 or suspended

- **WHEN** a mentor profile is not `ACTIVE`, which is the state that encodes Level 1 affiliation and an enrolled second factor
- **THEN** that mentor never appears in suggestions

#### Scenario: A dual-role account cannot suggest itself

- **WHEN** the student also holds a mentor profile that would otherwise be eligible
- **THEN** their own mentor profile is excluded from the suggestion set

### Requirement: The score uses the factors whose data exists and renormalizes the rest

The system SHALL compute a numeric score from the factors whose inputs exist on both sides, SHALL exclude a factor whose student-side data is absent, and SHALL renormalize the remaining weights over the active factors so that the score is a weighted average between zero and one. A factor present on both sides with nothing in common SHALL score zero and stay active.

#### Scenario: One factor is missing

- **WHEN** a student has no availability windows and the alumni and field factors are active
- **THEN** the score is computed over those two factors with their weights renormalized, and the suggestion carries `limited_information` set to true

#### Scenario: Nothing in common scores zero, not missing

- **WHEN** a mentor shares a field with the student and has no institutional connection to the student's institution
- **THEN** the alumni factor is zero and remains active, and the score is below the score of a mentor with the same field overlap and a same-department connection

#### Scenario: No active factor remains

- **WHEN** every factor is missing for a student, which today happens when the student has no affiliation and no availability windows and GoalAlignment is always missing
- **THEN** the ordering falls back to remaining capacity, then fewer requests in the last seven days, then the stable pair hash, and the response is still `200`

#### Scenario: Scores compare at six decimals

- **WHEN** two mentors' raw scores differ only beyond the sixth decimal place
- **THEN** they are treated as tied and the tie-break rule decides their order

### Requirement: Field overlap weights the student's primary field twice

Field overlap SHALL be the sum of the weights of the student's fields that appear in the mentor's fields, divided by the sum of the weights of all the student's fields, where the primary field weighs two and each interest field weighs one.

#### Scenario: Primary field only

- **WHEN** the student's primary field is shared and one interest field of two is not
- **THEN** the factor is two divided by four, which is 0.5

#### Scenario: Every field shared

- **WHEN** the mentor's fields contain the student's primary field and both interest fields
- **THEN** the factor is 1.0

### Requirement: Alumni connection compares institution, department, and batch year

When the student holds a verified affiliation, the alumni factor SHALL be 1.0 for the same institution, the same department, and a batch year within the configured distance, 0.5 for the same institution and department with a batch year outside that distance or unrecorded, and zero otherwise. When the student holds no verified affiliation the factor SHALL be missing.

#### Scenario: Same department and nearby batch

- **WHEN** student and mentor share the institution, the department, and batch years within the configured distance
- **THEN** the alumni factor is 1.0

#### Scenario: Same department, distant batch

- **WHEN** student and mentor share the institution and department and their batch years differ by more than the configured distance
- **THEN** the alumni factor is 0.5

#### Scenario: Different institution

- **WHEN** the student and the mentor hold verified affiliations at different institutions
- **THEN** the alumni factor is zero and stays active

#### Scenario: Student has no affiliation

- **WHEN** the student holds no verified affiliation
- **THEN** the alumni factor is missing and the remaining weights are renormalized

### Requirement: Availability overlap compares weekly windows in one time zone

The availability factor SHALL be the overlapping wall-clock minutes divided by the smaller of the two total available minutes, capped at 1.0, and SHALL be missing when the student has no windows or when the two accounts' windows are declared in different time zones.

#### Scenario: Overlapping windows

- **WHEN** the student is available on Monday from nine hundred minutes of the day to eleven hundred, and the mentor on Monday from one thousand to twelve hundred, in the same time zone
- **THEN** the overlap is one hundred minutes and the factor is that overlap divided by the smaller total, capped at 1.0

#### Scenario: Different time zones

- **WHEN** the student's windows and the mentor's windows are declared in different time zones
- **THEN** the factor is missing, the remaining weights are renormalized, and `limited_information` is true

#### Scenario: Student has no windows

- **WHEN** the student declared no availability
- **THEN** the factor is missing and the suggestions are still returned

### Requirement: Ties are broken deterministically and never by popularity

Suggestions SHALL be ordered by score descending, then by remaining weekly capacity descending, then by fewer requests received in the last seven days, then by a stable hash of the student id and the mentor profile id. The same student and the same data SHALL always produce the same order, and no ordering key SHALL be a public popularity, follower, or rating measure.

#### Scenario: The same student sees a stable order

- **WHEN** the same student requests suggestions twice with no data change
- **THEN** both responses carry the same mentors in the same order

#### Scenario: Two students with identical inputs

- **WHEN** two students have identical profiles and the same eligible mentors are tied on every earlier key
- **THEN** their orders differ according to the pair hash, and repeating the request reproduces each order exactly

#### Scenario: Capacity breaks a tie

- **WHEN** two mentors have equal scores and unequal remaining capacity
- **THEN** the mentor with more remaining capacity comes first

### Requirement: Every suggestion carries at most three plain-language reasons

Each suggestion SHALL carry one to three reason strings, ordered by weighted contribution, built only from the factors that are active and greater than zero, and naming only declared profile facts. A reason SHALL NOT claim that the mentor will help, has helped before, or is the best match.

#### Scenario: Reasons reflect the active factors

- **WHEN** the field and alumni factors are active and above zero and availability is missing
- **THEN** the suggestion carries two reasons, one naming the shared field and one naming the shared department, and no availability reason

#### Scenario: Three reasons is the maximum

- **WHEN** all active factors are above zero
- **THEN** at most three reasons are returned

#### Scenario: A zero factor produces no reason

- **WHEN** a factor is active and equals zero, such as a different institution
- **THEN** no reason mentions that factor

### Requirement: The suggestion payload never carries a numeric score

The response SHALL NOT include a score, points, tier, rank position, or any derived numeric measure of the match, and SHALL expose only already-public mentor attributes.

#### Scenario: The payload key set is fixed

- **WHEN** any suggestion response is read
- **THEN** each entry's keys are exactly the documented set, and no response contains `score`, `points`, `tier`, `rank`, an email, an account id, a biography, availability windows, or a capacity number

#### Scenario: The directory is unaffected

- **WHEN** the directory endpoint is read after this change
- **THEN** its payload is unchanged and still carries no score or rank, because the directory remains the browse surface

### Requirement: A suggestion pool admits only mentors with an active account

The ranked suggestions read SHALL exclude every mentor whose account status is not `ACTIVE`, alongside the existing eligibility filters, before any score is computed, so an ineligible account can be neither suggested nor counted toward the page size.

#### Scenario: A suspended mentor is not suggested

- **WHEN** a student asks for suggestions and a mentor who would otherwise rank inside the five is suspended
- **THEN** that mentor is absent from the response and the next eligible mentor takes the place, so the page still holds up to five entries

#### Scenario: A removed or anonymized mentor is not suggested

- **WHEN** a mentor's account is `ANONYMIZED` and the profile is `REMOVED`
- **THEN** that mentor is absent from the response

#### Scenario: Lifting the suspension restores eligibility

- **WHEN** the account returns to `ACTIVE`
- **THEN** the mentor is eligible again with no profile write and no second stored flag
