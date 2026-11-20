# Spec Delta

## Purpose

Makes a retried write safe to repeat: one optional `Idempotency-Key` header, one stored response per caller and key, a replay instead of a second write, and a refusal when the same key arrives with a different body. The header is optional, so a client that does not send one sees today's behaviour.

## ADDED Requirements

### Requirement: A retryable write replays its first response

The system SHALL accept an optional `Idempotency-Key` header on exactly three writes — message post, outcome report and request creation — SHALL store the first response keyed on the caller, the operation and the key for 24 hours, and SHALL replay that stored response for a repeat of the same key with the same body instead of performing the write again.

#### Scenario: The first call performs the write

- **WHEN** a participant posts a message with a new `Idempotency-Key`
- **THEN** one message row is written, one email event is queued, and the response carries the created message

#### Scenario: A repeat replays the stored response

- **WHEN** the same caller repeats the same request with the same key and the same body
- **THEN** the response status and body are byte-identical to the first, and no second message, outcome or request row exists

#### Scenario: A key belongs to its caller

- **WHEN** a different caller sends the same key value for the same operation
- **THEN** it is treated as a new key and its own write proceeds

#### Scenario: A write without the header is unchanged

- **WHEN** a caller sends the request with no `Idempotency-Key`
- **THEN** the write behaves exactly as it did before this change, and no record is stored

### Requirement: A key reused with a different body is refused

The system SHALL compare a canonical digest of the request body, SHALL refuse a key reused with a different digest with `409 IDEMPOTENCY_KEY_REUSED`, SHALL answer `409 IDEMPOTENCY_IN_PROGRESS` for a repeat while the first call is unfinished, and SHALL write nothing in either case.

#### Scenario: A different body is refused

- **WHEN** the same caller repeats a key with a body that differs in any value
- **THEN** the response is `409 IDEMPOTENCY_KEY_REUSED`, the stored response is unchanged, and no second row is written

#### Scenario: A repeat during an unfinished call is refused

- **WHEN** a second request arrives with the same key while the first is still being served
- **THEN** the response is `409 IDEMPOTENCY_IN_PROGRESS` and no write happens

#### Scenario: A malformed key is refused before the store

- **WHEN** the header is shorter than 8 characters, longer than 128, or carries a character outside letters, digits, dot, underscore and hyphen
- **THEN** the response is `422 IDEMPOTENCY_KEY_INVALID` and no record and no domain row are written

### Requirement: A stored response expires and a stale intent frees its key

The system SHALL delete a completed record 24 hours after it was written and an unfinished record 5 minutes after it was created, on one scheduled sweep, and SHALL perform a fresh write for a key whose record has been deleted.

#### Scenario: A completed record is swept

- **WHEN** the sweep runs and a completed record is older than its retention
- **THEN** the row is deleted and a later request with that key performs a fresh write

#### Scenario: A stale intent frees its key

- **WHEN** the sweep runs and an unfinished record is older than five minutes
- **THEN** the row is deleted, so the client's retry is served normally instead of answering `409`

#### Scenario: A young record survives the sweep

- **WHEN** the sweep runs and the record is inside its retention
- **THEN** it is untouched and its key still replays
