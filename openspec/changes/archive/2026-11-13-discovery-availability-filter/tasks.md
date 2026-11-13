# Tasks: discovery-availability-filter

## 0. Preconditions

- [x] 0.1 Re-check the snapshot in `design.md`: `git log --oneline -1` (expect `3c8c571`), `git status`, `sed -n '1,40p' services/api/src/db/schema/availability.ts`, `grep -n "intervalOverlap\|function overlap" -A 20 packages/domain/src/match.ts`, `sed -n '288,302p' services/api/src/profiles/profiles.controller.ts`, `sed -n '344,400p' services/api/src/profiles/drizzle-profiles.service.ts`. Verify: every line confirmed or listed as a mismatch.
- [x] 0.2 Confirm the runtime can resolve IANA zones: run a one-line `node -e` that formats a known instant in `Asia/Dhaka` and `Europe/London` and prints the offsets. Record the output here; the design depends on `Intl` and not on a library.

## 1. The domain helper

- [x] 1.1 Add `zonedWindowToUtc({ weekday, startMinute, endMinute, timezone }, referenceDate)` to `packages/domain/src/availability.ts`, returning one UTC interval or two when the window crosses midnight, using only `Intl.DateTimeFormat`. Verify: `pnpm --filter @connect/domain typecheck` passes and the helper imports nothing outside the package.
- [x] 1.2 Add tests in `packages/domain/test/availability.test.ts` for: the same zone as the viewer, a zone offset by several hours, a window crossing midnight, a week containing a daylight-saving transition, and a zero-length window (refused upstream). Verify: each case asserts the exact UTC start and end, not just a boolean.
- [x] 1.3 Add the `shortcut:` comment naming the mid-week offset-change limit and pointing at `DEBT-43`. Verify: the comment is present and states the upgrade condition.

## 2. The API filter

- [x] 2.1 Extend `mentorDirectoryQuery` with the four parameters and the validations from `design.md` R5, each producing a field error naming its parameter. Verify: unit tests cover the six refusals and one acceptance.
- [x] 2.2 Add the `EXISTS` predicate to `listMentors` over `availability_windows` for the mentor's user id and `context = 'MENTOR'`, using `AT TIME ZONE` for both sides and both the row's weekday and the adjacent one. Verify: `grep -n "AT TIME ZONE" services/api/src/profiles/drizzle-profiles.service.ts` shows the predicate and typecheck passes.
- [x] 2.3 Add `services/api/test/directory-availability.integration.test.ts`: a covering window matches, a later window does not, a cross-zone pair matches only on real overlap, a midnight-crossing window matches both sides, a mentor with no windows is excluded, and the six refusals. Verify: the file's assertions each name their case and the existing directory tests are unchanged.
- [x] 2.4 Measure the query with `EXPLAIN (ANALYZE)` on a seeded directory of about 200 mentor rows with windows, and record the timing here. Verify: the plan uses the `(user_id, context)` index and the timing is stated; if it exceeds 200 ms, open a debt row naming the bound instead of adding an index.

## 3. Contract

- [x] 3.1 Add the four query parameters, their types and their bounds to `GET /v1/mentors` in `packages/contracts/openapi.yaml`. Verify: `pnpm --filter @connect/contracts test` passes and no new path or body key appears.

## 4. The page

- [x] 4.1 Add the query builder to `apps/web/lib/mentors.ts`: build the four parameters only when the viewer set a weekday, default the zone from `Intl.DateTimeFormat().resolvedOptions().timeZone`, and clear all four together. Verify: unit tests cover a full window, a cleared filter and a browser-zone default.
- [x] 4.2 Add the control to `apps/web/app/mentors/page.tsx`: weekday select, start and end time, a zone select defaulting to the browser's, and a clear control; the filter state lives in the URL like the existing three. Verify: a page test reads the file and asserts the four inputs, the URL update and the clear control.
- [x] 4.3 Change the empty-state text when an availability filter is active, so the student is told the filter is the reason. Verify: the page test asserts both empty strings exist and the conditional.
- [x] 4.4 Add the strings. Verify: `grep -rn "Available on" apps/web/app` finds no literal outside the catalogue.

## 5. Docs and register

- [x] 5.1 Update `docs/functional-requirements.md` `FR-DISC-01` as complete, naming the four parameters and the UTC comparison.
- [x] 5.2 Close `DEBT-26` in `docs/known-debt.md` with its evidence, and annotate `DEBT-43` as narrowed: the conversion now exists for the browse path and the match factor still treats differing zones as missing.
- [x] 5.3 Update `docs/api-contracts.md` (the parameters, the conversion rule and the refusals) and `docs/matching-algorithm-spec.md` (the shared conversion helper).
- [x] 5.4 Add the decision rows to `docs/decision-log.md` (full text at the end of this file), and update `docs/mvp-build-plan.md` section 5 and `docs/milestones-and-phases.md`.

## 6. Gates, review and handoff

- [x] 6.1 Run from the repo root: `pnpm lint`, `pnpm typecheck`, `CI=true pnpm test`, `pnpm build`, each with its exit code echoed, in one background job writing to a log file. Record per-package totals; domain, api and web counts must each rise.
- [x] 6.2 Review gate per `AGENTS.local.md` section 2: verify-before-done, `/ponytail-review`, the silent-failure hunt (a filter that is parsed and then dropped from the query is the specific risk), and an independent second review of the conversion against the daylight-saving cases.
- [x] 6.3 Handoff: the helper and its cases, the predicate, the six refusals, the measurement from 2.4, the four gate totals, the register row flipped, `DEBT-26` closed and `DEBT-43` annotated.

## Decision rows to add at apply

**D rows (numbers assigned at apply, next free block in `docs/decision-log.md`)**

- Decision: The directory availability filter takes a weekday, a start and end minute, and an IANA zone defaulting to `Asia/Dhaka`, and compares UTC instants rather than wall-clock minutes.
- Decision: The conversion lives in `@connect/domain` as one pure function using `Intl`, and the SQL predicate mirrors it; the reference week is the request's own week.
- Decision: Overlap, not containment, decides a match, and a malformed window is `422` naming its parameter.
- Affects: `profiles/mentor-directory`, `docs/api-contracts.md`, `docs/matching-algorithm-spec.md`, `docs/known-debt.md`
