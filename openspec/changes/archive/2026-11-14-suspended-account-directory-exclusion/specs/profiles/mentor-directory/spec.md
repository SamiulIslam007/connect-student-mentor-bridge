# Spec Delta

## ADDED Requirements

### Requirement: A directory card requires an active account, not only an active profile

The public directory SHALL return a mentor only when the mentor's account status is `ACTIVE` as well as the profile's operating status, SHALL derive that condition from `users.status` on every read rather than from any profile column, and SHALL hide the mentor again for as long as the account is suspended, self-deactivated, deletion-pending, or anonymized.

#### Scenario: A suspended account is absent from every page and every filter

- **WHEN** a mentor whose profile is `ACTIVE` has an account status of `SUSPENDED`
- **THEN** the mentor appears on no page of the directory, under no `access_state`, field, language, or availability filter, and their id is not returned as a cursor target

#### Scenario: A removed or anonymized account is absent

- **WHEN** a mentor's account is `ANONYMIZED` and the profile is `REMOVED`
- **THEN** the mentor is absent from the directory

#### Scenario: Lifting the suspension restores the card with no profile write

- **WHEN** the same account returns to `ACTIVE` through the reinstate route or the scheduled sanction job
- **THEN** the mentor appears in the directory again, and the `mentor_profiles` row is byte-identical to the row read before the suspension

#### Scenario: The listing is derived, never stored

- **WHEN** the directory query is inspected
- **THEN** the account-status condition is present in the query itself, and no profile column is written by a suspension or by a lift
