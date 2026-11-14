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
openssl rand -base64 32   # paste the output after BETTER_AUTH_SECRET= in .env
docker compose up -d --build
docker compose ps
```

`BETTER_AUTH_SECRET` has no default. A clean copy of `.env.example` leaves it empty and the API refuses to start; set it to at least 32 characters before the first `up`. In PowerShell, run `(openssl rand -base64 32)` and paste the printed value into `.env`.

Every service must report `healthy`:

| Service | Address | Purpose |
|---|---|---|
| `web` | http://localhost:3000 | Next.js shell page; `/healthz` is the container health route |
| `api` | http://localhost:3001 | NestJS API; `/healthz` liveness, `/readyz` readiness |
| `postgres` | localhost:55432, or whichever free port `POSTGRES_PORT` names | PostgreSQL 16 |
| `objectstore` | http://localhost:7070 | S3-compatible store (versitygw) for evidence uploads later |
| `mailpit` | http://localhost:8025, SMTP on 1025 | Mail catcher |
| `clamav` | internal only | Scanner container; no scan integration yet |

`.env.example` lists every variable with local-only placeholder values. The
committed file contains no real credential and no value is usable against a
deployed system. Postgres is published on `${POSTGRES_PORT}` (55432 in that
file) so it does not collide with a PostgreSQL already running on 5432.

Windows can reserve a TCP port range that contains the published port, and then
the container cannot bind it: `docker compose ps` still shows the container up,
but a host process cannot connect and the integration suite loses its database
without saying why. Check the reserved ranges before a local run:

```bash
netsh interface ipv4 show excludedportrange protocol=tcp
```

On this machine that output contains 55405-55504, so 55432 cannot be published;
`POSTGRES_PORT=55400` is the value used locally. Any free port works: Compose
publishes `${POSTGRES_PORT:-55432}`, so the only edits are the port value and the
host `DATABASE_URL` beside it (D-157).

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
`DATABASE_URL` at the published database (localhost and the value of
`POSTGRES_PORT`), not the Compose service name.

## Database migrations and reference data

The schema is Drizzle TypeScript in `services/api/src/db/schema/`. Generated SQL lives in `services/api/drizzle/` and is applied forward-only; never edit an applied migration. Both commands read `DATABASE_URL` from the environment or the repository-root `.env`.

```bash
pnpm --filter api db:migrate   # apply pending migrations
pnpm --filter api db:seed      # idempotent institution/domain data plus the pilot affiliation attestations
SEED_DEMO_MENTORS=1 pnpm --filter api db:seed:demo   # dev only: two fake mentors for the /mentors page
```

The seed adds two illustrative institutions and, for the automatic Level 1 path, registers `example.edu.bd` on **Illustrative University**. That domain is a documentation placeholder (D-57), not a partnership: replace it when the pilot partner is known. `services/api/src/db/seed/affiliations.ts` also holds the checked-in pilot attestations (D-56); each entry writes one `VERIFIED`/`ADMIN_ATTESTATION` affiliation with its reason and one audit row, and an entry whose account does not exist is reported as skipped rather than failing the run. Run the seed again after the pilot accounts exist; a rerun inserts nothing new.

### The dev admin accounts the seed creates

`pnpm --filter api db:seed` also creates two demo admin accounts on the reserved `example.com` domain, so both admin surfaces are reachable locally without hand-written SQL (D-97, D-103):

| Email | Role | Scope |
|---|---|---|
| `platform.admin@example.com` | `PLATFORM_ADMIN` | none |
| `institution.admin@example.com` | `INSTITUTION_ADMIN` | the seeded **Illustrative University** |

Each account is created once, with a **generated password printed exactly once** to the seed's stdout as `{"event":"seed.admin_created","email":...,"password":...}`. The password is not stored anywhere: copy it from that line or reset it through `/forgot-password`. A second run prints no password and inserts nothing. The seed **refuses** to create these accounts when `NODE_ENV=production`, so nothing privileged is ever seeded into a real environment; the review and attestation routes still require an enrolled second factor (`403 MFA_REQUIRED`), which you enroll through `/account/security`.

### Granting the pilot's Platform Admin role in production

The pilot has one reviewer (the owner). No route grants `PLATFORM_ADMIN`, and the dev seed never runs in production (D-103): grant the role with one hand-run statement, then enroll a second factor through `/account/security` — the admin routes require MFA (`403 MFA_REQUIRED` without one). Bootstrapping this first account is DEBT-46.

```sql
INSERT INTO role_assignments (user_id, role)
SELECT id, 'PLATFORM_ADMIN' FROM users WHERE email = '<owner email>'
ON CONFLICT DO NOTHING;
```

Run it against the database, for example `docker compose exec -T postgres psql -U connect -d connect -c "<statement>"`. The review queue is at `/admin/reviews` and the affiliation queue at `/institution/attestations`; the header shows `Admin` only when the session holds `PLATFORM_ADMIN`, and `Claims` only when it holds `INSTITUTION_ADMIN` with an institution scope.

### Demo mentors

The demo seed is separate and guarded: it refuses to run when `NODE_ENV=production` or when `SEED_DEMO_MENTORS` is not `1`. It writes two accounts on the reserved `@example.edu.bd` domain (a user, the `MENTOR` role, a Level 1 `ADMIN_ATTESTATION` affiliation, a fixed fake second-factor row, and an `ACTIVE` mentor profile) and is idempotent by email, so a second run inserts nothing. Never wire it into `db:seed`.

When they run on the host, `DATABASE_URL` must point at the published port (localhost and the value of `POSTGRES_PORT`); inside a container, Compose builds the `postgres:5432` URL. Migrations are owned by the owner/script and are never applied through the read-only `postgresql` MCP.

### Outbox test event

The worker relays `outbox_events` rows into pg-boss and delivers `EmailRequested` events through the SMTP adapter. To see that path end to end:

```bash
pnpm --filter api outbox:test-event you@example.com
```

The command writes one `EmailRequested` row and prints its id. Within about five seconds (`OUTBOX_POLL_INTERVAL_MS`, default 5000) the worker enqueues it and delivers it; read the message at http://localhost:8025 (Mailpit). Running the command again with the same address writes nothing new: the dedupe key is `outbox-test:<address>`. Set `OUTBOX_MAX_ATTEMPTS` (default 5) to change the retry budget; a failing event shows an increasing `attempts` and `last_error` and, at the budget, a `failed_at` with one `outbox.event_failed` log line.

```sql
SELECT event_type, attempts, last_error, processed_at, failed_at FROM outbox_events ORDER BY created_at DESC;
```

The append-only grants create `connect_app` with `NOLOGIN`; local development connects as the database owner. A deployed environment creates a login role (for example `connect_login`), grants `connect_app` to it, and points the API and worker DSN at that login role. Never use the database owner for the app outside local development.

Integration tests use a separate `connect_test` database. Create it once:

```bash
docker compose exec postgres psql -U connect -d postgres -c "CREATE DATABASE connect_test"
```

Replace `connect` with `POSTGRES_USER` if it differs. The tests reset the `connect_test` schema on every run and never touch the development database. Outside CI they print a skip reason when the database is unreachable; with `CI` set they fail instead, so a green required check means the integration suite really ran.

## Auth configuration

| Variable | Purpose |
|---|---|
| `BETTER_AUTH_SECRET` | Session signing and the keyed hash in `signup_blocks`. Generate a local value with `openssl rand -base64 32`; at least 32 characters. Never commit it |
| `BETTER_AUTH_URL` | Public application origin used in verification and reset links (`http://localhost:3000` locally) |
| `WEB_CSRF_MODE` | Unset or any value enforces the CSRF guard on cookie-authenticated writes; `off` disables it for one deploy, a restart is enough (D-161) |

`GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are optional: set both to enable
Google sign-in, leave both empty to keep it disabled. A half-set pair is treated as
unset, and the start endpoint then answers `503 PROVIDER_UNAVAILABLE`. No value is
ever committed.

`BETTER_AUTH_SECRET` has no default: the API refuses to start when it is missing or shorter than 32 characters. Verification links point at `apps/web/api/auth/verify`, and reset links at the `/reset` page.

The `web` container calls the API at `http://api:3001` (`API_INTERNAL_URL` in `compose.yaml`). The browser-facing `NEXT_PUBLIC_API_BASE_URL` is the published port (`http://localhost:3001`); a container must never be pointed at `localhost` for the API, because that resolves to the container itself.

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

## CI gates

`.github/workflows/ci.yml` runs three parallel jobs on every pull request and
on pushes to `main`:

| Job | What it enforces |
|---|---|
| `checks` | frozen-lockfile install, lint, type-check, unit tests, production build |
| `images` | Docker build of the API and web images, then a Trivy scan (`ignore-unfixed`, failing on HIGH/CRITICAL) |
| `security` | `pnpm audit --audit-level high` and a Gitleaks secret scan |

Branch protection is a repository ruleset (`protect-main`) on the default
branch. It requires the `checks`, `images`, and `security` checks on the latest
commit, requires a pull request before merging (zero approvals needed), and
blocks branch deletion and non-fast-forward pushes. Nobody pushes directly to
`main`; work lands through a green pull request. Agents may push feature
branches and open pull requests; the owner merges.

## Notes and deviations

- The object store is **versitygw**, an S3-compatible gateway. The MinIO
  community image no longer allows anonymous pulls, so it cannot start from a
  clean checkout or CI without registry credentials. The S3 contract
  (`S3_*` variables, path-style addressing) is unchanged.
- Compose files live at the repository root so plain `docker compose up` works
  (design.md D3); Dockerfiles live in `infra/docker/`.
