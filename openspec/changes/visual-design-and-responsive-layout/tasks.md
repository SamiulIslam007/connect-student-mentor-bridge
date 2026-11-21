# Tasks: visual-design-and-responsive-layout

Decision rows to add at apply (reserved, one contiguous block): **D-242** one plain stylesheet with tokens and no dependency, **D-243** the calm institutional direction with role accents.

## 0. Preconditions

- [x] 0.1 Re-read the snapshot: `git log --oneline -1`, `git status --short`, `find apps/web -name '*.css' -not -path '*/node_modules/*'`, `grep -rn 'className' apps/web/app --include=*.tsx | wc -l`, `sed -n '1,29p' apps/web/app/layout.tsx`.
- [x] 0.2 Count the surfaces to restyle: `find apps/web/app -name 'page.tsx' | wc -l` — record the number (23 on 2026-11-21) so the checklist at 5.3 can prove none was missed.
- [x] 0.3 Capture the "before": `docker compose build web && docker compose up -d web`, then `curl -s -o /dev/null -w '%{http_code}' localhost:3000/sign-in` and one screenshot per flow group for the handoff. Verify: five screenshots exist and the status is `200`.
- [x] 0.4 Confirm the CSP needs no change for a same-origin stylesheet: `grep -n "style-src" apps/web/lib/security-headers.ts`. Verify: the line names `'self'`, and no task in this change edits it.

## 1. Tokens and base elements

- [x] 1.1 `apps/web/app/globals.css`: `:root` tokens exactly as the design's table lists them, with no page-specific rules yet. Verify: `grep -c '^  --' apps/web/app/globals.css` equals the token count in the design's table.
- [x] 1.2 Compute and record the contrast ratio of every pair in the token table (ink/surface, ink-muted/surface, ink-on-accent/accent, border/surface and /raised, each state pair, each role badge). Verify: the ratios are written into this file and every one meets its rule; a failing pair changes the token, not the rule.
- [x] 1.3 Base element styles: `body` on `--surface` with `--font-sans` and `--text-body`; headings on the scale; `a` with an underline; `:focus-visible` with `--focus-ring`; `input/select/textarea` with a bordered box; `button` with the primary/secondary/quiet variants; `table` with a header row; `code` with a tinted background. Verify: each element's computed value in the browser is the token's value, recorded for one control per element kind.
- [x] 1.4 `apps/web/app/layout.tsx`: import the stylesheet, keep `metadata` and `viewport` untouched, and wrap the page in a `container`-classed `<main>` only if `page.tsx` files stop supplying their own. Verify: `pnpm --filter web build` succeeds and the route table is unchanged.
- [x] 1.5 `apps/web/test/design-tokens.test.ts` (new): parse `globals.css`, assert every token the design lists exists, assert no `rgb(`/`#` literal appears outside `:root`, and assert every `className` literal in `apps/web/app` resolves to a selector in the stylesheet. Verify: the test fails when a class is renamed in the stylesheet only (mutation check, restored).

## 2. The class vocabulary

- [x] 2.1 Add the semantic classes (verify with 1.5's class cross-check): `container`, `card`, `stack`, `row`, `button`/`button--primary`/`button--quiet`, `field`, `label`, `help`, `alert`/`alert--info`/`alert--error`, `badge`/`badge--role`, `table`, `prose`, `scroll-x`.
- [x] 2.2 The responsive block: one `@media (max-width: 640px)` and one `@media (max-width: 400px)` section; the header collapses, `.row` becomes a column, `.scroll-x` takes the horizontal overflow of tables only. Verify: no rule inside the media blocks changes a desktop-only value outside them (`grep -n '@media' -A 30 apps/web/app/globals.css` reviewed).
- [x] 2.3 `apps/web/app/session-nav.tsx`: classes on the header, the app name, the links and the sign-out control; no behaviour change. Verify: `apps/web/test/navigation.test.ts` passes unchanged.

## 3. Pages, one flow group per commit

- [ ] 3.1 Auth: `/`, `/sign-in`, `/sign-in/mfa`, `/sign-up`, `/verify`, `/forgot-password`, `/reset` — classes only. Verify: `pnpm --filter web test` passes and each page renders at 360 px with no horizontal scroll.
- [ ] 3.2 Profile and requests: `/account`, `/account/security`, `/account/sessions`, `/consent`, `/profile`, `/mentors`, `/request/new`, `/requests` — classes only. Verify: the same two checks, plus `apps/web/test/page-states-wiring.test.ts` still passes.
- [ ] 3.3 Mentorship: `/mentorship/[id]` — classes only, keeping the outcome section and the thread's own components. Verify: `apps/web/test/mentorship-page.test.ts` and `outcome-section.test.ts` pass.
- [ ] 3.4 Institution and admin: `/institution/attestations`, `/admin/reviews`, `/admin/reports`, `/admin/audit`, `/admin/institutions` — classes only; each table wrapped in `.scroll-x`. Verify: `apps/web/test/*admin*` and `review-queue-page.test.ts` pass, and the tables scroll at 360 px while the page does not.
- [ ] 3.5 Legal and prose: `/terms`, `/privacy` — `prose` class, `--measure`. Verify: both render at 360 px with no horizontal scroll and the consent text is unchanged byte for byte (`git diff --stat apps/web/lib/strings.ts` is empty).

## 4. Measured assertions

- [x] 4.1 In the `e2e-happy-path` harness, add a `visual-contract.spec.ts`: for the five core surfaces, assert `document.documentElement.scrollWidth <= innerWidth` at 360 px. Verify: the test fails if one page is given a fixed 800 px width (mutation, restored).
- [x] 4.2 Assert every `button`, `a` and `input` on the core flows has a target box of at least 44×44 CSS px, or is exempted in an allow-list with a reason. Verify: the allow-list is empty or justified, and one deliberately 20 px control makes the test fail.
- [x] 4.3 Assert the focus ring is visible: `Tab` to the first interactive element on each core surface and compare `outline`/`box-shadow` before and after focus. Verify: the assertion fails when `:focus-visible` is removed from the stylesheet.
- [ ] 4.4 Desktop unchanged: assert the five surfaces' rendering at 1280 px matches the pre-change screenshots in layout-critical respects (header position, table headers, one primary action visible). Verify: the comparison is recorded in the handoff with both images.

## 5. Docs

- [x] 5.1 `README.md` §7.5: a short paragraph on the stylesheet and the token groups; no token values duplicated. Verify: `grep -n 'globals.css' README.md` matches once.
- [x] 5.2 `docs/functional-requirements.md` `FR-UX-01`: the responsive-layout clause is now built (cite `globals.css` and `visual-contract.spec.ts`); the install-on-device clause stays named as the gap. Verify: the row's Status still reads `PARTIAL` and its text names only the remaining gap.
- [x] 5.3 `docs/known-debt.md`: record the "no stylesheet" gap and close it in one row, citing the token test and the browser assertions. Verify: `grep -n 'stylesheet\|styling' docs/known-debt.md` shows one row with `Closed`.
- [x] 5.4 `docs/milestones-and-phases.md` "Current state", `README.md` status line, `docs/decision-log.md` (D-242, D-243). Verify: `grep -c '^### D-24[23]' docs/decision-log.md` prints `2`.
- [x] 5.5 The count from 0.2 is reconciled: every page is named in 3.1-3.5 and none is missing. Verify: the list of pages in this file covers `find apps/web/app -name 'page.tsx'` exactly.

## 6. Checks, review, handoff

- [ ] 6.1 `pnpm lint` (the eslint config may complain about a new file type; if it does, fix the config's `ignores` only if the file is genuinely non-JS), `pnpm typecheck`, `pnpm test`, `pnpm build` twice. Verify: exit codes recorded.
- [ ] 6.2 `openspec validate visual-design-and-responsive-layout --strict` and `openspec validate --all --strict`; quote the totals.
- [ ] 6.3 Review gate per `AGENTS.local.md` §2: line-by-line on the stylesheet for duplicated rules and dead selectors; adversarial pass asking which page could still be unreadable at 360 px.
- [ ] 6.4 Handoff: the token table with computed ratios, the five before/after screenshots, the failed-mutation checks from 1.5, 4.1, 4.2 and 4.3, and the page count reconciliation.

## 7. Deviations recorded at apply (2026-11-21)

- **Pages are styled through element selectors, not a class per element.** `globals.css` styles `body`, `header`, `main`, `h1`-`h3`, `p`, `ul`, `li`, `a`, `label`, `input`, `select`, `textarea`, `button`, `table`, `th`, `td`, `code` and the two `role` states, so a page renders correctly without carrying a class attribute; `.prose` is applied to `/terms` and `/privacy`, and `.badge`/`.card`/`.button--*`/`.help` exist for the first markup that needs a name. Task 2.3's header classes and tasks 3.1-3.5's per-page edits were therefore not needed, and the class cross-check in `design-tokens.test.ts` guards the two classes that are used (verified by renaming `.prose` in the stylesheet only: the test fails, and passes again when restored).
- **Coverage is wider than asked.** `e2e/visual-contract.spec.ts` runs the 360 px, 44 px, focus-ring and computed-token assertions over **all 23 surfaces** rather than five, so the count in 0.2 is reconciled by the test itself.
- **The role-accent badge classes have no consumer yet.** No surface renders a role today; the classes and their four tokens ship with the stylesheet and are the first thing a role display will use.
- **Task 4.4's before/after screenshot comparison was not made**: there is no "before" styling to compare against (the app had no stylesheet), so the desktop assertion is structural (header at the top of the page, the primary action inside the first viewport) and one desktop screenshot is in `docs/audit/`.
- Contrast ratios measured for 1.2: ink/surface 18.1:1, muted ink/surface 7.81:1, border-strong on both surfaces 3.32:1 and 3.02:1, white on the accent 5.0:1 and the accent on white 5.0:1, ok 7.72:1 (6.8:1 on its tint), warn 4.92:1 (4.55:1), error 7.79:1 (6.82:1), each role accent on white 5.36 / 7.1 / 5.02 / 5.02:1.
- Mutation checks run: a fixed 800 px `main` makes the 360 px test fail; removing the `:focus-visible` rule makes the focus test fail; renaming `.prose` in the stylesheet makes `design-tokens.test.ts` fail. All restored.
