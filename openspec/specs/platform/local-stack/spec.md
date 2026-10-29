# platform/local-stack Specification

## Purpose

Defines the containerized local environment that starts the complete connect stack from a clean checkout with one command, so contributors and agents develop against the same dependencies the product later deploys with.

## Requirements

### Requirement: One command starts the whole local stack

Running the documented Compose command from a clean checkout SHALL start `web`, `api`, `worker`, `postgres`, the S3-compatible object store, the mail catcher, and the malware scanner, and SHALL reach a healthy state without manual steps beyond copying the environment example and building images.

#### Scenario: Clean checkout reaches healthy

- **WHEN** a contributor follows the documented setup on a machine with Docker and runs the documented Compose command
- **THEN** all services start and report healthy, and the web app and API respond on their published local ports

#### Scenario: Dependencies are ready before dependents serve

- **WHEN** the API container starts while the database container is still initializing
- **THEN** the API waits for the database health check instead of crash-looping or serving traffic it cannot fulfil

#### Scenario: Start failure is visible

- **WHEN** a required service cannot start because a variable is missing or a port is already in use
- **THEN** the command exits non-zero and names the failing service

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
