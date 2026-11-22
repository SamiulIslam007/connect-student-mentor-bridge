# Spec Delta

## ADDED Requirements

### Requirement: The browser BFF carries an idempotency key

For the three retryable writes, the browser BFF SHALL forward a valid `Idempotency-Key` when the page supplies one and SHALL otherwise generate one per user action, SHALL keep the key stable across a retry of that action, and SHALL NOT forward a malformed or over-long key.

#### Scenario: A double submit creates one row

- **WHEN** a student double-submits a request, an outcome or a message through the page
- **THEN** both calls carry the same key, the second replays the first response, and exactly one row and one email exist

#### Scenario: A retry keeps the key

- **WHEN** the first call times out and the page retries the same action
- **THEN** the key is unchanged and the API returns the stored response

#### Scenario: A new action gets a new key

- **WHEN** the user submits a different request, outcome or message
- **THEN** a different key is generated and the write proceeds

#### Scenario: The BFF drops no key

- **WHEN** the browser sends a valid key
- **THEN** the upstream request carries the same value, and a test fails if `proxyJson` rebuilds headers without it

#### Scenario: A malformed key is refused

- **WHEN** the browser sends a key outside the documented length or character set
- **THEN** the API answers `422 IDEMPOTENCY_KEY_INVALID` and no row is written
