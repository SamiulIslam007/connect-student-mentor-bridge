# Local setup

The local environment is the Docker Compose stack at the repository root plus the
pnpm workspace. Everything here runs from a clean checkout with one Compose
command after one file copy.

## Prerequisites

| Tool | Version / note |
|---|---|
| Node.js | Version from `.nvmrc` (currently 24.19.0) |
| pnpm | 12.16.1 (`corepack enable` or `npm install -g pnpm@12.16.1`) |
| Docker | Docker Desktop with the **WSL 2** backend on Windows, plus the Compose plugin |

Windows and WSL 2: keep the repository inside the WSL 2 file system or use a Dev
Drive. Docker Desktop reads bind-mounted source across the host-to-VM file-share
layer; the development overlay enables polling so edits still reload.

## One command from a clean checkout

```bash
cp .env.example .env      # PowerShell: Copy-Item .env.example .env
docker compose up -d --build
docker compose ps
```

Every service must report `healthy`:

| Service | Address | Purpose |
|---|---|---|
| `web` | http://localhost:3000 | Next.js shell page; `/healthz` is the container health route |
| `api` | http://localhost:3001 | NestJS API; `/healthz` liveness, `/readyz` readiness |
| `postgres` | localhost:55432 | PostgreSQL 16 |
| `objectstore` | http://localhost:7070 | S3-compatible store (versitygw) for evidence uploads later |
| `mailpit` | http://localhost:8025, SMTP on 1025 | Mail catcher |
| `clamav` | internal only | Scanner container; no scan integration yet |

`.env.example` lists every variable with local-only placeholder values. The
committed file contains no real credential and no value is usable against a
deployed system. Postgres is published on 55432 so it does not collide with a
PostgreSQL already running on 5432.

ClamAV downloads its signature database on first run. Its health check has a
5-minute start period, so `docker compose ps` may show `starting` for a few
minutes the first time. This is expected; use `docker compose logs -f clamav` to
watch progress. The API does not depend on ClamAV.

## Development overlay (hot reload)

```bash
docker compose -f compose.yaml -f compose.dev.yaml up -d --build
```

The overlay mounts source for `web`, `api`, and `worker` and runs each in watch
mode; edits reload without an image rebuild. The base `compose.yaml` mounts no
host source.

## Working without Docker for the app processes

```bash
pnpm install
pnpm dev            # web on :3000, api on :3001
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

These are the same commands CI runs. When running the API on the host, point
`DATABASE_URL` at the published database (`localhost:55432`), not the Compose
service name.

## Data and reset

`pgdata`, `objectstoredata`, `mailpitdata`, and `clamavdata` are named volumes,
so data survives `docker compose down` and `up`. To start from empty:

```bash
docker compose down -v
```

## Stop

```bash
docker compose down
```

## Notes and deviations

- The object store is **versitygw**, an S3-compatible gateway. The MinIO
  community image no longer allows anonymous pulls, so it cannot start from a
  clean checkout or CI without registry credentials. The S3 contract
  (`S3_*` variables, path-style addressing) is unchanged.
- Compose files live at the repository root so plain `docker compose up` works
  (design.md D3); Dockerfiles live in `infra/docker/`.
