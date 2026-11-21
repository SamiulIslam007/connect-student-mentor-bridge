# Spec Delta

## ADDED Requirements

### Requirement: Published ports bind loopback by default

Every published port in the base Compose file SHALL bind `127.0.0.1` by default, including Postgres, the object store, Mailpit, the API and the web app, and a LAN test SHALL require an explicit opt-in override.

#### Scenario: A default stack is not reachable from the LAN

- **WHEN** the documented default command starts the stack
- **THEN** each published port is bound to `127.0.0.1` and a peer on the same LAN cannot connect

#### Scenario: The mail catcher is local only

- **WHEN** a verification or reset email is captured
- **THEN** its token is readable only from the local machine, not from another host on the network

#### Scenario: The opt-in is explicit

- **WHEN** a contributor needs a LAN device
- **THEN** they use a separate override that binds the named port, and the base file is unchanged

#### Scenario: A config test catches a regression

- **WHEN** a service gains a published port without a host address
- **THEN** the Compose policy test fails and names the service

### Requirement: API-only secrets stay out of the web container

The web service SHALL NOT receive `GOOGLE_CLIENT_SECRET`, `BETTER_AUTH_SECRET`, `DATABASE_URL`, `S3_SECRET_ACCESS_KEY`, `SMTP_PASSWORD` or any other API-only secret, and the Google client secret SHALL be present only in the API environment.

#### Scenario: The web environment is inspected

- **WHEN** the Compose environment for the web service is read
- **THEN** none of the named API-only variables is present

#### Scenario: The API still owns the provider

- **WHEN** Google sign-in starts or completes
- **THEN** only the API uses the client secret, and the web app calls the API

#### Scenario: A config test fails on a leak

- **WHEN** an API-only variable is added to the web block
- **THEN** the test fails and names the variable without printing its value

### Requirement: SMTP requires TLS in production

In production the SMTP sender SHALL use implicit TLS or require STARTTLS with certificate verification, SHALL fail rather than send plaintext when TLS is unavailable, and SHALL keep the local Mailpit plaintext path limited to development configuration.

#### Scenario: Production refuses a stripped STARTTLS

- **WHEN** the production transport cannot establish TLS
- **THEN** the send fails and the failure is logged without credentials or message content

#### Scenario: Local Mailpit still works

- **WHEN** the configured environment is local development
- **THEN** the plaintext Mailpit transport is used only there

#### Scenario: The transport is configured explicitly

- **WHEN** the SMTP settings are read
- **THEN** production sets implicit TLS or `requireTLS` and certificate verification, not opportunistic plaintext

### Requirement: Production startup rejects development secret values

The API SHALL refuse to start in production when a required secret is empty or equals a documented development placeholder, and the deployment SHALL source secrets from the host's secret store rather than a committed environment file.

#### Scenario: A development value fails startup

- **WHEN** production starts with a known development placeholder
- **THEN** the process exits non-zero and names the variable, without printing the value

#### Scenario: A real environment value starts

- **WHEN** every required secret is a non-placeholder value from the host
- **THEN** startup proceeds

#### Scenario: The secret list is documented

- **WHEN** an operator reads the runbook
- **THEN** every required secret, its rotation owner and its fallback are named, with no values
