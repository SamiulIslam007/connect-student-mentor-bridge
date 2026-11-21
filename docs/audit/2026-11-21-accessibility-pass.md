---
title: Accessibility pass, 2026-11-21
status: Partial
owner: Owner / CTO
date: 2026-11-21
sources: [openspec/changes/accessibility-evidence, e2e/accessibility.spec.ts, docs/functional-requirements.md]
---

# Accessibility pass, 2026-11-21

Scope: the automated WCAG 2.1 A/AA audit of every surface the web app serves, plus a
scripted keyboard traversal of five core flows. **The screen-reader (NVDA) pass was
not performed** — no agent can do it — and `FR-UX-04` therefore stays `PARTIAL`
(D-244, D-245).

## What was run

| Run | Command | Result |
|---|---|---|
| Automated audit | `pnpm exec playwright test --config e2e/playwright.config.ts accessibility` | 5 tests passed (54.5 s): 23 surfaces, 2 error states, 1 self-check, 1 keyboard walk |
| Keyboard walk | same spec, `keyboard traversal…` | 3, 8, 10, 5 and 9 focusable controls on `/`, `/sign-in`, `/sign-up`, `/requests`, `/mentors`; every one showed a 2 px `rgb(15, 98, 254)` outline |
| Runner self-check | same spec, `the runner detects a violation it is shown` | an appended `role="img"` with no name produced a blocking violation, so a clean result means something |
| Dependency audit | `pnpm audit --audit-level=high` | 2 moderate, unchanged by adding `@axe-core/playwright` 4.14.0 |

Chromium (Playwright 1.65.1, headless shell 159) on Windows 11. Every surface was
audited in its initial, signed-out render; the two error states were forced by
aborting `/api/**` so the alert line actually rendered.

## Automated result

Zero violations at every severity on all 23 surfaces, with 30 to 39 axe rules
passing per surface. The full per-surface counts are in the run output
(`event: "axe.surface"`), summarised by `event: "axe.summary"`.

| Group | Surfaces | Violations |
|---|---|---|
| Public | `/`, `/sign-in`, `/sign-in/mfa`, `/sign-up`, `/verify`, `/forgot-password`, `/reset` | 0 |
| Legal | `/terms`, `/privacy` | 0 |
| Student and mentor | `/profile`, `/mentors`, `/request/new`, `/requests`, `/mentorship/[id]`, `/account`, `/account/security`, `/account/sessions`, `/consent` | 0 |
| Institution and admin | `/institution/attestations`, `/admin/reviews`, `/admin/reports`, `/admin/audit`, `/admin/institutions` | 0 |
| Error states | `/requests`, `/mentors` with the read aborted | 0 |

The admin surfaces were audited in their signed-out render: the demo admin seed
writes a `PLATFORM_ADMIN` only through the development seed, and signing in with
one would need its printed password inside the suite. **Gap: the signed-in admin
surfaces are not covered by this automation** and are part of the manual pass.

## Findings

| # | Finding | Status |
|---|---|---|
| F1 | A date input draws no detectable outline when focus moves into its shadow sub-field during a Tab walk; a programmatic focus on the same input measures `2px solid rgb(15, 98, 254)` | Accepted and allow-listed in the spec with that reason. Chrome behaviour, not a page defect; the ring exists for a person tabbing in a normal browser session |
| F2 | A time input (`/mentors` availability filter) behaves the same way | Same as F1 |
| F3 | No screen-reader pass has been performed | **Open — OWNER ACTION.** NVDA on Windows over the five core flows: sign-up and verification, profile, request, mentorship thread, outcome and confirmation. Record findings in this table |
| F4 | The signed-in institution and admin surfaces are not in the automated set | Open — covered by the owner's manual pass until an admin fixture exists in the suite |

## Limitations

- A headless Chromium on a developer machine is not a low-end Android device; the
  device and slow-network check stays `DEBT-37`.
- Contrast was measured for the tokens when the palette was chosen
  (`visual-design-and-responsive-layout`, task 1.2) and axe reports no
  `color-contrast` finding, but neither substitutes for a person looking at the
  screen.
- The audit covers rendered states, not flows: a screen only reachable after a
  state change is covered only if it was rendered when audited.
