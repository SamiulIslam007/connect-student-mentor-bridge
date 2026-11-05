# identity/mfa-enrollment-ui Specification

## Purpose
Lets a signed-in account turn on a second factor, confirm it works, and turn it off again inside the web app, using the enrollment and verification behaviour the API already provides, without ever showing secret material a second time.

## Requirements

### Requirement: Enroll a second factor in the web app

The web app SHALL let a signed-in account start second-factor enrollment by confirming its password, SHALL show the TOTP secret, the `otpauth://` provisioning URI, and the backup codes exactly once per enrollment, and SHALL NOT consider the factor active until a correct code has been verified.

#### Scenario: Enrollment shows the secret once

- **WHEN** a signed-in account opens the security page and confirms its password
- **THEN** the page shows the TOTP secret, a provisioning URI an authenticator app can consume, and the full set of backup codes, and no response body or page URL contains a session token

#### Scenario: Enrollment is not active before verification

- **WHEN** enrollment has returned a secret and no code has been verified yet
- **THEN** the account still signs in with the password alone, and the page states that verification is the step that turns the factor on

#### Scenario: A correct code activates the factor

- **WHEN** the account enters a correct six-digit code on the enrollment page
- **THEN** the factor becomes active, the page confirms activation, and the account's next password sign-in requires the second step

#### Scenario: A wrong code leaves the factor inactive

- **WHEN** the account enters an incorrect code
- **THEN** the page shows an error in the string catalog, the factor stays inactive, and the account can retry with another code

#### Scenario: Backup codes are not shown again

- **WHEN** the account reloads or revisits the security page after a successful enrollment
- **THEN** neither the secret nor the backup codes are shown again, and the page offers only the disable action

#### Scenario: A password-confirmed call is required

- **WHEN** the enrollment form is submitted with an empty or wrong password
- **THEN** the page shows the same validation failure the API returns and creates no secret

### Requirement: Disable the second factor in the web app

The web app SHALL let an account with an active factor disable it after confirming its password, and SHALL report the resulting state on the page.

#### Scenario: Disable succeeds

- **WHEN** the account confirms its password on the security page while a factor is active
- **THEN** the factor and its backup codes are removed, the page reports that the factor is off, and the next password sign-in returns a session without a second step

#### Scenario: Disable refuses a wrong password

- **WHEN** the account submits a wrong password
- **THEN** the factor stays active, the page shows the validation failure, and nothing is deleted

### Requirement: Secret material stays on the page

The web app SHALL keep the TOTP secret and the backup codes in memory only, SHALL NOT write them to browser storage, a cookie, a URL, a log, or an analytics event, and SHALL clear them when the account leaves the page.

#### Scenario: Nothing is persisted

- **WHEN** an enrollment response has been rendered
- **THEN** browser storage and cookies contain no secret and no backup code, and the network history is the only place the response exists

#### Scenario: Leaving the page discards them

- **WHEN** the account navigates away before recording the codes
- **THEN** the page no longer holds them on return and states that a new enrollment starts a new secret

### Requirement: The security page has explicit states

The security page SHALL render a loading state, a signed-out state, an error state, an enrolled state, and a not-enrolled state, and SHALL label each with string-catalog copy.

#### Scenario: Signed out

- **WHEN** a visitor without a session opens the security page
- **THEN** the page states that signing in is required and links to sign-in, and it offers no enrollment form

#### Scenario: Upstream failure

- **WHEN** the enrollment or disable call fails for a reason other than validation
- **THEN** the page shows a retryable error, keeps the form usable, and does not claim the factor changed
