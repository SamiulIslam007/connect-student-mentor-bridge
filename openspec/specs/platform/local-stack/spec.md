# platform/local-stack Specification

## Purpose

Defines the containerized local environment that starts the complete connect stack from a clean checkout with one command, so contributors and agents develop against the same dependencies the product later deploys with.

## Requirements

### Requirement: One command starts the whole local stack

Running the documented Compose command from a clean checkout SHALL start `web`, `api`, `worker`, `postgres`, the S3-compatible object store, the mail catcher, and the malware scanner, and SHALL reach a healthy state after copying the environment example, generating and setting `BETTER_AUTH_SECRET`, and building images.

#### Scenario: Clean checkout reaches healthy

- **WHEN** a contributor follows the documented setup on a machine with Docker, sets a generated `BETTER_AUTH_SECRET`, and runs the documented Compose command
- **THEN** all services start and report healthy, and the web app and API respond on their published local ports

#### Scenario: Dependencies are ready before dependents serve

- **WHEN** the API container starts while the database container is still initializing
- **THEN** the API waits for the database health check instead of crash-looping or serving traffic it cannot fulfil

#### Scenario: Start failure is visible

- **WHEN** a required service cannot start because a variable is missing or a port is already in use
- **THEN** the command exits non-zero and names the failing service

#### Scenario: A missing auth secret fails loudly

- **WHEN** `.env` still has an empty `BETTER_AUTH_SECRET` and the stack starts
- **THEN** the API refuses to boot and the error names the variable and the command to generate a value

### Requirement: Every service declares a health check

Each service in the local stack SHALL declare a health check that inspects the process itself. Services exposing HTTP SHALL check an HTTP response on a documented route rather than a bare port probe, and the API SHALL use its operational endpoints.

#### Scenario: Service health is observable

- **WHEN** a contributor inspects the running stack
- **THEN** each service reports a healthy or unhealthy state, and the API and web health reflect their operational endpoints

#### Scenario: A wedged process is reported unhealthy

- **WHEN** a service process stops responding while its container is still running
- **THEN** that service reports unhealthy

### Requirement: Local data survives restarts and can be reset deliberately

Database, object storage, and captured mail data SHALL persist in named volumes across a normal stop and start, and SHALL be removed only by an explicit volume-deleting command.

#### Scenario: Data survives a restart

- **WHEN** a contributor stops the stack without deleting volumes and starts it again
- **THEN** previously written local data is still present

#### Scenario: Reset is explicit

- **WHEN** a contributor runs the documented volume-deleting command
- **THEN** local data is cleared and the stack starts from an empty state

### Requirement: Local images match the deployment shape

The stack SHALL run container images that are built in multiple stages, pin their base image versions, run as a non-root user, contain no secrets, and use one API image for both the API and worker with different start commands.

#### Scenario: Non-root runtime

- **WHEN** any application container is running
- **THEN** its process runs as a non-root user

#### Scenario: API and worker share an image

- **WHEN** the API and worker services are compared
- **THEN** they run the same image and differ only in start command and environment

### Requirement: Development hot reload is a separate overlay

The base Compose definition SHALL describe the runnable stack, and a separate development overlay SHALL add source-mounted hot reload so the base definition stays deployable.

#### Scenario: Source change reloads without a rebuild

- **WHEN** a contributor runs the stack with the development overlay and edits source in the web app or API
- **THEN** the affected service reloads without rebuilding its image

#### Scenario: Base definition carries no development mounts

- **WHEN** the stack runs without the development overlay
- **THEN** no host source directory is mounted into an application container

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
