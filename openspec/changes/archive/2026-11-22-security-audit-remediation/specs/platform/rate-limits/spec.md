# Spec Delta

## ADDED Requirements

### Requirement: Anonymous limits use a trusted client identity

The system SHALL key an anonymous credential or write limit on a client identity that the edge or BFF derives from the transport peer, SHALL forward that key only over the trusted BFF-to-API link, SHALL NOT trust a client-supplied forwarding header on the public side, and SHALL keep the per-account bucket as a second key.

#### Scenario: Two users behind one BFF have separate buckets

- **WHEN** two different browsers send credential requests through the same BFF address
- **THEN** each receives its own address bucket, and exhausting one does not answer `429` to the other

#### Scenario: A spoofed forwarding header changes nothing

- **WHEN** a public caller sends a forwarding header naming another address
- **THEN** the API ignores it, and the limit is keyed on the trusted peer or the BFF key

#### Scenario: A request without a trusted key falls back

- **WHEN** a direct caller reaches the API without a trusted client key
- **THEN** the request is keyed by its peer address and is not refused for a missing key

#### Scenario: The shared BFF address is not the only key

- **WHEN** the API sees many requests from one BFF container
- **THEN** a single anonymous bucket for that container does not exist

### Requirement: Account throttling resists targeted lockout

The system SHALL combine the account identifier with a source signal for the account bucket, SHALL NOT let an unauthenticated caller spend the only bucket belonging to a victim, and SHALL either admit a correct credential after a challenge or answer a retryable challenge instead of an unconditional hour-long block.

#### Scenario: An attacker cannot lock the victim out

- **WHEN** an attacker spends the account bucket for a victim's email from one source
- **THEN** a correct credential from another source is admitted after the configured challenge, and the attacker's source remains limited

#### Scenario: The source remains accountable

- **WHEN** one source repeats failures for one account
- **THEN** that source continues to answer `429 RATE_LIMITED` with a numeric `Retry-After`

#### Scenario: A key carries no personal data

- **WHEN** any account or source key is derived
- **THEN** it contains no at-sign, no readable email address and no raw session token

### Requirement: A sign-up intent is signed and single-use

The system SHALL issue a sign-up intent that is signed with a server secret and contains an issue time and a nonce, SHALL accept it once inside the two-second to one-hour window, and SHALL reject a forged, replayed or unsigned value before any upstream call.

#### Scenario: A forged marker is refused

- **WHEN** a caller sends an unsigned or altered intent cookie
- **THEN** registration answers `422 REGISTRATION_REFUSED`, the API is never called, and no row is written

#### Scenario: A replayed marker is refused

- **WHEN** a valid marker has already been consumed
- **THEN** a second registration with it is refused, and the first account is unchanged

#### Scenario: A valid marker is accepted once

- **WHEN** a person submits inside the time window with an unused valid marker and an empty honeypot
- **THEN** registration proceeds, and the marker is consumed

#### Scenario: The refusal does not name the check

- **WHEN** any sign-up check refuses
- **THEN** the response is the same generic refusal and no email address is logged
