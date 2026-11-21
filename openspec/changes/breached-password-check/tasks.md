# Tasks: breached-password-check

Decision rows to add at apply (reserved, one contiguous block): **D-248** the keyless k-anonymous range endpoint, **D-249** fail open with one log line, and the privileged-role clause deferred to a named row.

## 0. Preconditions

- [x] 0.1 Re-read the snapshot: `git log --oneline -1`, `git status --short`, `sed -n '265,275p' services/api/src/identity/better-auth-identity.service.ts`, `sed -n '560,570p' services/api/src/identity/better-auth-identity.service.ts`, `grep -rn 'fetch(' services/api/src`.
- [x] 0.2 Confirm the mechanism is absent: `grep -rni "breach\|pwned\|hibp" services/api/src packages/domain/src apps/web/lib` returns nothing.
- [x] 0.3 Confirm the provider's answer shape with the documented example (the digest of `password` and one live range call), and record the exact URL, the status and the first line of the body in this file. Verify: the body is `SUFFIX:COUNT` lines, and the record names the date.
- [x] 0.4 Confirm Node 24's global `fetch` typechecks in `services/api`: a throwaway `fetch("https://example.com")` in a scratch file passes `pnpm --filter api typecheck`, then is deleted.

## 1. The pure rule

- [x] 1.1 `packages/domain/src/password-breach.ts`: `rangePrefix` and `breachCountFrom` as the design defines them; no I/O, no `crypto`. Verify: 1.2's test covers both functions, including the malformed-body branch.
- [x] 1.2 `packages/domain/test/password-breach.test.ts`: a valid 40-hex digest and its prefix; a short, long, non-hex and empty input; a body containing the suffix; one not containing it; an empty body; a malformed line; and the documented example vector. Verify: `pnpm --filter @connect/domain test` passes, and returning `0` for a malformed body makes the malformed test fail (mutation, restored).

## 2. The checker seam

- [x] 2.1 `services/api/src/identity/password-breach.ts`: a `PasswordBreachChecker` interface (`check(password): Promise<"clean" | "breached" | "unavailable">`), a `fetch` implementation with the 3-second `AbortSignal.timeout`, the prefix cache with a size bound, and the structured log line. It hashes with `crypto.createHash("sha1")` and never stores the password. Verify: 2.2 drives it only through the injected `fetch`; no test reaches the network.
- [x] 2.2 Its unit test with an injected fake `fetch`: a breached answer, a clean answer, a 500, an abort and a malformed body; the cache returns one provider call for two identical prefixes; no log line or error carries the password or the digest. Verify: `node --import tsx --test services/api/test/password-breach.test.ts` passes; removing the timeout makes the abort case hang and fail.
- [x] 2.3 `services/api/src/identity/identity.module.ts`: provide the checker under its token, with the production implementation, so the service receives it the way it receives `IdentityService`. Verify: `grep -n 'PasswordBreach' services/api/src/identity/identity.module.ts` matches, and the API boots with no provider configured.
- [x] 2.4 Wire the checker into the identity service beside `passwordPolicyViolation` at `:269` and `:565`: `breached` throws `IdentityError("VALIDATION_ERROR", …)` naming the password field; `unavailable` logs and continues. Verify: both call sites are covered by 3.1 and 3.2, not just registration.
- [x] 2.5 `services/api/src/identity/api-error.ts`: confirm the message reaches `422 VALIDATION_FAILED` with the field named, changing nothing in the mapping unless the message must differ.

## 3. The two paths

- [x] 3.1 `services/api/test/auth-routes.test.ts`: a registration with a known-breached password answers `422` naming the field and writes no user, consent or audit row; a clean password registers as before.
- [x] 3.2 The same file: a reset with a known-breached password answers `422` and the old password still signs in; a clean password resets as before.
- [x] 3.3 The unavailable path: with the checker's fake returning `unavailable`, both registration and reset succeed, exactly one log line is emitted, and no user-facing error appears. Verify: the log line's key set is asserted (`event`, `reason` only).

## 4. Contract and docs

- [x] 4.1 `packages/contracts/openapi.yaml`: confirm the register and reset `422` responses already describe `VALIDATION_FAILED`; add only the new message example if the schema documents examples. Verify: `pnpm --filter @connect/contracts test` passes unchanged.
- [x] 4.2 `docs/security-requirements.md` `SEC-AUTH-3` (line 92): the third clause is built, naming the endpoint, the k-anonymity rule, the fail-open policy and the debt row for the privileged variant. Verify: the row no longer contains "the third is not".
- [x] 4.3 `docs/known-debt.md`: close `DEBT-67` with the strike-through convention, and add the privileged-role follow-up row with its own target. Verify: `grep -n 'DEBT-67' docs/known-debt.md` reads `Closed`, and the new row names a target.
- [x] 4.4 `docs/auth-and-access-control.md`: one line in the authentication section that a password is checked against a public breach corpus at registration and reset, with only a five-character prefix leaving the process. Verify: `grep -n 'breach' docs/auth-and-access-control.md` matches once.
- [x] 4.5 `docs/milestones-and-phases.md`: the "Open blockers" line no longer names `DEBT-67`; the "Current state" block names this change. Verify: `grep -n 'DEBT-67' docs/milestones-and-phases.md` returns nothing.
- [x] 4.6 `README.md` status line and `docs/decision-log.md` (D-248, D-249). Verify: `grep -c '^### D-24[89]'` prints `2`.

## 5. Checks, review, handoff

- [x] 5.1 `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` (twice) — exit codes and totals recorded.
- [x] 5.2 `openspec validate breached-password-check --strict` and `openspec validate --all --strict`; quote the totals.
- [x] 5.3 Review gate per `AGENTS.local.md` §2: the adversarial pass asks what an attacker learns from a refusal, whether the password can reach a log or an error body, and whether a provider outage can be mistaken for a clean answer.
- [x] 5.4 A live check against the real endpoint, once, recorded: a known-breached password and a fresh random one, with the status codes and the log lines.
- [x] 5.5 Handoff: the two path results, the unavailable-path log line, the deferral of the privileged clause with its new row, and the `.env.example` proof that no new secret was introduced.

## 6. Evidence (2026-11-21)

- **0.3 provider shape, verified live:** `curl -s -H "Add-Padding: true"
  "https://api.pwnedpasswords.com/range/21BD1"` answered HTTP 200 with the documented shape:
  `0002EEFFB2CCA91812B5CC9956854E22BEB:4`, `000F6468C6E4D09C0C239A4C2769501B3DD:5959`,
  `00115AE168591C338025516216655E42A09:17` - `SUFFIX:COUNT` lines, CRLF, uppercase suffix, no key required.
- **0.4** Node 24's global `fetch` typechecks in `services/api` (the checker compiles under `pnpm --filter api typecheck`); no
  scratch file was needed beyond the checker itself.
- **1.2 mutation:** returning `0` for a shapeless body instead of `null` makes "an empty or shapeless body is unknown" fail
  (7 pass, 1 fail); restored, 8 pass.
- **2.2** five cases drive the checker through an injected `fetch`: breached, clean, 500, `TimeoutError`, unreadable body,
  network error, cache (one call for one prefix), and the request's `Add-Padding` header plus a timeout signal. The log line's
  key set is asserted as exactly `["event", "reason"]` and no value carries the password or a 40-hex digest.
- **3.1-3.3** `services/api/test/password-breach.integration.test.ts` (4 cases, 4 pass): registration refused with no user
  and no consent row; clean password registers; reset refused and the stored password hash unchanged; `unavailable` accepts
  registration and writes the account. Two stacks carry their own answer, so no test reaches the provider.
- **4.1** the register and reset `422` responses already document `VALIDATION_FAILED` with no example block, so nothing was
  added; `packages/contracts` tests pass unchanged.
- **2.5** the message reaches `422 VALIDATION_FAILED` naming `password` through the existing mapping, unchanged.
