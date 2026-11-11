# Design: mentor-suggestions-and-reasons

## Context

See `proposal.md` for motivation. This section records only the state that shapes the approach.

**Repository snapshot (verified 2026-11-11, re-check at apply).**

- `main` is at `a7aba38` with a clean working tree; `openspec list` reports no active change; `openspec validate --all --strict` reports 37 passed, 0 failed on OpenSpec 1.14.3 once all three of this round's change directories exist (34 specs plus three changes). CI run `42804468000` on `main` (workflow `ci`, 2026-11-10) is green. No gate was run in this propose round.
- There is no matching code: `packages/domain/src/index.ts` exports age-gate, affiliation, account-status, availability, fields, identity, mentor-onboarding, mentorship, outcome, reputation, password-policy, profiles, request and visibility, and nothing else. `grep -rn suggest services/api/src` finds only the abuse-report `reason` field.
- `packages/config/src/index.ts` carries `CONSENT_DOCUMENT_VERSION`, the readiness timeout, the outcome cooling period, the reputation placeholder multipliers and `RATE_LIMITS`. There are no match weights.
- The directory read is `listMentors` in `services/api/src/profiles/drizzle-profiles.service.ts`: it filters `status = 'ACTIVE'` and an access mode other than `PAUSED`, keysets on `mentor_profiles.id`, then calls the private `readSlotsInUse(ids)` (pending count plus accepted inside `now() - interval '7 days'`) and `readMentorFields(ids)`, and derives `access_state` with `deriveAccessState(slotsInUse(counts), weeklyCapacity, accessMode)`. `slotsInUse` is `packages/domain/src/request.ts`.
- `GET /v1/mentors` is `profiles.controller.ts:290`; `GET /v1/mentors/:id` is `:304`; the controller is registered in `services/api/src/app.module.ts` and the module is `profiles.module.ts` with `PROFILES_SERVICE` as its token.
- `student_profiles` is `(id, user_id, goals text, primary_field_id, languages text[], timestamps)` with one row per user; `student_field_interests` is `(student_profile_id, field_id)`. `mentor_profiles` is `(id, user_id, primary_field_id, status, onboarding_status, activated_at, headline, bio, expertise_summary, scope_statement, languages, weekly_capacity, access_mode, timestamps)`; `mentor_fields` is `(mentor_profile_id, field_id)`. Neither side stores a structured outcome or goal type: `requests.target_outcome_type` is the only column of that enum, and it is per request and nullable.
- `availability_windows` is `(user_id, context STUDENT or MENTOR, weekday smallint 1 to 7, start_minute smallint 0 to 1440, end_minute smallint, timezone text)` with the end minute required to be later than the start minute by a check. `packages/domain/src/availability.ts` already validates and caps at 21 windows per context.
- `affiliations` is `(user_id, institution_id nullable, kind, department nullable, program nullable, batch_year smallint nullable, level, method, status, decided_by_user_id, decision_reason, verified_at, revoked_at, expires_at)` with a partial unique index allowing at most one `VERIFIED` row per user.
- `packages/contracts/src/body-keys.ts` lists body-bearing routes only; `GET /v1/mentors` is absent from it. `RATE_LIMITS` has an `auth`, `register`, `reset`, `export`, `write` and `default` bucket; the directory uses the default bucket implicitly.
- The web side has `apps/web/lib/mentor-directory.ts` (card type, `directoryQuery`, `accessStateLabel`, `canRequest`, `mergeCards`) and `apps/web/app/mentors/page.tsx`, which renders filters, cards, an empty state and a "load more" control. The directory card already links to `/request/new?mentor={id}`.
- `IdentityErrorCode` in `packages/domain/src/identity.ts` is a closed union; adding a code is a compile-time change that forces every consumer to handle it.

## Goals / Non-Goals

**Goals**

- One pure, deterministic scoring function with an exhaustive unit test, so the ranking rule can be argued about without a database.
- One read endpoint that a student calls, composed from the existing directory read so capacity and eligibility cannot drift.
- A section on `/mentors` that a student can use today, with the existing request link and the existing card shape.

**Non-Goals**

- No persistence of suggestions, no log of what was shown, no config version (`DEBT-31` owns versioned configuration).
- No change to the directory endpoint, its payload, or its ordering.
- No new dependency, no time-zone library, no migration.

## Decisions

Owner decisions keep the numbers the brief fixed (D1 to D7). Decisions taken while writing this proposal carry `R` numbers, because D8 to D16 are the other two changes in the same round.

### D1. Three factors now, GoalAlignment permanently missing (owner decision)

Implement field overlap, alumni connection and availability match; GoalAlignment is excluded and renormalized away. Alternative rejected: adding `student_profiles.target_outcome_type` plus a structured mentor guidance column. That costs one migration, two verbatim `MODIFIED` requirement blocks in `profiles/student-and-mentor-profiles`, two form changes and two contract updates, and it would still ship a factor nobody has validated. `docs/matching-algorithm-spec.md` section 6.3 already defines missing-factor exclusion, so three factors are spec-legal rather than a shortcut around it. The data-source gap is recorded as a debt row.

### D2. A new route in a new `matching` module, and a new capability (owner decision)

`GET /v1/suggestions` lives in `services/api/src/matching/`, and the spec lands as `matching/mentor-suggestions`. Alternative rejected: `GET /v1/mentors?ranked=true`. That would force a `MODIFIED` delta on `profiles/mentor-directory`, whose "No numeric score or rank" and fixed-key-set scenarios would have to be rewritten to say "unless ranked", and it would put two different payload shapes behind one contract path.

### D3. The availability filter ships in suggestions only (owner decision)

The directory's own missing availability filter (`DEBT-26`) is not built here; the debt row is re-pointed so its suggestions half closes with this change and its directory half is named as still open. Alternative rejected: adding `available` to the directory query as well, which doubles the scan-cap work for a filter the suggested set already expresses better.

### D4. Availability compares wall-clock windows, and a time-zone mismatch makes the factor missing (owner decision)

Two windows overlap when they share a weekday and their minute ranges intersect. When the student's and the mentor's windows carry different `timezone` strings, the factor is missing rather than converted. A `shortcut:` comment records the limit, and a debt row owns correct UTC conversion in Phase 2. Alternative rejected: converting both sides through `Intl` offsets now. That is the correct answer eventually but needs a reference week, handling of zones that change offset, and its own test suite, for a pilot whose users are in one country (P6).

### D5. Weights and the batch distance are constants in `@connect/config` (owner decision)

`MATCH_FACTOR_WEIGHTS` carries alumni 30, field 30, goal 25 and availability 15, matching the specification's Proposed defaults; `MATCH_ALUMNI_BATCH_DISTANCE` carries an integer year distance. Alternative rejected: a `config_versions` table (`FR-ADM-07`). Versioned, audited configuration is its own unbuilt change (`DEBT-31`), and the reputation weights already set the precedent of constants labelled as placeholders.

### D6. Suggestion event logging is deferred (owner decision)

Nothing is written when a suggestion is shown or chosen. It is a new append-only table, its grant, a probe row in the table-count test, a `truncateAll()` entry and a write on a read path. Recorded as a debt row. Alternative rejected: logging only to the structured application log, which the specification does not accept as the suggestion log (`FR-DISC-04` names an append-only record).

### D7. Five results, and the pending cap disables rather than hides (owner decision)

The set size is 5 from the specification. The student's own pending cap (`MAX_PENDING_REQUESTS_PER_STUDENT`) does not remove a mentor from the set; the send action is the place that refuses, exactly as the directory does with a `full` card. Alternative rejected: reusing `canCreateRequest` inside the read to simulate the send, which duplicates the request path's decision in a second place.

### R1. The route is student-only, and a profile-less student gets a new error code (owner decision)

`requireRole(identity, request, "STUDENT")` gates the route. A student without a profile is refused with `STUDENT_PROFILE_REQUIRED`, added to the `IdentityErrorCode` union. Alternative rejected: reusing `VALIDATION_ERROR` with a message, which gives the web layer nothing to branch on for a first-run prompt.

### R2. Suggestions compose on the existing directory read instead of a second query

`ProfilesService` gains one method, `readSuggestionPool(input)`, that reuses the same `ACTIVE`/`PAUSED` conditions, the same `readSlotsInUse` aggregate and the same `slotsInUse` domain function, and returns each candidate with the extra fields the score needs (the mentor's field ids, the mentor's availability windows, and the mentor's affiliation). The matching module then filters, scores, orders and shapes the response. Alternatives rejected: a second Drizzle query inside the matching module (two capacity definitions, guaranteed to drift); calling `listMentors` once per page (wrong projection, no availability, and it hides `APPLICATION_ONLY` mentors in a way the score needs to know about); a SQL-side score (untestable as a pure function, and `FR-DISC-06` needs an input list a test can freeze).

### R3. The suggestion entry reuses the directory card and adds exactly two keys

The payload entry is the directory card shape (`id`, `display_name`, `headline`, `access_mode`, `access_state`, `primary_field`, `fields`, `languages`) plus `reasons` (an array of one to three strings) and `limited_information` (a boolean), spread from the existing `mentorDirectoryPayload` so the two projections cannot diverge. The response envelope is `{ "data": [...] }` with no cursor, because the set size is fixed. Alternatives rejected: a bespoke projection (a third shape to keep in sync); a `next_cursor` that is always null (dead contract surface).

### R4. Availability overlap is measured in minutes, not in blocks

The specification writes the factor as "overlapping slots divided by the smaller slot count" and describes coarse blocks. Storage is minute windows, so the factor uses overlapping minutes divided by the smaller total available minutes, capped at 1.0. This is the same quantity at a finer grain and needs no new column. Alternative rejected: quantizing to three blocks per day, which would throw away the windows the profile page already collects.

### R5. The tie-break hash is a 32-bit FNV-1a over the pair

`stablePairHash(studentId, mentorProfileId)` runs FNV-1a over `${studentId}:${mentorProfileId}` and returns an unsigned 32-bit integer; ties compare on that integer ascending. It is dependency-free, deterministic across processes, and needs no seed. Alternatives rejected: `node:crypto` (a Node built-in inside the pure domain package, which CI's boundary rules keep free of platform imports); sorting on the concatenated string (the same property, but harder to test for the ordering rule's intent).

### R6. MATH-FLAG: the batch-distance value is an owner decision

`docs/matching-algorithm-spec.md` says the batch band distance is a config value but does not state it. This design ships `MATCH_ALUMNI_BATCH_DISTANCE = 0`, which means "the same batch year counts as close", as the most conservative reading. That number is `MATH-FLAG` per `AGENTS.local.md` section 2: the owner confirms it (or sends it to Claude web) before apply, and raising it later is a one-line config change plus one updated test expectation. No wording in this change depends on the value.

### R7. Rate limiting uses the existing default bucket

The route takes the default bucket (120 requests per minute) by inheriting the global throttler, as the directory does. No new bucket is introduced, because a read of five rows is not a write and does not enqueue anything.

## Acceptance criteria

Six criteria, restated from the exploration report:

1. A student receives at most five mentors in one response, never six.
2. The eligibility set is exactly the documented filter set: a `FULL` mentor is absent from suggestions and present in the directory as `full`, an `APPLICATION_ONLY` mentor is absent but requestable, a mentor sharing no field is absent while still in the directory, a paused or non-`ACTIVE` mentor is absent, and the caller's own mentor profile is absent.
3. The order is deterministic: the same student and the same data give the same five in the same order twice, and a tie resolves on remaining capacity, then fewer requests in seven days, then the pair hash.
4. A student with no availability windows still receives five suggestions, with the weights renormalized over the active factors and `limited_information` true.
5. A student who shares no field with a mentor is not suggested that mentor, and that mentor still appears in the directory.
6. All gates pass: `pnpm lint`, `pnpm typecheck`, `CI=true pnpm test` with the new integration file actually executed rather than skipped, and `pnpm build`.

## Assumptions

1. A student profile holding only `goals`, a primary field and its interests is enough to score; `requests.target_outcome_type` is not read.
2. Availability windows are few (at most 21 per context per `packages/domain/src/availability.ts`), so scoring in memory for a bounded candidate page is cheap.
3. The pilot's student and mentor population is in one time zone, which is why D4 is acceptable as a first release.
4. At most one `VERIFIED` affiliation exists per user, which the partial unique index already enforces and which the alumni factor relies on.

## Risks / Trade-offs

- Two factors with a third missing can look like a complete ranking to a user who reads a reason. Mitigation: `limited_information` is set whenever a factor is excluded, and no string promises a fit level.
- Scoring in the application layer after a bounded scan means the pilot's mentor count bounds the work. Mitigation: reuse the directory's scan cap, and record the scaling limit in the debt row for logging and weights rather than pretending it is a paging strategy.
- A new error code touches a closed union. Mitigation: the compiler names every consumer, and the authorization matrix row plus one integration test assert the refusal.
- Editing `mentors/page.tsx` can regress the existing filters. Mitigation: the suggestions section is a separate component or block above the list, and the existing page test keeps asserting the directory behaviour.

## Open Questions

- The exact `MATCH_ALUMNI_BATCH_DISTANCE` value (R6). Confirm before apply; it changes one constant and one test expectation, not the approach.
- Whether the `Suggested for you` heading should be hidden entirely when the set is empty, or shown with an empty-state line (FR-UX-05 wants a designed empty state). Default in this design: shown with the empty-state line, so a student learns the feature exists.

## Migration Plan

None. No schema change, no data change, no backfill. Deploy order is ordinary: the API route and the web section land together, and a client that never calls the new route is unaffected. Rollback is the revert of the commit; nothing persisted.
