# Spec Delta

## Purpose

Defines how every page reports that it is working, that there is nothing to show, and that something failed, so a user can tell the three apart on every surface.

## ADDED Requirements

### Requirement: Every read surface reports loading, empty and failure

A page that reads a collection SHALL render a loading line while the read is in flight, a line naming the failure with a retry control when the read fails, and an empty line when the read succeeds with no items, and SHALL NOT render an empty container in place of any of them.

#### Scenario: A slow read shows the loading line

- **WHEN** a page has started its read and the response has not arrived
- **THEN** the page shows its loading line and no empty line

#### Scenario: A failed read names the failure and offers a retry

- **WHEN** the read answers with an error or the request fails
- **THEN** the page shows its error line with the server's message when one is present, and a retry control that repeats the read

#### Scenario: A successful empty read shows the empty line

- **WHEN** the read succeeds and returns no items
- **THEN** the page shows its empty line and no items container

### Requirement: Every write control reports in flight and failure

A control that submits SHALL be disabled while its request runs and SHALL render a loading line, and SHALL render the failure, keep the input the user typed, and leave the control usable again when the request fails.

#### Scenario: A submit in flight cannot be repeated

- **WHEN** the user submits a form and the request is still running
- **THEN** the submit control is disabled and the loading line is shown

#### Scenario: A failed submit keeps the input

- **WHEN** the submit fails with a problem-details response
- **THEN** the page shows the returned detail, the typed values are unchanged, and the submit control is enabled again

#### Scenario: A failure is announced

- **WHEN** an error line is rendered
- **THEN** it carries the alert role so a screen reader announces it

### Requirement: The state vocabulary is one module

The web app SHALL express these states through one module that defines the state set, the transitions a load and a submit perform, and the string key each state maps to for a given surface, so a new page inherits the pattern instead of inventing another.

#### Scenario: A load moves idle to loading to empty

- **WHEN** a page begins a read that returns no items
- **THEN** the module reports `loading` and then `empty`

#### Scenario: A failed submit moves loading to error

- **WHEN** a submit request fails
- **THEN** the module reports `error` with the server message when present

#### Scenario: A success moves to ready

- **WHEN** a write succeeds or a read returns items
- **THEN** the module reports `ready` and the page keeps its existing success path
