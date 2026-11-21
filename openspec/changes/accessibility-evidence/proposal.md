# Proposal: accessibility-evidence

## Why

`FR-UX-04` is a **Must** — "all Phase 1 flows meet WCAG 2.1 AA" — and it is `PARTIAL` with nothing measured in either direction: `DEBT-38` says "no automated axe run and no recorded keyboard or screen-reader pass", and `docs/production-requirements.md` §6 lists WCAG 2.1 AA as a reliability target with no evidence behind it. The web suite asserts semantic roles, labels and one alert line per surface, which is a design intention, not a measurement.

Today the claim cannot be made at all: until `visual-design-and-responsive-layout` there is no palette to check contrast against, and until `e2e-happy-path` there is no browser to run a check in.

## What Changes

- `@axe-core/playwright` (pinned, dev) and one `accessibility.spec.ts` that audits every Phase 1 surface in the browser harness: the 7 auth pages, 8 profile and request pages, the mentorship page, 5 institution and admin pages, and the two legal pages.
- The gate: **serious and critical** violations fail the run; moderate and minor are reported into a record, not a build.
- The baseline: one run recorded with its violation list (expected to be non-empty on the first pass), then fixed to zero serious/critical.
- One recorded **manual** keyboard pass (tab order, focus visibility, no focus trap, Escape on any overlay) and one recorded **screen-reader** pass (NVDA on Windows, the owner's machine) over the five core flows, with findings and fixes in one dated `docs/audit/` record.
- `FR-UX-04` moves to `DONE` only when both the automated run and the manual record exist and their AA findings are closed; `DEBT-38` closes with them.

## Capabilities

### New Capabilities

- `experience/accessibility`: the accessibility contract for the web app — what is measured, at what severity it blocks, what a manual pass must cover, and what evidence a `DONE` claim requires. It is separate from `experience/visual-design` because the audit outlives any one palette, and separate from `experience/page-states` because state vocabulary is not conformance.

### Modified Capabilities

None. `experience/visual-design` states the contrast and target-size rules this change measures; it is not modified here.

## Impact

- **Code**: `e2e/accessibility.spec.ts` (new), `e2e/support/axe.ts` (a thin wrapper that runs axe at a given severity floor and formats the report), and whichever page or stylesheet files the findings require fixing.
- **Dependencies**: `@axe-core/playwright` (dev, pinned). `pnpm audit --audit-level=high` unchanged.
- **CI**: the `e2e` job from `e2e-happy-path` runs the new spec in the same job; no new job.
- **Contract / data / migrations**: none.
- **Tests**: the browser spec, plus `e2e/test/axe.test.ts` for the severity filter's pure part.
- **Docs**: `docs/functional-requirements.md` (`FR-UX-04`), `docs/known-debt.md` (`DEBT-38` closed), `docs/production-requirements.md` §6 and §13.2 (the accessibility line cites the record), `docs/milestones-and-phases.md` "Current state", `README.md` status line, `docs/decision-log.md` (D-244, D-245), and one new record under `docs/audit/`.

## Depends on

- `e2e-happy-path` — the browser, the stack startup, the seeded actors.
- `visual-design-and-responsive-layout` — the palette the contrast rules are checked against, and the pages as they will actually ship.

## Out of scope

- **WCAG AAA.** The requirement names AA; a higher target is a different, unbudgeted piece of work.
- **Moderate and minor violations as a build gate.** They are recorded and triaged; a gate that fails on `landmark-unique` or `region` would be red for reasons no pilot user feels, and would be the first thing disabled.
- **Motion, prefers-reduced-motion, or animation review.** No motion exists (change 4's explicit non-goal).
- **Assistive-technology coverage beyond NVDA** (VoiceOver, TalkBack, JAWS). One screen reader, recorded honestly, is the pilot's evidence; a matrix is post-pilot.
- **PDF, email or document accessibility.**
- **An accessibility statement page or a conformance report for the partner.** Those are documents, not code, and belong with the legal drafts.
- **Automated fixes for anything axe cannot see** (reading order, meaningful alt text, error recovery): the manual pass is what finds those, and its findings are fixed by hand.

## Risks and rollback

| Risk | Mitigation |
|---|---|
| The first run reports dozens of violations and the change balloons | The baseline is recorded first and the fixes are grouped by rule, not by page; a rule that needs a design change is raised to the owner rather than patched around |
| axe reports a false positive on a well-built control | The severity floor means a moderate does not block; a serious false positive is suppressed with a one-line `INLINE_DISABLE`-style rule and a comment naming the reason, reviewed once |
| The manual pass is done once and never repeated | The record carries a date and a scope; the next change touching a flow re-runs the automated part and the record names what drifted |
| A screen-reader pass on a dev machine is not representative of a low-end Android | Recorded as a limitation in the record itself; the pilot's own device check (`DEBT-37`, out of scope here) covers the device, not the conformance |
| Styling fixes for one rule break another surface | Every fix is re-verified by the full automated run, not by the single page |

**Rollback**: remove the spec and the dependency; the fixes it drove stay, because they are improvements independent of the audit. `FR-UX-04` returns to `PARTIAL` with the reason recorded.

**Traces to** `FR-UX-04`, `NFR-ACC-01`, `DEBT-38`, `DEBT-37`, `experience/page-states`, `experience/visual-design`, D-244, D-245.
