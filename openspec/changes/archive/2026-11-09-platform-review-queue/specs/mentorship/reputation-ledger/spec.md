# Spec Delta

## ADDED Requirements

### Requirement: A reversal compensates a counted outcome

The system SHALL reverse a counted outcome by appending exactly one `reputation_events` row with `event_type = 'REVERSAL'` carrying the negated points and the same field, mentor, student, and outcome type as the original `COUNTED` event, SHALL leave the original event unchanged, SHALL decrement the field snapshot's count by one and its total by the same points, and SHALL enforce at most one `REVERSAL` per outcome.

#### Scenario: The compensating event mirrors the original

- **WHEN** a counted outcome is reversed
- **THEN** one `REVERSAL` event exists for that outcome whose points are the negation of the `COUNTED` event's points, and the original row is byte-identical to before

#### Scenario: The snapshot decreases by exactly the reversed amount

- **WHEN** a mentor has two counted outcomes in a field and one is reversed
- **THEN** the snapshot reports a count of one and the total of the remaining outcome

#### Scenario: One reversal per outcome

- **WHEN** a second reversal is attempted for the same outcome
- **THEN** exactly one `REVERSAL` event exists and no snapshot row changes

#### Scenario: An ineligible outcome has nothing to reverse

- **WHEN** a counted outcome with a platform-decision basis or a declared conflict is reversed
- **THEN** the status still moves to `REVERSED`, and no `REVERSAL` reputation event is written because no `COUNTED` event existed for it

### Requirement: Replay accounts for reversals

Recomputing a mentor's field totals from `reputation_events` SHALL sum the `COUNTED` events and subtract the `REVERSAL` events, SHALL reproduce the stored `field_impact_snapshots` exactly after any number of reversals, and SHALL remain deterministic and order-independent.

#### Scenario: Replay after a reversal reproduces the snapshot

- **WHEN** the snapshot for a mentor and field is recomputed after one reversal
- **THEN** every stored total matches the recomputed value

#### Scenario: Reversal events are not rewritable

- **WHEN** the application role attempts to update or delete a `REVERSAL` event
- **THEN** the database refuses the operation and the stored row is unchanged
