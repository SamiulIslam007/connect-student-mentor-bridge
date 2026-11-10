# Spec Delta

## Purpose

States what a verified badge and a counted-outcome summary actually claim, and requires the disclaimer that keeps a reader from reading either as an independent audit. The rule exists because the product's value is credible evidence, and credibility fails the moment a badge overstates what was checked.

## ADDED Requirements

### Requirement: Every verified badge and impact summary carries a disclaimer

Wherever an affiliation badge or a counted-outcome (impact) summary is rendered, the interface SHALL show a disclaimer stating that the badge means the affiliation was verified, that a counted outcome was confirmed by the mentor, and that not every outcome was independently audited. The disclaimer SHALL NOT state or imply that the platform audited, verified, or endorsed any outcome, and SHALL be part of the string catalog rather than a literal in a component.

#### Scenario: The disclaimer appears on a directory card

- **WHEN** the mentor directory renders a card for a mentor with a verified affiliation
- **THEN** the card shows the disclaimer text, and the text names both what was confirmed and that not every outcome was independently audited

#### Scenario: The disclaimer appears beside the impact summary

- **WHEN** the profile page renders the counted-outcome impact section
- **THEN** the section shows the same disclaimer text, visible without expanding any control

#### Scenario: The disclaimer makes no audit claim

- **WHEN** the disclaimer text is read
- **THEN** it contains no statement that the platform audited or endorsed an outcome, and a test asserts the absent claim as well as the present one
