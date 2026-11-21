# Proposal: breached-password-check

## Why

`SEC-AUTH-3` is a security **Must** with three clauses; two are built (the identity library's hasher, and `PASSWORD_MIN_LENGTH`-equivalent `passwordPolicyViolation` with `422 VALIDATION_FAILED` naming the field) and the third is not. `docs/security-requirements.md:92` states it in the row itself, and `DEBT-67` records it: `grep -rni "breach\|pwned\|hibp" services/api/src packages/domain/src apps/web/lib` prints nothing. `docs/milestones-and-phases.md:23` names it as the one open blocker on the register.

The gap is specific: a password that is twelve characters long and appears in a public breach corpus is accepted, and a twelve-character minimum with no composition rule (`passwordPolicyViolation`, `services/api/src/identity/better-auth-identity.service.ts:269`) is exactly the shape a credential-stuffing run satisfies first.

## What Changes

- One pure function in `packages/domain`: given a password's SHA-1 hex digest, its five-character prefix, and the provider's response body, decide whether the password is known-breached. No I/O, no network, no `crypto` beyond a hash the caller supplies.
- One checker seam in `services/api/src/identity`: a `PasswordBreachChecker` with a `fetch`-based implementation against the Pwned Passwords **range** endpoint (k-anonymity: the first five hex characters of the SHA-1, never the password, never the full digest), a 3-second timeout, and an in-process cache for the response window.
- One call site next to the existing length rule — `passwordPolicyViolation` is the single predicate both `register` (`:269`) and `resetPassword` (`:565`) already call, so the breach clause joins it there rather than at each controller.
- The refusal reuses the existing shape: `422 VALIDATION_FAILED` naming `password`, with a message that says the password appears in a public breach.
- The unreachable policy: **accept and log** (D-249), with one structured line carrying the outcome and no personal data.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `identity/email-password-auth`: **MODIFIED** "Password policy". The length, no-composition and hash-storage clauses stay word for word; the requirement gains the breach clause, the k-anonymity rule, and the unreachable policy. Two existing scenarios are restated unchanged; four are added.

## Impact

- **Code**: `packages/domain/src/password-breach.ts` (new, pure), `packages/domain/test/password-breach.test.ts`, `services/api/src/identity/password-breach.ts` (new: the checker interface, the `fetch` implementation, the cache), its wiring in `services/api/src/identity/identity.module.ts`, and one clause in `services/api/src/identity/better-auth-identity.service.ts` beside `passwordPolicyViolation` at `:269` and `:565`.
- **Dependencies**: none. Node 24 provides `fetch` and `crypto`; the repository currently makes no outbound HTTP call from the API (`grep -rn 'fetch(' services/api/src` prints nothing), so this is the first one and it is worth naming.
- **Contract**: `packages/contracts/openapi.yaml` — the register and reset responses already document `422 VALIDATION_FAILED`; the message text changes, the shape does not. No new path, no new code, no `ROUTE_BODY_KEYS` change.
- **Data**: none. No migration; the password and the digest are never stored or logged.
- **Tests**: the pure function's unit tests, the checker's tests with an injected fake `fetch`, and two integration cases in `services/api/test/auth-routes.test.ts` (a breached password refused at register and at reset).
- **Docs**: `docs/security-requirements.md` (`SEC-AUTH-3` row), `docs/known-debt.md` (`DEBT-67` closed, with the deferred privileged-role variant as a new row), `docs/auth-and-access-control.md` (one line), `docs/milestones-and-phases.md` "Current state" and its open-blocker line, `README.md` status line, `docs/decision-log.md` (D-248, D-249), `.env.example` only if a switch is added (it is not).

## Depends on

- `docs-truth-gate-doc-and-debt-targets` — it writes the row's wording and the milestones blocker line this change then closes; landing after it avoids two edits to the same sentences.
- Nothing technical: the seam, the predicate and the test patterns all exist.

## Out of scope

- **Any paid breach API** (HIBP's keyed `/breachedaccount`, a commercial feed). The range endpoint is free, keyless and k-anonymous, which is what the pilot's cost envelope allows.
- **Sending the password, its full digest, any part of the email, or a user identifier to the provider.** Only the five-character prefix is sent, and the response is a suffix list.
- **A self-hosted corpus or an offline top-100k list.** A file to refresh forever, and a much weaker check than the live corpus for the same twenty lines of code.
- **Changing the 12-character minimum, adding composition rules, or touching the hasher.** `SEC-AUTH-3`'s first two clauses are built and stay.
- **A client-side check and a sign-up UX change.** The BFF and the API refuse; the page already renders a field-level validation error.
- **Breach checking on any path other than registration and password reset** (for example a password change from the account page, which does not exist as a route).
- **A privileged-role exception to the unreachable policy at registration** — see D-249: the role is not known there, and the reset path's account identity lives inside the identity library. The variant is recorded as its own debt row instead of half-built.

## Risks and rollback

| Risk | Mitigation |
|---|---|
| The provider is unreachable and sign-up stops | D-249: the check fails open for participants, logs one line, and the flow continues; a test proves the refusal path cannot be reached without a provider answer |
| The response is slow and registration hangs | A 3-second timeout and a documented budget; the whole request already has a 100 KiB body cap and a throttle |
| Privacy: a password leaks into a log or an error body | Only the five-character prefix leaves the process; the pure function never sees the password; the existing "password never logged" scenario is re-run |
| A false positive refuses a legitimate password | Only an exact suffix match with a non-zero count refuses; the message names the breach list and asks for another password |
| A provider outage is invisible | The outcome is a structured log line with a counter; the deployment change wires the alert, and this change names the event |
| A dependency-free implementation is more code than a library | The pure function is ~30 lines with RFC 6238-style test vectors taken from the provider's documented example digest |

**Rollback**: remove the call site and the seam; the pure function and its tests can stay or go. No data, no schema and no contract changes, so a revert costs nothing.

**Traces to** `SEC-AUTH-3`, `DEBT-67`, `FR-AUTH-01`, `FR-AUTH-05`, `D-248`, `D-249`.
