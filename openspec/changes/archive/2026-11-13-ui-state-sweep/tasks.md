# Tasks: ui-state-sweep

## 0. Preconditions

- [x] 0.1 Re-check the snapshot in `design.md`: `git log --oneline -1` (expect `9132af4`), `git status`, and re-run the scan `for f in $(find apps/web/app -name page.tsx -o -name '*-form.tsx'); do echo "$(grep -c 'state === \"loading\"\|state === \"error\"\|empty' $f) $f"; done | sort -n`. Verify: the ten files in `design.md` are the ones with a count of zero, and any file that gained a state since is struck from the list and named in the handoff.
- [x] 0.2 Grep the string catalogue groups for each touched page so new keys land in the existing group: `grep -n "^  account: {\|^  sessions: {\|^  security: {\|^  profile: {\|^  requestNew: {\|^  signIn: {\|^  signUp: {\|^  mfa: {\|^  forgotPassword: {\|^  reset: {\|^  verify: {" apps/web/lib/strings.ts`. Verify: every touched page has a group, and none is invented.

## 1. The state module

- [x] 1.1 Add `apps/web/lib/page-state.ts` with the union, `beginLoad`, `beginSubmit`, `settleSuccess`, `settleFailure`, and `stateKey(state, surface)`. Verify: `pnpm --filter web typecheck` passes.
- [x] 1.2 Add `apps/web/test/page-state.test.ts`: a load from `idle` to `loading` to `empty` versus `ready`, a submit from `idle` to `loading` to `error` with and without a server message, and a key lookup for each of the ten surfaces. Verify: the file passes and asserts every surface has a key for every state it can reach.

## 2. The list and record pages

- [x] 2.1 `/account/sessions`: loading line, error line with retry, empty line when the caller has no sessions, and an in-flight state on the revoke control. Verify: the wiring test covers the file and the revoke control is disabled while running.
- [x] 2.2 `/account/security`: in-flight and failure states on enrollment, verification and disable; the existing success notices are unchanged. Verify: the wiring test covers the file.

## 3. The form pages

- [x] 3.1 `/profile`: in-flight and failure states on each save (student profile, mentor profile, availability, affiliation), with the typed values kept on failure. Verify: the wiring test covers the file and names the four submits.
- [x] 3.2 `/request/new`: in-flight and failure states on the send; the existing draft behaviour (`request-draft.ts`) is untouched and the draft is still kept on failure. Verify: `apps/web/test/request-draft.test.ts` still passes unchanged.
- [x] 3.3 `/sign-in`, `/sign-up`, `/sign-in/mfa`, `/forgot-password`, `/reset` (the `reset-form` client component), `/verify`: an in-flight state on every submit and a failure line carrying `role="alert"`. `/verify` has no submit — it renders a terminal state from its URL parameter — so it gains the alert role on its failure line only. Verify: the wiring test covers all six files with each page's own required keys.

## 4. Strings and the wiring test

- [x] 4.1 Add the new keys under each page's existing group in `apps/web/lib/strings.ts` (loading, empty where applicable, failure, retry). Verify: `grep -c "loading" apps/web/lib/strings.ts` rises by the number of touched pages, and no group is duplicated.
- [x] 4.2 Add `apps/web/test/page-states-wiring.test.ts` with one table entry per touched page: the file path, the module import, and the required keys. It reads each file and asserts them. Verify: deleting one error line from one page makes the test fail, then restore it.
- [x] 4.3 Assert `role="alert"` appears on each touched page's error line in the same test. Verify: the count assertion in `design.md` acceptance criterion 2 passes.

## 5. Docs

- [x] 5.1 Update `docs/functional-requirements.md` `FR-UX-05` as complete, naming the eleven pages and the module.
- [x] 5.2 Update `docs/mvp-build-plan.md` section 5 and `docs/milestones-and-phases.md` "Current state". `FR-UX-04` is explicitly not closed here; no debt row changes.

## 6. Gates, review and handoff

- [x] 6.1 Run from the repo root: `pnpm lint`, `pnpm typecheck`, `CI=true pnpm test`, `pnpm build`, each with its exit code echoed, in one background job writing to a log file. The web count must rise by the two new files; every other package's count must be unchanged.
- [x] 6.2 Review gate per `AGENTS.local.md` section 2: verify-before-done, `/ponytail-review` (the diff is eleven additions, so check for copy drift), and the silent-failure hunt (a swallowed error that leaves the page on `ready`).
- [x] 6.3 Handoff: the eleven pages, the two new test files, the observed failure from 4.2, the four gate totals, and the register row flipped with `FR-UX-04` still Partial.
