# Proposal: ui-state-sweep

## Why

`FR-UX-05` is Must: "Designed empty, loading, and error states for every list and form". Today five list surfaces have all three, and ten pages that accept input or show a record have none: a save that is running and a save that failed look identical, and a slow read renders an empty page with no explanation. That is the difference between a pilot user retrying and a pilot user giving up.

## What Changes

- Add one pure state module `apps/web/lib/page-state.ts`: the state union (`idle`, `loading`, `error`, `empty`, `ready`), the transitions a submit or a load performs, and the string key each state maps to.
- Apply it to the pages that lack states: `/account/security`, `/account/sessions`, `/profile`, `/request/new`, `/sign-in`, `/sign-up`, `/sign-in/mfa`, `/forgot-password`, `/reset`, `/verify`.
- Every write-capable control shows an in-flight state (disabled plus a loading line) and a failed state with the server's own message; every read surface shows a loading line, an error line with retry, and an empty line.
- Every error line carries `role="alert"` so a state change is announced, not only rendered.
- Add a test that reads each touched page file and asserts the state keys are rendered, which is how this repo proves page wiring without a renderer.
- Web only. No API, contract, schema or string-catalog shape change beyond new keys.

## Capabilities

### New Capabilities

- `experience/page-states`: the contract for how a page reports "working", "nothing here" and "this failed", so later pages inherit one pattern instead of inventing a fourth.

### Modified Capabilities

None. No existing requirement states the opposite.

## Impact

- **Code**: `apps/web/lib/page-state.ts` (new), the ten pages listed above, `apps/web/lib/strings.ts` (new keys grouped per page), and no shared component is introduced.
- **Tests**: `apps/web/test/page-state.test.ts` (new, the pure module) and `apps/web/test/page-states-wiring.test.ts` (new, one assertion per touched page).
- **API/contract/data/dependencies**: none.
- **Docs**: `docs/functional-requirements.md` (`FR-UX-05` complete), `docs/mvp-build-plan.md` section 5, `docs/milestones-and-phases.md`. `FR-UX-04` stays Partial: this change adds `role="alert"` but is not an accessibility audit.

## Depends on

- Nothing. It reads no new endpoint and adds no route.

## Out of scope

- `FR-UX-04`'s WCAG evidence: no axe run, no contrast audit, no keyboard sweep (those belong to an accessibility change).
- A shared presentational component or a design-token change; the pages keep their existing markup and classes.
- Offline behaviour and a draft for any form other than the request form (`DEBT-37`, `DEBT-49`).
- Retry policy beyond one explicit retry control on a failed read.

## Risks and rollback

| Risk | Mitigation |
|---|---|
| Ten pages edited in one change is where regressions hide | Each page keeps its existing success path untouched; the diff adds a state branch and a disabled attribute, and the wiring test names the page it covers |
| A new string key collides with an existing one | Keys are added under each page's existing group and a test asserts the catalogue has no duplicate paths |
| The state helper becomes a framework | It is one union, two transitions and one mapping; a fourth behaviour is a new change with a reason |
| A page shows "error" for a signed-out session | The signed-out branch is checked before the error branch on every page that has both, and the wiring test asserts the order where it exists |

Rollback: revert the commit. No data, no route and no contract is involved.

**Traces to** FR-UX-05, FR-UX-02 (the failed-write half, already built for the request form); DEBT-37, DEBT-38 (untouched).
