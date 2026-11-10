# Design: trust-surfaces

## Repository snapshot (verified 2026-11-10, re-check at apply)

- `main` at `1d19545`; no active OpenSpec change; `openspec validate --all --strict` reports 31 passed, 0 failed.
- `pnpm lint` and `pnpm typecheck` exit 0 today. `pnpm test` was not run in the propose pass (it re-migrates `connect_test`), so no test total is claimed here; the declared test blocks counted statically are domain 92, web 117, contracts 19, api 197 = 425, matching the last archived change.
- `services/api/src/identity/better-auth-identity.service.ts:63` declares `export const CONSENT_DOCUMENT_VERSION = "2026-11"`; `:299` inserts the two `consentRecords` rows with purposes `TERMS` and `PRIVACY_NOTICE` and that version, inside the registration transaction, unconditionally.
- `packages/domain/src/identity.ts:41` `RegisterAccountInput` has `displayName`, `email`, `password`, `dateOfBirth`, `timezone?`, `requestId`. `services/api/src/identity/auth.controller.ts:71` maps the body to it with `textField`/`emailField` helpers.
- `packages/contracts/src/body-keys.ts` lists `POST /v1/auth/register` with six keys including the documented `account_status` no-op; `packages/contracts/test/openapi.test.ts` asserts that list equals the OpenAPI request schema properties.
- `apps/web/app` contains no `terms` or `privacy` route. `/sign-up` is a client component that posts `/api/auth/register`, which is a one-line `proxyJson` passthrough.
- `apps/web/lib/strings.ts` is the only string catalog (463 lines) and holds `signUp.*`, `account.*`, `mentors.*`, `impact.*` groups. `grep -rn "audited\|countersign" apps/web` returns nothing today.
- `apps/web/app/profile/impact-section.tsx` renders counts by field; `apps/web/app/mentors/page.tsx` renders directory cards. Neither shows a disclaimer.
- Capability `trust/consent-and-audit-records` owns "Consent recorded at registration" with scenarios "Registration writes consent records" and "Registration rejected writes no consent". Capability `trust/verified-badge-disclaimer` does not exist.

## Goals

1. A user cannot complete registration without explicitly accepting two documents, and the API enforces it, not just the form.
2. The stored consent version is the version the user could have read, from one constant.
3. Every badge and impact summary carries one disclaimer sentence that states what was confirmed and what was not audited.

## Non-goals

Legal text, re-acceptance on version change, `FR-CONS-02`, consent-management screens, header navigation changes, accessibility remediation.

## Decisions

### D1: Acceptance is a required body field, refused by the API

`RegisterAccountInput` gains `consentAccepted: boolean`; the controller reads `consent_accepted` from the body and refuses when it is not `true` with `IdentityError("VALIDATION_ERROR", …)`, which `ProblemDetailsFilter` already maps to `422 VALIDATION_FAILED` naming the field. The service writes the two consent rows only when the flag is true, inside the same transaction that creates the user, so a failure leaves neither.

- Rejected: gating only in the browser. A `POST` from any client would still create an account with consent rows for a document nobody opened; the web form is a convenience, the API is the trust boundary.
- Rejected: a separate `POST /v1/me/consents` call after registration. It adds a second round trip and a window in which a user exists without consent, which the current invariant ("no user without consent") would then have to tolerate.

The version stays `CONSENT_DOCUMENT_VERSION` and is not renamed; the pages read the same constant through a one-line re-export rather than repeating the literal, so a version bump changes one file.

### D2: The two documents are static pages, not stored rows

The pages are React server components with the text inline as catalog strings and the version interpolated. No `documents` table, no CMS, no migration.

- Rejected: storing document bodies in Postgres. Nothing reads them from the database, the text changes at the speed of a git commit, and a table would need a grant, a probe row, and a migration for no behaviour.

### D3: One disclaimer string, rendered in two places

A single catalog entry (`disclaimer.verified`) holds the sentence; the impact section and the directory card both render it. The test asserts the sentence is present on both surfaces and that the word "audited" appears only in the negation.

- Rejected: per-surface wording. Two sentences drift, and the trust claim is the one place where drift is a liability.

### D4: The docs-only group rides here, not in a fourth change

The owner's brief places it in this change's scope and also mentions it under change 3; this design follows the version written in full (this one) and states the conflict in the handoff so it can be moved with one edit. The group is additive: new `docs/known-debt.md` rows for the ten unbuilt or unmeasured Must requirements, a one-paragraph correction of the D-79 text, and the `Last reviewed` date. No requirement text is restated, so nothing here can collide at archive with the other two changes.

## Assumptions

- `ProblemDetailsFilter` continues to map `VALIDATION_ERROR` to `422 VALIDATION_FAILED` naming the offending field, as it does for the body allowlist today. Re-check at apply.
- No existing client posts registration outside the web BFF: `grep` finds only `apps/web/app/api/auth/register/route.ts` and the integration tests.
- The directory card and the impact section are the only two render sites of a badge or a counted summary in the MVP. If apply finds a third, it gets the same string.

## Risks

- The `account_status` no-op key and the new `consent_accepted` key must both appear in the contract, the allowlist, and the matrix test's probe body; a mismatch fails `openapi.test.ts` and `request-validation` parity at once. Mitigated by updating the three in one commit.
- Adding a required field to registration is the change's only breaking surface; the pilot has no third-party clients, and the web app ships in the same change.
