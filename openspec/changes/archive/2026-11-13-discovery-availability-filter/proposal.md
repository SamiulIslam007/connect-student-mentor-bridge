# Proposal: discovery-availability-filter

## Why

`FR-DISC-01` is Must and names four filters: "field, language, access state, availability". Three shipped with `mentor-directory` (2026-11-09); the availability filter did not, and `DEBT-26` records the gap: "a student cannot narrow the browse list to mentors free at a given time". The ranked suggestions read already uses availability, so the data and the validation exist — what is missing is the browse filter a student uses before they know whom to ask.

## What Changes

- Add four query parameters to the public directory read: `available_weekday` (1 to 7), `available_start` and `available_end` (minute of day), and `available_timezone` (IANA zone, default `Asia/Dhaka`).
- Convert the requested window from the viewer's zone into UTC instants, then compare it against each mentor's stored weekly windows converted from the mentor's own stored zone — never a wall-clock comparison (`DEBT-43`).
- Refuse a partial window, an inverted or 24-hour-plus window, an unknown zone, a value out of range, and any combination the other filters already refuse, all as `422` naming the parameter.
- Return a mentor who has at least one `MENTOR`-context window overlapping the requested one, including a window that crosses midnight in either zone.
- Add the control to `/mentors`: a day select, a start and end time, a zone defaulted from the browser, and a clear-filters control.
- No migration, no new route, no schema change: `availability_windows` already stores weekday, wall-clock minutes and the zone per row.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. The existing directory requirement names a filter set rather than closing it, so the new behaviour is added as its own requirement in the owning capability; nothing in the current text contradicts an extra filter.

(The new requirement lands in `profiles/mentor-directory`, the capability that already owns the directory's filter, order and pagination contract.)

## Impact

- **Code**: `packages/domain/src/availability.ts` (a pure zone-window helper), `services/api/src/profiles/profiles.controller.ts` (four query parameters and their validation), `services/api/src/profiles/drizzle-profiles.service.ts` (one `EXISTS` predicate on the directory query), `apps/web/app/mentors/page.tsx` (the control), `apps/web/lib/mentors.ts` (a pure query builder), `apps/web/lib/strings.ts`.
- **Tests**: `packages/domain/test/availability.test.ts` (the zone helper), `services/api/test/mentorship.integration.test.ts` or a new `services/api/test/directory-availability.integration.test.ts` (the predicate), `apps/web/test/mentor-filters.test.ts` (the query builder).
- **API/contract**: four query parameters and their bounds on the existing `GET /v1/mentors` in `packages/contracts/openapi.yaml`; no new path, no body key.
- **Data**: none.
- **Docs**: `docs/functional-requirements.md` (`FR-DISC-01` complete), `docs/known-debt.md` (`DEBT-26` closed; `DEBT-43` narrowed and annotated, not closed), `docs/api-contracts.md` (the parameters and the conversion rule), `docs/matching-algorithm-spec.md` (the shared conversion), `docs/decision-log.md`, `docs/mvp-build-plan.md`, `docs/milestones-and-phases.md`.

## Depends on

- `profile-availability-and-access-mode` (archived 2026-11-05): the stored windows, their validation and their zone column.
- `mentor-directory` (archived 2026-11-09): the public read, its keyset pagination and its filter validation.
- `mentor-suggestions-and-reasons` (archived 2026-11-11): the availability interval overlap helper this change reuses.

## Out of scope

- Changing the match factor's own zone behaviour (`DEBT-43` stays open for that path; this change narrows it by shipping the conversion helper).
- A "free right now" shortcut with no window, a recurring-booking calendar, or a slot picker.
- Time-zone display on the mentor card.
- Filtering the suggestions read by a window.
- Storing a computed UTC copy of the windows.

## Risks and rollback

| Risk | Mitigation |
|---|---|
| A wrong conversion shows an unavailable mentor, which is worse than no filter | The conversion is one pure function with a test per case: same zone, a fixed-offset zone, a zone that crosses midnight, a zone with a daylight-saving transition in the requested week, and a window that touches midnight at one edge |
| The filter hides every mentor for a defaulted zone the viewer did not choose | The zone defaults to `Asia/Dhaka` only when the caller sends none, the page always sends the browser's zone, and the empty state names the filter so the student can clear it |
| A per-row `AT TIME ZONE` makes the query slow | The predicate runs inside the existing bounded scan (`DIRECTORY_SCAN_LIMIT`) over an indexed table; the measurement is a task, and a debt row records the bound if the plan degrades |
| The window is compared by wall clock by mistake | The spec states the rule, and a test uses two zones whose wall clocks differ by more than the window length, so a wall-clock implementation returns the wrong set and the test fails |

Rollback: remove the four parameters, the predicate and the control. No data changes.

**Traces to** FR-DISC-01 (the availability filter), FR-PROF-02 (availability windows), FR-REQ-06 (capacity, untouched); DEBT-26 (closed), DEBT-43 (narrowed), D-93 (the suggestions half).
