# Design: discovery-availability-filter

## Context

**Repository snapshot (re-verified 2026-11-13 at apply).**

- Base: `main` after `ui-state-sweep`, `audit-log-search` and `sanction-lifecycle-warn-and-lift`. `openspec validate --all --strict` passes. No migration.
- `availability_windows` (`services/api/src/db/schema/availability.ts`): `user_id`, `context` (`STUDENT` or `MENTOR`), `weekday` 1 to 7, `start_minute` and `end_minute` 0 to 1440 with the end after the start, `timezone` text, one index on `(user_id, context)`. Minutes are wall-clock minutes **in the row's own zone**.
- `packages/domain/src/match.ts` lines 147-190 hold the interval-overlap helper, and lines 172-190 state the shortcut that differing zones are treated as missing rather than converted — that is `DEBT-43`.
- `packages/domain/src/availability.ts` holds `validateAvailabilityWindows` and the bounds; it has no zone conversion.
- `services/api/src/profiles/profiles.controller.ts` line 290 declares `@Get("mentors")` with `field`, `language`, `access_state`, `cursor` and `limit`, and passes them to `mentorDirectoryQuery`.
- `services/api/src/profiles/drizzle-profiles.service.ts` line 344 `listMentors` builds conditions as SQL fragments inside a bounded scan (`DIRECTORY_SCAN_LIMIT`), with `EXISTS` subqueries already used for the field and language filters.
- The directory spec's filter requirement (`openspec/specs/profiles/mentor-directory/spec.md` line 51) closes on the five existing parameters but does not forbid another.
- `apps/web/app/mentors/page.tsx` builds its query from the URL and renders the filters beside the list.

## Goals / Non-Goals

**Goals**

- A student can ask "who is free on Thursday 20:00 to 21:00 my time" and get only those mentors.
- One conversion function, tested by cases, used by the browse filter now and available to the match factor later.
- The empty state explains the filter, so a filter that matches nobody is not mistaken for an outage.

**Non-Goals**

- No change to the match factor's zone behaviour (that is `DEBT-43`'s remaining half).
- No recurring slots, no booking, no "free now" shortcut, no zone display.

## Decisions

The brief fixed the parameters and the comparison rule; decisions taken here carry `R` numbers.

### R1. Four parameters, all-or-nothing

`available_weekday`, `available_start`, `available_end` and `available_timezone`. Weekday without a window is `422`; a window without a weekday is `422`; the zone alone is `422`. Alternative rejected: a single encoded string, which is harder to validate and to read in a URL.

### R2. Compare UTC instants of a reference week, computed per row in SQL

Each availability row defines, in its own zone, a wall-clock interval on a weekday. The filter converts both sides to UTC instants on the same reference week derived from the request (the week containing "today" in the viewer's zone), then asks whether the intervals overlap:

- viewer side: `(date + (available_weekday - 1) + start_minute minutes) AT TIME ZONE available_timezone` to the same with `end_minute`, giving a `timestamptz` pair;
- mentor side, per row: `(monday + (weekday - 1) + start_minute minutes) AT TIME ZONE timezone` to the same with `end_minute`, on the same Monday anchor the helper uses; the resulting interval may straddle UTC midnight and needs no second weekday;
- overlap: the viewer window starts before the mentor window ends, and the mentor window starts before the viewer window ends, both in UTC.

Alternative rejected: comparing wall-clock minutes, which is exactly the bug `DEBT-43` records, and which a test with two distant zones will catch.

### R3. The conversion is one pure function in the domain package

`packages/domain/src/availability.ts` gains `zonedWindowToUtc({ weekday, startMinute, endMinute, timezone }, referenceDate)` returning **one** UTC interval: a window that straddles UTC midnight is still one interval, and overlap decides the match, so no adjacent-weekday duplication is needed (corrected at apply). It uses only `Intl.DateTimeFormat` with `timeZone`, so no dependency is added. The SQL predicate mirrors it; the test asserts the two agree for the same rows, which is the same pattern `response-reliability` used for its aggregate. Alternative rejected: a fixed-offset table, which breaks on any zone with daylight saving.

### R4. The reference week is the request's own week, not a fixed date

Using "today" in the viewer's zone keeps a daylight-saving transition in the right week, so the offsets are the ones the student will actually experience. The residual error is a zone whose offset changes mid-week, which is recorded as a `shortcut:` comment beside the helper and in `DEBT-43`'s narrowed text. Alternative rejected: a fixed reference week in January, which is wrong for half the year in any zone with daylight saving.

### R5. A validation failure names the parameter

An unknown zone is checked with `Intl.DateTimeFormat` (a thrown `RangeError` becomes `422` naming `available_timezone`), `available_end` must exceed `available_start` and not exceed 1440, and weekday must be 1 to 7. Alternative rejected: silently dropping a bad filter, which returns the wrong set for a typo.

### R6. The page sends the browser's zone, and the empty state names the filter

`apps/web/lib/mentors.ts` builds the query with `Intl.DateTimeFormat().resolvedOptions().timeZone` when the viewer has not chosen one, and the empty state's text changes when an availability filter is active. Alternative rejected: defaulting silently to `Asia/Dhaka` on the page, which would show wrong results to a student abroad.

## Assumptions

1. The pilot is Bangladesh-only, so `Asia/Dhaka` is a safe server default when no zone is sent; the parameter exists so a student abroad is not silently wrong.
2. A mentor's `MENTOR`-context windows are the only ones the directory consults; `STUDENT` windows are irrelevant to being requested.
3. Overlap, not full containment, is the intended meaning of "available in that window"; a mentor free for part of it is still requestable.

## Acceptance criteria

1. A mentor with a window wholly covering the requested one appears; a mentor whose window is an hour later does not.
2. A viewer in `Asia/Dhaka` and a mentor in `Europe/London` match only when their UTC intervals genuinely overlap, asserted with two zones whose wall clocks differ by more than the window.
3. A window that crosses midnight in the mentor's zone is matched on both adjacent weekdays.
4. Each of the six invalid inputs is `422` naming its own parameter.
5. `grep -n "AT TIME ZONE" services/api/src/profiles/drizzle-profiles.service.ts` shows the predicate, and the domain helper's own test covers the same five cases.
6. The existing three filters and the keyset pagination behave exactly as before, with the existing tests unchanged.

## Risks

- A wrong predicate can empty the directory for everyone; the integration test seeds a mentor with no availability at all and asserts that applying the filter excludes them while no filter includes them.
- The scan bound means a page can return fewer than `limit` rows when many candidates are filtered out; this is the behaviour the existing filters already have and the result stays a valid keyset page.
