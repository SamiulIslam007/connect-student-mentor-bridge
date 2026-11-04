# identity/google-signin Specification

## Purpose
Lets an account with a Google identity sign in, links that identity to an existing account by verified email, and keeps the whole flow inert until the owner supplies provider credentials.

## Requirements

### Requirement: Google sign-in start

The system SHALL start a Google sign-in for a browser by returning the provider authorization URL, and SHALL refuse the request when the provider is not configured rather than falling back to a built-in client identifier.

#### Scenario: Configured provider returns the authorization URL

- **WHEN** the API is started with `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` set and a client asks to sign in with Google
- **THEN** the response contains an authorization URL for Google carrying this deployment's client id, and an opaque value that the callback step must return

#### Scenario: Unconfigured provider refuses

- **WHEN** the provider credentials are absent and a client asks to sign in with Google
- **THEN** the request is rejected with `503` and code `PROVIDER_UNAVAILABLE`, no request leaves the server, and no placeholder client id is used

#### Scenario: Unknown provider is a validation error

- **WHEN** a client asks to sign in with a provider that is not enabled
- **THEN** the request is rejected with `422 VALIDATION_FAILED` and no redirect URL is returned

### Requirement: Google sign-in callback creates or links the account

The system SHALL complete a Google sign-in from the callback parameters, SHALL treat the provider email as verified, and SHALL apply the same account activation and status rules as the password path.

#### Scenario: First sign-in creates an active account

- **WHEN** a Google identity with a verified email completes the callback and no account exists for that email
- **THEN** one account is created with `email_verified = true` and `account_status = ACTIVE`, one session is issued, and an audit entry records the sign-in

#### Scenario: Existing account is linked, not duplicated

- **WHEN** a Google identity completes the callback for an email that already has an account with no Google identity linked
- **THEN** the Google identity is linked to that existing account, no second account is created, and the session belongs to the existing account id

#### Scenario: Suspended account is refused

- **WHEN** a Google identity completes the callback for an account whose `account_status` is `SUSPENDED`
- **THEN** the request is refused with `403 ACCOUNT_SUSPENDED` and no session is created

#### Scenario: Second factor is not bypassed

- **WHEN** a Google identity completes the callback for an account that has an active second factor
- **THEN** the request is refused with `403 FORBIDDEN`, the session the provider flow created is revoked, and the account must sign in with the password and its second factor

#### Scenario: Missing or altered callback state is refused

- **WHEN** the callback arrives without the opaque value issued at sign-in start, or with a different value
- **THEN** the request is rejected with `401 UNAUTHENTICATED`, no account is created or linked, and no session is issued

#### Scenario: Provider error is a client failure, not a server failure

- **WHEN** the provider returns an error or an unusable code
- **THEN** the response is a `4xx` problem body naming the failure class and never a `500`

### Requirement: Provider credentials come from the environment only

The system SHALL read the provider credentials from the environment, SHALL NOT carry a default, placeholder, or committed value, and SHALL document the variable names without values.

#### Scenario: No committed credential

- **WHEN** the repository is searched for a Google client identifier or secret
- **THEN** only environment variable names appear (`.env.example` carries names with no values) and no value is committed

#### Scenario: Startup without credentials stays healthy

- **WHEN** the API starts without provider credentials
- **THEN** the service is healthy, password and MFA sign-in still work, and only the Google start endpoint reports `PROVIDER_UNAVAILABLE`
