# experience/accessibility Specification

## Purpose

Defines how accessibility is evidenced rather than assumed: the automated audit every Phase 1 surface must pass, the severity floor that fails a run, and the dated manual record that must exist before conformance is claimed.

## Requirements

### Requirement: Every Phase 1 surface is audited automatically

The system's browser test suite SHALL audit every Phase 1 web surface with an automated accessibility ruleset on every change, SHALL fail the run on any serious or critical violation, and SHALL report moderate and minor violations into the run's record without failing it.

#### Scenario: A new serious violation fails the change

- **WHEN** a change introduces a control with no accessible name on any audited surface
- **THEN** the run fails, names the surface, the rule and the element

#### Scenario: A moderate violation is recorded, not fatal

- **WHEN** the audit reports only moderate or minor violations
- **THEN** the run passes and the violations appear in the run's report

#### Scenario: A surface is not silently skipped

- **WHEN** the audited surface list is compared with the pages the app serves
- **THEN** every Phase 1 page is in the list, and a page missing from it fails a test

### Requirement: A manual pass is recorded before conformance is claimed

The project SHALL record, in one dated document, a keyboard pass and a screen-reader pass over the core student and mentor flows, naming the surfaces covered, the assistive technology and browser used, every finding, and the change that fixed it, before any document describes the interface as meeting WCAG 2.1 AA.

#### Scenario: The record exists before the claim

- **WHEN** any document states that the interface meets WCAG 2.1 AA
- **THEN** a dated record naming the surfaces, the assistive technology, the findings and their fixes exists in the repository

#### Scenario: A finding is either fixed or carried

- **WHEN** the manual pass finds a barrier
- **THEN** the record names the change that fixed it, or the record states why it is carried and where it is tracked

#### Scenario: The automated run and the record agree

- **WHEN** the record lists a surface as passing
- **THEN** the automated run covers that surface, so a later regression is caught without repeating the manual pass
