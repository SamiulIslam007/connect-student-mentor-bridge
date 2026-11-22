# Spec Delta

## ADDED Requirements

### Requirement: A reviewer is never a participant

The system SHALL refuse a platform review decision with `403 OUTCOME_REVIEW_CONFLICT` when the acting platform admin is the outcome's student or its mentor, SHALL write one `PERMISSION_DENIED` audit row for the attempt, and SHALL NOT change the status, the ledger, a verification record, or an email.

#### Scenario: The student cannot review their own outcome

- **WHEN** the platform admin who is the outcome's student submits a review decision
- **THEN** the response is `403 OUTCOME_REVIEW_CONFLICT`, the status is unchanged, and one denial row names that admin and the outcome

#### Scenario: The mentor cannot review their own outcome

- **WHEN** the platform admin who is the outcome's mentor submits a review decision
- **THEN** the response is `403 OUTCOME_REVIEW_CONFLICT` and no verification or ledger row is written

#### Scenario: An unrelated admin still decides

- **WHEN** a platform admin who is neither participant decides a case with a valid reason
- **THEN** the existing review path proceeds unchanged

#### Scenario: The check is inside the transaction

- **WHEN** the outcome's participants change between the read and the decision
- **THEN** the decision is evaluated against the locked row and either succeeds once or refuses with the conflict code

#### Scenario: The refusal is auditable

- **WHEN** a participant admin is refused
- **THEN** exactly one `PERMISSION_DENIED` row carries the admin, the outcome and the request id, and no `OUTCOME_REVIEWED` row exists
