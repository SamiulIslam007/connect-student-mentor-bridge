# profiles/profile-visibility Specification

## Purpose
Decides, in one pure function with a complete matrix test, who may see which account's profile, so that discovery (#6) and mentor onboarding (#5) inherit a tested rule instead of inventing one at the call site.

## Requirements

### Requirement: A profile is visible only per the FR-PROF-04 matrix

The system SHALL decide profile visibility with a pure policy that receives the viewer's roles, whether the viewer is the subject, the subject's profile kind (student or mentor), and whether the viewer holds a relationship that the matrix names, and SHALL answer either `VISIBLE` or `HIDDEN`.

#### Scenario: A mentor's profile is visible to any signed-in account

- **WHEN** a signed-in account with any role requests a mentor's profile
- **THEN** the policy answers `VISIBLE`

#### Scenario: A student's profile is hidden from everybody but its owner and a requesting mentor

- **WHEN** an account requests a student profile it does not own and holds no mentorship relationship with that student
- **THEN** the policy answers `HIDDEN`

#### Scenario: A student's profile is visible to the mentor who received their request

- **WHEN** the viewer is the mentor addressed by a request from that student
- **THEN** the policy answers `VISIBLE` for that student's profile

#### Scenario: The owner always sees their own profile

- **WHEN** an account requests its own profile, of either kind
- **THEN** the policy answers `VISIBLE` regardless of role

#### Scenario: An institution admin does not see student-level profiles by default

- **WHEN** an institution admin requests a student profile with no active student consent for that institution and purpose
- **THEN** the policy answers `HIDDEN`

#### Scenario: Consent makes institution-level reading possible

- **WHEN** an institution admin requests a student profile and an active, specific consent for that institution and purpose exists
- **THEN** the policy answers `VISIBLE`

#### Scenario: A platform admin reads student-level data only with a case reference

- **WHEN** a platform admin requests a student profile without a dispute or support case reference
- **THEN** the policy answers `HIDDEN`, and with one it answers `VISIBLE`, to be recorded as a break-glass access by the caller

#### Scenario: An unauthenticated viewer sees nothing

- **WHEN** the viewer has no session
- **THEN** the policy answers `HIDDEN` for every profile, including a mentor's

### Requirement: A hidden profile behaves as if it does not exist

The system SHALL treat the policy's `HIDDEN` answer as a missing object: a caller SHALL answer `404` and SHALL NOT return a distinguishing body, a count, or a timing hint that the profile exists.

#### Scenario: Hidden answers with not found

- **WHEN** a read of a hidden profile is attempted through any future endpoint
- **THEN** the response is `404 NOT_FOUND` with no profile fields and no statement that the profile exists

### Requirement: The matrix is covered pair by pair

The system SHALL have a data-driven test that calls the policy for every combination of viewer role, subject kind, ownership, relationship, consent, and case reference, and SHALL assert every cell of the documented matrix.

#### Scenario: Every cell is asserted

- **WHEN** the matrix test runs
- **THEN** every (viewer role × subject kind × relationship) cell has an expected answer, and a cell missing from the table fails the test rather than being skipped
