# Proposal: trust-surfaces

## Why

Two Must requirements are unbuilt and both are visible to a user in the first two minutes. `FR-CONS-01` requires consent for the terms and the privacy notice, and `FR-VER-05` requires a disclaimer wherever a verified badge or an impact summary appears. Today registration writes two `GRANTED` consent rows for document version `2026-11` (`services/api/src/identity/better-auth-identity.service.ts:63` and `:299`) while no page in the application shows that document — `apps/web/app` has no `/terms` and no `/privacy` route — so the stored record asserts consent to something the user never saw. Separately, `grep -rn "audited\|countersign" apps/web` returns nothing: the disclaimer FR-VER-05 demands does not exist in any string, page, or component. A pilot partner reads exactly these two things: what the user agreed to, and what a badge does not claim.

## What Changes

- Add `/terms` and `/privacy` pages that render the document version stored on the consent record (`CONSENT_DOCUMENT_VERSION = "2026-11"`), state that they are pilot drafts pending legal review, and are readable without a session.
- Add an explicit consent checkbox to `/sign-up`. The browser refuses to submit until it is ticked, and the registration request carries `consent_accepted: true`. **BREAKING** for any API client that posts `POST /v1/auth/register` without `consent_accepted`: registration is now refused with `422 VALIDATION_FAILED` naming the field and creates no user and no consent row.
- The two consent rows are written only when the caller accepted. The version written is the version the pages show, from one shared constant rather than a literal in each place.
- Add the verified-badge disclaimer string to the catalog and render it beside the profile impact summary and on every mentor directory card: a mentor countersigned the outcome, and not every outcome was independently audited. It never claims an audit that did not happen.
- Docs-only task group (no behaviour): add the missing debt-register rows for the unbuilt Must requirements, correct the D-79 text that claims per-account throttling while the code keys on IP only, and refresh the stale `Last reviewed` date in `README.md`.
- No migration. No new dependency.

## Capabilities

### New Capabilities

- `trust/verified-badge-disclaimer`: the rule that every verified badge and every impact summary carries a disclaimer stating what confirmation means and that outcomes are not all independently audited, and where that disclaimer is rendered.

### Modified Capabilities

- `trust/consent-and-audit-records`: "Consent recorded at registration" currently writes the two records whenever registration completes. It is restated so registration is refused unless the caller accepted, and so the records are written only on acceptance. A new requirement in the same capability states that the consent documents exist as versioned pages and that the page version is the stored version.

## Impact

- **Code**: `apps/web/app/terms/page.tsx` and `apps/web/app/privacy/page.tsx` (new), `apps/web/app/sign-up/page.tsx` (checkbox + client refusal), `apps/web/lib/strings.ts` (sign-up consent labels, the two page bodies, the disclaimer), `apps/web/app/profile/impact-section.tsx` and `apps/web/app/mentors/page.tsx` (disclaimer placement), `services/api/src/identity/auth.controller.ts` (parse and refuse `consent_accepted`), `packages/domain/src/identity.ts` (`RegisterAccountInput` gains the flag), `services/api/src/identity/better-auth-identity.service.ts` (write the consent rows only when accepted).
- **Tests**: `apps/web/test/sign-up-errors.test.ts` and a new `apps/web/test/consent.test.ts` (page version equals the stored version, checkbox gates submission, the disclaimer renders in both places), `services/api/test/identity.integration.test.ts` (registration without consent creates no user and no consent rows; with consent creates two rows at the page version), `packages/contracts/test/openapi.test.ts` (the new body key).
- **API/contract**: `packages/contracts/openapi.yaml` gains `consent_accepted` on the registration request schema and a `422` response naming it; `packages/contracts/src/body-keys.ts` gains the key for `POST /v1/auth/register`. The route is already in the `authorization-matrix` `MATRIX` (public), so no new row is needed — but the test's body for that route must carry the flag.
- **Data**: no schema change, no migration. Existing consent rows are untouched.
- **Docs**: `docs/functional-requirements.md` (FR-CONS-01 and FR-VER-05 marked built), `docs/known-debt.md` (new DEBT rows for the unbuilt Musts; DEBT-14/DEBT-19 cross-references verified), `docs/decision-log.md` (D-82, D-83 recorded; D-79 corrected), `docs/api-contracts.md` §1 and §4.1 (the new body key and its `422`), `docs/auth-and-access-control.md` (consent is an explicit act), `README.md` (status cell and `Last reviewed`), `docs/mvp-build-plan.md` §5, `docs/milestones-and-phases.md`.
- **Dependencies**: none added. Existing Next.js, NestJS, Drizzle, and the string catalog.

## Depends on

- `identity/email-password-auth` and `trust/consent-and-audit-records` (archived): the registration route and the consent writes this change narrows.
- `profiles/mentor-directory` and `mentorship/reputation-ledger` (archived): the two surfaces the disclaimer renders on.
- Nothing from `privacy-export-and-erasure` or `abuse-reports-and-sanctions`; this change applies first and independently.

## Out of scope

- Authoring the legal text. The pages ship as versioned pilot drafts and say so; the wording is the owner's and counsel's task, and the version constant is what makes a later text swap safe.
- Re-acceptance when the document version changes. The version is stored per row exactly so that a later change can prompt re-acceptance; this change does not build the prompt.
- `FR-CONS-02` (revocable institution data-sharing consent) and any consent-management screen.
- Styling beyond the existing page patterns, and any change to the header navigation (the two pages are reachable from the sign-up consent line).
- Accessibility remediation (`FR-UX-04`), which stays as its own debt row.
- The other unbuilt Musts the debt rows record. Adding a row is not building the feature.

## Risks and rollback

| Risk | Mitigation |
|---|---|
| A client that posts registration without the new flag breaks | The flag is documented in the contract, the refusal names the field and the `422` code, and the web BFF is updated in the same change; the permission-matrix test's public-route probe is updated with it |
| The checkbox is a UI-only gate that a direct API call bypasses | The API refuses without `consent_accepted`; the browser check is a convenience, the server check is the trust boundary, and an integration test drives the API directly |
| The page version drifts from the stored version | One constant is the source for both, the contract of the web page is asserted by a test that compares the rendered version to the value the API stores, and the value is not duplicated as a literal |
| The disclaimer is read as an audit claim | The wording states what happened (a mentor confirmed) and what did not (independent audit of every outcome), and a test asserts the sentence is present on both surfaces |
| The docs-only group touches files another open change also edits | The group is additive (new debt rows) or a one-paragraph correction; nothing in it restates a requirement |

Rollback: revert the commit. No migration, no data write, no contract-breaking removal; a rollback restores registration without the flag and removes two pages.

**Traces to** FR-CONS-01 (consent capture with document versions), FR-VER-05 (the verified-badge disclaimer), FR-PROF-04 (a badge is an affiliation claim, not an audit), SEC-* none; ADR-018 (Drizzle, unchanged); D-82 and D-83 (this change's decisions); DEBT-14 and DEBT-19 (bounded by the disclaimer wording and untouched here).
