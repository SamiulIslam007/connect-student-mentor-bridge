# Spec Delta

## REMOVED Requirements

### Requirement: The web app sends a documented header set with a report-only policy

The web app SHALL set `X-Content-Type-Options`, `Referrer-Policy`, frame protection and a permissions policy on every route, and SHALL set a content security policy in report-only mode until enforcement is decided separately.

#### Scenario: Every route carries the headers

- **WHEN** any web route is requested
- **THEN** the header map returned for that path contains the four enforcing headers and the report-only policy

#### Scenario: The policy is report-only, named as such

- **WHEN** the response headers are read
- **THEN** the content policy appears under the report-only header name and no enforcing policy header is present

#### Scenario: The policy permits what the app uses

- **WHEN** the policy is read
- **THEN** it allows same-origin scripts, styles and connections, inline styles, and data images, and forbids framing and foreign form actions

**Reason**: the requirement's title and its own scenario state a mode that no longer exists once the policy enforces; leaving it in place would publish a header that contradicts its body. The replacement requirement below carries the directive list forward unchanged.

**Migration**: no consumer changes. The four other headers, the directive list and the source pattern are identical, and `WEB_CSP_MODE=report-only` reproduces the removed header for one deploy.

## ADDED Requirements

### Requirement: The web app enforces its content security policy

The web app SHALL send `Content-Security-Policy` on every route with the documented directive list, SHALL NOT send a report-only policy in the default configuration, and SHALL send the report-only header only when `WEB_CSP_MODE=report-only` is configured.

#### Scenario: The enforcing header is present on every route

- **WHEN** any web route is requested
- **THEN** the response carries `Content-Security-Policy` and the four other documented headers

#### Scenario: No report-only header in the default configuration

- **WHEN** the response headers are read with no flag set
- **THEN** no `Content-Security-Policy-Report-Only` header is present

#### Scenario: The flag restores the report-only mode

- **WHEN** `WEB_CSP_MODE=report-only` is set and the web app restarts
- **THEN** the response carries `Content-Security-Policy-Report-Only` and no enforcing policy

#### Scenario: The policy permits what the app uses and nothing else

- **WHEN** the policy is read
- **THEN** it allows same-origin scripts and connections, same-origin and inline styles, inline scripts, and data images, and it forbids framing, foreign form actions and any foreign script origin

#### Scenario: The browser runs every flow under it

- **WHEN** the manual checklist in the change's tasks is executed on the running stack
- **THEN** sign-up, sign-in, Google sign-in and its callback, MFA, one form submit and one admin read complete with no CSP violation in the browser console
