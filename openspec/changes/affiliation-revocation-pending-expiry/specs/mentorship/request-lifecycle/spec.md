# Spec Delta

## ADDED Requirements

### Requirement: A request expires when the mentor becomes ineligible

A request that is still `PENDING` when its mentor's account loses its last verified affiliation SHALL become `EXPIRED` with `expiry_reason = 'MENTOR_INELIGIBLE'`, SHALL queue one notice to the student naming that reason, and SHALL NOT count against the mentor's response reliability.

#### Scenario: The student is told why

- **WHEN** a pending request expires because the mentor lost Level 1
- **THEN** the student receives one queued notice that the request expired because the mentor is no longer verified, and `GET /v1/requests` shows the status `EXPIRED` with that reason

#### Scenario: The mentor is not penalised

- **WHEN** response reliability is computed after an eligibility expiry
- **THEN** that request is absent from both `requests_decided_in_time` and `requests_late_or_expired`

#### Scenario: A deadline expiry still counts

- **WHEN** a request expires at 48 hours with no decision
- **THEN** it carries `expiry_reason = 'DEADLINE'` and counts as a non-response exactly as it does today

#### Scenario: The slot is freed for the student

- **WHEN** a pending request expires for ineligibility
- **THEN** it no longer counts toward the student's three-request cap and the student may send a new request to another mentor
