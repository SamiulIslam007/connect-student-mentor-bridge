# Spec Delta

## Purpose

Guarantees that a side effect either happens or is retried until it does: every state change writes its event in the same transaction, a worker relays events into a Postgres-backed queue, and handlers stay idempotent so a redelivery is never a second email.

## ADDED Requirements

### Requirement: A side effect is written in the same transaction as its cause

A state change that must cause a side effect SHALL write one `outbox_events` row inside the same database transaction, with `aggregate_type`, `aggregate_id`, `event_type`, a `payload`, a `dedupe_key`, and an `available_at`, and SHALL NOT perform the side effect inline.

#### Scenario: Event and change commit together

- **WHEN** a transaction that inserts an event fails before commit
- **THEN** neither the state change nor the event row exists, and no side effect runs

#### Scenario: Event without a change is impossible

- **WHEN** a state change succeeds
- **THEN** exactly one event row for it exists, committed by the same transaction

### Requirement: A duplicate event is never written twice

`dedupe_key` SHALL be unique across the table, and a writer that reuses a key SHALL insert nothing rather than raising, so a retried request cannot enqueue a second side effect.

#### Scenario: Same key twice

- **WHEN** two writes use the dedupe key `request:<id>:received`
- **THEN** one row exists and neither caller sees an error

### Requirement: The worker relays unprocessed events and marks them processed only on success

The worker SHALL select due unprocessed rows without blocking other pollers, enqueue one queue job per row keyed by the event id, and set `processed_at` only after the handler for that `event_type` resolves successfully.

#### Scenario: Successful handling

- **WHEN** the handler for a due event resolves
- **THEN** the row carries `processed_at` and is not selected again

#### Scenario: Handler throws

- **WHEN** the handler throws
- **THEN** `processed_at` stays null, `attempts` increases, `last_error` records the message, and the row is retried later

#### Scenario: An event is not due yet

- **WHEN** a row's `available_at` is in the future
- **THEN** it is not selected on this poll

### Requirement: A failing event is retried a bounded number of times and then marked failed

The worker SHALL retry a failing event with exponential backoff up to `OUTBOX_MAX_ATTEMPTS` (default 5), then SHALL set `failed_at` and keep the row with its `last_error` instead of deleting it.

#### Scenario: Attempt limit reached

- **WHEN** the fifth attempt fails
- **THEN** `failed_at` is set, `processed_at` stays null, and one error line names the event and its last error

#### Scenario: A failed event is visible

- **WHEN** the rows are listed after a permanent failure
- **THEN** the row is present with its attempts, its last error, and a `failed_at` value

### Requirement: Handlers are idempotent

Every registered handler SHALL be safe to run twice for the same event id and SHALL NOT produce a second observable side effect.

#### Scenario: Redelivered event

- **WHEN** the same event is handled twice
- **THEN** the second run produces no additional email, row, or state change

### Requirement: An unregistered event type fails loudly

When a due event names an `event_type` with no registered handler, the worker SHALL record the failure on the row and log it, and SHALL NOT mark the event processed.

#### Scenario: Typo in an event type

- **WHEN** an event names `RequestAcepted`
- **THEN** the row stays unprocessed with a `last_error` naming the unknown type, and the worker process keeps running

### Requirement: The queue schema belongs to the migration, not to the worker

The migration SHALL create the `pgboss` schema and grant its use to the application role, so the worker can start with no owner rights.

#### Scenario: Worker starts as the application role

- **WHEN** the worker boots connected as `connect_app` after the migration
- **THEN** it creates its queue tables and starts polling without a permission error

### Requirement: The worker runs as its own process and stops cleanly

The worker SHALL run from the same image with a different start command, SHALL be healthy while polling, and SHALL finish or abandon its current event and exit 0 on `SIGTERM`.

#### Scenario: Graceful shutdown

- **WHEN** the worker receives `SIGTERM`
- **THEN** it stops polling, completes or releases the current event, and exits with code 0

#### Scenario: Startup fault

- **WHEN** the worker cannot connect to the database at boot
- **THEN** it exits non-zero with one structured error line, and the container is restarted by the orchestrator
