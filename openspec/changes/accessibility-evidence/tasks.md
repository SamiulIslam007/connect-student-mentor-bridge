# Tasks: accessibility-evidence

Decision rows to add at apply (reserved, one contiguous block): **D-244** serious and critical gate with moderate and minor recorded, **D-245** the dated manual-pass record as the basis of a `DONE` claim.

## 0. Preconditions

- [ ] 0.1 Re-read the snapshot: `git log --oneline -1`, `git status --short`, `grep -n 'axe\|jsdom\|testing-library' apps/web/package.json package.json`, `ls e2e`.
- [ ] 0.2 Confirm the harness reaches every surface: run the happy-path spec and record which of the 23 pages it visits. Verify: the list of unvisited surfaces is written here, and the tasks below seed an admin and an institution admin so the remaining ones are reachable.
- [ ] 0.3 Record the dependency budget: `pnpm audit --audit-level=high` before adding axe. Verify: the count is quoted so 4.1 can compare.

## 1. The runner

- [ ] 1.1 Add `@axe-core/playwright` pinned to `devDependencies` at the root; `pnpm install` and commit the lockfile. Verify: `pnpm why @axe-core/playwright` resolves and a clean `pnpm install --frozen-lockfile` succeeds.
- [ ] 1.2 `e2e/support/axe.ts`: `auditPage(page, { floor: "serious" })` returning the formatted violations and a boolean, plus a `SEVERITIES` list. No page-specific logic.
- [ ] 1.3 `e2e/test/axe.test.ts`: the severity filter keeps `serious` and `critical`, drops `moderate` and `minor`, and formats a violation with its surface, rule id and element. Verify: `node --import tsx --test e2e/test/axe.test.ts` passes; a filter that keeps `moderate` makes it fail (mutation, restored).
- [ ] 1.4 `e2e/accessibility.spec.ts`: one test per group in the design's surface table, plus a test that the audited list equals `find apps/web/app -name 'page.tsx'`'s page set. Verify: adding a page without listing it fails that test.

## 2. The baseline, before any fix

- [ ] 2.1 Run the spec and write the full violation list into this file, grouped by rule, with counts per surface. Verify: `pnpm exec playwright test e2e/accessibility.spec.ts` output is summarised and the raw report is attached to the PR.
- [ ] 2.2 Classify each violation: fix in this change, fix in `visual-design-and-responsive-layout` (a token or class change), or carry with a debt row. Verify: every rule in 2.1 appears in exactly one of the three lists.

## 3. Fix to zero serious and critical

- [ ] 3.1 Fix the "no accessible name" and "unlabelled control" class of findings across the auth pages; re-run the full list. Verify: zero serious/critical on those surfaces and no new moderate.
- [ ] 3.2 The same for the student and mentor surfaces, including the error-state renders of `/requests`, `/mentors` and `/mentorship/[id]`; the alert line must be announced (role and live region). Verify: the error-state audit passes with its alert rendered.
- [ ] 3.3 The same for the institution and admin surfaces, with a seeded `PLATFORM_ADMIN` and `INSTITUTION_ADMIN`; tables must expose their headers. Verify: the audit passes on all five admin pages and the seed's admin path is recorded.
- [ ] 3.4 Contrast findings: any pair below its AA ratio is fixed in `globals.css` (not per page) and the computed ratio is updated in `visual-design-and-responsive-layout`'s task 1.2 record. Verify: no `color-contrast` violation remains and the token table's ratios are re-quoted.
- [ ] 3.5 Record each fix group's before/after counts. Verify: the numbers add up to the baseline from 2.1 minus what was carried.

## 4. The gates

- [ ] 4.1 `pnpm audit --audit-level=high` after adding axe: same severity line as 0.3. Verify: the two lines are compared in the handoff.
- [ ] 4.2 The `e2e` job runs the accessibility spec in CI on a branch, and the job is red when one serious rule is deliberately broken (mutation, reverted). Verify: the run URL and the failing rule are in the handoff.
- [ ] 4.3 `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` (twice), `pnpm e2e` — exit codes recorded.

## 5. The manual pass

- [ ] 5.1 Keyboard pass on the five core flows in Chrome: tab order follows the reading order, every control shows a focus ring, no focus escapes into a hidden element, and Escape closes anything that overlays. Verify: findings listed with the surface and the element.
- [ ] 5.2 Screen-reader pass with NVDA on Windows on the same five flows: labels announced, the error line announced, the unread/confirmation states announced. Verify: findings listed; each is fixed in this change or carried with a row.
- [ ] 5.3 Write `docs/audit/<date>-accessibility-pass.md`: surfaces, browser and NVDA versions, the automated run link, every finding with its fix or its tracking row, and the limitation that a dev-machine pass does not represent a low-end Android. Verify: the file names a surface for every audited page and no finding is left unclassified.

## 6. Docs

- [ ] 6.1 `docs/functional-requirements.md` `FR-UX-04`: `DONE`, citing the record and the spec. Verify: the row's status marker changes and both citations are present.
- [ ] 6.2 `docs/known-debt.md`: close `DEBT-38` by the strike-through convention, naming the record and the run. Verify: `grep -n 'DEBT-38' docs/known-debt.md` shows `Closed` and struck problem text.
- [ ] 6.3 `docs/production-requirements.md` §6 and §13.2: the accessibility line cites the record; nothing else in those sections moves. Verify: `git diff docs/production-requirements.md` touches only those lines.
- [ ] 6.4 `README.md` status line, `docs/milestones-and-phases.md` "Current state", `docs/decision-log.md` (D-244, D-245). Verify: `grep -c '^### D-24[45]'` prints `2`.
- [ ] 6.5 `docs/mvp-build-plan.md` §5 gains a row for this change if the round's table is short one. Verify: the table's last row names this change.

## 7. Review and handoff

- [ ] 7.1 `openspec validate accessibility-evidence --strict` and `openspec validate --all --strict`; quote the totals.
- [ ] 7.2 Review gate per `AGENTS.local.md` §2: the adversarial pass asks which audited surface could pass because it failed to render, and whether the error-state audits really render the alert.
- [ ] 7.3 Handoff: the baseline counts, the before/after per rule, the manual pass summary, the CI run URL, and every carried finding with its row.
