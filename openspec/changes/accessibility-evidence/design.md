# Design: accessibility-evidence

## Context

See `proposal.md` — Why. Constraints that shape the approach:

- `apps/web/test/*` runs on `node --import tsx --test` with no DOM: there is no jsdom and no React testing library (`apps/web/package.json` lists only `@types/react` and `@types/react-dom` as dev dependencies). axe cannot run there, which is why the audit runs in the browser harness.
- The harness from `e2e-happy-path` already starts the stack, signs in actors and reaches every core surface; the audit reuses its fixtures rather than adding a second login path.
- `docs/audit/` holds dated records as precedent (`2026-11-15-hermes-explore.md`, `2026-11-20-round-five-apply-report.md`), which is where the manual record belongs.
- `apps/web/lib/page-state.ts` gives each of 10 surfaces an `error` and a `loading` state line; a "no visible error" finding is therefore about rendering, not about a missing state.
- The web CSP forbids third-party scripts; axe is injected by the test runner, never shipped to a user.

## Goals / Non-Goals

**Goals**

- A regression in accessibility fails a change, on the surfaces a student and a mentor actually use.
- One record a partner or an auditor can read, with a date, a scope and the assistive technology named.
- A severity floor that is honest about what blocks: serious and critical.

**Non-Goals**

- No accessibility fixes designed in this document; findings decide what code changes.
- No axe rule customization beyond disabling one rule with a written reason.
- No screen-reader matrix, no device matrix, no conformance statement document.

## Decisions

### D-244: Serious and critical fail the run; moderate and minor are recorded

- Date: 2026-11-21
- Decision: `@axe-core/playwright` runs on every audited surface with the default rule set; a `serious` or `critical` violation fails the run and names the surface, the rule and the element. `moderate` and `minor` are written into the run output and the record, and do not fail it.
- Reason: the two severities are the ones that map to a barrier a person cannot work around (no accessible name, an unlabelled input, a colour-only signal); the lower ones are frequently structural preferences whose fix is a whole-page change. A gate that fails on all four severities would be red for reasons no pilot user feels, and the first response to a red gate that blocks every PR is to weaken it.
- What would change this decision: the pilot reporting a real barrier from a moderate rule, in which case that rule is promoted to the gate individually rather than the whole severity raised.
- Alternatives rejected: (a) fail on every violation — unhittable on the first run and the first thing disabled; (b) report only, gate nothing — that is the state the repo is in today.
- Status: Decided (owner-approved as the audit's A1 recommendation)
- Affects: `e2e/accessibility.spec.ts`, `.github/workflows/ci.yml` (the existing `e2e` job)

### D-245: The manual pass is a dated record in `docs/audit/`, and it is what makes `DONE` legitimate

- Date: 2026-11-21
- Decision: one file, `docs/audit/<date>-accessibility-pass.md`, naming the surfaces covered, the browser and NVDA version, every finding, its fix or its tracking row, and the automated run that covers the same surfaces. `FR-UX-04` becomes `DONE` only when that file exists and its AA findings are closed.
- Reason: the row has been `PARTIAL` for a month because "we designed it accessibly" is not evidence. A dated record with a scope is what a partner asks for, and it is the same shape `docs/runbook.md` uses for a restore drill (`D-227`'s precedent: a hand-filled record table, no scripted proof).
- What would change this decision: an accessibility audit by a third party before the pilot, which would become the record's source and make the manual pass a repetition rather than the evidence.
- Status: Decided (owner-approved as the audit's A2 recommendation)
- Affects: `docs/audit/`, `docs/functional-requirements.md` (`FR-UX-04`), `docs/known-debt.md` (`DEBT-38`)

## The audited surface list

Derived from the pages the app serves; the list is asserted by a test so a new page cannot slip past it.

| Group | Surfaces |
|---|---|
| Public | `/`, `/sign-in`, `/sign-up`, `/verify`, `/forgot-password`, `/reset`, `/sign-in/mfa` |
| Legal | `/terms`, `/privacy` |
| Student and mentor | `/profile`, `/mentors`, `/request/new`, `/requests`, `/mentorship/[id]`, `/account`, `/account/security`, `/account/sessions`, `/consent` |
| Institution and admin | `/institution/attestations`, `/admin/reviews`, `/admin/reports`, `/admin/audit`, `/admin/institutions` |

States: each surface is audited once in its initial render, and the three with an error state (`/requests`, `/mentors`, `/mentorship/[id]`) are audited again with the error line rendered, because an alert that is invisible to a screen reader is the failure mode this product cannot afford.

## Risks / Trade-offs

- axe cannot see reading order, focus traps or an unhelpful alt text → the manual pass is not optional; the two halves cover different failures and the record says which found what.
- A serious violation on a page nobody uses (`/admin/audit` when no admin exists) still blocks → all audited surfaces are reachable in the harness with a seeded platform admin, so the finding is real; a page that cannot be reached is a finding in itself.
- The audit lengthens the `e2e` job → axe is injected into pages already loaded by the existing fixtures; the measured addition is one assertion pass per surface, not a new navigation.
- A single disabled rule can hide a class of barriers → any rule disabled is named in the record with the reason and the review that accepted it.

## Migration Plan

1. Land the wrapper and the spec with the baseline recorded, before fixing anything, so the "before" number is evidence rather than memory.
2. Fix by rule, not by page, re-running the full list after each fix group.
3. Take the manual pass last, when the interface has stopped moving, and write the record the same day.
4. Only then tick `FR-UX-04` and close `DEBT-38`.

**Rollback**: the spec and dependency are removable; the fixes are improvements that stay. The record, if already written, remains accurate for the code it described and is amended, not deleted.

## Open Questions

None.
