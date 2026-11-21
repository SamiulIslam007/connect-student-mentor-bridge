# experience/visual-design Specification

## Purpose

Defines what the interface looks like: one token set for colour, type, spacing, radii and focus, the narrow-viewport contract every Phase 1 flow must keep, the minimum interactive target size, and the contrast every state must meet.

## Requirements

### Requirement: One token set styles every page

The web app SHALL define its colour, type, spacing, radius and focus tokens once as CSS custom properties in a single stylesheet imported by the root layout, and SHALL style every page from that stylesheet - through its element rules and its classes - with no page carrying an inline style attribute and no second stylesheet.

#### Scenario: A page is styled by the shared stylesheet

- **WHEN** any page under `apps/web/app` renders
- **THEN** its visual presentation comes from the shared stylesheet, and the page component carries no inline `style` attribute

#### Scenario: A class that does not exist fails a test

- **WHEN** a page uses a class name the stylesheet does not define
- **THEN** the web test suite fails and names the page and the class

#### Scenario: The tokens are the only colour source

- **WHEN** a page or component needs a colour, a spacing value or a radius
- **THEN** it uses a token rather than a literal value, so one edit changes the whole interface

### Requirement: The core flows are usable at a narrow viewport

Every Phase 1 flow SHALL be usable at 360 CSS pixels wide without horizontal scrolling of the page, SHALL keep its primary action visible without zooming, and SHALL NOT rely on hover to reveal a control.

#### Scenario: A student flow at 360 pixels

- **WHEN** the sign-up, directory, request, requests list and mentorship pages render at 360 CSS pixels wide
- **THEN** the document width does not exceed the viewport, and each page's primary action is visible without zooming

#### Scenario: A wide table at a narrow viewport

- **WHEN** an admin or institution table renders at 360 CSS pixels wide
- **THEN** the table scrolls inside its own container and the page itself does not scroll horizontally

### Requirement: Interactive targets meet a minimum size

Every interactive control SHALL present a target of at least 44 by 44 CSS pixels on the core student and mentor flows, and SHALL show a visible focus indicator when reached by keyboard.

#### Scenario: A control is measured

- **WHEN** a button, link or input on a core flow is measured in the browser
- **THEN** its target box is at least 44 by 44 CSS pixels, or its padding makes the combined target so

#### Scenario: Keyboard focus is visible

- **WHEN** a keyboard user tabs to a control
- **THEN** a focus indicator is visible against both the page background and the control's own background

### Requirement: Text meets WCAG 2.1 AA contrast

Text and interactive elements SHALL meet the WCAG 2.1 AA contrast ratio against their background — 4.5:1 for normal text, 3:1 for large text and for interactive boundaries — in every state the interface renders.

#### Scenario: Body text contrast

- **WHEN** body text renders on the surface colour
- **THEN** the computed contrast ratio is at least 4.5:1

#### Scenario: Muted and disabled text stay legible

- **WHEN** secondary text, help text or a disabled control renders
- **THEN** its contrast still meets the ratio for its size, or it is not presented as text a user must read

#### Scenario: The failure state is legible

- **WHEN** an error alert renders
- **THEN** its text meets the ratio against the alert background, in both the info and the error variants
