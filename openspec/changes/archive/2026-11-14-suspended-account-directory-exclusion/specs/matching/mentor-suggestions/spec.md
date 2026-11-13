# Spec Delta

## ADDED Requirements

### Requirement: A suggestion pool admits only mentors with an active account

The ranked suggestions read SHALL exclude every mentor whose account status is not `ACTIVE`, alongside the existing eligibility filters, before any score is computed, so an ineligible account can be neither suggested nor counted toward the page size.

#### Scenario: A suspended mentor is not suggested

- **WHEN** a student asks for suggestions and a mentor who would otherwise rank inside the five is suspended
- **THEN** that mentor is absent from the response and the next eligible mentor takes the place, so the page still holds up to five entries

#### Scenario: A removed or anonymized mentor is not suggested

- **WHEN** a mentor's account is `ANONYMIZED` and the profile is `REMOVED`
- **THEN** that mentor is absent from the response

#### Scenario: Lifting the suspension restores eligibility

- **WHEN** the account returns to `ACTIVE`
- **THEN** the mentor is eligible again with no profile write and no second stored flag
