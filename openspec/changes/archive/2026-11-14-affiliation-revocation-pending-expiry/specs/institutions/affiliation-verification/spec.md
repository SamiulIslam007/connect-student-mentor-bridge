# Spec Delta

## ADDED Requirements

### Requirement: Losing the last verified affiliation expires the mentor's pending requests

When a transaction leaves an account with no `VERIFIED` affiliation, the system SHALL move that account's `PENDING` requests to `EXPIRED` with `expiry_reason = 'MENTOR_INELIGIBLE'`, SHALL queue exactly one notice per affected request in the same transaction, and SHALL leave every accepted request, mentorship and outcome untouched.

#### Scenario: A claim the new domain cannot support expires the queue

- **WHEN** a Level 1 mentor claims a second institution whose registered domains do not match their email address
- **THEN** the earlier affiliation is `REVOKED`, the new claim is `PENDING` at `LEVEL_0`, every `PENDING` request of that mentor is `EXPIRED` with reason `MENTOR_INELIGIBLE`, and one notice per request is queued

#### Scenario: A replacement that is verified expires nothing

- **WHEN** a mentor claims an institution whose domain matches, or an institution admin verifies a new claim
- **THEN** the earlier row is `REVOKED`, the new row is `VERIFIED`, and no request changes status

#### Scenario: Running twice changes nothing the second time

- **WHEN** the same revocation transaction is retried after it committed
- **THEN** no request moves and no second notice is queued, because the update is conditional on `status = 'PENDING'`

#### Scenario: An accepted request survives

- **WHEN** the mentor has an `ACCEPTED` request and a live mentorship at the moment Level 1 is lost
- **THEN** both keep their status, and only requests still `PENDING` expire
