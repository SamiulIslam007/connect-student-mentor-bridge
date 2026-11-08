# Spec Delta

## MODIFIED Requirements

### Requirement: A mentor decides a pending request exactly once

Accept and decline SHALL each apply to a `PENDING` request only, SHALL record the decision and its timestamp, SHALL move the request out of `PENDING` in a single conditional update, and SHALL queue exactly one email to the student. An accept SHALL also create exactly one mentorship for the request in the same transaction, and a decline SHALL create none.

#### Scenario: Accept

- **WHEN** the addressee accepts a pending request
- **THEN** the status is `ACCEPTED`, `decided_at` is set, and one email to the student is queued

#### Scenario: Decline with a reason

- **WHEN** the addressee declines with a reason
- **THEN** the status is `DECLINED`, the reason is stored as the decision note, and one email to the student is queued

#### Scenario: Deciding twice

- **WHEN** the addressee acts on a request that is no longer `PENDING`
- **THEN** the response is `409 REQUEST_INVALID_STATE` and nothing changes

#### Scenario: A non-addressee decides

- **WHEN** an account other than the addressee accepts or declines
- **THEN** the response is `403` and nothing changes

#### Scenario: Accept creates the mentorship

- **WHEN** the addressee accepts a pending request
- **THEN** exactly one mentorship exists for that request with status `ACTIVE`, the request id recorded, and the field copied from the request

#### Scenario: A failed mentorship insert leaves the request pending

- **WHEN** the mentorship insert fails while accepting
- **THEN** the transaction rolls back, the request status is still `PENDING`, and no email to the student is queued

#### Scenario: Decline creates no mentorship

- **WHEN** the addressee declines a pending request
- **THEN** no mentorship exists for that request
