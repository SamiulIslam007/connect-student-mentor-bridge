# Design: consent-purposes-and-mentor-agreements

## Context

**Repository snapshot (verified 2026-11-12, re-check at apply).**

- `main` is at `3c8c571`, clean, 37 specs valid before this round; no gate run in this propose round. CI run `43208893367` succeeded on that commit.
- `consent_records` (`services/api/src/db/schema/trust.ts` lines 57-73): `id`, `user_id` not null with `onDelete: restrict`, `purpose`, `action`, `document_version` not null, nullable `institution_id` with `onDelete: restrict`, `occurred_at`, and one index on `(user_id, purpose, occurred_at)`.
- The enum already holds all five purposes (`services/api/src/db/schema/enums.ts` lines 29-35): `TERMS`, `PRIVACY_NOTICE`, `VOLUNTEER_AGREEMENT`, `COMMUNITY_GUIDELINES`, `INSTITUTION_DATA_SHARING`; `consent_action` holds `GRANTED` and `WITHDRAWN`. **No enum change is needed.**
- `grant_profile_tables` grants `SELECT, INSERT` on `consent_records` only (`services/api/drizzle/0000_baseline.sql` line 148), so the append-only rule is already enforced by privilege.
- Registration writes the two consents: `services/api/src/identity/auth.controller.ts` lines 76-86 refuses a body without `consent_accepted: true` and then writes the rows with `CONSENT_DOCUMENT_VERSION`.
- The activation predicate lives in `services/api/src/onboarding/mentor-activation.ts`: it reads `users.twoFactorEnabled` (line 21) and returns `mfaEnrolled` (line 41), with no consent input at all.
- `mentor_profiles` has `onboarding_status`, `status`, `activated_at`; it has no orientation column. The status sync runs on profile save, on MFA changes and on affiliation decisions.
- The spec `openspec/specs/profiles/mentor-onboarding/spec.md` holds a requirement whose header is "Activation is not yet gated on the agreements" (line 52) with one scenario (line 56), plus the predicate requirement at line 23 with five scenarios (lines 27, 32, 37, 42, 47).
- `apps/web/app/terms/page.tsx` and `apps/web/app/privacy/page.tsx` render the published documents session-free; `apps/web/lib/strings.ts` carries `CONSENT_DOCUMENT_VERSION`.
- The demo seed creates an `ACTIVE` mentor and two admins (`services/api/src/db/seed/`).

## Goals / Non-Goals

**Goals**

- Five purposes, each with a screen, each recorded append-only with a document version.
- A mentor cannot reach `ACTIVE` without the volunteer agreement, the community guidelines and the orientation acknowledgement.
- A student can grant and withdraw institution sharing, and a withdrawal changes nothing else.

**Non-Goals**

- No quiz, no document authoring, no consent report, no institution read of student data.
- No change to the registration refusal, the documents, or `CONSENT_DOCUMENT_VERSION`.
- No data migration: the column is additive and every existing `ACTIVE` profile keeps its status.

## Decisions

The brief fixed the scope but no `D` numbers; decisions taken here carry `R` numbers.

### R1. One signed-in consent route pair, not five bespoke routes

`GET /v1/me/consents` returns every purpose with its current document version and the caller's latest state; `POST /v1/me/consents` takes `{ purpose, document_version, action }` and appends one row. Alternative rejected: a route per purpose, which multiplies the four hand-maintained registries by five for one behaviour. The purpose enum is validated in the body, so an unknown value is `422`.

### R2. The orientation is a column and an audit row, not a consent purpose

`mentor_profiles.orientation_completed_at` plus an `ORIENTATION_COMPLETED` audit entry written by the same request that accepts the volunteer agreement. Alternative rejected: modelling it as a sixth consent purpose, which would need an enum migration and would let a user "withdraw" their orientation, which has no meaning.

### R3. Re-acceptance is a signal on the own read, never a refusal

`GET /v1/me` gains a `consents` block carrying, per purpose, `current_version` and `accepted_version`. The web shows a banner linking to `/consent` when they differ. No route refuses a stale version. Alternative rejected: a middleware that blocks writes until re-acceptance, which would lock a pilot user out of the product over a document edit and produce a support incident the requirement does not ask for.

### R4. `institution_id` carries the institution for a data-sharing consent

The column exists and is nullable, so a sharing consent names its institution and a withdrawal names the same one; the pair is what makes the grant per institution. Alternative rejected: a single global sharing flag, which FR-CONS-02 does not describe and which would make a withdrawal from one institution silently withdraw from all.

### R5. The predicate takes consents as an input, so it stays pure

`mentor-activation.ts` gains `hasVolunteerAgreement`, `hasCommunityGuidelines` and `orientationCompleted` inputs and keeps returning the same shape; the drizzle service fills them in the same query as today's MFA read. Alternative rejected: reading consents inside the predicate, which would make it untestable without a database and would put two data sources in a pure function.

### R6. Grandfathering is the absence of a backfill

The migration adds a nullable column and nothing else. An `ACTIVE` profile keeps its status until one of the existing re-evaluation events runs; when it does, a profile with no agreements returns to `PENDING` exactly as the requirement states. Alternative rejected: a backfill that marks every active mentor as having consented, which would write consent records nobody gave — the one thing an append-only consent table must never contain.

### R7. The screen is one page with three sections

`/consent` renders the purposes the caller can hold (mentor: volunteer agreement, community guidelines; student: institution sharing), each with the document title, its version, an accept and a withdraw. The page calls one BFF route. Alternative rejected: a page per purpose, and a modal per purpose — both add surface without adding a behaviour.

### R8. `docs/pilot-plan.md`'s Gate 2 consent line names the page

The Gate 2 checklist says "Consent screens live for the five MVP purposes"; the task rewrites that line to name `/terms`, `/privacy` and `/consent` so the gate can be checked by opening three URLs. Alternative rejected: leaving it prose, which is how the gap survived this long.

## Assumptions

1. The volunteer agreement applies to mentors only and the community guidelines to every user; the data-sharing consent applies to students. The brief states this; the register's FR-CONS-01 lists the purposes without naming roles.
2. One document version per purpose (`CONSENT_DOCUMENT_VERSION`) is enough for the pilot; a per-purpose version map is a later change.
3. An already-`ACTIVE` mentor profile may keep operating without the new consents until its next re-evaluation; the alternative (an immediate block) needs a product decision nobody has recorded, and R6 keeps the behaviour visible in the spec.

## Acceptance criteria

1. Five purposes can each be granted; `grep -n "purpose" services/api/src/db/schema/enums.ts` still shows five and the migration adds no enum value.
2. A mentor with Level 1, MFA, no volunteer agreement, or no community guidelines, or no orientation stays `PENDING`; with all of them it is `ACTIVE` with `activated_at` set once.
3. An already-`ACTIVE` mentor profile is untouched by the migration, asserted by reading the row before and after.
4. Withdrawing institution sharing appends one `WITHDRAWN` row and changes no `affiliations` row.
5. A stale document version produces the banner signal and no `4xx` on any other route.
6. The demo seed's mentor is `ACTIVE` after the seed runs.

## Risks

- The activation predicate has three existing callers (profile save, MFA change, affiliation decision); missing one leaves a mentor able to reach `ACTIVE` without consent. The tasks name the grep.
- `truncateAll()` in the test support does not know new tables; this change adds no table, but it does add a column, so the seed and the fixtures must set it where a mentor must be `ACTIVE`.

## Apply notes (2026-11-13)

- **R9. The routes live in their own controller, and `GET /v1/me` is untouched.** `consent.controller.ts` is a new controller in a new module, so `MeController` and `ProfilesController` gain no injected dependency and the fourteen hand-built test stacks that enumerate them stay as they are. R3's "the own read gains a `consents` block" would have meant touching all fourteen for one field the dedicated route already returns; the header banner reads `/api/me/consents` instead.
- **R10. Accepting a mentor document re-runs the activation funnel.** `POST /v1/me/consents` calls `syncMentorActivation` in the same transaction for the two mentor purposes. Without it an accepted agreement would wait for an unrelated trigger (an affiliation decision or a second-factor change) before it could activate the profile, which is a dead end for the only user action that exists for this purpose.
- **The three inputs are filled once, in the funnel.** Task 3.2 names every call site; filling them inside `syncMentorActivation` covers all six of them (the affiliation claim, the institution-admin decision, the role grant, and three second-factor paths) with one query, which is why no service file other than the funnel changed.
- **The blast radius was the fixtures, not the code.** Once the predicate demanded the agreements, every fixture that drove a mentor to `ACTIVE` stopped working: `attestation`, `requests`, `mentorship`, `outcomes` and `reputation` each build one through the API. `services/api/test/support/agreements.ts` grants the two consents and the orientation by email or id, and each `activeMentor`-shaped helper calls it before enrolling the second factor. That is the honest cost of a trust rule: the fixtures had been asserting a state the rule no longer allows.
- **`institution_id` is refused, not ignored, on another purpose.** A body that names an institution with `purpose: TERMS` is `422`, so a client cannot believe it recorded a sharing decision it did not make.
