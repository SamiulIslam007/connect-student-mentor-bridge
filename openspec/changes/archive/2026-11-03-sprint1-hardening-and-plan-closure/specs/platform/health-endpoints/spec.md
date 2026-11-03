# Spec Delta

## ADDED Requirements

### Requirement: Readiness uses the application database configuration

The readiness probe SHALL resolve the database URL through the same environment-or-root-`.env` path as the database module, so a host run configured only by the repository `.env` reports the same database state that the API actually uses.

#### Scenario: Host run with only the root .env is ready

- **WHEN** the API runs on the host with `DATABASE_URL` absent from the shell but present in the repository `.env`, and the database is reachable
- **THEN** `GET /readyz` returns `200`

#### Scenario: Missing configuration is not ready

- **WHEN** no database URL is available from either the environment or `.env`
- **THEN** `GET /readyz` returns `503` with `database: "unavailable"` and no connection string or stack trace

#### Scenario: The probe stays bounded

- **WHEN** the database check hangs
- **THEN** the endpoint responds within `READINESS_TIMEOUT_MS` instead of waiting indefinitely
