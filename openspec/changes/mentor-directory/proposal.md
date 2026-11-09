# Proposal: mentor-directory

## Why

Every piece of the core loop is built and merged, but no user can enter it: no screen or navigation entry links to `/requests` or `/request/new`, and the list endpoint the contract documents at `docs/api-contracts.md:298` does not exist, so the request form's `?mentor=` id has no producer. A student cannot find a mentor to ask. This change adds the smallest thing that makes five merged changes demonstrable: a public mentor list, reachable from the header, that links into the existing request form.

## What Changes

- Implement `GET /v1/mentors?field=&language=&access_state=&cursor=&limit=` as documented, **without** suggestion rank, score, or a reason string. Results are stable-ordered by mentor profile id and keyset paginated.
- Return only the public directory projection: mentor profile id, display name, headline, access mode, derived access state, primary field, fields, and languages. Email, account ids, availability windows, weekly capacity, and biography stay off the list.
- Only `ACTIVE` mentors appear (which already means a verified Level 1 affiliation and an enrolled second factor); `PAUSED` mentors are hidden; `FULL` mentors are shown with a disabled request action and a string-catalog reason.
- Add the BFF route `apps/web/app/api/mentors/route.ts` and the page `apps/web/app/mentors/page.tsx` with a field filter, cards, and a Request action linking to `/request/new?mentor={id}`.
- Add `Mentors` and `Requests` to the signed-in header (`apps/web/lib/navigation.ts`) and a "Find a mentor" link on `/profile`.
- Seed two to three clearly fake demo mentors through a **separate, dev-only** seed entry point so the directory is demoable against a dummy institution domain.
- Record the owner decisions D-69 to D-72, correct the contract's access level for the list (documented as `S`, decided public), and correct `docs/security-requirements.md`'s "authentication to browse" mitigation.
- No migration: the endpoint reads existing tables.

## Capabilities

### New Capabilities

- `profiles/mentor-directory`: the public directory read — who appears, which fields it may expose, how order and pagination work, and how the access state is derived.

### Modified Capabilities

- `profiles/profile-visibility`: the "an unauthenticated viewer sees nothing" scenario is restated so the visibility policy keeps governing profile reads while the public directory projection is explicitly named as the one anonymous read. Without this, the archived spec reads as forbidding the new endpoint.

## Impact

- **Code**: `services/api/src/profiles/profiles.service.ts` (record, payload, service method), `drizzle-profiles.service.ts` (list query), `profiles.controller.ts` (route), `apps/web/app/api/mentors/route.ts`, `apps/web/app/mentors/page.tsx`, `apps/web/lib/navigation.ts`, `apps/web/lib/strings.ts`, `apps/web/app/profile/page.tsx` (one link), `services/api/src/db/seed/{demo-mentors.ts,run.ts}`, `services/api/package.json` (a `db:seed:demo` script).
- **Tests**: `services/api/test/profiles.integration.test.ts` (list, filters, projection allowlist, hidden paused, full state), `authorization-matrix.test.ts`, `apps/web/test/mentor-directory-page.test.ts`, `apps/web/test/mentor-directory-route.test.ts`, `apps/web/test/navigation.test.ts`.
- **API/data**: one endpoint, `packages/contracts/openapi.yaml`; no schema change.
- **Dependencies**: none added.
- **Docs**: `docs/api-contracts.md` §5.3, `docs/functional-requirements.md` (FR-DISC-01/03 built-to-depth), `docs/security-requirements.md` (directory-scraping row), `docs/known-debt.md` (availability filter), `docs/mvp-build-plan.md` §5, `docs/milestones-and-phases.md`, `docs/decision-log.md`, `README.md`.

## Depends on

- `profiles/mentor-onboarding` (#5, archived): `mentor_profiles.status = 'ACTIVE'` already encodes Level 1 plus an enrolled second factor.
- `profiles/availability-and-access-mode` (4b, archived): `access_mode` (`OPEN`, `APPLICATION_ONLY`, `PAUSED`) and the pause/resume routes.
- `mentorship/request-lifecycle` (#7, archived): `slotsInUse` and the rolling capacity window that the derived `FULL` state reuses, and `/request/new?mentor={id}` as the destination.
- `identity/account-navigation` (4d, archived): the header model every signed-in page renders.

## Out of scope

- Suggestion ranking, Match Score, sort order, and the per-result reason (FR-DISC-02, `#6`, deferred by D-58). This change does not consume `match_score`.
- The suggestion log (FR-DISC-04) and concierge assist (FR-DISC-05).
- Filtering by availability windows: FR-DISC-01 names it, this change does not ship it. The gap is recorded as debt with the matching change as its owner.
- Impact counts on directory cards (N+1); counts stay on the mentor detail read.
- Any mentor detail page change, any new table, any migration.
- Public exposure of biography, capacity, availability, or contact details.

## Risks and rollback

| Risk | Mitigation |
|---|---|
| A public list leaks private data | The projection is one explicit object with a test asserting the exact key set; the query never selects `users.email`, availability rows, or capacity |
| The public read contradicts the archived visibility rule | The delta restates the requirement and names the public projection as the only anonymous read; the contract changes from `S` to public in the same change |
| Scraping becomes trivial | Page size is capped (50), the list carries no contact data, and the rate-limit change follows immediately; the security doc row is corrected rather than left contradicting the code |
| The derived `FULL` state drifts from the request-time capacity check | Both use `slotsInUse` from `@connect/domain`; the list test asserts a full mentor is shown with the disabled action and the request path still refuses with `MENTOR_AT_CAPACITY` |
| Demo mentors leak into production | A separate seed entry point, an explicit environment flag, and a refusal when `NODE_ENV=production`; demo accounts use the reserved `@example.edu.bd` domain |

Rollback: delete the two web files and the controller method, revert the header and contract edits. No data is written, so rollback is safe at any time.

**Traces to** FR-DISC-01 (field, language, access-state filters; availability filter deferred), FR-DISC-03 (access states shown, Full disabled with a reason), FR-DISC-06 (no sensitive or payment input), FR-PROF-02 (a paused mentor is hidden from discovery), FR-PROF-04 (profile visibility matrix), FR-VER-04 (a mentor below Level 1 is absent); ADR-003 (same session model), ADR-018 (Drizzle); D-58 (`#6` deferred), D-69 to D-72 (this change's decisions).
