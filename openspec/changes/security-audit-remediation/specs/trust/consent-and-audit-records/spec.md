# Spec Delta

## ADDED Requirements

### Requirement: A consent version is one the product published

A consent record SHALL accept only a document version the product has published, SHALL refuse an unknown or future version with `422 VALIDATION_FAILED` naming `document_version`, and SHALL keep the accepted version in the audit metadata.

#### Scenario: The current version is accepted

- **WHEN** the browser posts the published `CONSENT_DOCUMENT_VERSION`
- **THEN** the record is appended exactly as before

#### Scenario: A future version is refused

- **WHEN** a client posts a version that no page or configuration has published
- **THEN** the response is `422`, no consent row is written, and no audit row claims acceptance

#### Scenario: A historical version is allowed only by policy

- **WHEN** a migration or approved historical flow supplies an older published version
- **THEN** it is accepted only if that version is in the documented allowlist

#### Scenario: The ledger keeps the version

- **WHEN** a valid consent is read
- **THEN** its stored version equals the value the user saw
