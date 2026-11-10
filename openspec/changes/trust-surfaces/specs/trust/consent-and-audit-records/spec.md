# Spec Delta

## MODIFIED Requirements

### Requirement: Consent recorded at registration

Registration SHALL be refused unless the caller explicitly accepted the terms of service and the privacy notice in the same request, and SHALL then write an append-only consent record for the terms of service and one for the privacy notice, each naming the document version shown to the user. Acceptance SHALL be evaluated before any user, session, or consent row is written, and a refusal SHALL name the missing acceptance with `422` and the code `VALIDATION_FAILED`.

#### Scenario: Registration writes consent records

- **WHEN** a visitor ticks the consent checkbox, which sends `consent_accepted: true`, and completes registration
- **THEN** two `GRANTED` consent records exist for that user with distinct purposes, the same document version, and the time of consent, and that version equals the version rendered by the `/terms` and `/privacy` pages

#### Scenario: Registration rejected writes no consent

- **WHEN** registration fails validation, the age gate, duplicate email, or does not carry `consent_accepted: true`
- **THEN** no consent record and no user row is written for that attempt, and the response is `422 VALIDATION_FAILED` naming `consent_accepted`

## ADDED Requirements

### Requirement: The consent documents are published, versioned pages

The application SHALL serve the terms of service at `/terms` and the privacy notice at `/privacy`, each rendering the same document version that registration stores on its consent records, each readable without a session, and each stating that it is a pilot draft pending legal review. The version SHALL come from one constant rather than a separate literal per page.

#### Scenario: The page version is the stored version

- **WHEN** a visitor reads `/terms` or `/privacy`
- **THEN** the page states the document version, and that string is the `document_version` written on the consent records created by a registration made after that page load

#### Scenario: The pages are readable without a session

- **WHEN** an unauthenticated visitor requests `/terms` or `/privacy`
- **THEN** the response is `200` with the document text and no sign-in redirect

#### Scenario: The draft status is disclosed

- **WHEN** either page renders
- **THEN** it states that the text is a pilot draft pending legal review, so no reader mistakes it for reviewed legal terms
