# Design

## Context

See `proposal.md` — Why. Only the state that shapes the approach is recorded here.

**Repository snapshot (verified live 2026-11-05, re-check at apply):**

- `main` at `2716a44`; all four gates green, 172 tests passing with 0 skipped under `CI=true`; migrations `0000`–`0006`.
- `services/api/src/db/schema/profiles.ts` holds `studentProfiles`, `studentFieldInterests`, `mentorProfiles`, `mentorFields`. `mentorProfiles` has `status` (`mentor_status`, default `DRAFT`), `weeklyCapacity`, and **no** `access_mode`; there is no `availability_windows` table and no `availability_context` or `mentor_access_mode` enum in `enums.ts`.
- `PUT /v1/me/mentor-profile` is a full replace (D-39) implemented in `profiles.controller.ts` -> `profiles.service.ts`; `docs/api-contracts.md` §5.1 already documents `POST /v1/me/mentor-profile/pause` and `/resume` as "not built yet".
- `packages/domain/src/profiles.ts` validates drafts by returning problem lists (not throwing), with the bounds as exported constants (`MENTOR_WEEKLY_CAPACITY_MAX`, `PROFILE_LANGUAGE_MAX`). `packages/domain` may not import a framework or the database.
- `GET /v1/me` reports `timezone` for the account (`Asia/Dhaka` default), which the availability form can default to.
- `apps/web/app/profile/page.tsx` (~360 lines) already renders the student and mentor forms in one page with a save-per-form pattern and string-catalog copy.
- Change `roles-and-profile-visibility` (4c) is the plan's predecessor and adds the `MENTOR` role plus `roles` on `GET /v1/me`.

## Goals / Non-Goals

**Goals**

- Availability and access mode exist, are validated, and are editable in the app.
- `isDiscoverable` exists as tested policy before discovery is written.
- No behaviour is claimed for `APPLICATION_ONLY` that the code does not perform.

**Non-Goals**

- Discovery, ranking, or showing anyone else's availability — #6.
- Enforcing `APPLICATION_ONLY`, capacity on resume, or requests — #7.
- Recurring exceptions, calendar sync, or converting stored minutes for display beyond the stored zone.
- Changing the mentor-profile content requirement (see D3).

## Decisions

### D1 — The schema is exactly `docs/data-model.md` §5.2

```sql
CREATE TABLE availability_windows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  context availability_context NOT NULL,
  weekday smallint NOT NULL CHECK (weekday BETWEEN 1 AND 7),
  start_minute smallint NOT NULL CHECK (start_minute BETWEEN 0 AND 1440),
  end_minute smallint NOT NULL CHECK (end_minute BETWEEN 0 AND 1440),
  timezone text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_minute > start_minute)
);
CREATE INDEX availability_windows_user_context_idx ON availability_windows (user_id, context);
```

`mentor_profiles.access_mode mentor_access_mode NOT NULL DEFAULT 'OPEN'`. The migration ends with the hand-written `GRANT SELECT, INSERT, UPDATE, DELETE ON availability_windows TO connect_app` (the Step 1 grant discipline; `mentor_profiles` is already granted by `0003`).

Rejected: a JSONB blob on the profile — it would make the overlap check, the cap, and the future availability-match query someone's runtime problem instead of a constraint.

### D2 — One pure validator owns every availability rule

`packages/domain/src/availability.ts` exports `MAX_AVAILABILITY_WINDOWS_PER_CONTEXT = 21` (three a day, `Proposed default`), `validateAvailabilityWindows(windows): AvailabilityProblem[]`, and `sortWindows`. Rules, in one place and unit-tested:

1. `weekday` integer 1–7; `startMinute` and `endMinute` integers 0–1440; `endMinute > startMinute`.
2. No two windows for the same weekday may overlap; touching endpoints (`end == next.start`) are allowed.
3. The set may not exceed the cap.
4. `timezone` must be an IANA zone: validated with `Intl.DateTimeFormat(undefined, { timeZone })` inside a try/catch, so no zone list is bundled and no dependency is added.

The service maps a non-empty problem list to one `422 VALIDATION_FAILED` before any write, matching the profile save path.

### D3 — Availability gets its own paths; access mode rides the existing profile save

| Route | Behaviour |
|---|---|
| `GET /v1/me/availability?context=STUDENT\|MENTOR` | The caller's windows for one context, ordered. |
| `PUT /v1/me/availability` | Full replace for the body's `context`: `{ context, windows: [...] }`. Last write wins. |
| `PUT /v1/me/mentor-profile` | Gains an **optional** `access_mode` accepting `OPEN` or `APPLICATION_ONLY`; absent means "leave the stored value alone" so an existing client is unaffected. |
| `POST /v1/me/mentor-profile/pause` | Sets `PAUSED`. Idempotent. |
| `POST /v1/me/mentor-profile/resume` | Sets the body's `access_mode` (`OPEN` or `APPLICATION_ONLY`, default `OPEN`). Idempotent. |

Why access mode goes into the existing save instead of a new setter: the mentor already has exactly one form that writes the profile, and a fourth route for one enum value would add surface without adding capability. Why `access_mode` is optional rather than required: `PUT` is a full replace, so a required field would break every existing client and test that does not know about it.

No requirement in `profiles/student-and-mentor-profiles` is restated, so this delta cannot collide with 4c's restatement of the mentor-profile content requirement at archive.

### D4 — Pause/resume carry no capacity logic in this change

`docs/api-contracts.md` says resume is "subject to capacity". The capacity check (`CAPACITY_BELOW_ACTIVE`) needs mentorships, which #7 introduces. 4b therefore implements the state change only and the spec says so; #7 adds the check to the same handler. A task names the exact place to add it, so it is not lost.

### D5 — `isDiscoverable` is the only consumer-facing policy, and it is total

```ts
isDiscoverable({ accessMode, status }: { accessMode: MentorAccessMode; status: MentorStatus }): boolean
```

False when `accessMode === "PAUSED"`; false when `status !== "ACTIVE"`; true otherwise. Both fields are already stored, so discovery (#6) has nothing to interpret. It ships with a test over the full 3 × 5 product so no combination is unhandled.

Rejected: putting the rule in the discovery query — a rule in SQL is untested by unit tests, and #6 needs it in TypeScript anyway to decorate the list.

### D6 — Time zones are stored per window and defaulted from the account

Each window carries its own zone (the data model's shape, and the honest one for a mentor travelling or a student on a different zone). The form defaults new rows to the account's `timezone` from `GET /api/me`. No conversion is stored: `start_minute` and `end_minute` are wall-clock minutes in that zone, which keeps the availability-match factor in #6 a pure comparison.

### D7 — The profile page grows two sections, not two pages

The existing page already has one form per profile kind; availability is a third block inside each relevant section (student availability in the student section, mentor availability plus access mode in the mentor section), saved by its own request so a refused availability save cannot discard unsaved profile text. Access-mode controls render only when `roles` from `/api/me` includes `MENTOR`.

Rejected: a separate `/profile/availability` page — more navigation for a form that belongs next to the profile it describes.

### D8 — The mentor gate depends on 4c, and the interim check is written down

The mentor-context writes (`pause`, `resume`, `access_mode`, and mentor availability) are role-gated with `requireRole(request, "MENTOR")` from 4c. If 4b is applied before 4c, the tasks say to gate on "the caller has a mentor profile" and switch to the role check when 4c lands; that interim check is a two-line helper, not a second policy.

Practically, 4c should merge first: the plan's Sprint 2 order already says 4a → 4c → 4b, and 4b's UI reads `roles` from `/api/me`, which 4c introduces.

## Assumptions

- `mentor_profiles` rows already exist for accounts that saved a mentor profile, so the `access_mode` column needs a default and no backfill (`OPEN` is the honest default: nothing was paused before the column existed).
- The seeded `institutions` table is irrelevant here; availability is per user, not per institution.
- 21 windows per context is a sensible cap for a pilot; it is a `Proposed default` in the D-38 sense and moves to versioned configuration in Sprint 7.
- "Overlap within a weekday" is the only overlap rule needed; windows are weekly and never span midnight (a window ending at 1440 covers the end of the day).

## Risks

| Risk | Mitigation |
|---|---|
| A full-replace availability save silently discards windows a concurrent tab added | Last write wins is the documented profile convention (D-39); the form reloads before saving and shows the stored set after each save. |
| The overlap rule rejects a legitimate split shift | Touching endpoints are allowed and the refusal detail names the conflicting weekday and minutes. |
| `access_mode` in a full-replace `PUT` gets dropped by a client that omits it | Optional + "absent leaves the stored value" means an old client cannot pause or unpause a mentor by accident. |
| The role dependency makes 4b unmergeable first | The interim check is specified in D8 and in the tasks, so the order can be swapped without redesign. |
| Validation and the database disagree | The check constraints mirror the pure rules; a test inserts a boundary row through `connect_app` and expects the database to accept it, and an out-of-range row and expects a refusal. |
