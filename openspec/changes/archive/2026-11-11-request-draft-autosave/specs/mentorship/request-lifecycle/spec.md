# Spec Delta

## ADDED Requirements

### Requirement: A request draft is kept on the device until it is sent or expires

While a student fills the request form, the web application SHALL keep the typed field values on the same device under a key that identifies the mentor profile, SHALL restore them when the form reopens for that mentor, SHALL discard and remove a draft older than twenty-four hours, and SHALL clear it after a successful send. Storage SHALL contain those field values only — never a session token, a password, or an email address.

#### Scenario: A draft survives a reload

- **WHEN** a student types into the request form and reloads the page for the same mentor
- **THEN** the question, context summary, target outcome, timeframe, interaction type and application note are restored exactly as typed

#### Scenario: A draft is scoped to one mentor

- **WHEN** a draft was written for one mentor and the form opens for a different mentor
- **THEN** no field is restored from the other mentor's draft

#### Scenario: A successful send clears the draft

- **WHEN** the request is created and the response is a success
- **THEN** the stored draft for that mentor no longer exists

#### Scenario: A failed send keeps the draft

- **WHEN** the send fails with a validation or server error
- **THEN** the stored draft is unchanged and the page still shows the typed values

#### Scenario: A stale draft is discarded

- **WHEN** the stored draft is older than twenty-four hours
- **THEN** its values are not restored and the stored entry is removed

#### Scenario: Signing out removes drafts

- **WHEN** the user signs out
- **THEN** no request draft remains in browser storage

#### Scenario: Storage holds no credential

- **WHEN** the stored draft is read back
- **THEN** it contains the form field values only, and no access token, refresh token, session value, password, or email address

### Requirement: A storage failure never blocks sending a request

The form SHALL treat an unavailable, throwing, or quota-exceeded store as a missing draft: it SHALL still collect and submit the request, SHALL show no error to the user for the storage failure alone, and SHALL NOT throw from the helper.

#### Scenario: Storage is unavailable

- **WHEN** browser storage is absent or every call throws
- **THEN** the form submits normally and no unhandled error reaches the user

#### Scenario: The store is full

- **WHEN** a write fails because the quota is exceeded
- **THEN** the value is not stored, the page keeps working, and the send still succeeds

#### Scenario: A malformed stored value

- **WHEN** the stored entry is not valid JSON or is missing required fields
- **THEN** it is ignored, the form opens empty, and the stored entry is removed
