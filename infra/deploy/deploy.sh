#!/usr/bin/env bash
# Migrate-first deploy (D-252, SEC-INF-6).
#
# The order is the point: the migration runs as its own step and a failure stops
# the release before any new image takes traffic. Everything after the migration
# is the host's job, and each step is named so a runbook entry can quote it.
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL must be set for the migration step}"

echo "{\"event\":\"deploy.migrate.start\"}"
if ! pnpm --filter api db:migrate; then
  echo "{\"event\":\"deploy.migrate.failed\",\"action\":\"release stopped, previous version keeps serving\"}" >&2
  exit 1
fi
echo "{\"event\":\"deploy.migrate.done\"}"

# The host restarts each service after this script exits 0. The API image is the
# same one the worker runs, so the two share a release tag.
for service in api worker web; do
  echo "{\"event\":\"deploy.restart\",\"service\":\"${service}\",\"order\":\"after migration\"}"
done

echo "{\"event\":\"deploy.ready_to_verify\",\"checks\":[\"/healthz\",\"/readyz\",\"sign-in page\"]}"
