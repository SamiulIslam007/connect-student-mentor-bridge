# Proposal: signup-bot-protection

## Why

`SEC-ABUSE-1` is a Must and its second clause — "bot protection on sign-up" — is not built: `grep -rni "captcha\|turnstile\|hcaptcha" services/api apps/web` returns nothing, and the row's own annotation credits only the two rate-limit buckets. Rate limiting caps the volume of automated sign-ups; it does not stop a script that creates one account per address slowly, which is what a free-invite pilot is worth to a spammer.

## What Changes

- One honeypot field (`contact_website`) on the sign-up form, documented in the request schema and the body allowlist so its presence never produces a field-naming error; a value in it refuses the registration in both the BFF and the API.
- One intent marker: an httpOnly `connect_signup_intent` cookie minted by a new `GET /api/auth/register-intent` route when the sign-up page mounts; a submission younger than two seconds or older than one hour is refused.
- One generic refusal, `422 REGISTRATION_REFUSED`, with one actionable sentence and no indication of which check failed; one structured log line names the check server-side and carries no personal data.
- No account, consent or audit row is written for a refusal. No third-party processor, no new dependency, no captcha.

## Capabilities

### New Capabilities

None: the behaviour belongs to registration, which `identity/email-password-auth` already owns.

### Modified Capabilities

- `identity/email-password-auth`: one ADDED requirement, "Registration refuses an automated submission". The existing "Email and password registration" requirement is not modified — it states what a valid submission does, and a refusal is a precondition it never contemplated, so nothing in it contradicts the new rule.

## Impact

- **Code**: `apps/web/app/api/auth/register/route.ts` (the two checks around the existing proxy), `apps/web/app/api/auth/register-intent/route.ts` (new, sets the cookie), `apps/web/app/sign-up/page.tsx` (the hidden field, the mount call, the refusal message through the string catalog), `apps/web/lib/sign-up-intent.ts` (a pure helper: cookie parsing plus the two window checks), `services/api/src/identity/auth.controller.ts` (the honeypot check before the service call), `services/api/src/identity/api-error.ts` (the new code in the 422 set), `packages/config/src/index.ts` (the two windows).
- **Contract**: `packages/contracts/openapi.yaml` — one optional `contact_website` property in the register request schema, and the `422 REGISTRATION_REFUSED` response; `packages/contracts/src/body-keys.ts` — the register entry gains `contact_website`.
- **Data**: none. No migration; the refusal writes no row at all.
- **Tests**: `apps/web/test/sign-up-intent.test.ts` (new), `apps/web/test/sign-up-errors.test.ts` (the new refusal message is one catalog string), `services/api/test/auth-routes.test.ts` (the API's honeypot refusal and the generic body), `packages/contracts/test/openapi.test.ts` and the body-key inventory (parity).
- **Docs**: `docs/security-requirements.md` (`SEC-ABUSE-1` annotation names both clauses and the check), `docs/auth-and-access-control.md` (one line on the pre-session refusal), `docs/api-contracts.md` (the register refusal), `docs/mvp-build-plan.md` §5, `docs/milestones-and-phases.md`, `README.md` status line, `docs/decision-log.md`.

## Depends on

None.

## Out of scope

- **A captcha or a third-party signal** (Turnstile, reCAPTCHA): excluded by the owner. It would add an external processor to the privacy document and a network dependency inside the one flow that must never fail.
- **A proof-of-work challenge or a JS challenge**: the intent cookie already costs a script one page fetch; anything stronger is post-pilot.
- **Bot protection on sign-in, password reset or the request form**: `SEC-ABUSE-1`'s clause names sign-up only, and those routes carry their own buckets.
- **Blocking a whole IP or an ASN**, and any block table: `signup_blocks` exists for the under-18 gate and must not be reused for a different purpose.
- **Revealing the check to the client**, including a different HTTP status per check.

## Risks and rollback

| Risk | Mitigation |
|---|---|
| A real user is refused (slow connection, a filled autofill field, a stale tab) | The honeypot field is `tabindex=-1`, `aria-hidden` and off the autofill path; the message tells the user to reload and try again, which re-mints the marker; the refusal costs one retry, not an account |
| A password manager fills the hidden field | The field is `autoComplete="off"`, named unlike any credential field, and a test asserts the page's rendered markup carries those attributes |
| The intent cookie is absent because the user opened the page before this deploy | The refusal is the actionable message, not a dead end; the sign-up page re-mints on mount, so a reload always works |
| The check becomes an oracle that tells a bot what to fix | One status, one code, one body for all three checks; a test compares the three responses byte for byte |
| Logging leaks personal data | The log line carries only the check name; a test asserts the line's key set |

**Rollback**: delete the two checks and the intent route; the honeypot field stays harmless in the form and the allowlist entry becomes unused, which the inventory test tolerates. No data to undo.

**Traces to** SEC-ABUSE-1, SEC-DATA-5, FR-AUTH-01, FR-AUTH-03, D-82, DEBT-08.
