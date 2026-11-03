# Design

## Context

Snapshot verified **2026-11-03** on `main` at commit `706453b`, before this change was proposed. Re-verify the file facts at apply time.

What exists:

- `services/api/src/db/schema/auth.ts:13` — `users.id` is **`text`**, not `uuid`. `trust.ts` already references it correctly as `text("user_id")`.
- `services/api/src/db/schema/trust.ts:26` — a private `citext` `customType` and a private `timestamps` helper. `trust.ts:41` shows the house pattern `uuid("id").primaryKey().defaultRandom()`.
- `services/api/drizzle/0000_baseline.sql:2` — `CREATE EXTENSION IF NOT EXISTS citext`, so `citext` is available to later migrations.
- `services/api/src/me/me.controller.ts` — `GET /v1/me` returns the account record only; `api-contracts.md` says change #4 extends it.
- `services/api/src/app.module.ts:27` — middleware is applied to an explicit controller list.
- `services/api/test/support/database.ts:99` — `truncateAll` truncates an explicit table list.
- `services/api/test/identity.integration.test.ts:701-717` — asserts the exact `/v1/me` key set and that no profile fields are present.
- `packages/contracts/openapi.yaml:351-368` — `AccountSummary` is `additionalProperties: false` and is shared by `GET /v1/me` and the sign-in response.
- No profile, field, or availability code exists. `service/src/identity/auth.controller.ts` validates by reading named properties; it never rejects unknown ones.

Library facts confirmed through Context7 (Drizzle ORM docs, 2026-11-03): `uuid().defaultRandom()` emits `gen_random_uuid()`; composite keys use `primaryKey({ columns: [...] })` from `drizzle-orm/pg-core`; `text().array()` takes a `sql` default; `onConflictDoUpdate({ target, set })` returns the conflicting row via `RETURNING` when `set` is a no-op. No better-auth API is touched by this change.

## Goals / Non-Goals

**Goals:**

- One migration that adds the profile and field tables without touching an existing row.
- A normalizer with one documented behavior, provable by unit tests, that survives Bangla input.
- Profile endpoints that cannot read or write another user's data, by construction rather than by check.
- One source of truth for a mentor's primary field.
- A `/v1/me` response that grows without making the sign-in contract lie.

**Non-Goals:**

- See `proposal.md` — Out of Scope. In design terms: no availability table, no `access_mode`, no pause/resume, no affiliation, no visibility matrix, no capacity lock, no field admin tooling.

## Landmines Resolved Before Schema Work

These are the five defects that would surface mid-apply if left implicit. Each is resolved here, and the doc fix lands in the same change.

1. **`users.id` is `text`.**
   Every `user_id` column this change adds is `text` with a `references(() => users.id)`. `data-model.md` §5.2 currently says `uuid` and is corrected. A migration generated from the doc as written would fail with a foreign-key type mismatch.

2. **No redundant `account_status` check on profile endpoints.**
   `account-status-lifecycle` guarantees that only an `ACTIVE` account holds a session: activation on verification, and suspension and deactivation delete every `sessions` row in the same transaction. Therefore "the request carries a valid session" already implies `ACTIVE`. An `if (status !== 'ACTIVE') throw` in the profile service would be unreachable-through-the-API code and would contradict that spec's scenario "Suspension needs no user action … the refusal does not require a separate status check per endpoint". The profile service resolves the session and writes; nothing else.

3. **`MeResponse` is a new standalone schema, not an `AccountSummary` extension.**
   `AccountSummary` is returned by sign-in; adding profile properties to it would make that response untruthful. `allOf: [AccountSummary, …]` is **not** usable either, because `AccountSummary` declares `additionalProperties: false`; under OpenAPI 3.1 the composition would forbid the very properties being added. `MeResponse` therefore restates the six account properties (referencing `AccountStatus`) and adds `student_profile` and `mentor_profile`, both nullable. `AccountSummary` is untouched. The six-property duplication is deliberate and is asserted by the contract test.

4. **`truncateAll` must learn the new tables.**
   `student_profiles` and `mentor_profiles` cascade from `users`, but `fields` does not (its creator reference is `set null`). Without adding `fields`, `mentor_fields`, `student_field_interests`, `availability_*`-free but still explicit profile tables to the truncation list, a field created by one test survives into the next and breaks the unique-slug assertions. The list becomes explicit for every new table.

5. **The new controller joins the middleware list.**
   `app.module.ts` applies `RequestIdMiddleware` per controller. `ProfilesController` and the extended `MeController` (already listed) must be present, or profile requests lose `request_id` and problem responses report `unattributed`.

## Decisions

### D1 — Schema and key types

New tables, all with `uuid("id").primaryKey().defaultRandom()` unless noted:

| Table | Columns added by this change |
|---|---|
| `fields` | `name text`, `normalized_slug citext` unique, `created_by_user_id text?` → `users.id` `set null`, `status field_status` default `ACTIVE`, timestamps |
| `student_profiles` | `id`, `user_id text` unique → `users.id` `cascade`, `goals text`, `primary_field_id uuid` → `fields.id` `restrict`, `languages text[]` default `{}`, timestamps |
| `student_field_interests` | `student_profile_id uuid` → `student_profiles.id` `cascade`, `field_id uuid` → `fields.id` `restrict`, composite PK |
| `mentor_profiles` | `id`, `user_id text` unique → `users.id` `cascade`, `primary_field_id uuid` → `fields.id` `restrict`, `status mentor_status` default `DRAFT`, `headline`, `bio`, `expertise_summary`, `scope_statement` (`text`), `languages text[]` default `{}`, `weekly_capacity smallint`, timestamps |
| `mentor_fields` | `mentor_profile_id uuid` → `mentor_profiles.id` `cascade`, `field_id uuid` → `fields.id` `restrict`, composite PK |

Enums: `field_status` (`ACTIVE`, `RETIRED`) and `mentor_status` (`DRAFT`, `PENDING`, `ACTIVE`, `SUSPENDED`, `REMOVED`). `mentor_status` lands now with default `DRAFT`; nothing transitions it in this change. `availability_context` is documented in `data-model.md` now but its table is deferred, so the follow-up needs no enum migration.

`weekly_capacity` gets a DB check `>= 1` only. The upper bound is policy (`MENTOR_WEEKLY_CAPACITY_MAX`), so encoding 5 in DDL would require a migration to change a number. Alternative rejected: check both bounds in DDL.

The `citext` `customType` and the `timestamps` helper move from `trust.ts` into `db/schema/columns.ts` and are imported by both files. Alternative rejected: copy six lines into a second file — two definitions of the same column type drift.

Columns the data model lists but this change does **not** create: `access_mode` (follow-up `profile-availability-and-access-mode`), `onboarding_status`, `orientation_completed_at`, `activated_at` (#5), `current_role_title`, `current_organization` (#5), `student_profiles.onboarding_completed_at` (#5). `data-model.md` gains a note naming the owning change for each, so the doc stays truthful without shipping dead columns.

**Duplicated primary field resolved:** `mentor_profiles.primary_field_id` is the single source of truth, mirroring `student_profiles.primary_field_id`. `mentor_fields` stores **additional** fields only and loses `is_primary`. Alternative rejected: keep `is_primary` and derive the primary from the join table — two writers of one fact, and a profile could end up with zero or two primaries.

### D2 — Field normalization

```
normalizeFieldName(input):
  s = input.normalize("NFKC").trim()
  s = s.replace(/[\s_-]+/gu, " ")
  s = s.toLowerCase().trim()
```

- `NFKC` folds compatibility forms (`ＡＩ` → `AI`), which matters because users type on mixed keyboards.
- Case-folding is locale-independent `toLowerCase()`; Bangla has no case, so the name survives intact. No ASCII transliteration is attempted.
- Punctuation is not a separator, so `C++` and `C` stay distinct.
- The stored `name` is the first trimmed submission for that slug. A later variant reuses the row and does not rewrite the display name (stable, and avoids "AI" → "ai" churn). Rename is Phase 1b (D-23).

Alternatives rejected: ASCII slugify (Bangla names collapse to `""` and collide on the unique index); trim-only (duplicates on case); storing the raw name with no slug (no dedupe, and matching would need string comparison).

Validation is not inside the normalizer: `normalizeFieldName` is pure string transformation; the profile rules check the trimmed length (1–100, mirroring the documented display-name bound) and reject an empty slug.

### D3 — Fields are created by a profile save

A save accepts field **names**, not ids. Inside the write transaction, each name is upserted:

```
insert into fields (name, normalized_slug, created_by_user_id)
values (...)
on conflict (normalized_slug) do update set normalized_slug = excluded.normalized_slug
returning id
```

The `do update` is a deliberate no-op: `do nothing` does not return the conflicting row, and a catch-and-select on `23505` would abort the surrounding transaction. Two concurrent saves therefore both succeed and both get the same id.

Alternative rejected: `POST /v1/fields` plus id-based profile input — an extra endpoint, an extra contract surface, and a window where a field exists with no profile. Not needed for pick-or-create: `GET /v1/fields` supplies the picker.

### D4 — `/v1/me` response shape

`MeResponse` = the six `AccountSummary` properties plus:

```
student_profile: null | {
  goals, primary_field: { id, name },
  interest_fields: [{ id, name }], languages: [string]
}
mentor_profile: null | {
  headline, bio, expertise_summary, scope_statement,
  primary_field: { id, name }, fields: [{ id, name }],
  languages: [string], weekly_capacity: integer
}
```

Profile rows are read with at most two queries per role (profile, then its field join), not a per-row loop; a user has at most one profile per role. No profile id or timestamp is exposed — nothing consumes it, and it is not an identifier anyone should cache.

### D5 — `account_status` in a profile body is ignored, never rejected

`profiles/profile-bootstrap` requires no error when a request submits `account_status` with a profile save. `SEC-API-1` requires unknown fields to be rejected. The narrow resolution: the request readers extract named properties, exactly as `auth.controller.ts` already does, so `account_status` is accepted and ignored. The OpenAPI body schema keeps `additionalProperties: false` for the documented contract and lists `account_status` as a documented property whose value the server ignores.

Strict unknown-key rejection across API endpoints is a **pre-existing gap** (register and sign-in already ignore unknown keys); this change does not widen it and does not fix it. Recorded as debt in the handoff. Alternative rejected: strict rejection only on the new endpoints — two validation styles in one API, and `account_status` would need a bespoke exception anyway.

### D6 — Validation is pure and atomic

`packages/domain/src/profiles.ts` exposes `validateStudentProfileInput` and `validateMentorProfileInput`, returning a list of human-readable problems (empty means valid). The service maps a non-empty list to `IdentityError("VALIDATION_ERROR", …)`, which the existing `ProblemDetailsFilter` already renders as `422 VALIDATION_FAILED`. No new error code, no new filter branch.

All validation runs **before** the transaction opens, so a refused save cannot leave an orphan field. The transaction then: upsert fields → upsert profile (`on conflict (user_id) do update`) → delete join rows → insert join rows. The spec's orphan-field scenario is asserted anyway, because a future refactor could move validation inside.

Alternative rejected: a `ProfileError` class — duplicates the filter mapping and the contract's error enum.

### D7 — Capacity constant, no configuration table

`MENTOR_WEEKLY_CAPACITY_MAX = 5` lives in `packages/domain/src/profiles.ts`, labelled **Proposed default** in code and docs, with a `D-xx` row in `decision-log.md`. Sprint 7 (`config_versions`) replaces the constant; until then, a single named constant beats an env var for a value that cannot change without a product decision. Alternative rejected: `.env` variable — the value is policy, not deployment configuration.

### D8 — `If-Match` dropped

Both profile PUTs are last-write-wins. The endpoint is self-service, single-owner, and is edited from one browser; there is no second writer to lose against. `api-contracts.md` §5.1 loses the `If-Match` mentions, and a `D-xx` row records the reason. No version column, no `ETag`. Alternative rejected: `updated_at`-based `ETag` — new contract surface, new client behavior, and no user-visible benefit for one writer.

### D9 — Web surface

One client page at `/profile` with a student section and a mentor section; each section loads its current values from `/api/me` and saves with its own PUT. The field control is a native `<input list="…">` fed by `/api/fields`; typing a new name creates the field on save. No combobox dependency, no client-side validation library — the server is the only validator, and the page shows the returned `detail`.

`proxyJson` in `apps/web/lib/bff.ts` currently hardcodes `method: "POST"`; it gains an optional `method` parameter (default `POST`) so the PUT routes reuse it instead of copying the forwarding logic.

Alternative rejected: two separate pages — four BFF routes, two navigations, more strings, no benefit for the Sprint 1 demo.

### D10 — Contract and error surface

New paths: `GET /v1/fields`, `PUT /v1/me/student-profile`, `PUT /v1/me/mentor-profile`. No new problem codes; every failure is `401 UNAUTHENTICATED` or `422 VALIDATION_FAILED`. `GET /v1/fields` returns `{ fields: [{ id, name }] }`, sorted by name, active only, unpaginated at pilot scale (noted in `api-contracts.md`).

## Risks / Trade-offs

- **The exact-key-set test breaks by design** → update `identity.integration.test.ts:701-717` to the new full key set and keep the "no other user's data" assertion; do not delete the key-set assertion.
- **Field display name is first-wins** → a typo is permanent until the Phase 1b rename tool. Accepted; the alternative (last-wins) creates silent churn in a shared taxonomy.
- **`GET /v1/fields` is unpaginated** → at pilot scale the taxonomy is small; pagination is Phase 1b if the list grows.
- **`SEC-API-1` unknown-field rejection is still unmet API-wide** → recorded as debt, not widened here (D5).
- **`toLowerCase()` on Turkish dotted `I`** → locale-independent mapping is deterministic and consistent between insert and lookup; a user-visible Turkish edge case is possible but the product is English/Bangla-only.
- **No per-field text length limit** → the HTTP body limit bounds the payload; adding per-field maxima would invent product policy not present in the FRs.
- **Deferred columns are absent from the database** → `data-model.md` names the owning change for each so the doc and schema cannot silently disagree.

## Migration Plan

1. Add schema files, run `pnpm --filter api db:generate`, review `0002_*.sql` by hand (FK types, `citext`, checks, composite PKs), and commit the generated snapshot with it.
2. No backfill and no existing row is read or rewritten. `test/support/database.ts` replays every migration from an empty schema, so the integration suite proves the migration from scratch.
3. Docs updated in the same branch (the docs gate blocks archive).
4. Rollback: revert the branch. Locally, dropping the new tables and enums restores the previous shape; `users`, `sessions`, `consent_records`, and `audit_logs` are untouched. No deployment exists, so there is no production rollback path to design.

## Open Questions

None. The capacity maximum, `If-Match`, and the field input shape were decided before this design was written (D7, D8, D3).
