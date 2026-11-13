# Spec Delta

## ADDED Requirements

### Requirement: The public impact read requires an active account

The public mentor impact read SHALL answer `404` for a mentor whose account status is not `ACTIVE`, matching the rule the directory and the request context already apply, and SHALL return the counts unchanged when the account is active.

#### Scenario: A suspended mentor's impact is not found

- **WHEN** a caller reads the impact counts of a mentor whose profile is `ACTIVE` and whose account is `SUSPENDED`
- **THEN** the response is `404` and no count is returned

#### Scenario: Lifting the suspension restores the read

- **WHEN** the account returns to `ACTIVE`
- **THEN** the same read returns the stored counts, unchanged, with no write to the profile or the ledger

#### Scenario: The own read is unaffected

- **WHEN** a mentor reads its own impact
- **THEN** the response still reports its own counts, which the session rule already limits to an `ACTIVE` account
