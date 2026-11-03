---
title: Never run two API integration test processes against connect_test at once
date: 2026-11-03
category: testing
module: services/api
problem_type: developer_experience
component: integration-tests
severity: medium
applies_when:
  - running or debugging services/api integration tests
  - an agent wants to run one test file directly with node --import tsx --test
  - two test commands are about to be issued in parallel
tags: [integration-tests, postgres, test-database, concurrency]
---

# Never run two API integration test processes against connect_test at once

## Context

`services/api` integration tests all use the single `connect_test` database. The
package script (`node --test --test-concurrency=1 test/*.test.ts`) runs every file
in one process, so the serial guarantee holds there. Running a single file
directly, or issuing two test commands at the same time, creates two processes
that both reset and truncate the same database.

## Guidance

- Prefer `pnpm --filter api test` (one process, serial) or the root `pnpm test`.
- When running one file directly, run one at a time and wait for it to finish:
  `node --import tsx --test test/<subject>.test.ts`.
- Never issue two `node --test` invocations against `connect_test` in parallel
  tool calls, even for different files.

## Why This Matters

`openTestDatabase` + `resetDatabase` drop and recreate the `public` schema, and
each suite truncates the shared tables between tests. Two processes interleave
those operations: a schema drop waits on the other connection's locks, and the
run hangs instead of failing with a clear assertion. A 27-second suite timed out
after 10 minutes this way. The hang looks like a code defect, so it costs a
misdiagnosis, not just time.

## When to Apply

- Any local or agent-driven run of the API integration suite.
- Any future suite that shares `connect_test` between files or processes.

## Examples

Wrong (two tool calls in parallel):

```text
node --import tsx --test test/identity.integration.test.ts
node --import tsx --test test/profiles.integration.test.ts
```

Right:

```text
pnpm --filter api test
```

## Related

- `services/api/test/support/database.ts` (reset/truncate helpers)
- `services/api/package.json` (`test` script)
- `docs/local-setup.md` (creating `connect_test`)
