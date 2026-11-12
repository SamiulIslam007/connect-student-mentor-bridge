# Design: break-glass-thread-read

## Context

See `proposal.md` for motivation. Only the state that shapes the approach is recorded here.

**Repository snapshot (verified 2026-11-11, re-check at apply).**

- `main` is at `6e88994`, clean; no active change; 35 specs valid before this round. No gate was run in this propose round.
- `services/api/src/mentorships/mentorships.controller.ts` serves `@Get(":id")` (line 89), `@Get(":id/messages")` (line 126), `@Post(":id/messages")` (line 144), `@Post(":id/sessions")` (line 160), `@Post(":id/complete")` (line 178), `@Post(":id/confirm-held")` (line 197) and `@Post(":id/cancel")` (line 207).
- `services/api/src/mentorships/` also holds `mentorship.service.ts` (the interface), `drizzle-mentorship.service.ts`, `mentorships.tokens.ts` and `mentorships.module.ts`.
- `services/api/src/reports/admin.controller.ts` is the established split for an admin-only surface: `PLATFORM_ADMIN` with `requiresMfa: true` on each route, and it is registered separately from the participant controller.
- `audit_logs` (`services/api/src/db/schema/trust.ts`): `action` is `text` not null (line 83), `breakGlass` is a boolean defaulting to false (line 88), `reason` is nullable text (line 89), and `object_type` and `object_id` are text. `appendAuditEntry` (`services/api/src/identity/audit-log.ts`) accepts `reason` and `metadata` and documents that metadata must never hold a raw email, password, hash or token.
- `AuditAction` is a closed union; the `audit_logs.action` column being text means a new member needs no migration.
- `services/api/test/authorization-matrix.test.ts` holds `MATRIX` rows of the shape `{ route, access, mutating, body }` and a controller list plus a provider-token list; `services/api/test/request-validation.integration.test.ts` keeps its own controller and provider lists.
- `packages/contracts/src/body-keys.ts` keys on the colon form, for example `POST /v1/admin/accounts/:id/suspend`, parity-tested against the OpenAPI request schemas.
- The report queue projection is read in `services/api/src/reports/drizzle-reports.service.ts` and rendered by `apps/web/app/admin/reports/page.tsx`, whose `ReportRow` interface carries `id`, `target_kind`, `target_id`, `reason`, `details`, `status`, `created_at`.
- `apps/web/app/api/admin/reports/route.ts` is the BFF read for that page; the resolve action lives at `apps/web/app/api/admin/reports/[id]/resolve/route.ts` (six `../` segments from that depth).

**Library behaviour confirmed with context7 (2026-11-11):** `@nestjs/throttler` 6.7.1 supports the named `@Throttle({ default: ... })` form this repo already uses, so the new write route takes the existing `write` bucket with no new wiring.

## Goals / Non-Goals

**Goals**

- A moderator can read the conversation a report refers to, with a reason on the record before the content is returned.
- One projection, shared with the participant read, so the admin never sees a different thread shape.
- The refusals are exhaustive and tested one by one: missing reason, non-admin, no second factor, unknown mentorship.

**Non-Goals**

- No evidence files, no write access, no search, no export.
- No notification to the participants.
- No new table, column, enum value or migration.

## Decisions

Owner decisions keep the numbers the brief fixed (D-120 to D-124). Decisions taken while writing carry `R` numbers.

### D-120. A POST with a required reason, at most 1000 characters (owner decision)

`POST /v1/admin/mentorships/{id}/break-glass-read` with a body carrying `reason`, required, trimmed, 1 to 1000 characters, and a validation message that states the bound. Alternative rejected: a GET with the reason in the query string, which leaks a moderator's free text into access logs and proxy logs, and which reads as a pure read when it is not one: the call writes an audit row.

### D-121. The actor, the order, and the refusals (owner decision)

`PLATFORM_ADMIN` with an enrolled second factor. The order is: authorize, validate the body, resolve the mentorship, write the audit row, read the content, respond. A missing or empty reason is `422` with no audit row and no content; a non-admin is `403 ROLE_REQUIRED`; a platform admin without a second factor is refused before any write; an unknown mentorship id is `404` with no audit row. The participant's own read is unchanged. Alternative rejected: allowing `INSTITUTION_ADMIN`, which the requirement does not grant and `FR-PROF-04` argues against.

### D-122. Messages plus the agreement and the sessions, never outcome text (owner decision)

The response carries the thread messages oldest first, the agreement (cadence, weeks, goal, per-party acknowledgement timestamps) and the session records (time, duration, meeting link, held confirmations), using the participant read's own projection. No outcome text, no profile text, no email address. Alternative rejected: messages only, which leaves a reviewer unable to see the session a report is about; and everything, which would pull outcome and profile content into a moderation read the requirement does not authorise.

### D-123. No participant notification; the audit row is the record (owner decision)

Participants are not told that their thread was read. A debt row records the gap so the decision is visible and revisitable. Alternative rejected: notifying both participants, which is the more defensible product long term but is new behaviour `FR-NOT-01` does not list as a trigger, and which needs its own template, its own queue path and a decision about disclosing a moderator's activity to a reporting user.

### D-124. No migration, one new action member (owner decision)

`audit_logs.action` is text, and `break_glass` and `reason` already exist, so the audit write needs no schema change. `AuditAction` gains `THREAD_BREAK_GLASS_READ`. Alternative rejected: a new `break_glass_reads` table, which would duplicate what the audit log already records.

### R1. The report queue entry gains one nullable mentorship id

The admin page needs the mentorship id to form the route, and a report row carries only the target's id (a message id). The queue projection therefore gains one nullable field, populated only when the target is a message, and the page renders the action only when it is present. Alternative rejected: asking the moderator to paste a mentorship id, and a second lookup route from a message id to a mentorship, both of which are more moving parts than one nullable field.

**Consequence:** the report-queue schema in `packages/contracts/openapi.yaml` gains the property, and any test that freezes its key set must be updated in the same change. The task names the grep before the suite runs.

### R2. The audit row names the mentorship, and the reason is the reason column

`object_type` is `mentorships`, `object_id` is the mentorship id, `break_glass` is true, `reason` is the validated text, and metadata carries the message count returned and nothing else. The reason goes in its own column rather than in metadata, because that column exists for exactly this. Alternative rejected: metadata-only, which would hide the reason from any reader of the audit table.

### R3. The route takes the write bucket and answers with no-store

`@Throttle({ default: RATE_LIMITS.write })`, because the call appends an audit row, and `Cache-Control: no-store` on the response, because a moderation read of a private conversation must not be cacheable anywhere. Alternative rejected: the default bucket, which would let a scripted read fan out faster than any other write.

### R4. The route lives in its own controller, in the existing module

`services/api/src/mentorships/admin-thread.controller.ts`, registered in `mentorships.module.ts`, following `services/api/src/reports/admin.controller.ts`. The participant controller keeps its own routes untouched, so the participant read cannot accidentally inherit the admin guard or the reverse. Alternative rejected: a method on `MentorshipsController`, which would put two different authorization models in one class and make the MATRIX row ambiguous.

### R5. The web action is a disclosure on the row, not a new page

`apps/web/app/admin/reports/page.tsx` gains, for a row whose target is a message and whose mentorship id is known, a "Read thread" control that reveals a required reason input and then renders the returned messages and the agreement and session summary inline, with a close control. No new page, no new route in the web app beyond the BFF call. Stitch is not connected for this run, so no Stitch task exists; the control follows the page's existing suspend form pattern, and `design.md` records that Stitch was not used.

## Acceptance criteria

1. A platform admin with an enrolled second factor and a reason reads the thread of a mentorship they are not part of, and the response carries messages oldest first, the agreement and the session records, with no outcome text and no profile text.
2. Exactly one audit row exists for that read, with `break_glass` true, the reason, the acting account and the mentorship id, and it exists before the content is returned.
3. A missing, empty or over-1000-character reason answers `422` naming the field, writes no audit row and returns no content.
4. A non-admin answers `403 ROLE_REQUIRED`; a platform admin with no enrolled second factor is refused before any write; both write no audit row and return no content.
5. An unknown mentorship id answers `404` and writes no audit row.
6. A participant's own `GET /v1/mentorships/{id}/messages` is unchanged, including its `404` for a third account.
7. The response carries `Cache-Control: no-store`.
8. The report queue entry exposes the mentorship id only for a message target, and the page offers the action only there.

## Assumptions

1. One platform admin per review is enough; there is no second-operator check on a break-glass read, and none is required by the FR.
2. The participant projection is safe to reuse: it discloses message bodies and author ids to a participant already, and the admin is a strictly wider actor by policy, not by data shape.
3. Audit rows written by a failed read after the audit write are acceptable and desirable: they record an attempt that got past authorization.
4. A nullable queue field is additive for existing clients, which read named keys rather than positional data.

## Risks / Trade-offs

- This is the most sensitive change of the round: it widens who can read a private conversation. Mitigation: one actor type, a second factor, a mandatory reason, an audit row before content, a fixed projection, a frozen key set, and an independent second review pass over the diff.
- The queue projection changes shape, which breaks any key-set test that enumerates it. Mitigation: the grep is a task step before the suite, and the affected files are named.
- A moderator may read a thread for a reason that later looks thin. Mitigation: the reason is mandatory and audit-visible; the sampling and review of admin actions is `FR-ADM-03`, still open (DEBT-29).
- Reusing the participant projection could pull a field the admin should not see. Mitigation: the payload test asserts the exact key set and the absence of outcome, profile and email text.

## Open Questions

- Whether participants should eventually be told (D-123, recorded as a debt row rather than decided). Revisit with the privacy notice and `FR-CONS-02`.

## Migration Plan

None.
