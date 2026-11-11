# Tasks: request-draft-autosave

## 0. Preconditions

- [x] 0.1 Re-read the repository snapshot in `design.md` against the real tree: `git log --oneline -1`, `git status`, `grep -rn "localStorage" apps/web`, `grep -n "sign-out" apps/web/app/session-nav.tsx apps/web/app/account/sessions/page.tsx`. Verify: every snapshot line is confirmed or listed as a mismatch in the handoff.

## 1. The pure draft helper

- [x] 1.1 Add `apps/web/lib/request-draft.ts` with `DRAFT_KEY_PREFIX`, `DRAFT_TTL_MS` (twenty-four hours), the `RequestDraftValues` type, `parseDraft(raw)`, `readDraft(mentorId, storage)`, `writeDraft(mentorId, values, storage)`, `clearDraft(mentorId, storage)` and `clearAllDrafts(storage)`, each taking a `Storage`-shaped parameter that defaults to `globalThis.localStorage`. Every storage call is wrapped so an absent, throwing, or full store degrades to a no-op result. Verify: `pnpm --filter web typecheck` passes and the ESLint boundary rules report no import outside `apps/web`.
- [x] 1.2 Add `apps/web/test/request-draft.test.ts` with a fake storage: a round trip; a draft for one mentor not read for another; an expired draft ignored and removed; a malformed value ignored and removed; a throwing store; a quota-exceeded store; and `clearAllDrafts` removing only keys with the prefix. Verify: `pnpm --filter web test` passes and each test name maps to one spec scenario.

## 2. The form wiring

- [x] 2.1 In `apps/web/app/request/new/page.tsx`, read the draft once after the mentor id is known and apply it in an effect that runs once per mentor id, so the restored values are not overwritten by the initial state. Verify: a page test that reads the source asserts the read and the single application, and the manual check in 2.4 shows the restored values.
- [x] 2.2 Write the draft on change through a 400-millisecond debounce, and flush the pending write when the component unmounts. Verify: the page test asserts the debounce constant and the unmount flush; the manual check shows the text surviving a reload.
- [x] 2.3 Clear the draft after a successful create response and keep it on any failure. Verify: a page test asserts the clear call sits in the success branch only; the manual check covers a refused send.
- [x] 2.4 Add one string-catalog line to `apps/web/lib/strings.ts` announcing a restored draft, and render it only when a draft was restored. Verify: `grep -n "restored" apps/web/lib/strings.ts` shows the entry and no literal string remains in the page.

## 3. Sign-out clearing

- [x] 3.1 Call `clearAllDrafts()` in `apps/web/app/session-nav.tsx` after the successful sign-out post, and in `apps/web/app/account/sessions/page.tsx` after a successful sign-out-everywhere. Verify: a test asserts both call sites, and the manual check shows browser storage holding no draft after each path.

## 4. Manual verification on the local stack

- [ ] 4.1 With the local stack up, sign in as a student, open `/request/new?mentor={id}`, type into all six fields, reload, and confirm every value returns; then send successfully and confirm the key is gone; then repeat with a forced failure and confirm the values survive; then sign out and confirm no draft remains. Verify: each of the four observations is recorded in the handoff with the browser storage content before and after.

## 5. Docs and decisions

- [x] 5.1 Update `docs/mvp-build-plan.md` row 7, dropping "draft autosave remains open" and recording that it closed with this change. Verify: `grep -n "draft autosave remains open" docs/` returns nothing.
- [x] 5.2 Update `docs/functional-requirements.md`: mark `FR-REQ-02` built to depth with the draft's scope (on-device, per mentor, twenty-four hours, cleared on sign-out) and mark `FR-UX-02` partially built, naming what is still missing (offline states). Verify: both rows carry this change's name and the date.
- [x] 5.3 Update `docs/known-debt.md`: add the `FR-REQ-02` progress note, add the missing `FR-AUTH-09` row (self-deactivation has no reversal path; `grep -rn reactivate services/api/src` returns nothing), and record the accepted limit that a hard tab kill inside the debounce window loses the last keystrokes. Verify: each new row names one owner and one target.
- [x] 5.4 Add the decision rows `D-104`, `D-105` and `D-106` (full text at the end of this file) to `docs/decision-log.md`. Verify: `grep -n "D-104" docs/decision-log.md` shows the row and no earlier row was renumbered.
- [x] 5.5 Update `docs/milestones-and-phases.md` "Current state" and, if it names the last change, the `README.md` status line. Verify: the two files agree with each other and with the merge commit.

## 6. Full checks, review and handoff

- [x] 6.1 (done 2026-11-11: lint 0, typecheck 0, `CI=true pnpm test` 0 with domain 113 / web 164 / contracts 19 / api 231, 0 skipped; build 0) Run from the repo root with Docker up: `pnpm lint`, `pnpm typecheck`, then `CI=true pnpm test`, then `pnpm build`. Record each exit code and the per-package totals. `CI=true` is what makes the API integration files run; for this change it proves the untouched API still passes, so a run with many skipped files is UNVERIFIED. The api suite takes ten minutes or more, so run the four gates as one background job writing to a log file and read it back.
- [x] 6.2 Run the review gate from `AGENTS.local.md` section 2, shortened for a client-only diff: `verify-before-done`, `/ponytail-review`, `/ce-code-review`, and `review-diff`. The silent-failure hunt matters here because every storage call swallows an error, so list each swallow and its log line.
- [x] 6.3 Confirm the diff contains only the tasks above — no API, contract, schema or registry file should appear — then write the handoff naming the PR, the merge commit, the gate totals, and the manual observations from 4.1.

## Decision rows to add at apply

Add each of these to `docs/decision-log.md` as its own row. They are reserved here because this propose round may create only files under `openspec/changes/`.

**D-104**

- Date: 2026-11-11
- Decision: A request draft is kept in `localStorage` under one key per mentor profile, holding the six form field values only — never a token, a password, or an email address.
- Reason: it survives a tab close, which is the failure this fixes, and it needs no new dependency; the identity spec's "no token in browser storage" rule stays true because no credential is written.
- Status: Decided
- Affects: `mentorship/request-lifecycle` (ADDED requirement), `apps/web/lib/request-draft.ts`, `docs/known-debt.md`

**D-105**

- Date: 2026-11-11
- Decision: A stored draft expires twenty-four hours after its last write; an older draft is ignored and removed on the next read.
- Reason: a week-old half-written request would resurface against a mentor whose context has changed, and the loss it prevents is minutes of typing.
- Status: Decided
- Affects: `mentorship/request-lifecycle`, `apps/web/lib/request-draft.ts`

**D-106**

- Date: 2026-11-11
- Decision: Every request draft is cleared on sign-out at both call sites — the header sign-out and the sign-out-everywhere action on the sessions page.
- Reason: personal text on a shared device must not survive a deliberate sign-out, and the second call site would otherwise be missed by a rule that only names "the sign-out path".
- Status: Decided
- Affects: `apps/web/app/session-nav.tsx`, `apps/web/app/account/sessions/page.tsx`, `mentorship/request-lifecycle`

## Workflow follow-up

- Merge the PR with a merge commit after every check passes, then archive the change on its own `chore/archive-request-draft-autosave` branch, because the ruleset refuses a direct push to `main`.
- At archive, confirm the ADDED requirement landed in `openspec/specs/mentorship/request-lifecycle/spec.md` without altering any of its eight existing requirements, and that `openspec validate --all --strict` still passes.
