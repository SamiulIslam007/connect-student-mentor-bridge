# Spec Delta

## ADDED Requirements

### Requirement: Privileged sessions have idle and absolute limits

A session for `PLATFORM_ADMIN` or `INSTITUTION_ADMIN` SHALL expire after 30 minutes without a request and SHALL never outlive 12 hours from creation; a request after either limit SHALL answer `401 SESSION_EXPIRED` and the row SHALL be revoked. Student and mentor sessions keep the existing 30-day policy.

#### Scenario: An idle admin session expires

- **WHEN** an admin session has made no request for more than 30 minutes
- **THEN** its next request is `401 SESSION_EXPIRED`, no handler runs, and the row is revoked

#### Scenario: An old admin session expires even when active

- **WHEN** an admin session was created more than 12 hours ago
- **THEN** its next request is `401 SESSION_EXPIRED`, whatever its last-seen time

#### Scenario: A fresh admin session works

- **WHEN** an admin session is inside both limits
- **THEN** the request proceeds normally

#### Scenario: A student or mentor keeps the long policy

- **WHEN** a student or mentor session is older than the admin idle limit
- **THEN** it continues under the documented 30-day policy

#### Scenario: The numbers are configuration

- **WHEN** the configured idle or absolute value changes
- **THEN** the next request is evaluated against the new value without a code change
