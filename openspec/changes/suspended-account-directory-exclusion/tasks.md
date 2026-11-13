# Tasks: suspended-account-directory-exclusion

## 0. Preconditions

- [x] 0.1 Re-check the snapshot in `design.md`: `git log --oneline -1` (expect `731a5c7`), `git status`, `grep -rn "from(mentorProfiles)" --include=*.ts services/api/src`, `sed -n '340,400p' services/api/src/profiles/drizzle-profiles.service.ts`, `sed -n '455,500p'` (the suggestion pool), `sed -n '110,125p' services/api/src/reputation/drizzle-reputation.service.ts`, `sed -n '195,225p' services/api/src/requests/drizzle-requests.service.ts`, `sed -n '70,82p' services/api/src/onboarding/mentor-activation.ts`. Verify: every line confirmed, or listed as a mismatch.
- [x] 0.2 Confirm the two lift paths write no profile column: read `liftSuspension` in `services/api/src/reports/drizzle-reports.service.ts` and `liftExpiredSuspensions` in `services/api/src/reports/sanction-expiry.ts`, and record in this file what each one writes.

## 1. The discovery predicate

- [x] 1.1 Add the `users.status = 'ACTIVE'` condition to `listMentors` in `services/api/src/profiles/drizzle-profiles.service.ts`, with one comment saying the exclusion is derived so a lift needs no profile write. Verify: `grep -n "users.status" services/api/src/profiles/drizzle-profiles.service.ts` shows it in the directory query.
- [x] 1.2 Add the same condition to `readSuggestionPool`. Verify: the query carries both conditions and `pnpm --filter api typecheck` passes.
- [x] 1.3 Add the same condition to `readMentorContext`'s predicate, keeping the in-code `null` guard. Verify: `GET /v1/mentors/{id}` is `404` for a suspended account and `200` for an active one.
- [x] 1.4 Add an `innerJoin(users)` and the same condition to `impactForMentorProfile` in `services/api/src/reputation/drizzle-reputation.service.ts`, keeping the in-code guard. Verify: `GET /v1/mentors/{id}/impact` is `404` for a suspended account.
- [x] 1.5 Apply the same condition to the `PROFILE` branch of the report-target check in `services/api/src/reports/drizzle-reports.service.ts` (found in review: a hidden profile that still accepted a report was a second existence oracle). Verify: `POST /v1/reports` with `target_kind: profile` is `404` once the account is suspended.

## 2. The request refusal

- [x] 2.1 Pass the mentor account's status into `canCreateRequest` (`packages/domain/src/request.ts`) and extend its pause branch, so an inactive account answers `MENTOR_UNAVAILABLE` after the field, self-request and affiliation branches keep their own answers. Verify: no new error code, no early check in the service, and the group-office-hours probe answers alike for an active and an inactive account (found in review; an early service check was a suspension oracle).
- [x] 2.2 Leave the pending and accept paths untouched, and record in the report that a request already sent to a mentor suspended afterwards keeps today's behaviour (`design.md` R4).

## 3. The conditional activation write

- [x] 3.1 Add `eq(mentorProfiles.status, profile.status)` to the update's `WHERE` in `services/api/src/onboarding/mentor-activation.ts`, in the same `and(...)` as the user id. Verify: `sed -n '70,82p'` shows the condition and the four call sites still compile.

## 4. Tests

- [x] 4.1 `services/api/test/profiles.integration.test.ts`: a suspended account is absent from the directory under an access-state, a language and a primary-field filter; the mentor context read is `404`; setting the account back to `ACTIVE` restores both the card and the context read; then an `ANONYMIZED` account with the profile still `ACTIVE` is absent, and a `REMOVED` profile is absent too. The `mentor_profiles` row is byte-identical across the flow.
- [x] 4.2 `services/api/test/matching.integration.test.ts`: a suspended mentor is not suggested while the other eligible mentor still is; the lift restores both; an `ANONYMIZED` account with an `ACTIVE` profile is absent.
- [x] 4.3 `services/api/test/requests.integration.test.ts`: a request to a suspended mentor is `409 MENTOR_UNAVAILABLE` with no request row and no queued mail; the request context read is `404` for that mentor; a `GROUP_OFFICE_HOURS` body answers identically to an active and a suspended mentor, and a paused mentor answers exactly as the suspended one does.
- [x] 4.4 `services/api/test/reputation.integration.test.ts`: the public impact read is `404` for a suspended account and unchanged after the account returns to `ACTIVE`.
- [x] 4.5 `services/api/test/reports.integration.test.ts`: suspend through the route, lift through the route, suspend again with a passed end date and lift through the job; the directory query lists the mentor before and after, and the `mentor_profiles` row is byte-identical at every step.
- [x] 4.6 `services/api/test/mentor-activation.test.ts`: the sync's write is skipped when the stored status differs from the one it read, and applies when it matches.
- [x] 4.8 `packages/domain/test/request.test.ts`: every inactive account status is `MENTOR_UNAVAILABLE`, and the group-office-hours and below-Level-1 branches keep their own answers for a suspended account.
- [x] 4.7 Mutation check: remove the `users.status` condition from `listMentors` and confirm the directory test fails for that reason; restore it. Remove the status condition from the activation `WHERE` and confirm 4.6 fails; restore it. Record both in the report.

## 5. Docs and register

- [x] 5.1 Update `docs/functional-requirements.md`: `FR-DISC-01` (a suspended or deactivated account is excluded from discovery and from new requests), `FR-ADM-05` (the suspension reaches discovery), and the status lines that name them; recompute section 2.16 if a score moves.
- [x] 5.2 Update `docs/auth-and-access-control.md` section 13 (the suspension paragraph states the discovery consequence) and `docs/known-debt.md` (open or close the rows this change touches, next free numbers).
- [x] 5.3 Add the decision rows to `docs/decision-log.md` (full text at the end of this file), and update `docs/mvp-build-plan.md` section 5 and `docs/milestones-and-phases.md`.

## 6. Gates, review and handoff

- [x] 6.1 Run from the repo root: `pnpm lint`, `pnpm typecheck`, `CI=true pnpm test`, `pnpm build`, `pnpm exec openspec validate --all --strict`, each with its exit code echoed, in one background job writing to a log file. Record per-package totals including skipped.
- [x] 6.2 Review gate: line-by-line pass on the diff (every discovery query covered, no silent failure, no new error code), then an independent adversarial pass on the diff and the delta specs.
- [x] 6.3 Handoff: the five discovery surfaces, the request refusal, the conditional write, both mutation checks, the gate totals, the register rows, and the debt rows opened or closed.

## Decision rows to add at apply

**D rows (numbers assigned at apply, next free block in `docs/decision-log.md`)**

- Decision: Discovery and new requests require `users.status = 'ACTIVE'`, derived on every read and never stored on the mentor profile, so a suspension needs one write and a lift needs none.
- Decision: A request to an account that is not `ACTIVE` answers `MENTOR_UNAVAILABLE`, the same refusal a paused mentor returns, so the cause is not disclosed.
- Decision: A request already sent to a mentor who is suspended afterwards keeps its status and its accept and decline paths; only new discovery and new requests are blocked.
- Decision: `syncMentorActivation` writes conditionally on the status it read, so a concurrent status change by another actor wins and the next trigger recomputes.
- Affects: `profiles/mentor-directory`, `matching/mentor-suggestions`, `mentorship/request-lifecycle`, `mentorship/reputation-ledger`, `profiles/mentor-onboarding`, `docs/auth-and-access-control.md`, `docs/functional-requirements.md`
