# Tasks

## 1. Schema and policy

- [x] 1.1 Add `availabilityContext` (`STUDENT`, `MENTOR`) and `mentorAccessMode` (`OPEN`, `APPLICATION_ONLY`, `PAUSED`) to `services/api/src/db/schema/enums.ts`, an `availabilityWindows` table in `services/api/src/db/schema/profiles.ts` (or a sibling `availability.ts`) with the check constraints and the (`user_id`, `context`) index, and `access_mode` on `mentorProfiles` defaulting to `OPEN`. Verify: `pnpm --filter api typecheck` passes and the column list matches `docs/data-model.md` §5.2 line for line.
- [x] 1.2 Generate migration `0008_*` with `pnpm --filter api db:generate`, then add the hand-written `GRANT SELECT, INSERT, UPDATE, DELETE ON availability_windows TO connect_app` in the same reviewed file. Verify: `pnpm --filter api db:migrate` applies twice with the second run a no-op; an integration test running as `SET ROLE connect_app` inserts, updates, and deletes a window; an out-of-range weekday is refused by the database.
- [x] 1.3 Add `packages/domain/src/availability.ts`: `MAX_AVAILABILITY_WINDOWS_PER_CONTEXT`, `validateAvailabilityWindows`, `sortWindows`, and `isDiscoverable`, exported from the package index. Verify: `packages/domain/test/availability.test.ts` covers every validation rule (bounds, ordering, overlap, adjacency allowed, cap, unknown zone), the full 3 × 5 discoverability product, and the stable sort.

## 2. Availability API

- [x] 2.1 Add the `availability` module: `AvailabilityService` (read and full-replace per context, caller only), its controller (`GET /v1/me/availability`, `PUT /v1/me/availability`), tokens, and the module registration in `app.module.ts`. Map a non-empty problem list to one `422 VALIDATION_FAILED` before the write. Verify: integration tests for save-then-read, replace-both-contexts-independently, empty-list clear, stable order, a refused save leaving the previous set intact, and a body `user_id` writing only the caller's rows.
- [x] 2.2 Gate the endpoints with the role guard from `roles-and-profile-visibility` for the `MENTOR` context (student context needs no role). If 4c has not merged, use the interim check from design D8 and leave a single named helper to swap. Verify: a `MENTOR`-context write without the role is refused, and the student context still works for a `STUDENT`-only account.

## 3. Access mode

- [x] 3.1 Accept an optional `access_mode` (`OPEN` | `APPLICATION_ONLY`) in `PUT /v1/me/mentor-profile`, leaving the stored value untouched when absent, and add the `pause` and `resume` routes (resume takes an optional `access_mode`, default `OPEN`; both idempotent). Verify: integration tests for the default `OPEN` on creation, choosing `APPLICATION_ONLY`, pause then resume-with-mode, resume-without-mode giving `OPEN`, pause twice, and one assertion that an older body without `access_mode` leaves a paused profile paused.
- [x] 3.2 Record in the handler comment and in one integration test that no capacity check runs in this change, so #7 adds `CAPACITY_BELOW_ACTIVE` in the named place. Verify: the test names the follow-up change.

## 4. Web

- [x] 4.1 Add the BFF routes `apps/web/app/api/me/availability/route.ts` (GET and PUT), `apps/web/app/api/me/mentor-profile/pause/route.ts`, and `apps/web/app/api/me/mentor-profile/resume/route.ts`, following the existing BFF pattern (session cookie to bearer, pass-through of status and body). Verify: `apps/web/test/` gains route tests for success, `401`, and a pass-through `422`.
- [x] 4.2 Extend `apps/web/app/profile/page.tsx`: a weekly-availability editor per context (add/remove rows, weekday select, start and end time inputs, a time-zone field defaulting to the account's `timezone`, save with its own error state) and, only when `roles` includes `MENTOR`, an access-mode selector plus pause/resume, with copy stating that applications are not built yet. Add every label and message to `apps/web/lib/strings.ts`. Verify: `pnpm --filter web build` passes; a live save, reload, and pause round-trip works; a refused save keeps the entered rows and shows the problem; a non-mentor sees no access-mode control.

## 5. Contracts and docs

- [x] 5.1 Update `packages/contracts/openapi.yaml` with the three new paths, the `access_mode` field on the mentor-profile save, and the availability schemas (window object with the documented bounds). Update `docs/api-contracts.md` with the same rows and remove the "Not built yet" markers from the pause and resume rows. Verify: the contract test passes and every implemented route appears in the document.
- [x] 5.2 Update `docs/data-model.md` (§4.1 `availability_context` and `mentor_access_mode` built; §5.2 `availability_windows` and `mentor_profiles.access_mode` marked built with the constraints), `docs/functional-requirements.md` (FR-PROF-01 and FR-PROF-02 evidence, including "APPLICATION_ONLY is stored only"), `docs/mvp-build-plan.md` §5 and `docs/milestones-and-phases.md` (4b status and the Current state block), `docs/known-debt.md` (record that `APPLICATION_ONLY` is inert until #7 and that capacity-on-resume belongs to #7), and `docs/decision-log.md` (new rows: per-window time zones; access mode optional on the full-replace save; the 21-window cap as a Proposed default).
- [x] 5.3 Verify the docs gate: `openspec validate --all --strict` passes, and no live document still says availability or access mode are unbuilt, or claims `APPLICATION_ONLY` is enforced.

## 6. Integration, review, and handoff

- [x] 6.1 On a clean volume: `docker compose down -v`, `up -d --build`, `db:migrate` twice, `db:seed` twice, then `pnpm lint`, `pnpm typecheck`, `CI=true pnpm test`, `pnpm build`. Verify: all four gates exit 0, the second migrate is a no-op, the run reports 0 skipped, and the count is recorded with its date.
- [x] 6.2 Review gate: `/ponytail-review`, the silent-failure check, the diff-scope check, and the trust-rule check (nothing in `AGENTS.md` §7 weakened). Verify: every finding is fixed in scope or recorded in `docs/known-debt.md` with a reason.
- [x] 6.3 Handoff: the migration, the validation rules as implemented, what `APPLICATION_ONLY` does and does not do, and what #6 and #7 must consume (`isDiscoverable`, the capacity check). Verify: every claim cites a command run in this session.

## Workflow follow-up

- Archive only when the owner asks: `/ce-compound`, the memory update, `openspec archive`, and `openspec validate --archived --strict`.
- Git lifecycle from `AGENTS.local.md` §6: push the branch, open the PR, wait for green `checks` / `images` / `security`, merge with `gh pr merge <n> --merge --delete-branch`, and paste the raw `git log --oneline -3` from `main`.
- Order note: apply 4c before 4b. If the owner applies 4b first, task 2.2 uses the interim mentor-profile check from design D8 and must be revisited when 4c lands.
