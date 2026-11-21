# Spec Delta

## MODIFIED Requirements

### Requirement: Password policy

The system SHALL accept passwords of at least 12 characters with no composition rules, SHALL accept long passphrases, SHALL store only a salted hash, and SHALL refuse a password that appears in a public breach corpus at registration and at password reset. The breach check SHALL send to the provider only the first five characters of the password's SHA-1 digest, SHALL never send the password itself, any further digest characters, the email address or a user identifier, and SHALL accept the password when the provider cannot answer.

#### Scenario: Short password rejected

- **WHEN** a registration or reset submits a password shorter than 12 characters
- **THEN** the request is rejected with a validation error naming the minimum length and no account or password change is written

#### Scenario: Password never logged

- **WHEN** any authentication request succeeds or fails
- **THEN** no log line, audit metadata, or error body contains the password or a password hash

#### Scenario: A breached password is refused at registration

- **WHEN** a registration submits a password whose digest appears in the breach corpus with a non-zero count
- **THEN** the request is rejected with a validation error naming the password field and stating that the password appears in a public breach, and no account, consent or audit row is written

#### Scenario: A breached password is refused at reset

- **WHEN** a password reset submits a breached password
- **THEN** the request is rejected with the same validation error and the existing password is unchanged

#### Scenario: Only the prefix leaves the process

- **WHEN** any breach check runs
- **THEN** the outbound request carries exactly five hexadecimal characters, and no request or log line contains the password, more than five digest characters, the email address or a user id

#### Scenario: A clean password is accepted

- **WHEN** the password's suffix does not appear in the provider's answer, or appears with a count of zero
- **THEN** registration or reset proceeds exactly as before this change

#### Scenario: An unreachable provider does not stop a participant

- **WHEN** the provider times out, refuses the connection, or answers outside the documented shape
- **THEN** the password is accepted, one structured log line records the outcome, and no user-facing error is produced

#### Scenario: The answer is cached for its window

- **WHEN** two checks within the cache window share the same five-character prefix
- **THEN** the provider is called once and both checks read the same answer
