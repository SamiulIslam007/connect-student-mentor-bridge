# Tasks: e2e-happy-path

Decision rows to add at apply (reserved, one contiguous block): **D-236** one full browser path with seeded actors, **D-237** its own CI job, **D-238** the verification link read from Mailpit, **D-239** the TOTP code computed with Node's `crypto`.

## 0. Preconditions

- [ ] 0.1 Re-read the snapshot: `git log --oneline -1`, `git status --short`, `grep -n 'jobs:' -A 2 .github/workflows/ci.yml`, `grep -n 'mailpit' compose.yaml`.
- [ ] 0.2 Confirm no harness exists: `find . -name 'playwright*' -not -path './node_modules/*'` and `grep -rn '"@playwright' package.json apps/*/package.json services/*/package.json` must both come back empty.
- [ ] 0.3 Confirm Mailpit's API in the pinned image: `docker compose exec -T mailpit wget -qO- http://127.0.0.1:8025/api/v1/messages` and record the response shape in this file. If it differs, use the spool-file fallback from D-238 and say so here.
- [ ] 0.4 Confirm the demo seed produces an `ACTIVE` mentor with a verified factor: `pnpm --filter api db:seed:demo` then `psql "$DATABASE_URL" -c "select m.status, t.verified from mentor_profiles m join two_factors t on t.user_id = m.user_id limit 3"`.

## 1. The support helpers (pure, tested first)

- [ ] 1.1 `e2e/support/totp.ts`: a `totp(secretBase32, atMs)` returning six digits, with base32 decoding kept in the same file. Verify: 1.2 proves it against the RFC vectors.
- [ ] 1.2 `e2e/test/totp.test.ts`: the RFC 6238 SHA-1 vectors (59, 1111111109, 1234567890 seconds) and the seeded `DEMO_TOTP_SECRET`. Verify: `node --import tsx --test e2e/test/totp.test.ts` passes and a deliberately wrong key makes it fail.
- [ ] 1.3 `e2e/support/mailpit.ts`: `latestLinkFor(address)` polling `MAILPIT_HTTP_URL` with a deadline and a clear timeout message naming the address and the SMTP host. Verify: point `MAILPIT_HTTP_URL` at a closed port and record the failure text.
- [ ] 1.4 `e2e/support/actors.ts`: the seeded mentor's address and password source (the seed's own exported constants) and a random-but-recorded student address per run, so a rerun does not collide. Verify: two consecutive runs use two different addresses, quoted in the handoff.
- [ ] 1.5 `e2e/playwright.config.ts`: `fullyParallel: false`, `retries: process.env.CI ? 1 : 0`, `trace: "on-first-retry"`, `screenshot: "only-on-failure"`, `webServer` entries for `web` and `api`, and a guard that throws unless the database name ends in `_test`. Verify: with `DATABASE_URL=…/connect` the config exits non-zero before any browser starts.

## 2. The path

- [ ] 2.1 Sign-up: open `/sign-up`, wait until more than two seconds have passed since the page's intent marker, fill the five visible fields, tick consent, submit, and assert the "check your email" state. Verify: the run reaches this state, and a submission under two seconds is a separate assertion in the spec that expects the refusal string.
- [ ] 2.2 Verification: read the link from Mailpit and visit it; assert the verified state. Verify: `psql "$DATABASE_URL" -c "select email_verified from users where email='<run address>'"` returns `t`.
- [ ] 2.3 Profile and field: create the student profile with one self-created field; assert it is saved and appears on `/profile`. Verify: one `student_profiles` row for the run's student.
- [ ] 2.4 Request: open the seeded mentor from `/mentors`, send a structured request through `/request/new`; assert it appears on `/requests`. Verify: one `mentorship_requests` row in `PENDING`.
- [ ] 2.5 Mentor decision: sign in as the seeded mentor (password, then the computed TOTP code), accept the request, and assert the mentorship page is reachable. Verify: one `mentorships` row linked to the request.
- [ ] 2.6 Thread: post one message as the mentor; assert the student sees it on `/mentorship/{id}`. Verify: the thread read returns two messages and one queued email row.
- [ ] 2.7 Outcome and confirmation: as the student report an outcome; as the mentor confirm it; assert the student sees the confirmed state. Verify: the ledger row exists — `psql "$DATABASE_URL" -c "select count(*) from outcome_events where outcome_id = …"` returns at least one.
- [ ] 2.8 The counted read: advance past the cooling period through the same mechanism the integration tests use (the sweeper entry point, never a clock change), assert `counted` on the outcome and a non-zero count on `/profile`'s impact section. Verify: the assertion fails if `earnsMentorReputation` is broken (mutation check, recorded here, restored).

## 3. The CI job

- [ ] 3.1 `.github/workflows/ci.yml`: a fourth job `e2e` with a `postgres:16-alpine` service, `pnpm install --frozen-lockfile`, `pnpm exec playwright install --with-deps chromium`, `pnpm --filter api db:migrate`, `pnpm --filter api db:seed:demo`, then `pnpm e2e`. Verify: `node -e "require('yaml').parse(require('fs').readFileSync('.github/workflows/ci.yml','utf8'))"` exits 0 and the service credentials match `DATABASE_URL`.
- [ ] 3.2 Confirm the job fails independently: push a branch whose spec asserts a wrong string and observe only `e2e` red while `checks` stays green; revert.
- [ ] 3.3 Root `package.json`: an `e2e` script, and `@playwright/test` pinned in `devDependencies`. Verify: `pnpm e2e --list` prints the spec without building anything.

## 4. Tests and docs

- [ ] 4.1 `apps/web/test/*` and `services/api/test/*` unchanged: `pnpm test` still reports the same per-package totals as before the change (record them).
- [ ] 4.2 `docs/milestones-and-phases.md` §5.5: tick the end-to-end line, citing the CI run URL and date. Verify: the box reads `[x]` and the run is named.
- [ ] 4.3 `docs/production-requirements.md` §11 "CI gates": name the job; leave §9 and §10 untouched. Verify: `grep -n 'e2e' docs/production-requirements.md` matches once.
- [ ] 4.4 `docs/mvp-build-plan.md` §4: DoD item 2 gains "and the browser path is green in CI". Verify: `grep -n 'browser path' docs/mvp-build-plan.md` matches.
- [ ] 4.5 `docs/local-setup.md`: a section on running `pnpm e2e` locally, the two prerequisites (stack up, `_test` database) and the timeout budget. Verify: `grep -n 'pnpm e2e' docs/local-setup.md` matches once.
- [ ] 4.6 `docs/known-debt.md`: record and close the missing end-to-end test (the 2026-11-15 audit's finding B4) in one row, with the run that closed it. Verify: `grep -n 'end-to-end' docs/known-debt.md` shows the row with a `Closed` status.
- [ ] 4.7 `docs/decision-log.md`: D-236 to D-239 in the existing field style. Verify: `grep -c '^### D-23[6-9]'` prints `4`.

## 5. Checks, review, handoff

- [ ] 5.1 `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` (twice, cold), `pnpm e2e` — every exit code recorded.
- [ ] 5.2 `openspec validate e2e-happy-path --strict` and `openspec validate --all --strict`; quote the totals.
- [ ] 5.3 Review gate per `AGENTS.local.md` §2: the adversarial pass asks what the spec would still pass with if the BFF route were removed, and whether any assertion depends on a wall clock.
- [ ] 5.4 Handoff: the CI job duration, the three mutation checks (wrong TOTP key, broken `earnsMentorReputation`, removed confirm step), and the local run time on Windows.
