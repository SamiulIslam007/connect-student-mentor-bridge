# Proposal

## Why

A mentor profile can be saved today with no answer to "when can this person actually meet", and with no way to stop accepting work. `docs/data-model.md` §5.2 already defines the shape (`availability_windows`, `mentor_access_mode`) and `docs/api-contracts.md` already documents the pause and resume routes as "not built yet"; the fields are simply absent from the schema and the profile form. Discovery (#6) and requests (#7) both need those facts to exist before they can be written, and 4b sits before both in the plan (Sprint 2 order 4a → 4c → 4b → #5 → #6).

## What Changes

- **Weekly availability for both sides.** A new `availability_windows` table exactly as specified in `docs/data-model.md` §5.2: `user_id`, `context` (`STUDENT` or `MENTOR`), `weekday` (1–7), `start_minute`, `end_minute`, `timezone`, with `end_minute > start_minute`. One migration, application-role grants included.
- **Availability endpoints.** `GET /v1/me/availability?context=` returns the caller's windows for one context and `PUT /v1/me/availability` replaces them atomically, following the existing "last write wins, full replace" profile convention (D-39).
- **Access mode on the mentor profile.** `mentor_profiles.access_mode` (`OPEN`, `APPLICATION_ONLY`, `PAUSED`, default `OPEN`), selectable through the existing mentor-profile save, plus the two documented routes: `POST /v1/me/mentor-profile/pause` sets `PAUSED`, and `POST /v1/me/mentor-profile/resume` clears it and restores the mode the caller names (default `OPEN`).
- **A discoverability policy that #6 and #7 can reuse.** A pure `isDiscoverable({ accessMode, status })` in `packages/domain`: `PAUSED` is never discoverable, and neither is a profile whose operating status is not `ACTIVE`. It ships with unit tests and its first consumer is discovery (#6).
- **`APPLICATION_ONLY` is stored, validated, and otherwise inert.** No route, list, or request path enforces it in this change; the requirement states that explicitly so #7 does not have to guess.
- **Validation in one pure function.** Weekday range, minute range, ordering, overlap within a weekday, a per-context window cap (`Proposed default`, 21 = three windows a day), and an IANA time-zone check, all returning problems rather than throwing, matching `packages/domain/src/profiles.ts`.
- **The profile page gains two sections.** Weekly availability (per context, with add/remove rows) and, for mentors holding the `MENTOR` role, an access-mode selector with a pause/resume control. All copy through the string catalog.
- **Contracts and docs.** New paths and the `access_mode` field in `packages/contracts/openapi.yaml`, the same rows in `docs/api-contracts.md`, the built markers in `docs/data-model.md` §4.1/§5.2, `docs/functional-requirements.md` evidence for FR-PROF-01/02, and the plan trackers.

## Capabilities

### New Capabilities

- `profiles/availability-and-access-mode`: weekly availability windows, the mentor access mode, and the discoverability policy that reads it.

### Modified Capabilities

None. The mentor-profile save gains an optional field and a new path hangs off it, but no existing requirement's behaviour changes; the new capability owns every new requirement. This is deliberate: change `roles-and-profile-visibility` (4c) already modifies the mentor-profile content requirement, and two deltas that restate the same requirement would collide at archive.

## Impact

- **Code:** `services/api/src/db/schema/profiles.ts` (`mentor_profiles.access_mode`) and a new `availability` table plus `enums.ts` (`availability_context`, `mentor_access_mode`), migration `0008`, a new `services/api/src/availability/*` module (service, controller, module), `services/api/src/profiles/profiles.controller.ts` and `profiles.service.ts` (the optional field and the two toggles), `packages/domain/src/availability.ts` (validation and `isDiscoverable`), `packages/contracts/openapi.yaml`, `apps/web/app/profile/page.tsx` plus its BFF routes and `apps/web/lib/strings.ts`.
- **Data:** one new table, one new column with a default, one new enum. No existing row is rewritten; existing mentor profiles read `OPEN`.
- **Configuration:** none.
- **Dependencies:** none.
- **Depends on:** `roles-and-profile-visibility` (4c) for the `MENTOR` role check that guards the mentor-context writes, and for `GET /v1/me` reporting roles so the form knows what to show. If 4b is applied first, the mentor-context endpoints must be temporarily gated by "the caller has a mentor profile" instead — the tasks state the check to make at apply.

## Out of scope

- Discovery, matching, and any ranking — #6, which is the first consumer of `isDiscoverable`.
- Enforcement of `APPLICATION_ONLY`, capacity checks on resume (`CAPACITY_BELOW_ACTIVE`), and the request flow — #7.
- Mentor activation and affiliation — #5.
- Public visibility of another account's availability — #6 decides what discovery exposes.
- Calendar integration, time-zone conversion at display time beyond the stored zone, and recurring exceptions (holidays) — not in the MVP.
- Rate limiting and CSRF on the new endpoints — Sprint 7.

## Risks and rollback

| Risk | Mitigation |
|---|---|
| Overlapping or unbounded windows make matching expensive or ambiguous | Validation refuses overlaps within a weekday and caps the list (21 per context); both are pure and unit-tested. |
| A mentor pauses and loses the mode they had | `resume` takes the mode to restore and the form sends the value it loaded before pausing; the default is `OPEN`, which is stated in the spec. |
| `APPLICATION_ONLY` is read as if it did something | The spec says plainly that it is stored and validated only, and the UI copy says the same thing to the mentor. |
| Time zones are stored per window, so a wrong zone silently misaligns a match | The zone is validated against the runtime's IANA list on write, and the form defaults to the account's own `timezone` from `GET /v1/me`. |
| 4b lands before 4c and the mentor gate does not exist | The tasks name the interim check explicitly; nothing is left to "figure out at apply". |

Rollback: revert the branch and drop the local volume. The schema change is additive, and a reverted database keeps the other tables working.

**Traces to** FR-PROF-01 (student availability), FR-PROF-02 (mentor availability, access mode, a paused mentor is hidden from discovery), FR-UX-05 (form states), SEC-AUTH-4 (no token-borne authority), ADR-012 (pure policy in `packages/domain`), D-38 (bounded, versioned defaults), D-39 (last-write-wins profile saves); `docs/data-model.md` §5.2 and `docs/api-contracts.md` §5.1.
