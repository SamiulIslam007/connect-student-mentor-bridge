# Tasks: trust-surfaces

Ordering note: no migration, no new dependency. Task group 1 must land first because the pages define the version the tests assert against; group 4 is additive documentation and can be reordered without breaking anything.

## 1. The consent documents exist as pages

- [x] 1.1 Re-export `CONSENT_DOCUMENT_VERSION` for the web app from one module (no second literal), and add the catalog strings: page titles, the draft notice, the four document sections, and the version label.
- [x] 1.2 Add `apps/web/app/terms/page.tsx` and `apps/web/app/privacy/page.tsx` as server components rendering the version and the draft notice.
- [x] 1.3 Test: `apps/web/test/consent.test.ts` asserts both pages render the version equal to the constant, render the draft notice, and contain no hard-coded second version string; asserts the pages need no session.

## 2. Acceptance gates registration

- [x] 2.1 Add `consent_accepted` to `packages/contracts/openapi.yaml` on the registration request schema (required, boolean), document the `422` refusal that names it, and add the key to `ROUTE_BODY_KEYS["POST /v1/auth/register"]`.
- [x] 2.2 Extend `RegisterAccountInput` with `consentAccepted` and read the flag in `auth.controller.ts` before the existing field extraction; refuse with `IdentityError("VALIDATION_ERROR", "consent_accepted must be true…")` when it is not `true`.
- [x] 2.3 In `better-auth-identity.service.ts`, write the two `consentRecords` rows only when `consentAccepted` is true, inside the existing registration transaction, and keep the existing rollback path.
- [x] 2.4 Add the checkbox and its client-side guard to `apps/web/app/sign-up/page.tsx`, plus the catalog label and the link to `/terms` and `/privacy`; the submit stays disabled until ticked.
- [x] 2.5 Test (API): extend `services/api/test/identity.integration.test.ts` — registration without the flag returns `422`, creates no `users` row and no `consent_records`; registration with it creates exactly two rows whose `document_version` equals the constant.
- [x] 2.6 Test (contract + matrix): update `packages/contracts/test/openapi.test.ts` for the new required key, and the public-route probe body for `POST /v1/auth/register` in `services/api/test/authorization-matrix.test.ts`.
- [x] 2.7 Test (web): `apps/web/test/sign-up-errors.test.ts` covers the blocked submit and the unchanged field-level error mapping.

## 3. The disclaimer renders where a claim is made

- [x] 3.1 Add `disclaimer.verified` to `apps/web/lib/strings.ts`.
- [x] 3.2 Render it in `apps/web/app/profile/impact-section.tsx` and on each card in `apps/web/app/mentors/page.tsx`.
- [x] 3.3 Test: extend `apps/web/test/impact-section.test.ts` and `apps/web/test/mentor-directory.test.ts` to assert the sentence is present on both surfaces and that no "audited by connect"-style claim appears.

## 4. Documentation

- [x] 4.1 `docs/functional-requirements.md`: mark FR-CONS-01 and FR-VER-05 built, naming the pages, the accepted-flag refusal, and the two disclaimer sites.
- [x] 4.2 `docs/known-debt.md`: add rows for the unbuilt or unmeasured Must requirements, in sorted requirement order — DEBT-29 FR-ADM-03 (audit sampling), DEBT-30 FR-ADM-06 (break-glass reads), DEBT-31 FR-ADM-07 (versioned configuration), DEBT-32 FR-PRIV-03 (retention sweeper), DEBT-33 FR-DISC-02 (rule-based suggestions), DEBT-34 FR-DISC-06 (no sensitive attributes in matching — has no match function to guard), DEBT-35 FR-VER-02 (institution-admin attestation queue), DEBT-36 FR-CONS-02 (revocable institution consent), DEBT-37 FR-UX-01 (installable PWA), DEBT-38 FR-UX-04 (WCAG evidence absent). Re-number only if an applied change took a number first.
- [x] 4.3 `docs/decision-log.md`: record D-82 and D-83 (below) as the next free numbers at apply time; correct the D-79 paragraph so it no longer claims per-account keying, and point it at DEBT-27.
- [x] 4.4 `docs/api-contracts.md` §1 and §4.1: the new required body key, its `422`, and the version the pages render. `docs/auth-and-access-control.md`: consent is an explicit act, refused at the API.
- [x] 4.5 `README.md`: status cell mentions the two pages and the disclaimer; `Last reviewed` refreshed to the apply date. `docs/mvp-build-plan.md` §5 and `docs/milestones-and-phases.md`: append the change as `DONE` on archive.

## 5. Checks, review gate, handoff

- [x] 5.1 Run `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `CI=true pnpm test`; capture each exit code and the per-package test counts.
- [x] 5.2 Confirm no new route was added without a contract path, no new table exists, and `grep -c 'consent_accepted'` matches across contract, allowlist, controller, and web form.
- [x] 5.3 Review gate: walk the diff against this design, then hand off with the gate output and any deviation from the brief.

## Decision rows to add at apply

- **D-82:** Registration requires an explicit consent acceptance that the API enforces, and the terms and privacy documents ship as versioned pages whose version is the version stored on the consent rows. Reason: a consent record for a document the user was never shown is a false record, and FR-CONS-01 is Must. Affects `trust/consent-and-audit-records`, `docs/api-contracts.md` §4.1, `docs/auth-and-access-control.md`.
- **D-83:** One disclaimer string is rendered beside every badge and impact summary; it states that the mentor confirmed and that not every outcome was independently audited. Reason: FR-VER-05 is Must and credibility depends on not overstating a check. Affects `trust/verified-badge-disclaimer`, `docs/functional-requirements.md` FR-VER-05.
