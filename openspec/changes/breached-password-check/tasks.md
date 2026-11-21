# Tasks: breached-password-check

Decision rows to add at apply (reserved, one contiguous block): **D-248** the keyless k-anonymous range endpoint, **D-249** fail open with one log line, and the privileged-role clause deferred to a named row.

## 0. Preconditions

- [ ] 0.1 Re-read the snapshot: `git log --oneline -1`, `git status --short`, `sed -n '265,275p' services/api/src/identity/better-auth-identity.service.ts`, `sed -n '560,570p' services/api/src/identity/better-auth-identity.service.ts`, `grep -rn 'fetch(' services/api/src`.
- [ ] 0.2 Confirm the mechanism is absent: `grep -rni "breach\|pwned\|hibp" services/api/src packages/domain/src apps/web/lib` returns nothing.
- [ ] 0.3 Confirm the provider's answer shape with the documented example (the digest of `password` and one live range call), and record the exact URL, the status and the first line of the body in this file. Verify: the body is `SUFFIX:COUNT` lines, and the record names the date.
- [ ] 0.4 Confirm Node 24's global `fetch` typechecks in `services/api`: a throwaway `fetch("https://example.com")` in a scratch file passes `pnpm --filter api typecheck`, then is deleted.

## 1. The pure rule

- [ ] 1.1 `packages/domain/src/password-breach.ts`: `rangePrefix` and `breachCountFrom` as the design defines them; no I/O, no `crypto`. Verify: 1.2's test covers both functions, including the malformed-body branch.
- [ ] 1.2 `packages/domain/test/password-breach.test.ts`: a valid 40-hex digest and its prefix; a short, long, non-hex and empty input; a body containing the suffix; one not containing it; an empty body; a malformed line; and the documented example vector. Verify: `pnpm --filter @connect/domain test` passes, and returning `0` for a malformed body makes the malformed test fail (mutation, restored).

## 2. The checker seam

- [ ] 2.1 `services/api/src/identity/password-breach.ts`: a `PasswordBreachChecker` interface (`check(password): Promise<"clean" | "breached" | "unavailable">`), a `fetch` implementation with the 3-second `AbortSignal.timeout`, the prefix cache with a size bound, and the structured log line. It hashes with `crypto.createHash("sha1")` and never stores the password. Verify: 2.2 drives it only through the injected `fetch`; no test reaches the network.
- [ ] 2.2 Its unit test with an injected fake `fetch`: a breached answer, a clean answer, a 500, an abort and a malformed body; the cache returns one provider call for two identical prefixes; no log line or error carries the password or the digest. Verify: `node --import tsx --test services/api/test/password-breach.test.ts` passes; removing the timeout makes the abort case hang and fail.
- [ ] 2.3 `services/api/src/identity/identity.module.ts`: provide the checker under its token, with the production implementation, so the service receives it the way it receives `IdentityService`. Verify: `grep -n 'PasswordBreach' services/api/src/identity/identity.module.ts` matches, and the API boots with no provider configured.
- [ ] 2.4 Wire the checker into the identity service beside `passwordPolicyViolation` at `:269` and `:565`: `breached` throws `IdentityError("VALIDATION_ERROR", …)` naming the password field; `unavailable` logs and continues. Verify: both call sites are covered by 3.1 and 3.2, not just registration.
- [ ] 2.5 `services/api/src/identity/api-error.ts`: confirm the message reaches `422 VALIDATION_FAILED` with the field named, changing nothing in the mapping unless the message must differ.

## 3. The two paths

- [ ] 3.1 `services/api/test/auth-routes.test.ts`: a registration with a known-breached password answers `422` naming the field and writes no user, consent or audit row; a clean password registers as before.
- [ ] 3.2 The same file: a reset with a known-breached password answers `422` and the old password still signs in; a clean password resets as before.
- [ ] 3.3 The unavailable path: with the checker's fake returning `unavailable`, both registration and reset succeed, exactly one log line is emitted, and no user-facing error appears. Verify: the log line's key set is asserted (`event`, `reason` only).

## 4. Contract and docs

- [ ] 4.1 `packages/contracts/openapi.yaml`: confirm the register and reset `422` responses already describe `VALIDATION_FAILED`; add only the new message example if the schema documents examples. Verify: `pnpm --filter @connect/contracts test` passes unchanged.
- [ ] 4.2 `docs/security-requirements.md` `SEC-AUTH-3` (line 92): the third clause is built, naming the endpoint, the k-anonymity rule, the fail-open policy and the debt row for the privileged variant. Verify: the row no longer contains "the third is not".
- [ ] 4.3 `docs/known-debt.md`: close `DEBT-67` with the strike-through convention, and add the privileged-role follow-up row with its own target. Verify: `grep -n 'DEBT-67' docs/known-debt.md` reads `Closed`, and the new row names a target.
- [ ] 4.4 `docs/auth-and-access-control.md`: one line in the authentication section that a password is checked against a public breach corpus at registration and reset, with only a five-character prefix leaving the process. Verify: `grep -n 'breach' docs/auth-and-access-control.md` matches once.
- [ ] 4.5 `docs/milestones-and-phases.md`: the "Open blockers" line no longer names `DEBT-67`; the "Current state" block names this change. Verify: `grep -n 'DEBT-67' docs/milestones-and-phases.md` returns nothing.
- [ ] 4.6 `README.md` status line and `docs/decision-log.md` (D-248, D-249). Verify: `grep -c '^### D-24[89]'` prints `2`.

## 5. Checks, review, handoff

- [ ] 5.1 `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` (twice) — exit codes and totals recorded.
- [ ] 5.2 `openspec validate breached-password-check --strict` and `openspec validate --all --strict`; quote the totals.
- [ ] 5.3 Review gate per `AGENTS.local.md` §2: the adversarial pass asks what an attacker learns from a refusal, whether the password can reach a log or an error body, and whether a provider outage can be mistaken for a clean answer.
- [ ] 5.4 A live check against the real endpoint, once, recorded: a known-breached password and a fresh random one, with the status codes and the log lines.
- [ ] 5.5 Handoff: the two path results, the unavailable-path log line, the deferral of the privileged clause with its new row, and the `.env.example` proof that no new secret was introduced.
