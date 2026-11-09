# Tasks: mentor-directory

## 1. The read contract and the projection

- [ ] 1.1 Add `MentorDirectoryCard` and `MentorDirectoryQuery` to `services/api/src/profiles/profiles.service.ts`, plus `mentorDirectoryPayload(card)` returning exactly the allowlisted keys, and extend `ProfilesService` with `listMentors(input)`; verify `pnpm --filter api typecheck` passes.
- [ ] 1.2 Implement `listMentors` in `services/api/src/profiles/drizzle-profiles.service.ts`: select `ACTIVE` profiles joined to `users` and the primary field, apply `field` (primary or `mentor_fields`), `language` (case-insensitive exact), keyset on `mentor_profiles.id` ascending with `limit + 1`, and return `{cards, nextCursor}`; verify a unit test drives pagination over three seeded mentors.
- [ ] 1.3 Add the second, bounded query that computes `slotsInUse` for the page's mentor ids from `mentorship_requests` and derives `access_state` (`full` at or above `weekly_capacity`, else `application_only` for `APPLICATION_ONLY`, else `available`), reusing `slotsInUse` from `@connect/domain`; verify a test asserts a full mentor's state and that no capacity number leaves the service.
- [ ] 1.4 Add `GET /v1/mentors` to `services/api/src/profiles/profiles.controller.ts` (no session requirement), validating `field` as a uuid, `access_state` against the three values, and `limit` 1 to 50 defaulting to 20 with `422 VALIDATION_ERROR` otherwise; verify the integration test covers a valid page, an unknown field id returning an empty page, and both refusals.

## 2. Directory behaviour tests

- [ ] 2.1 Extend `services/api/test/profiles.integration.test.ts`: only `ACTIVE` mentors appear; a `PAUSED` mentor is absent even under `access_state=available`; a `FULL` mentor appears as `full`; ordering is by id and a second page never repeats or skips; verify every case names its scenario.
- [ ] 2.2 Add the exact-key-set assertion: `Object.keys(card).sort()` equals the documented allowlist, and no response body contains an email, `user_id`, availability window, capacity, or biography; verify the test fails when one key is added.
- [ ] 2.3 Add the anonymous read assertion (`200` with a body, no session cookie) and the request-path cross-check (`POST /v1/requests` to the full mentor still answers `409 MENTOR_AT_CAPACITY`); verify both in the same run.

## 3. API contract and matrix

- [ ] 3.1 Add `GET /v1/mentors` to `packages/contracts/openapi.yaml` with the five query parameters, the public access (no security requirement), the `200` schema, and the `422` problem; verify `pnpm --filter @connect/contracts test` passes.
- [ ] 3.2 Add `GET /v1/mentors` with `access: "public"` to the `MATRIX` in `services/api/test/authorization-matrix.test.ts`; verify the matrix test passes and no other route is refused differently.
- [ ] 3.3 Update `docs/api-contracts.md` §5.3: the list loses the suggestion-rank and reason wording, its access changes from `S` to public, and the filter, order, page-size, and projection rules are stated; verify no sentence still promises a rank in this release.

## 4. BFF route and page

- [ ] 4.1 Add `apps/web/app/api/mentors/route.ts` following `apps/web/app/api/mentors/[id]/route.ts`: forward the five query parameters without a session, map a non-JSON upstream to `502`; verify `apps/web/test/mentor-directory-route.test.ts` covers the forwarding, a status passthrough, and the non-JSON case.
- [ ] 4.2 Generate one Stitch design for the directory screen and record the project/screen name in this task before writing markup; verify the implementation follows the generated structure, spacing, and tokens.
- [ ] 4.3 Add `apps/web/app/mentors/page.tsx` with the field `<select>` from `/api/fields`, cards, the `full` card with a disabled action and its reason, empty state, load-error state with retry, and "Load more" from `next_cursor`; verify `apps/web/test/mentor-directory-page.test.ts` renders each state.
- [ ] 4.4 Add the `mentors` string group to `apps/web/lib/strings.ts` (title, intro, filters, empty, error, request, full reason, load more); verify no literal user-facing string remains in the page.
- [ ] 4.5 Add `Mentors` and `Requests` to the signed-in items in `apps/web/lib/navigation.ts` and a "Find a mentor" link on `/profile`; verify `apps/web/test/navigation.test.ts` asserts the new items and that signed-out navigation is unchanged.

## 5. Dev-only demo mentors

- [ ] 5.1 Add `services/api/src/db/seed/demo-mentors.ts` writing two fake mentors (user, MENTOR role assignment, `ADMIN_ATTESTATION` Level 1 affiliation, `@example.edu.bd` email, a fixed fake `two_factors` row, an `ACTIVE` profile with a field), idempotent by email; verify a second run inserts nothing.
- [ ] 5.2 Guard the module: refuse unless `NODE_ENV !== 'production'` and `SEED_DEMO_MENTORS === '1'`, wire it to a new `db:seed:demo` script, and leave `db:seed` unchanged; verify a test asserts the refusal with each missing condition.
- [ ] 5.3 Exercise the guard and the rows against the local stack, then confirm the demo mentors appear on `/mentors` and are requestable; record the result in the handoff.

## 6. Docs and decisions

- [ ] 6.1 Correct `docs/security-requirements.md`'s directory-scraping mitigation from "authentication to browse" to the real controls (narrow projection, capped page, rate limits from `request-validation-and-rate-limits`); verify the row no longer contradicts a public list.
- [ ] 6.2 Record `FR-DISC-01` as built without the availability filter and `FR-DISC-03` as the first surface that shows Available, Full, and Application-only; add a `known-debt.md` row naming the availability filter with `#6` as its owner.
- [ ] 6.3 Fix the stale forward references assigned to this change: `docs/api-contracts.md:280` (the resume capacity check shipped in #8, D-61), `docs/mvp-build-plan.md:106` (row #7's "until #8" text), `docs/functional-requirements.md:154` (`FR-REQ-03`'s "until #8"), and `docs/milestones-and-phases.md:120` (the nonexistent change name `requests-and-capacity`); verify `grep -rn "until #8\|requests-and-capacity\|does not ship" docs/` returns nothing.
- [ ] 6.4 Add the one-line "superseded by ADR-018" note to `research/connect-research-report.md:199` without rewriting the report, and state in the handoff that this is an explicit owner exception to leaving `research/` as history.
- [ ] 6.5 Update `docs/mvp-build-plan.md` §5 and `docs/milestones-and-phases.md` "Current state", and the `README.md` status line, marking this change `DONE` with its evidence.
- [ ] 6.6 Add the `D-69` to `D-72` rows to `docs/decision-log.md` if they are not already present from the propose round, and verify every doc that stated the old order or access level agrees.

## 7. Checks and handoff

- [ ] 7.1 Run from the repo root with Docker up and `CI=true`: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`; record each exit code and the per-package test totals.
- [ ] 7.2 Run the review gate (ponytail review and audit, code review, silent-failure hunt, trust-rule check) and fix in-scope findings; record the rest.
- [ ] 7.3 Confirm the diff contains only the tasks above, then write the handoff naming the PR, the merge commit, the gate totals, and any dev-database writes the demo seed caused.
