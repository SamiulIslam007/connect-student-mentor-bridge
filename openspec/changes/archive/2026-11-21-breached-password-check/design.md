# Design: breached-password-check

## Context

See `proposal.md` — Why. Verified facts that shape the approach:

- `services/api/src/identity/better-auth-identity.service.ts:269` — `register` calls `passwordPolicyViolation(input.password)` and throws `IdentityError("VALIDATION_ERROR", "password must be at least 12 characters")`. The same predicate is called at `:565` in `resetPassword`, so one insertion point covers both paths.
- `services/api/src/identity/auth.controller.ts:94` and `:275` pass the password through (`password`, `new_password`); the controller is not where the password rule lives, and this change does not move it.
- `grep -rn 'fetch(' services/api/src` returns nothing: the API makes no outbound HTTP call today. This is the first, which is why the seam and its timeout are decisions rather than details.
- The repository's seam convention: interfaces plus a DI token, an implementation per real dependency, and tests that pass a fake (for example `IdentityService` in `services/api/src/identity/identity.tokens.ts`).
- `packages/domain` is pure TypeScript with no I/O, and holds the other pure rules (`age-gate.ts`, `password-policy` neighbouring logic, `match.ts`), each with a sibling test.

## Goals / Non-Goals

**Goals**

- A password known to be breached is refused on both paths that set one, with a message a person can act on.
- Nothing about the password or the account leaves the process beyond five hex characters.
- A provider outage cannot stop a 100-student invite from working.

**Non-Goals**

- No client-side check, no password-strength meter, no composition rules.
- No corpus storage, no refresh job, no self-hosted mirror.
- No change to the hasher, the session, the age gate or the reset token's lifecycle.

## Decisions

### D-248: The Pwned Passwords range endpoint, keyless and k-anonymous

- Date: 2026-11-21
- Decision: the checker calls `https://api.pwnedpasswords.com/range/{first5}`, which answers a list of suffixes and counts; the code hashes the password with SHA-1, sends the first five hex characters, and compares suffixes locally. No API key, no account, `Add-Padding` left off, a 3-second timeout, and an in-process cache keyed by the prefix with the provider's own `Last-Modified`/`Cache-Control` honoured up to 24 hours.
- Reason: it is free, requires no credential (so no secret reaches `.env` or a log), and by construction reveals only a five-character prefix that maps to hundreds of real hashes. Any keyed variant would add a secret to every environment and a bill on the one path the owner set a zero-cost rule for.
- Alternatives rejected: (a) a self-hosted corpus — no outbound call, but a multi-gigabyte file to refresh forever; (b) an offline top-100k list — a fraction of the coverage for the same twenty lines.
- Status: Decided (owner-approved as the audit's P1 recommendation)
- Affects: `services/api/src/identity/password-breach.ts`, `packages/domain/src/password-breach.ts`

### D-249: Fail open, with one log line — and the privileged-role exception recorded rather than half-built

- Date: 2026-11-21
- Decision: when the provider times out, refuses, or answers something unparseable, the password is **accepted** and one structured line records `{ event: "password.breach_check_unavailable", reason }`. No user-facing error. The audit's recommendation also proposed failing closed for privileged roles; **at the two call sites available it cannot be implemented honestly**, because registration has no role yet (roles are granted after sign-up) and the reset path identifies the account only inside the identity library, after the new password is set. The variant is recorded as its own debt row — a check at sign-in for an admin whose stored password has not been breach-checked — rather than approximated here.
- Reason: a third-party outage must not stop sign-up for an invited cohort, and rate limits, MFA for privileged roles and the 12-character floor already blunt stuffing. Approximating the privileged clause with a role check that always sees "no role" would be worse than recording it: it would read as built.
- What would change this decision: a real credential-stuffing incident in the pilot, or the deployment change introducing an alert that makes an outage visible within minutes rather than at the next report.
- Alternatives rejected: (a) fail closed everywhere — one provider hiccup stops onboarding for everyone; (b) fail closed at reset only — the reset path cannot see the role in time, so it would fail closed for every role, contradicting the first half of the policy.
- Status: Decided (owner-approved as the audit's P2 recommendation, with the privileged-role clause deferred to a named row)
- Affects: `docs/known-debt.md` (new row), `docs/security-requirements.md` (`SEC-AUTH-3`), `docs/decision-log.md`

## The pure rule

`packages/domain/src/password-breach.ts` exports:

- `rangePrefix(sha1Hex)` → the first five characters, upper-cased, or `null` when the input is not 40 hex characters.
- `breachCountFrom(body, sha1Hex)` → the count for the suffix, `0` when absent, `null` when the body is not the documented shape (so "unparseable" and "clean" are different answers).
- The documented example from the provider's own page is a test vector: the digest of `password` and its response body.

The pure file does no hashing: the caller hashes, because `crypto` in the domain package would be a platform dependency the package does not otherwise carry.

## Risks / Trade-offs

- The first outbound call in the API is on the registration path → a 3-second budget, a cache, a fail-open policy and a log line; the deployment change adds the alert on that event.
- SHA-1 is used only as the provider's index, never as storage → stated in the code comment so a reader does not "fix" it to SHA-256 and get zero matches.
- The cache must not become a personal-data store → it keys on the prefix only, holds suffix lists, and is bounded in size with an eviction bound.
- A refusal message that says "breached" tells an attacker the password is in a public list → it tells them something they could compute themselves; the alternative message ("choose a stronger password") leaves the user unable to understand why a long password was refused.
- Node's global `fetch` on Node 24 is stable but untyped in this repo's TS config → the implementation uses the DOM `fetch` type the runtime provides; the typecheck gate decides, and a `node:https` fallback is a one-file change.

## Migration Plan

No data or schema change. Deploy order is irrelevant; the check is additive and fails open until the provider answers. Rollback deletes the clause and the seam; nothing persisted depends on it.

## Open Questions

None. The privileged-role variant is a recorded follow-up (D-249), not an open question.
