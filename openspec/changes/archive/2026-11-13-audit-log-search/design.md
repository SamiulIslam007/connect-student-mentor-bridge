# Design: audit-log-search

## Context

**Repository snapshot (re-verified 2026-11-13 at apply).**

- Base: `main` at `9132af4` plus the `ui-state-sweep` merge; `openspec validate --all --strict` passes. No migration in this change.
- `audit_logs` (`services/api/src/db/schema/trust.ts` lines 75-96): `id`, `occurred_at`, `actor_user_id` (nullable, restrict), `actor_role` default `ANONYMOUS`, `action` text not null, `object_type` text not null, `object_id` nullable, `request_id` not null, `break_glass` boolean, `reason` nullable, `metadata` jsonb, `prev_hash`, `hash`; indexes on `(object_type, object_id, occurred_at)` and `(actor_user_id, occurred_at)`. There is no index on `action` and none on `occurred_at` alone.
- Grants: `GRANT SELECT, INSERT ON TABLE "consent_records", "audit_logs" TO connect_app` (`services/api/drizzle/0000_baseline.sql` line 148), so the read needs no grant change and the append-only rule stands.
- No route anywhere declares `audit` (`grep -rn "audit" services/api/src --include=*.controller.ts` returns only the break-glass comment), so the read is genuinely new.
- `AuditAction` is a closed union in `services/api/src/identity/audit-log.ts`; the column is text, so the filter compares strings and accepts any value the union lists plus historical ones.
- The admin-surface pattern to copy is `services/api/src/reports/admin.controller.ts` (guard, throttle) with `apps/web/app/admin/reports/page.tsx` (state machine, filters, keyset) and `apps/web/app/api/admin/reports/route.ts` (BFF read).

## Goals / Non-Goals

**Goals**

- A reviewer can answer "who acted on this object, when, and why" from the browser.
- The projection is minimal and frozen by a test.
- No migration, no write-path change, no new audit behaviour.

**Non-Goals**

- No free-text search, no export, no retention, no meta-audit.
- No index changes unless the measurement in task 1.4 proves they are needed.

## Decisions

The brief fixed the projection and the actor; decisions taken here carry `R` numbers.

### R1. One GET with five optional filters and keyset pagination

`GET /v1/admin/audit?actor=&action=&object_type=&object_id=&from=&to=&cursor=&limit=`, ordered by `occurred_at` descending then `id` descending, default limit 50, cap 100. Alternative rejected: offset pagination, which drifts as rows are appended, and a POST search body, which makes a read a write for the request-validation registry's purposes and puts filters in a body where the allowlist has to grow.

### R2. The projection is the row minus `metadata`, `prev_hash` and `hash`

Returned: `id`, `occurred_at`, `actor_user_id`, `actor_role`, `action`, `object_type`, `object_id`, `request_id`, `break_glass`, `reason`. The admin page offers free-text filters rather than a duplicated action list, so the API stays the only place the enum lives; a refused value comes back as its `422` detail. Alternative rejected: returning the row, which would disclose `metadata` — a field whose own comment says it carries no secrets but which no requirement authorises publishing, and which would make the payload's key set a moving target as writers add keys.

### R3. An unknown filter value is a `422`, not an empty page

`action` is validated against the union, `object_type` against the exact values the writers store (which include upper-case ones), `actor` against the identity library's text id shape (`[A-Za-z0-9_-]{1,64}` — account ids are not uuids, corrected at apply), and `limit` against 1 to 100; a bad value is `422 VALIDATION_FAILED` naming the parameter. Alternative rejected: an unrecognised `action` returning an empty page, which silently hides a typo in an incident review.

### R4. Reading the audit log is not audited

No row is written by the read. Alternative rejected: a `AUDIT_LOG_READ` row per call, which would let a reader inflate the table they are reviewing and would add a write to a route whose value is that it is a pure read. The consequence — a reviewer's reading is not itself on the record — is stated in the capability spec and in the register's annotation.

### R5. No new index; the bound is recorded

The actor and object filters use the two existing indexes; the action filter can scan. At pilot volume (thousands of rows) that is invisible, and adding an index to an insert-heavy append-only table for a filter used in incident review is the wrong trade now. `shortcut: action filter is a scan, add an index when audit_logs passes roughly a million rows` is the comment, and `DEBT-58` states the same bound.

### R6. The page is `/admin/audit` with filters in the URL

Filter state lives in the query string so a reviewer can hand the link to a colleague and land on the same rows. Alternative rejected: in-memory filter state, which makes an incident handover a set of instructions instead of a link.

## Assumptions

1. `object_type` values are the writers' own set (`users`, `mentorships`, `outcomes`, `institutions`, `role_assignments`, `consent_records`, `privacy_requests`); the filter accepts exactly those and the task greps the writers to fix the list.
2. A reason may contain a person's words about an incident but never a reporter's identity; that rule is already stated for the write path and is not re-litigated here.
3. The admin page needs no new permission model: the existing admin links are gated on the same role, and the API enforces the role regardless.

## Acceptance criteria

1. `grep -n "audit_logs" services/api/src/audit/drizzle-audit.service.ts` shows one select with no `metadata`, `prev_hash` or `hash`.
2. The integration test freezes the payload's exact key set and asserts an unknown `action` is `422`.
3. A mentor, an institution admin and a platform admin without a second factor are each refused, and no row is written by any of the three.
4. Ordering is stable across two pages while new rows are appended between them.
5. `git diff --name-only` contains no file under `services/api/drizzle` and no grant change.

## Risks

- The `action` allowlist can fall behind the union: the task derives it from the union at build time rather than hand-listing it.
- A wide date range on a large table would be slow; the cap and the default range-less read are the mitigation, and R5 states the bound.
