# Spec Delta

## Purpose

Defines the unversioned operational endpoints that tell the container platform and uptime monitoring whether the API process is alive and whether it can serve traffic, without exposing internal detail or requiring authentication.

## ADDED Requirements

### Requirement: Liveness endpoint reports the process only

`GET /healthz` SHALL return `200` with a stable JSON body indicating the API process is running. It SHALL NOT require authentication, SHALL NOT be versioned, and SHALL NOT depend on the database or any other external service.

#### Scenario: Live process returns ok

- **WHEN** an unauthenticated client sends `GET /healthz` to a running API process
- **THEN** the response is `200` with a JSON body whose status field reports `ok`

#### Scenario: Liveness survives a dependency outage

- **WHEN** the database or object storage is unreachable while the API process is still running
- **THEN** `GET /healthz` still returns `200`

### Requirement: Readiness endpoint reflects dependency availability

`GET /readyz` SHALL return `200` only when the API can serve traffic, which requires the database connection to succeed, and SHALL return `503` when a required dependency is unavailable. The body SHALL report the status of each checked dependency without secrets, stack traces, connection strings, or personal data.

#### Scenario: Ready when dependencies are available

- **WHEN** an unauthenticated client sends `GET /readyz` and the database is reachable
- **THEN** the response is `200` with a JSON body reporting `ok` for each checked dependency

#### Scenario: Not ready when the database is unavailable

- **WHEN** an unauthenticated client sends `GET /readyz` and the database connection fails
- **THEN** the response is `503` and the body identifies the unavailable dependency without exposing internal detail

#### Scenario: Readiness is bounded

- **WHEN** a dependency check hangs
- **THEN** the endpoint responds within its configured timeout instead of waiting indefinitely

### Requirement: Operational endpoints are stable and unauthenticated

`GET /healthz` and `GET /readyz` SHALL be reachable without a session or bearer token, SHALL live outside the `/v1` product base path, SHALL return `application/json`, and SHALL keep a stable field shape so container health checks and the uptime monitor can rely on them.

#### Scenario: No credentials required

- **WHEN** either endpoint is called with no `Authorization` header and no session cookie
- **THEN** the request is served rather than rejected with `401` or `403`

#### Scenario: Unknown operational path is not a health signal

- **WHEN** a client requests a path other than the two documented operational endpoints
- **THEN** the response is a normal `404` and is not treated as healthy by monitoring

### Requirement: Health checks drive the local stack and monitoring

The local stack's API health check and the external uptime monitor SHALL use these endpoints, and the API container SHALL be reported unhealthy when they fail.

#### Scenario: Failed readiness marks the container unhealthy

- **WHEN** `GET /readyz` returns `503` inside the local stack
- **THEN** the API container is reported unhealthy
