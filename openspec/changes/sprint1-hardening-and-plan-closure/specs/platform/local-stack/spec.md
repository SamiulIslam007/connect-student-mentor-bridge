# Spec Delta

## MODIFIED Requirements

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
