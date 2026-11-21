# Tasks: thread-read-state-ui

Decision rows to add at apply (reserved, one contiguous block): **D-246** mark-read on open, once per load and once per focus window, **D-247** the count on the list and in the thread, nowhere else.

## 0. Preconditions

- [ ] 0.1 Re-read the snapshot: `git log --oneline -1`, `git status --short`, `sed -n '12,21p' apps/web/app/api/mentorships/[[...path]]/route.ts`, `sed -n '2030,2045p' packages/contracts/openapi.yaml`, `grep -n 'unread_count' services/api/src/mentorships/mentorship.service.ts`.
- [ ] 0.2 Confirm the API behaviour the UI will rely on: `grep -n 'read' services/api/test/mentorship.integration.test.ts | head` and re-run that file. Verify: the suite passes and the marker's monotonic behaviour is asserted there, not assumed.
- [ ] 0.3 Confirm the BFF cannot reach the route today: `curl -s -o /dev/null -w '%{http_code}' -X POST localhost:3000/api/mentorships/<id>/read -H 'cookie: …'` returns `404`. Verify: the `404` is recorded as the "before" state.

## 1. The pure helper

- [ ] 1.1 `apps/web/lib/read-state.ts`: `unreadLabel`, `newSince`, `shouldMarkRead` as the design defines them; no React, no `next` import. Verify: 1.2's test fails when a branch of `shouldMarkRead` is removed.
- [ ] 1.2 `apps/web/test/read-state.test.ts`: zero vs one vs many; a marker before, at and after the newest message; `shouldMarkRead` at mount, under 30 seconds, at 30 seconds, and with a duplicate mount. Verify: the test fails if the 30-second guard is removed (mutation, restored).

## 2. The route

- [ ] 2.1 `apps/web/app/api/mentorships/[[...path]]/route.ts`: add `POST /:id/read` to `ALLOWED`, nothing else. Verify: `grep -n 'POST /:id/read' apps/web/app/api/mentorships/[[...path]]/route.ts` matches once.
- [ ] 2.2 A wiring test in the existing style asserts the entry exists and that the page posts to it. Verify: `apps/web/test/mentorship-page.test.ts` (or its sibling) fails if the allow-list entry is removed.

## 3. The pages

- [ ] 3.1 `apps/web/app/mentorship/[id]/page.tsx`: send the mark-read write on mount, re-read on the 30-second focus path, and render the "new messages" divider from `newSince`. Verify: the divider appears with a seeded unread message and disappears after the write, checked in the browser harness.
- [ ] 3.2 The failure path: a refused or failed write keeps the thread, shows the string-catalog error line and does not remove the divider. Verify: the wiring test covers the branch, and a manual refusal (invalid id) is recorded in the handoff.
- [ ] 3.3 `apps/web/app/requests/page.tsx`: the count badge through `unreadLabel`, inside the existing row, with no new fetch. Verify: the page's test asserts a badge for a non-zero count and no badge for zero.
- [ ] 3.4 `apps/web/lib/strings.ts`: the count label and the "new messages" marker text. Verify: `grep -n 'unread' apps/web/lib/strings.ts` matches, and no page carries a literal.

## 4. Tests and the server's invariants

- [ ] 4.1 `pnpm --filter web test`: all pass, with the new totals recorded.
- [ ] 4.2 `services/api/test/mentorship.integration.test.ts` unchanged and passing, including the break-glass scenario, so D-122's invariant is re-proved rather than assumed. Verify: the run's totals are quoted.
- [ ] 4.3 In the browser harness, one assertion that a mentor posting a message leaves the student's badge at `1` until the student opens the thread. Verify: it fails if the page stops sending the write.

## 5. Docs

- [ ] 5.1 `docs/functional-requirements.md` `FR-THR-02`: the row becomes `DONE` only if both halves are proven; otherwise the gap line names exactly what remains. Verify: the status marker and the gap sentence are consistent with 4.2 and 4.3.
- [ ] 5.2 `docs/known-debt.md`: close `DEBT-61` by the strike-through convention, naming the pages and the test. Verify: `grep -n 'DEBT-61' docs/known-debt.md` reads `Closed` with struck problem text.
- [ ] 5.3 `docs/api-contracts.md`: one line that the browser uses `POST /v1/mentorships/{id}/read` on opening the thread. Verify: the line is inside the existing mentorship section, not a new one.
- [ ] 5.4 `README.md` status line, `docs/milestones-and-phases.md` "Current state", `docs/decision-log.md` (D-246, D-247). Verify: `grep -c '^### D-24[67]'` prints `2`.

## 6. Checks, review, handoff

- [ ] 6.1 `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` (twice) — exit codes recorded.
- [ ] 6.2 `openspec validate thread-read-state-ui --strict` and `openspec validate --all --strict`; quote the totals.
- [ ] 6.3 Review gate per `AGENTS.local.md` §2: the adversarial pass asks whether any path could mark a thread read that the participant did not open, and whether the badge can ever disagree with the server.
- [ ] 6.4 Handoff: the before/after `404`, the badge and divider evidence from the browser run, the break-glass suite result, and the `FR-THR-02` verdict with its reason.
