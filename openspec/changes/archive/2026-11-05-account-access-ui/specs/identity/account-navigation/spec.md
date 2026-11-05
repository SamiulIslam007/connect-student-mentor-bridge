# Spec Delta

## Purpose

Gives a signed-in account a way to move between the pages that already exist — account, profiles, sessions, and the security page — and makes signing out of the current session different from signing out of every session, so a leaked device does not force a full sign-out.

## ADDED Requirements

### Requirement: A header on every page

Every page SHALL render a header that shows the app name and the destinations available to the current visitor: `Sign in` and `Create account` when there is no session, and `Account`, `Profile`, `Sessions`, and `Sign out` when there is one.

#### Scenario: Signed-out visitor

- **WHEN** a visitor without a session opens any page
- **THEN** the header links to sign-in and sign-up and offers no signed-in destination and no sign-out

#### Scenario: Signed-in account

- **WHEN** a signed-in account opens any page
- **THEN** the header links to the account page, the profile page, and the session list, and shows a sign-out action

#### Scenario: The header never blocks the page

- **WHEN** the session probe fails or is slow
- **THEN** the page content still renders, the header shows the signed-out destinations, and no error is surfaced in place of page content

### Requirement: Sign out ends only the current session

The shell SHALL provide a sign-out action that revokes the current session only, leaves every other session of that account valid, and then shows the visitor the signed-out home page.

#### Scenario: Sign out of the current session

- **WHEN** a signed-in account chooses `Sign out`
- **THEN** the current session is revoked, the session cookie is cleared, the visitor lands on the home page, and another session of the same account still works

#### Scenario: Sign out when the session is already gone

- **WHEN** the sign-out call reports that the session no longer exists
- **THEN** the cookie is still cleared, the visitor sees the signed-out header, and no error is shown

### Requirement: Signing out of every session lives with the session list

The action that revokes every session of an account SHALL be offered on the session list page, SHALL revoke all sessions including the current one, and SHALL NOT be offered on the sign-in page.

#### Scenario: Sign out everywhere from the session list

- **WHEN** a signed-in account chooses to sign out of all sessions on the session list page
- **THEN** every session row for that account is revoked, the visitor ends up signed out, and their next request is rejected with `401`

#### Scenario: The sign-in page carries no session actions

- **WHEN** a visitor opens the sign-in page
- **THEN** the page shows the sign-in form, the Google action, and the reset link only, and offers no signed-in state

### Requirement: The account area is connected

The account page SHALL link to the session list and to the security page, and each of those pages SHALL link back to the account page.

#### Scenario: Reaching the session list

- **WHEN** a signed-in account is on the account page
- **THEN** one click reaches the session list, and one click from there returns to the account page

#### Scenario: Reaching the security page

- **WHEN** a signed-in account is on the account page
- **THEN** one click reaches the second-factor security page, and one click from there returns to the account page

### Requirement: Navigation is accessible on a narrow viewport

The header and the in-page links SHALL be reachable by keyboard, SHALL meet WCAG 2.1 AA contrast, SHALL use the string catalog, and SHALL remain usable at a 360-pixel-wide viewport.

#### Scenario: Keyboard and screen reader

- **WHEN** a keyboard-only user tabs through the header and the account area
- **THEN** every destination and action is focusable, has an accessible name, and shows a visible focus indicator

#### Scenario: Narrow viewport

- **WHEN** the app renders at 360 pixels wide
- **THEN** the header's destinations are all reachable without horizontal scrolling
