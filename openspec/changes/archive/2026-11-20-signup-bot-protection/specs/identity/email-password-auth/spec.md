# Spec Delta

## ADDED Requirements

### Requirement: Registration refuses an automated submission

The system SHALL refuse a registration whose honeypot field carries a value, whose form was served less than two seconds before submission, or whose intent marker is absent or older than one hour, SHALL answer one generic `422 REGISTRATION_REFUSED` that names no check, and SHALL write no account, consent or audit row for a refusal.

#### Scenario: A filled honeypot is refused

- **WHEN** a submitter sends a non-empty `contact_website` with an otherwise valid registration
- **THEN** the response is `422 REGISTRATION_REFUSED`, no account exists for the address, and no consent or audit row was written

#### Scenario: A submission faster than the floor is refused

- **WHEN** the intent marker says the form was served less than two seconds before the submission
- **THEN** the response is the same `422 REGISTRATION_REFUSED` and nothing is written

#### Scenario: A stale or missing marker is refused

- **WHEN** the submission carries no intent marker, or one older than an hour
- **THEN** the response is the same `422 REGISTRATION_REFUSED` and nothing is written

#### Scenario: Every refusal looks identical

- **WHEN** the three refusals above are compared
- **THEN** their status, problem code and message are identical, and only the server-side log line differs

#### Scenario: A human submission is unaffected

- **WHEN** a person fills the form with an empty honeypot and submits more than two seconds and less than an hour after the page was served
- **THEN** the registration proceeds exactly as it did before this change and the intent marker is cleared
