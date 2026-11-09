# Design: mentor-directory

## Repository snapshot (verified 2026-11-09, re-check at apply)

- `docs/api-contracts.md:298` documents `GET /v1/mentors?field=&language=&access_state=&cursor=&limit=` with access `S` (student) and a suggestion rank; `:317` documents `GET /v1/mentors/{id}` as the signed-in request-form read. The list route does not exist: `services/api/src/profiles/profiles.controller.ts` registers `GET /v1/mentors/:id` only (line 211), implemented by `readMentorContext` (`services/api/src/profiles/drizzle-profiles.service.ts:278`), which returns `null` unless `mentor_profiles.status = 'ACTIVE'`.
- `MentorContext` (`services/api/src/profiles/profiles.service.ts:45`) and `mentorContextPayload` (`:107`) are the existing wire shape: `id`, `display_name`, `headline`, `access_mode`, `status`, `primary_field`. It selects no email and no account id.
- `mentor_profiles.status = 'ACTIVE'` already means Level 1 plus an enrolled second factor (`packages/domain/src/mentor-onboarding.ts:46`, spec `profiles/mentor-onboarding`).
- `slotsInUse({pending, acceptedInWindow})` lives in `packages/domain/src/request.ts:53`; the request path counts by two queries under a mentor row lock (`services/api/src/requests/drizzle-requests.service.ts:420-458`). Nothing stores a `FULL` state today; `grep -rn "FULL" services/api/src` outside tests returns nothing.
- `apps/web` has no `/mentors` page: the app's pages are `account`, `account/security`, `account/sessions`, `forgot-password`, `mentorship/[id]`, `profile`, `request/new`, `requests`, `reset`, `sign-in`, `sign-in/mfa`, `sign-up`, `verify`. `apps/web/lib/navigation.ts:24` offers only account, profile, sessions, sign-out when signed in.
- No page or header links to `/requests` or `/request/new`: `grep -rn 'href="' apps/web/app` returns only back-links from `/mentorship/[id]` and `/request/new`.
- `apps/web/app/api/mentors/[id]/route.ts` is the BFF pattern a list route copies: read the session cookie, call `forwardUpstream`, map a non-JSON body, pass the status through.
- Seed entry point: `services/api/package.json:15` (`db:seed` → `src/db/seed/run.ts`), which seeds institutions and affiliation attestations by email lookup. It has no environment guard today.
- Gates on 2026-11-09 with Docker up: `pnpm lint` 0, `pnpm typecheck` 0, `pnpm build` 0, `pnpm test` under `CI=true` green (domain 87, web 102, contracts 16, api 175 tests, 0 skipped).

## Goals / Non-Goals

**Goals**

- One public, paginated read that lists exactly the mentors a student can legitimately ask, in a stable order.
- A projection narrow enough that a public endpoint cannot leak contact or availability data.
- A page and two navigation links, so the already-built request → mentorship → outcome loop is reachable by clicking.

**Non-Goals**

- Any ranking, score, or "why this mentor" text.
- Any filter over availability windows, or over data that is not already public.
- Any change to `GET /v1/mentors/{id}`, the request form, or the request rules.
- Any write, table, or migration.

## Decisions

**D1 — The list is public, and the visibility matrix keeps governing profile reads.** The owner decided the directory read is public (D-71) while the request action stays signed-in. That contradicts two archived statements: `docs/api-contracts.md:298` marks the list `S`, and `openspec/specs/profiles/profile-visibility/spec.md:47` says an unauthenticated viewer sees nothing "for every profile, including a mentor's". Resolution: the contract's access changes to public, and the visibility requirement is restated so the policy still answers `HIDDEN` for every profile read while naming the directory projection as the only anonymous read. Rejected: keeping the list signed-in — it contradicts a fixed owner decision and blocks the partner demo, where a visitor should see who is available.

**D2 — No rank; order by mentor profile id.** `match_score`, suggestion reason, and sort order belong to `#6`, which stays deferred (D-58). Ordering by `mentor_profiles.id` is stable across inserts, needs no extra column, and makes the keyset honest. Rejected: ordering by counted outcomes — it is a ranking with placeholder weights (D-67) and would invite "why is my mentor last".

**D3 — The filter key is the field's opaque id, not its slug.** `GET /v1/fields` already hands the UI `{id, name}` pairs and keysets by slug internally; the directory filters on `primary_field_id` **or** membership in `mentor_fields`, so an additional field also matches. An unknown or non-existent id returns an empty page, never a `404`. `language` is an exact, case-insensitive match against one element of `mentor_profiles.languages`. `access_state` accepts `available`, `application_only`, `full`. Rejected: slug filter — the UI has no slug, and adding a second identifier to the contract buys nothing.

**D4 — `FULL` is derived at read time, never stored.** The page query returns up to `limit + 1` mentor rows; a second aggregate query over those ids computes `slotsInUse` per mentor from `mentorship_requests` (pending plus accepted inside the seven-day window, the same helper the request path uses). Two queries, no N+1, and no column that can drift. Rejected: a stored `access_state` column — it needs a writer on every request transition and would be wrong for up to one sweeper interval.

**D5 — Pagination is keyset on the mentor id, `limit` 1 to 50 defaulting to 20.** The next cursor is the last id of a full page; `next_cursor` mirrors the requests list shape. Rejected: offset paging, which shifts while mentors activate.

**D6 — The wire projection is one explicit object with an exact-key-set test.** Exposed: `id`, `display_name`, `headline`, `access_state`, `access_mode`, `primary_field`, `fields`, `languages`. Excluded: `users.email`, `users.id`, `mentor_profiles.bio`, `expertise_summary`, `scope_statement`, `weekly_capacity`, availability windows, `onboarding_status`. `bio` is excluded because the list is a public surface with no need for it and the detail read already carries it. The test asserts `Object.keys(card).sort()` equals the documented list, so a later service change cannot widen the payload silently.

**D7 — Demo mentors come from a separate, guarded seed entry point.** `db:seed:demo` runs `src/db/seed/demo-mentors.ts`, which refuses unless `NODE_ENV !== 'production'` **and** `SEED_DEMO_MENTORS=1`, and uses the reserved `@example.edu.bd` domain. A demo mentor needs four rows to be visible: the user, a `role_assignments` MENTOR row, an affiliation `ADMIN_ATTESTATION` Level 1 row, and a `two_factors` row, because `ACTIVE` requires an enrolled second factor — a seeded `two_factors.secret` is a fixed, obviously fake dev constant and is never accepted by a production deployment because the seed cannot run there. Rejected: adding demo mentors to the existing `db:seed` — that script is documented as safe to run against any environment, and one missing flag would put fake people in front of real users.

**D8 — No migration.** The endpoint reads `mentor_profiles`, `mentor_fields`, `fields`, `users`, `mentorship_requests`, and `role_assignments`, all at migration `0014`. No new column, table, enum, index, or grant. The next migration number stays `0015` and is untouched by this change.

**D9 — The contract and the security doc are corrected in this change, not later.** `docs/api-contracts.md:298` loses the rank and reason phrasing and changes access to public; `docs/security-requirements.md`'s "Authentication to browse" mitigation for directory scraping is replaced with the real control set (narrow projection, capped page, rate limiting by `request-validation-and-rate-limits`). Leaving either would ship a doc that contradicts the code.

## API surface

| Method and path | Access | Notes |
|---|---|---|
| `GET /v1/mentors` | public | `field` (uuid), `language` (string), `access_state` (`available`, `application_only`, `full`), `cursor` (mentor profile id), `limit` (1 to 50, default 20). `200` with `{data, next_cursor}`; a malformed `field` or `access_state` is `422 VALIDATION_ERROR` |

Rules:

- Only `status = 'ACTIVE'` rows appear. `PAUSED` is hidden even when the caller filters for it (an explicit `access_state=available` request returns an empty page rather than a leak).
- `access_state` is `full` when `slotsInUse >= weekly_capacity`, else `application_only` when `access_mode = 'APPLICATION_ONLY'`, else `available`.
- A `FULL` mentor appears with `access_state: "full"`; the page disables the Request action and shows the string-catalog reason.
- The list is readable without a session; the Request action links to `/request/new?mentor={id}`, which is already signed-in only.

## Wire shape

```json
{
  "data": [
    {
      "id": "9c2e…",
      "display_name": "Ayesha Rahman",
      "headline": "Product designer, fintech",
      "access_state": "available",
      "access_mode": "OPEN",
      "primary_field": { "id": "…", "name": "Product design" },
      "fields": [{ "id": "…", "name": "Product design" }],
      "languages": ["en", "bn"]
    }
  ],
  "next_cursor": "9c2e…"
}
```

## Web

- Route `apps/web/app/api/mentors/route.ts`: forward `field`, `language`, `access_state`, `cursor`, `limit` to the API, no session required, and map a non-JSON body to `502` (the existing `forwardUpstream` behaviour).
- Page `apps/web/app/mentors/page.tsx`: a field `<select>` populated from `/api/fields`, a result list of cards, an empty state, a load-error state with retry, and a "Load more" keyed on `next_cursor`. Every label comes from `apps/web/lib/strings.ts` (new `mentors` group).
- Header: `Mentors` and `Requests` in `apps/web/lib/navigation.ts` for a signed-in account; the existing `navigation.test.ts` list is extended rather than replaced.
- Profile: one "Find a mentor" link next to the existing back-link.
- Stitch (binding rule 12): generate one screen for this list before writing the page and record the project/screen name in `tasks.md` at apply.

## Assumptions

- A pilot institution's seeded mentors are enough to demo the list; the demo seed exists for the empty-domain case.
- `mentor_profiles.languages` is a non-null text array on every active profile (verified in the profile payload). A null would simply render as an empty list.
- The API's `@connect/domain` `slotsInUse` stays the single capacity rule; if `#6` later needs a second definition, this read changes with it.

## Risks

| Risk | Mitigation |
|---|---|
| Public payload grows a private field later | Exact-key-set test on the projection plus a comment naming the allowlist |
| The derived `FULL` state disagrees with the request-time refusal | Both call `slotsInUse`; the integration test checks a full mentor shows `full` and still gets `MENTOR_AT_CAPACITY` on request |
| The visibility spec is left contradicting the endpoint | The delta restates the requirement and names the public projection explicitly, and the change is validated with `openspec validate --strict` before apply |
| Demo seed rows reach production | `NODE_ENV` guard, explicit flag, separate script, reserved domain; the seed test asserts the refusal |
| Scraping | Capped page, narrow projection, no contact data; the rate-limit change follows immediately after |
