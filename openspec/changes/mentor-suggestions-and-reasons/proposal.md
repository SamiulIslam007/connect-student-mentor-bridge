# Proposal: mentor-suggestions-and-reasons

## Why

`FR-DISC-02` is Must and unbuilt: a student chooses a mentor from a filtered list ordered by mentor profile id, with no ranking and no explanation, because `GET /v1/mentors` deliberately ships without suggestion rank or reasons (`docs/api-contracts.md` section 5.3 says so in plain words). The matching specification (`docs/matching-algorithm-spec.md`) has been Approved-adjacent Draft scope since 2026-10-16 and every input it needs except one is already stored, so the cheapest real product improvement left in the student flow is to score and explain what the directory already returns.

## What Changes

- Add a pure scoring function in `@connect/domain` implementing three of the four documented factors — field overlap, alumni connection, availability match — with the missing-factor exclusion and weight renormalization rule from `docs/matching-algorithm-spec.md` section 6.3. GoalAlignment is permanently missing until a structured goal field exists.
- Add `GET /v1/suggestions` in a new `matching` module: a signed-in student receives at most five eligible mentors, ordered deterministically, each with one to three plain-language reasons and a `limited_information` flag.
- Apply the documented eligibility filters E1, E2, E3, E4, E6 and E7 before scoring, reusing the existing `ACTIVE`, non-`PAUSED`, capacity rule (`slotsInUse`, D-59) rather than defining a second one. E5 (re-request cooldown) is not built.
- Add weights and one batch-distance constant to `@connect/config`.
- Add a "Suggested for you" section on `/mentors`, above the existing filtered list, reusing the existing `/request/new?mentor={id}` link and the existing directory card shape, with an empty state.
- Add `STUDENT_PROFILE_REQUIRED` to the identity error codes so a student without a profile is refused clearly instead of being handed an arbitrary list.
- Close `DEBT-33` (no rule-based suggestions) and `DEBT-34` (nothing to freeze the no-sensitive-attribute rule against). Re-point `DEBT-26` (no availability filter) at this change and close its suggestions half.
- No migration, no new table, no profile form change, no new dependency.

## Capabilities

### New Capabilities

- `matching/mentor-suggestions`: how a student's suggestions are selected, scored, ordered and explained, what makes a mentor ineligible, what "missing" data does to the weights, and what the payload may and may not carry. Matching is its own product area: `docs/matching-algorithm-spec.md` already owns the rules and later changes will extend this capability with suggestion logging, weight tuning and concierge suggestions, so it does not belong under `profiles/`.

### Modified Capabilities

None. `profiles/mentor-directory` keeps its requirement that the directory payload carries no rank or score; the new endpoint is a separate read with its own payload, and the directory's text stays true. `profiles/profile-visibility` is unchanged: this change reads mentor profiles only, which that policy already makes visible to any signed-in viewer.

## Impact

- **Code**: new `packages/domain/src/match.ts`, `services/api/src/matching/` (module, controller, service interface, tokens, Drizzle service), `apps/web/lib/suggestions.ts`, `apps/web/app/api/suggestions/route.ts`; edited `packages/domain/src/index.ts` (export), `packages/domain/src/identity.ts` (one new error code), `packages/config/src/index.ts` (weights and batch distance), `services/api/src/app.module.ts`, `apps/web/app/mentors/page.tsx`, `apps/web/lib/strings.ts`.
- **Tests**: new `packages/domain/src/match.test.ts`, `services/api/test/matching.integration.test.ts`, `apps/web/test/suggestions.test.ts`; edited `services/api/test/authorization-matrix.test.ts` (MATRIX row plus controller and provider lists) and `services/api/test/request-validation.integration.test.ts` (controller and provider lists).
- **API/contract**: `packages/contracts/openapi.yaml` gains one path. `packages/contracts/src/body-keys.ts` needs no entry: a GET takes no body, and the file lists body-bearing routes only.
- **Data**: none. No table, column, enum or migration. The queries read `student_profiles`, `student_field_interests`, `mentor_profiles`, `mentor_fields`, `availability_windows`, `affiliations`, `mentorship_requests` and `users`. No grant is needed because no table is created.
- **Dependencies**: none added. No time-zone library: the availability factor compares wall-clock windows and treats differing zones as missing.
- **Docs**: `docs/api-contracts.md` section 5.3 gains the endpoint and loses the "not built" sentence for `FR-DISC-02`; `docs/matching-algorithm-spec.md` records the three-factor scope and the deferred fourth; `docs/functional-requirements.md` (`FR-DISC-02` built to depth, `FR-DISC-06` now guarded); `docs/known-debt.md` (DEBT-26, DEBT-33, DEBT-34 closed or re-pointed, three new rows); `docs/decision-log.md` (the owner decisions this change records); `docs/mvp-build-plan.md` section 5 and `docs/milestones-and-phases.md` current state; `README.md` status line.

## Depends on

- `profiles/mentor-directory` (archived 2026-11-09): the eligibility and capacity shape, the `access_state` derivation, and the `/mentors` page this change adds a section to.
- `profiles/availability-and-access-mode` (archived 2026-11-05): `availability_windows` and `access_mode`.
- `institutions/affiliation-verification` (archived 2026-11-08): the `affiliations` row (institution, department, program, batch year) the alumni factor reads.
- `mentorship/request-lifecycle` (archived 2026-11-08): `slotsInUse` (D-59) and the rolling capacity window.
- `identity/role-authorization` (archived 2026-11-05): the `STUDENT` role this route requires.

## Out of scope

- Suggestion event logging (matching spec section 11): a new append-only table, a config-version column, and a write on a read path. Recorded as debt.
- Concierge suggestions (section 9) and AI-written reasons (section 8.2).
- A coarse "strong fit / good fit" label (open question 4 in the spec).
- GoalAlignment (D1 below): no structured goal field exists on either side.
- The re-request cooldown filter E5: no declined-pair store exists.
- Mentor reputation as a factor: the spec excludes it from v1 by principle.
- Filtering the directory by availability window (the directory's own half of `DEBT-26`), and any change to `/v1/mentors`.
- Ranking the `APPLICATION_ONLY` mentor into suggestions: the spec excludes them from automatic suggestions, and they stay requestable from browse.

## Risks and rollback

| Risk | Mitigation |
|---|---|
| A student sees an unexplained order and distrusts it | Every suggestion carries reasons built only from declared profile facts, and the strings are asserted in a test; no reason claims an outcome or a ranking |
| The suggestion set disagrees with what the request path allows | Both read `slotsInUse` from `@connect/domain` and the same `ACTIVE`/`PAUSED` rules; the integration test requests a suggested mentor and asserts no refusal, and asserts a `FULL` mentor is absent from suggestions |
| Missing data silently changes the ranking | The renormalization rule is one pure function with tests per missing-factor combination, and `limited_information` is set whenever a factor is excluded |
| The availability factor is wrong for a mentor abroad | Differing time zones make the factor missing rather than wrong; the shortcut is a named code comment and a debt row for UTC handling in Phase 2 |
| A new top-level capability name splits the spec tree | The path is `matching/mentor-suggestions` and the proposal states why the area does not fit `profiles/`; later matching work extends the same capability |
| The teammate batch-distance number is invented | It ships as one config constant labelled Proposed default with a `MATH-FLAG` open question in the design; the owner confirms the value before apply, and changing it is a one-line edit |

Rollback: delete the matching module, the domain file, the web section and its BFF route, then revert the config constants and the contract path. No data is written, no migration exists, so rollback is safe at any time.

**Traces to** FR-DISC-02 (rule-based suggestions with a plain-language reason), FR-DISC-06 (no pay-to-rank, no sensitive attributes in matching), FR-PROF-02 (a paused mentor is hidden from discovery), FR-VER-04 (a mentor below Level 1 cannot receive requests), FR-DISC-01 (the directory filters, unchanged), FR-UX-05 (designed empty, loading and error states); ADR-018 (Drizzle), ADR-001 (modular monolith with REST); D-58 (discovery deferred, now resumed), D-59 (capacity counts a rolling 7-day window), D-69 to D-72 (the directory's own decisions this change follows); DEBT-26, DEBT-33, DEBT-34.
