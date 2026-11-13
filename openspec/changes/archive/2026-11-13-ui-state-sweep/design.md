# Design: ui-state-sweep

## Context

**Repository snapshot (re-verified 2026-11-13 at apply).**

- `main` is at `9132af4`, clean except the four untracked proposal directories, `openspec validate --all --strict` passes.
- Five pages already carry all three states with the pattern `state === "loading"` / `state === "error"` / `state === "ready" and length === 0`: `apps/web/app/mentors/page.tsx` (lines 218-260), `apps/web/app/requests/page.tsx` (line 150), `apps/web/app/admin/reports/page.tsx` (line 197), `apps/web/app/admin/reviews/page.tsx` (line 123), `apps/web/app/admin/institutions/page.tsx` (lines 112-124), plus `institution/attestations`.
- Ten pages have no such branch: `account/security`, `account/sessions`, `profile`, `request/new`, `sign-in`, `sign-up`, `sign-in/mfa`, `forgot-password`, `reset`, `verify`. The scan that produced this list is `grep -c 'state === "loading"\|state === "error"\|empty'` over every `page.tsx` and `*-form.tsx`.
- **Correction to the propose-time snapshot:** `app/mentorship/[id]/page.tsx` was listed as lacking states. It does not: `lib/mentorship-view.ts` already exports `pageState` and `pageStateMessage` (loading, signed-out, not-found, error, ready) and `test/mentorship-page.test.ts` asserts both, so that page is out of this change. `app/consent/page.tsx` (added by the consent change after this proposal was written) has a loading line but no `role="alert"` and no retry; it is recorded as a follow-up rather than widened into this change.
- `apps/web/lib/strings.ts` is 725 lines, grouped by surface, and every page test asserts a string key rather than a rendered node.
- Web tests never render: `node:test` here has no React renderer, and the existing page tests `readFileSync` the page and assert the call or the key.
- `apps/web/app/verify/page.tsx`, `reset/reset-form.tsx` and `sign-in/mfa/page.tsx` already render an inline message for one failure path; they lack the in-flight and the retry branches.

## Goals / Non-Goals

**Goals**

- One state vocabulary across the eleven pages, expressed as a pure module so it is testable without a renderer.
- A user can tell "working" from "nothing" from "failed" on every surface that a pilot user touches.
- The error line is announced, not only drawn.

**Non-Goals**

- No component extraction, no CSS or token change, no layout redesign.
- No accessibility audit; `role="alert"` is the only a11y addition.
- No offline cache and no new form drafts.

## Decisions

The brief fixed the scope; decisions taken here carry `R` numbers.

### R1. A pure module, not a component

`apps/web/lib/page-state.ts` exports the state union, `beginLoad`, `beginSubmit`, `settleSuccess`, `settleFailure` and `stateKey(state, surface)`. Pages call it and render their own markup, which keeps the existing classes and lets the test run without a renderer. Alternative rejected: a shared state component, which the test harness cannot render and which would make the diff eleven rewrites instead of eleven additions.

### R2. Five states, and "empty" is not "ready with zero rows" by name only

The union is `idle`, `loading`, `error`, `empty`, `ready`. A read that returns an empty array moves to `empty`, so a page cannot render a bare empty container by forgetting a branch. Alternative rejected: keeping `ready` plus a length check, which is what the three-state pages do and is exactly the branch that gets omitted.

### R3. A failed write keeps the input and states the server's message

Every touched form settles to `error` with the problem-details `detail` when the response carries one, and to its own generic string otherwise; the input values are never cleared on failure. Alternative rejected: a toast, which the app has nowhere and which would be a new mechanism for one behaviour.

### R4. `role="alert"` on the error line only

The error line carries `role="alert"`; loading and empty lines do not, because announcing every state change is noise. Alternative rejected: `aria-live="polite"` on a wrapper, which needs an always-mounted region on eleven pages.

### R5. One wiring test, not eleven page tests

`apps/web/test/page-states-wiring.test.ts` holds one table of `{ file, requiredKeys }` and loops over it, reading each file and asserting the keys are rendered and the module is imported. Alternative rejected: eleven near-identical files, which is eleven places to forget when a page is added.

## Assumptions

1. The five pages that already have states are not touched: their pattern is compatible with the module but rewriting them adds risk without adding a behaviour. If a reviewer wants uniformity, that is a follow-up.
2. The `verify` and `reset` pages reach their terminal state from a URL parameter rather than a submit, so their "loading" is a brief read state; the module still describes it.
3. No new endpoint is needed for any retry control: every touched read already exists.

## Acceptance criteria

1. `grep -l "page-state" apps/web/app` lists the ten pages.
2. `grep -c 'role="alert"' apps/web/app` is at least ten (one per touched page's error line).
3. The wiring test fails if any page's error line is removed, and passes on the final tree.
4. No file under `services/api`, `packages/contracts` or `apps/web/app/api` changes.
5. `pnpm --filter web test` count rises by the two new files' cases and no existing web test changes.

## Risks

- The ten-page diff is large for one change; the mitigation is that each hunk is an addition and the gate is the wiring test, not review by eye.
- A page with both a signed-out branch and an error branch can render the wrong one; the task requires the signed-out check first and the wiring test asserts the order where both exist.
