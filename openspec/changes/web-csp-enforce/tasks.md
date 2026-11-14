# Tasks: web-csp-enforce

## 0. Preconditions

- [ ] 0.1 Re-check the snapshot: `sed -n '1,30p' apps/web/lib/security-headers.ts`, `sed -n '1,20p' apps/web/next.config.ts`, `grep -rn "\.css" apps/web/app apps/web/lib`, `grep -rn "Content-Security-Policy" apps/web --include=*.ts`. Record every mismatch.
- [ ] 0.2 Save today's policy string verbatim in this file, so task 2.2 can prove it did not change.
- [ ] 0.3 Bring the stack up and confirm the report-only header is live before touching code: `curl -sI http://localhost:3000/sign-in | grep -i content-security`.

## 1. The mode

- [ ] 1.1 `apps/web/lib/security-headers.ts`: add `cspHeaderKey(mode)` returning `Content-Security-Policy-Report-Only` for `report-only` and `Content-Security-Policy` otherwise, and `cspMode()` reading `process.env.WEB_CSP_MODE`, defaulting to enforce. Keep `WEB_SECURITY_HEADERS` a data export the test can read. Verify: `pnpm --filter web typecheck`.
- [ ] 1.2 `apps/web/next.config.ts`: build the header array from the chosen key. Verify: `pnpm --filter web build` and `grep -n "cspHeaderKey" apps/web/next.config.ts`.

## 2. Tests

- [ ] 2.1 `apps/web/test/security-headers.test.ts`: default mode → the enforcing key is present and the report-only key absent; `report-only` mode → the reverse; the other four headers unchanged in both.
- [ ] 2.2 The directive list is asserted once as an exact string equal to the one saved in 0.2. Verify: the assertion fails when one directive is deleted.
- [ ] 2.3 Mutation check: make `cspMode()` always return `report-only` and confirm 2.1 fails on the default case; restore and record the result.

## 3. Live header check (no browser needed)

- [ ] 3.1 Rebuild and restart the web container, then `curl -sI http://localhost:3000/sign-in` and `curl -sI http://localhost:3000/mentors`: the enforcing header is present, the report-only header absent, and the five other headers unchanged.
- [ ] 3.2 Set `WEB_CSP_MODE=report-only`, restart, repeat 3.1 in the other direction, then unset it and restart. Record all three outputs.

## 4. Docs

- [ ] 4.1 `docs/security-requirements.md`: `SEC-API-3` — the web half is enforced with the pilot policy, and the annotation states that inline scripts remain allowed, so the control is origin and framing restriction only.
- [ ] 4.2 `docs/known-debt.md`: close `DEBT-56` with the checklist date and runner; open one row for a nonce-based `script-src` that would let `'unsafe-inline'` go (next free number, do not guess).
- [ ] 4.3 `docs/local-setup.md`: `WEB_CSP_MODE` in the variable list (name and the two values, no secret); `docs/decision-log.md` (reserved rows at the end of this file).
- [ ] 4.4 `docs/mvp-build-plan.md` §5 and `docs/milestones-and-phases.md`.

## 5. Gates and review

- [ ] 5.1 One background job, each exit code echoed: `pnpm lint`, `pnpm typecheck`, `CI=true pnpm test`, `pnpm build`, `pnpm exec openspec validate --all --strict`; per-package totals including skipped.
- [ ] 5.2 Line-by-line pass (mode default, header array, test matrix), then an independent adversarial pass on the diff and the delta — specifically that the REMOVED block's directive list is restated in the ADDED one.

## 6. MANUAL VERIFICATION CHECKLIST — the change is not done until this passes

Runner: the owner. Record date, browser and version beside each line. A failure is closed only by fixing the policy or by `WEB_CSP_MODE=report-only` plus a report.

- [ ] 6.1 Sign-up flow: `http://localhost:3000/sign-up`, submit, open the verification link from Mailpit (`http://localhost:8025`). Console: no CSP violation.
- [ ] 6.2 Sign-in with email and password. Console: no CSP violation; the session header renders.
- [ ] 6.3 Google sign-in: click the provider button, complete consent, land back on the callback relay and reach a signed-in page. Console: no CSP violation on `/callback/google`; no `form-action` or `connect-src` refusal.
- [ ] 6.4 MFA enrollment: `/account/security`, enroll, verify one code. Console: no CSP violation.
- [ ] 6.5 One form submit per family: the mentor request form (`/request/new`), a profile save (`/profile`), and an admin read (`/admin/audit`). Console: no CSP violation on any.
- [ ] 6.6 Install metadata still loads: `/manifest.webmanifest` returns 200 and the icons render.
- [ ] 6.7 Read the console for `Refused to` and `Content Security Policy` on every page above; paste any hit into this file, then either fix the policy or roll back.
- [ ] 6.8 Record the final state: enforcing policy live, checklist complete, then close `DEBT-56` in task 4.2.

## Decision rows to add at apply

Reserved as **`D-167 … D-168`** after `D-166`; re-confirm at apply.

- **D-167**: The web content security policy enforces with the directive list it reported, and `'unsafe-inline'` stays until a nonce-based `script-src` change lands, so the pilot's control is origin and framing restriction only. Reason: Next injects an inline bootstrap and there is no nonce plumbing; the honest bound is stated in the security register. Affects: `platform/http-security-controls`, `docs/security-requirements.md`.
- **D-168**: `WEB_CSP_MODE=report-only` is the documented rollback, read at build or start time so a flip costs one restart. Reason: the header array is already static data, and a per-request switch would put a header decision in the request path. Affects: `apps/web/next.config.ts`, `docs/local-setup.md`.
