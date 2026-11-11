# Tasks: mentor-suggestions-and-reasons

## 0. Preconditions

- [ ] 0.1 Confirm `MATCH_ALUMNI_BATCH_DISTANCE` with the owner (design R6, `MATH-FLAG`); record the answer in this file before writing the domain function. Verify: the constant value in `packages/config/src/index.ts` matches the confirmed answer, and the matching unit test asserts that exact value.
- [ ] 0.2 Re-read the repository snapshot in `design.md` against the real tree (`git log --oneline -1`, `git status`, `grep -n "listMentors" services/api/src/profiles/drizzle-profiles.service.ts`) and report every mismatch before writing code. Verify: each snapshot line is either confirmed by a command output or listed as a mismatch in the handoff.

## 1. The pure scoring rule in the domain package

- [ ] 1.1 Add `packages/domain/src/match.ts` with the types (`MatchCandidate`, `MatchStudent`, `MatchFactors`, `MatchResult`), the `MATCH_FACTOR_WEIGHTS` consumer, `fieldOverlap`, `alumniConnection`, `availabilityOverlap`, `scoreCandidate` (renormalizing over active factors, rounding to six decimals), `orderSuggestions` and `stablePairHash` (FNV-1a, unsigned 32-bit). No database, HTTP or Node built-in import. Verify: `pnpm --filter @connect/domain typecheck` passes and `eslint packages/domain/src/match.ts` reports no boundary violation.
- [ ] 1.2 Add `packages/domain/src/match.test.ts` covering: field overlap 2/4 and 1.0; alumni 1.0, 0.5, 0 and missing; availability overlap in minutes, the cap at 1.0, and the different-time-zone case returning missing; GoalAlignment always missing; one-missing-factor renormalization; a present-but-zero factor staying active; no active factor at all; the six-decimal comparison; and the pair hash being stable across calls and different across mentors. Verify: `pnpm --filter @connect/domain test` passes with every case named for the scenario it covers.
- [ ] 1.3 Export the new module from `packages/domain/src/index.ts` and add the weights plus the batch distance to `packages/config/src/index.ts`, each with a comment naming the specification section and the `MATH-FLAG` label. Verify: `pnpm --filter @connect/domain test` and `pnpm --filter @connect/config build` pass, and `grep -n "MATCH_" packages/config/src/index.ts` shows both constants.

## 2. The candidate read on the existing profiles service

- [ ] 2.1 Add `readSuggestionPool` to `services/api/src/profiles/profiles.service.ts` and `drizzle-profiles.service.ts`: the same `ACTIVE` and not-`PAUSED` conditions as `listMentors`, the same `readSlotsInUse` aggregate, plus the candidate's field ids, its availability windows, its affiliation (institution, department, batch year) and the count of requests received in the last seven days; return the student's own inputs in the same call. Verify: a service-level test with seeded fixtures returns the capacity numbers, the received count and the affiliation fields for each candidate.
- [ ] 2.2 Bound the read with the directory's scan cap and exclude the caller's own mentor profile in the query, not in memory. Verify: a test seeds more candidates than the cap and asserts the bounded result, and a dual-role account's own profile is absent.

## 3. The matching module and the route

- [ ] 3.1 Add `services/api/src/matching/` (`matching.module.ts`, `matching.controller.ts`, `matching.service.ts`, `matching.tokens.ts`, `drizzle-matching.service.ts`) and register the module in `services/api/src/app.module.ts`; the controller calls `requireRole(identity, request, "STUDENT")` and then the service. Verify: `pnpm --filter api typecheck` passes and the app boots in the integration test's stack.
- [ ] 3.2 Implement the service: read the pool, drop ineligible mentors using the domain rules, score, order, take five, and build the payload as the existing `mentorDirectoryPayload` spread plus `reasons` and `limited_information`. Verify: an integration test asserts the five-item cap, the eligible-only set, the reason count of one to three, and that no entry carries a score key.
- [ ] 3.3 Add `STUDENT_PROFILE_REQUIRED` to `IdentityErrorCode` in `packages/domain/src/identity.ts` and map the no-profile and no-session refusals in the controller. Verify: the compiler lists every consumer touched; integration tests assert `422 STUDENT_PROFILE_REQUIRED`, `401 SESSION_INVALID` and `403 ROLE_REQUIRED`.
- [ ] 3.4 Add the reason-text builder with a fixed template per active factor and above-zero value, ordered by weighted contribution and capped at three, with the exact strings in the string catalog path the API already uses for problems. Verify: a unit or integration test asserts one reason per active non-zero factor, no reason for a zero or missing factor, and no string containing a claim about past outcomes.

## 4. Matching behaviour tests

- [ ] 4.1 Add `services/api/test/matching.integration.test.ts` for the eligibility set: a `FULL` mentor absent from suggestions and present in the directory as `full`; an `APPLICATION_ONLY` mentor absent but requestable; a mentor with no shared field absent; a paused mentor absent; a mentor below `ACTIVE` absent; the dual-role own profile absent. Verify: every case names its spec scenario and the whole file passes under `CI=true`.
- [ ] 4.2 Add determinism tests: the same student twice yields the same order; two students with identical inputs get pair-hash-dependent orders that reproduce exactly; equal scores are broken by remaining capacity; the no-active-factor fallback exercises all three ordering keys. Verify: the file passes with the same seed data and no time dependence.
- [ ] 4.3 Add the missing-data tests: a student with no availability windows still gets five suggestions with `limited_information` true; a student with no affiliation still gets suggestions; a student with neither still gets suggestions through the fallback ordering. Verify: each assertion names the renormalization or fallback scenario.
- [ ] 4.4 Add the negative payload assertions: `Object.keys(entry).sort()` equals the documented set; no response body contains `score`, `points`, `tier`, `rank`, an email, an account id, a biography, or a capacity number. Verify: adding one key to the projection fails the test.

## 5. The three registries this repo requires

- [ ] 5.1 Add `GET /v1/suggestions` to `packages/contracts/openapi.yaml` with the security requirement, the `200` schema for the entry object, the `401`, `403` and `422` problems, and no request body. Verify: `pnpm --filter @connect/contracts test` passes, including the parity test.
- [ ] 5.2 Add the `MATRIX` row for `GET /v1/suggestions` in `services/api/test/authorization-matrix.test.ts`, and add `MatchingController` plus its provider tokens to that file's controller and provider lists. Verify: the matrix test passes and reports the route as student-only.
- [ ] 5.3 Add `MatchingController` and its provider tokens to the controller and provider lists in `services/api/test/request-validation.integration.test.ts`. Verify: the file passes and reports no route allowlisted without a route and no route without an allowlist.
- [ ] 5.4 Confirm `packages/contracts/src/body-keys.ts` needs no entry: the route is a GET and the file lists body-bearing routes only. Verify: `grep -n "suggestions" packages/contracts/src/body-keys.ts` returns nothing and the parity test still passes.

## 6. The web surface

- [ ] 6.1 Add `apps/web/lib/suggestions.ts`: the payload types, a `suggestionQuery`-free loader shape, a reason-list formatter, and a merge that keeps the suggested set separate from the directory page. Verify: `apps/web/test/suggestions.test.ts` asserts the shape mapping, the empty set, and that a suggestion never renders as a directory card with a different key set.
- [ ] 6.2 Add `apps/web/app/api/suggestions/route.ts` by copying the nearest read-only BFF route and replacing only the upstream path; do not hand-write an Authorization header. Verify: a route test asserts the forwarding, a status passthrough, and a non-JSON upstream mapping to `502`.
- [ ] 6.3 Add the "Suggested for you" section to `apps/web/app/mentors/page.tsx` above the existing list, with loading, error, and empty states, each card reusing the existing `/request/new?mentor={id}` link and the existing disclaimer. Verify: the page test asserts the section renders the empty-state string when the set is empty, and the existing directory assertions still pass.

## 7. Test-seam and fixture support

- [ ] 7.1 Extend the test support in `services/api/test/support/` only if the new module needs a provider the stacks do not already build; otherwise reuse the existing `startApiStack`. Verify: no support file changes if the stack resolves the module, and the full api suite passes with the new file included.

## 8. Docs and decisions

- [ ] 8.1 Update `docs/api-contracts.md` section 5.3: add `GET /v1/suggestions` with its access, set size, payload keys, ordering, and refusal codes, and rewrite the closing sentence that says suggestion reasons and ranking are not built. Verify: `grep -n "not built" docs/api-contracts.md` no longer names `FR-DISC-02`.
- [ ] 8.2 Update `docs/matching-algorithm-spec.md`: record the three-factor scope, the missing GoalAlignment input, the minute-based availability measure, and the time-zone limitation, each dated and labelled. Verify: the section 6.3 rules and the implemented behaviour agree line for line.
- [ ] 8.3 Update `docs/functional-requirements.md`: mark `FR-DISC-02` built to the stated depth and `FR-DISC-06` guarded by the first scoring function, each with its evidence line. Verify: the rows name the change and the date.
- [ ] 8.4 Update `docs/known-debt.md`: close `DEBT-33` and `DEBT-34`, re-point `DEBT-26` with its suggestions half closed and its directory half open, and add rows for the GoalAlignment data source, the deferred suggestion log, and UTC availability handling. Verify: every new row names one owner and one target change.
- [ ] 8.5 Add the decision rows `D-91` to `D-96` (full text in the section at the end of this file) to `docs/decision-log.md`, and correct every doc that still states the old order or the "no suggestions" position. Verify: `grep -rn "not built\|D-58" docs/` no longer contradicts the implemented behaviour.
- [ ] 8.6 Update `docs/mvp-build-plan.md` section 5 row 6 and `docs/milestones-and-phases.md` "Current state", plus the `README.md` status line, marking the change with its evidence, PR number and date. Verify: the three docs agree on the change's status and name the same PR.

## 9. Full checks, review and handoff

- [ ] 9.1 Run from the repo root with Docker up: `pnpm lint`, `pnpm typecheck`, then `CI=true pnpm test`, then `pnpm build`. Record each exit code and the per-package test totals. `CI=true` is what makes the integration files run, so a run with many skipped files and zero failures is not a pass and must be reported as UNVERIFIED. The api suite replays the migrations for every integration file and takes ten minutes or more, so run the four gates as one background job writing to a log file and read it back.
- [ ] 9.2 Run the review gate from `AGENTS.local.md` section 2: `verify-before-done`, `/ponytail-review` (the change touches matching, which section 2 lists as high-risk, so also `/ponytail-audit`), `/ce-code-review`, the silent-failure hunt, the trust-rule check, `/ponytail-debt`, and `review-diff`. Fix in-scope findings; record the rest.
- [ ] 9.3 Confirm the diff contains only the tasks above, then write the handoff naming the PR, the merge commit, the per-package gate totals, the confirmed batch-distance value, and anything left as debt.

## Decision rows to add at apply

Add each of these to `docs/decision-log.md` as its own row. They are reserved here because this propose round may create only files under `openspec/changes/`.

**D-91**

- Date: 2026-11-11
- Decision: Matching ships three of the four documented factors: field overlap (weight 30), alumni connection (weight 30), availability match (weight 15). GoalAlignment is permanently missing because neither side stores a structured goal type, and the missing-factor exclusion and renormalization of `docs/matching-algorithm-spec.md` section 6.3 applies. No migration and no profile form change.
- Reason: a fourth factor would need one migration, two verbatim `MODIFIED` requirement blocks, two form changes and two contract updates, and it would still ship an unvalidated factor.
- Status: Decided
- Affects: `matching/mentor-suggestions`, `docs/matching-algorithm-spec.md`, `docs/known-debt.md` (new GoalAlignment row)

**D-92**

- Date: 2026-11-11
- Decision: Suggestions are `GET /v1/suggestions` in a new `services/api/src/matching/` module and a new `matching/mentor-suggestions` capability, readable only by an account holding the student role. The directory endpoint and its payload are untouched.
- Reason: ranking the directory through a query flag would force a `MODIFIED` delta on `profiles/mentor-directory` and put two payload shapes behind one path.
- Status: Decided
- Affects: `matching/mentor-suggestions`, `docs/api-contracts.md` section 5.3, `packages/contracts/openapi.yaml`

**D-93**

- Date: 2026-11-11
- Decision: The availability filter lives in suggestions only. `DEBT-26` is re-pointed: its suggestions half closes with this change, its directory half stays open.
- Reason: the suggested set is the ranked view; the directory keeps its keyset contract and its scan cap.
- Status: Decided
- Affects: `docs/known-debt.md` (DEBT-26), `openspec/specs/profiles/mentor-directory` (no text change)

**D-94**

- Date: 2026-11-11
- Decision: AvailabilityMatch compares wall-clock weekday and minutes, and the factor is missing when the two accounts' windows carry different time zones. Correct UTC conversion is a Phase 2 debt row.
- Reason: the pilot population is single-country (P6), and correct conversion needs a reference week and offset-change handling for a gain no pilot user can observe.
- Status: Decided
- Affects: `docs/matching-algorithm-spec.md`, `docs/known-debt.md`, `packages/domain/src/match.ts`

**D-95**

- Date: 2026-11-11
- Decision: Match weights and the alumni batch distance are constants in `@connect/config` (`MATCH_FACTOR_WEIGHTS`, `MATCH_ALUMNI_BATCH_DISTANCE`), not a versioned configuration table. The batch distance starts at 0, which means the same batch year counts as close.
- Reason: `FR-ADM-07` versioned configuration is unbuilt (`DEBT-31`), and the reputation weights already ship as labelled constants; the batch distance is a `MATH-FLAG` the owner confirms.
- Status: Decided
- Affects: `packages/config/src/index.ts`, `docs/matching-algorithm-spec.md`, `docs/known-debt.md` (DEBT-31 cross-reference)

**D-96**

- Date: 2026-11-11
- Decision: Suggestion event logging (matching spec section 11) is deferred, and nothing is written when a suggestion is shown, opened or chosen.
- Reason: it is a new append-only table with its grant, its probe row and a write path on a read endpoint, and no consumer exists before the weights are tuned.
- Status: Decided
- Affects: `docs/known-debt.md` (new row), `docs/matching-algorithm-spec.md`, `docs/functional-requirements.md` (FR-DISC-04 stays unbuilt)

## Workflow follow-up

- Merge the PR with a merge commit after every check passes, then archive the change on its own `chore/archive-mentor-suggestions-and-reasons` branch, because the ruleset refuses a direct push to `main`.
- At archive, confirm the new capability's `## Purpose` was copied into `openspec/specs/matching/mentor-suggestions/spec.md` and that `openspec validate --all --strict` still passes for all capabilities.
