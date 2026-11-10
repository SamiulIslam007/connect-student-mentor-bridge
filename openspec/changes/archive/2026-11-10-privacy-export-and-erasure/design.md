# Design: privacy-export-and-erasure

## Repository snapshot (verified 2026-11-10, re-check at apply)

- `main` at `1d19545`. Last migration is `0015_wealthy_red_ghost.sql`; **next free migration number is whatever `drizzle-kit generate` emits at apply time** — do not write a number into these artifacts.
- 28 tables today; `services/api/test/database.integration.test.ts:47` is named "the migrations create the twenty-eight tables and protect the ledger" and asserts the list, so adding one table renames that test.
- `services/api/test/support/database.ts:111` `truncateAll()` lists 21 table names; a new table referenced by `users` would be cascaded, but it is added to the list explicitly so a test can clean it deterministically.
- `services/api/src/db/schema/auth.ts`: `users.id text PK`, `users.name text NOT NULL`, `users.email text NOT NULL UNIQUE`, `users.image nullable`, `users.timezone text NOT NULL DEFAULT 'Asia/Dhaka'`, `users.status accountStatus NOT NULL`, `users.age18Plus boolean NOT NULL`, `users.anonymizedAt` nullable. `sessions`, `accounts` (`password`, tokens), `verifications`, `twoFactors` all reference `users` with `ON DELETE CASCADE`.
- `services/api/src/db/schema/profiles.ts`: every personal text column is `NOT NULL` — `student_profiles.goals`, `mentor_profiles.headline`, `.bio`, `.expertise_summary`, `.scope_statement`; `languages` is `text[] NOT NULL DEFAULT '{}'`.
- `services/api/src/db/schema/mentorships.ts`: `thread_messages.sender_user_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT`, `body text NOT NULL`, no `updated_at`. There is no other personal column on `thread_messages`.
- `services/api/src/db/schema/enums.ts:43` `mentor_status` = `DRAFT, PENDING, ACTIVE, SUSPENDED, REMOVED`. `services/api/src/profiles/drizzle-profiles.service.ts:320` returns `null` unless `row.status === "ACTIVE"`, and the directory filters the same way, so `REMOVED` is already a working exclusion.
- `services/api/src/identity/better-auth-identity.service.ts:997` already computes `createHmac("sha256", this.secret).update(email.trim().toLowerCase()).digest("hex")` for `signup_blocks.email_hash`; `this.secret` is the existing `BETTER_AUTH_SECRET`.
- `services/api/src/db/schema/trust.ts` holds `consent_records` and `audit_logs`; migration `0004_audit_fk_restrict.sql` made their `users` foreign keys `ON DELETE RESTRICT`.
- `trust/consent-and-audit-records` states: "user deletion SHALL be implemented as pseudonymization in the privacy change".
- Evidence files do not exist (`FR-OUT-02` unbuilt, DEBT-22), so "evidence files purged" is vacuous today.

## Goals

1. A user can obtain their own record as one document, with no secret in it.
2. A user can leave, and the ledger remains exactly as written and still resolvable.
3. Both actions are recorded, bounded, and throttled.

## Non-goals

Object storage and signed URLs; a background job; retention sweeping; `FR-CONS-02`; deleting the counterpart's content; an admin deletion queue or a cooling window.

## Decisions

### D1: The tombstone uses placeholders, not `NULL`, and removes the mentor from discovery

Owner decision D1 names "set personal columns to NULL". The schema does not allow that: `users.name`, `users.email`, and every personal profile text column are `NOT NULL`, and `thread_messages.sender_user_id` is `NOT NULL` with a `RESTRICT` foreign key. Setting `NULL` would fail at the first statement. The implementation therefore replaces each personal value with a neutral placeholder of the same type, and the exact column set is:

| Table | Action |
|---|---|
| `users` | `email` → the existing HMAC-SHA256 hash; `name` → `Deleted user`; `image` → `NULL`; `last_seen_at` → `NULL`; `status` → `ANONYMIZED`; `anonymized_at` → now |
| `accounts` | `password`, `access_token`, `refresh_token`, `id_token`, `scope` → `NULL`; `account_id` → placeholder. The rows are kept so the provider link does not silently re-create an account |
| `sessions` | every row deleted |
| `two_factors` | every row deleted (the secret and the backup codes are credentials) |
| `student_profiles` | `goals` → `''`; `languages` → `'{}'` |
| `mentor_profiles` | `headline`, `bio`, `expertise_summary`, `scope_statement` → `''`; `languages` → `'{}'`; `status` → `REMOVED` |
| `thread_messages` | `body` → the tombstone string, for the rows this user wrote |
| everything else | untouched: `affiliations`, `role_assignments`, `availability_windows` (deleted — a schedule is personal and has no ledger role), `student_field_interests`, `mentor_fields`, `mentorship_requests`, `mentorships`, `mentorship_sessions`, `outcomes`, `outcome_events`, `verification_records`, `reputation_events`, `field_impact_snapshots`, `consent_records`, `audit_logs`, `institutions`, `fields`, `outbox_events`, `signup_blocks` |

`mentor_profiles.status = REMOVED` is load-bearing, not cosmetic: the directory and the single-mentor read both key on `status === "ACTIVE"`, and neither joins `users.status`, so without it a deleted mentor would keep appearing with an empty headline.

- Rejected: hard deletion with a cascade. `RESTRICT` on the ledger and on `thread_messages.sender_user_id` refuses it, and a cascade would destroy counted outcomes, which the ledger rule forbids.
- Rejected: moving ledger rows to a fresh opaque subject id. It writes to the ledger in a change whose whole point is not writing to it.

### D2: The message body is rewritten, and that is the one sanctioned writer

`mentorship/thread-and-sessions` says a message "SHALL NOT accept attachments or edits", and its scenario "Messages are not editable" asserts that an update request returns `404` because no such route exists. This design reads that as *no participant edit path*: the route rule is untouched, and erasure is a system write. Rewriting the body is required, or the deleted user's prose survives inside another person's thread and the erasure is fiction. The exception is written into the new capability's requirement and stated in the handoff so the owner can escalate it into a MODIFIED delta for that capability if they read the sentence differently.

- Rejected: leaving message bodies intact. It keeps a full conversation written by a deleted person readable by their counterpart, which fails the erasure the change exists to deliver.

### D3: The export is one synchronous JSON document with a fixed allowlist

Tables: `users` (no password), `accounts` (provider name only), `sessions` (id, created and expiry, no token), `consent_records`, `audit_logs` where the user is the actor or the object, `affiliations`, `availability_windows`, `student_profiles` + `student_field_interests`, `mentor_profiles` + `mentor_fields`, `role_assignments`, `mentorship_requests` sent and received, `mentorships`, `thread_messages` **written by the caller only**, `mentorship_sessions`, `outcomes` reported by the caller, `outcome_events` and `verification_records` for those outcomes, `privacy_requests`. Every section is read in one repeatable-read transaction so the document is consistent.

- Rejected: object storage plus a signed URL (FR-PRIV-01's literal wording). It would add the first S3 client, a lifecycle, and an expiry job for a document the user can receive directly. Recorded as an owner narrowing and as a debt row for the signed-URL depth.
- Rejected: a background job with a completion email. There is nothing to wait for at pilot volume.

### D4: One email-hash function, shared rather than copied

The HMAC lives today as a private method on the identity service. It is extracted to a small module taking `(secret, email)` and used by both the identity service and the new privacy service; the secret is read from the same config value (`BETTER_AUTH_SECRET`) in both places. The deleted email therefore hashes to the same value that `signup_blocks` would use, which is the correct behaviour: the address stays blocked for the 12-month window.

- Rejected: a new `PRIVACY_HASH_SECRET` environment variable. It adds a config surface and a deploy step for a value that must not differ between the two callers.

### D5: Deletion is confirmed by repeating the account email

`docs/api-contracts.md:408` currently says deletion "Requires recent re-authentication". No `IdentityService` method verifies a password without creating a session, so implementing that would mean either a new credential-check seam in the identity library or a second sign-in round trip. The body instead carries `confirm_email`, compared case-insensitively to the stored address; a mismatch is `422 VALIDATION_FAILED` naming the field.

- Rejected: a new `verifyPassword` seam on `IdentityService`. It reaches into the library's hashing for a confirmation step whose real job is preventing an accidental or cross-site delete, which `SameSite=Lax` plus a `POST` body already mostly does.
- Rejected: a 15-minute session-age rule. The session object does not carry its creation time, so it would add a query and a new failure mode for weaker protection than typing the address.

## Assumptions

- `ProblemDetailsFilter` maps `VALIDATION_ERROR` to `422 VALIDATION_FAILED` and `FORBIDDEN`-class identity errors to `403`, as it does today. Re-check at apply.
- No existing read selects `users.name` outside a session-scoped path, so the placeholder cannot appear in another user's view. `grep` for `users.name` at apply; the directory and the request detail are the two candidates.
- The pilot's export volume fits in memory (one user's rows, not a table scan). If apply finds a path where one user owns thousands of messages, the section is keyset-paged and concatenated rather than streamed.

## Risks

- **Unrecoverable loss if pseudonymization is wrong.** The first test written is the delete-with-ledger-intact case; it runs against a seeded counted outcome and asserts row counts, checksums of the ledger rows before and after, and that a join from each ledger row to its user still resolves. The erase runs in one transaction, so a failure cannot leave a half-erased row.
- The export is the first route that reads across nearly every table for one user; a forgotten `where user_id = …` would leak. Mitigated by a two-user fixture and an assertion that the second user's distinctive strings are absent from the document.
- `REMOVED` is an existing enum member that nothing writes today; a reader may assume it is unreachable. The design says why it is written here, and the spec scenario asserts the directory exclusion.

## Test order (written into tasks.md)

1. delete-with-ledger-intact (seeded counted outcome, before/after row identity)
2. deletion is one transaction (forced failure)
3. identifiers erased, `NOT NULL` intact, counterpart content untouched
4. deleted account cannot sign in, no live session, idempotent second request
5. export holds only the caller's rows and no secret
6. export refusals (suspended, anonymized, deactivated, signed out)
7. one `privacy_requests` row per request
8. database probe and table count
