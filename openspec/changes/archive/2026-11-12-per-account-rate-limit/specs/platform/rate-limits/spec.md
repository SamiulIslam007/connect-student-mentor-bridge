# Spec Delta

## ADDED Requirements

### Requirement: The throttled credential routes also carry an account bucket

The system SHALL enforce a second request limit on the sign-in, forgot-password and reset-password routes, keyed by the account the request names rather than by the caller's address. The account key SHALL be derived from the body's account identifier when present, otherwise from a session credential, otherwise from the caller's address, and SHALL NOT contain a raw email address.

#### Scenario: One account from many addresses is capped

- **WHEN** one account is submitted from several different addresses and the account bucket's limit is reached
- **THEN** further attempts for that account answer `429 RATE_LIMITED` with a numeric `Retry-After`, whatever address they come from

#### Scenario: The key follows the account, not the address

- **WHEN** the same account identifier is read from two different client addresses
- **THEN** both requests resolve to the same account key

#### Scenario: A different account is unaffected

- **WHEN** one account is throttled
- **THEN** a different account is served in the same window, even from the same address

#### Scenario: A key never carries personal data

- **WHEN** any account key is derived
- **THEN** it contains no at-sign and no readable email address

#### Scenario: A request with no account identifier falls back

- **WHEN** a route is called with no body account identifier and no session credential
- **THEN** the request is keyed by the caller's address and is not refused for a missing key

#### Scenario: The existing behaviour is unchanged

- **WHEN** the credential routes are called within every configured limit
- **THEN** they answer as they did before this change, and the existing address bucket still applies on its own window
