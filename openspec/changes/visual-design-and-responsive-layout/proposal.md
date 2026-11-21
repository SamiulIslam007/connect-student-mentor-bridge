# Proposal: visual-design-and-responsive-layout

## Why

The web app has **no stylesheet at all**: `find apps/web -name '*.css' -not -path '*/node_modules/*'` returns nothing, `grep -rn 'className' apps/web/app --include=*.tsx` counts **0**, `grep -rn '<style'` counts **0**, and `apps/web/app/layout.tsx` renders `<body>` with no class, no `<link>` and no font. Every screen — sign-up, the mentor directory, a request, a mentorship thread, the admin review queue — renders as default browser HTML.

The register does not say so. `FR-UX-01` ("installable, mobile-first PWA with responsive layouts … usable at a narrow viewport") is scored **PARTIAL**, credited for the manifest and icons (`apps/web/test/manifest.test.ts`), while its responsive-layout clause is unmet. `docs/design-system.md` is still "Planned, not yet created". This is the largest visible gap between the pilot product and a credible one, and no tracker records it.

## What Changes

- One `apps/web/app/globals.css`, imported once in `apps/web/app/layout.tsx`, holding the design tokens as CSS custom properties: surface, ink, muted ink, border, accent, the four stakeholder role colours, a type scale, a spacing scale, radii, and a focus ring.
- A small set of semantic classes on plain elements — container, card, button (primary/secondary/quiet), input/label/help, table, alert (info/warn/error), badge, and a two-column-to-one-column layout — so no page needs an inline style and no component library is added.
- All 23 user-facing pages restyled through those classes; the header becomes a responsive bar; admin tables stay tables with a horizontal scroll container at narrow widths.
- Responsive behaviour at 360 CSS px on the core student and mentor flows: no horizontal scrolling, primary action reachable without zoom, 44 px minimum touch targets, visible `:focus-visible`.
- Contrast that meets WCAG 2.1 AA for text and interactive elements against the new tokens, so change 5 has a palette to audit rather than an absence.

## Capabilities

### New Capabilities

- `experience/visual-design`: the token set, the shared stylesheet, the responsive contract at a narrow viewport, touch-target size, visible focus, and AA contrast. It is new because no existing capability states what the interface looks like; `experience/installable-pwa` owns the install identity and `experience/page-states` owns loading/empty/error vocabulary, and neither should grow a colour system.

### Modified Capabilities

None. `experience/installable-pwa` and `experience/page-states` are untouched: the manifest keys, the icon sizes, the absence of a service worker and the page-state vocabulary do not change.

## Impact

- **Code**: `apps/web/app/globals.css` (new), `apps/web/app/layout.tsx` (one import, the header shell), `apps/web/app/session-nav.tsx` (classes instead of bare markup), and the 23 page components for classes only. No data fetching, no state, no route changes.
- **Dependencies**: none. No Tailwind, no CSS-in-JS, no icon font. The only new file is a stylesheet.
- **CSP**: unaffected — `style-src 'self' 'unsafe-inline'` (`apps/web/lib/security-headers.ts:19`) already permits a same-origin stylesheet, and this change adds no nonce requirement.
- **Contract / data / migrations**: none.
- **Tests**: `apps/web/test/*` must stay green; a new `apps/web/test/design-tokens.test.ts` asserts the token file's shape and that every class used by a page exists in the stylesheet. Viewport and touch-target assertions run in the browser harness from `e2e-happy-path`.
- **Docs**: `README.md` §7.5 (the layout section gains a short token note), `docs/functional-requirements.md` `FR-UX-01` (the responsive clause becomes built, the install/device clause stays partial), `docs/known-debt.md` (the "no stylesheet" row closed), `docs/milestones-and-phases.md` "Current state", `docs/decision-log.md` (D-242, D-243).

## Depends on

- `e2e-happy-path` (soft): the viewport, touch-target and focus assertions need the browser harness it introduces. The CSS itself can land first; the assertions cannot.
- `dependency-security-bump` (soft): every PR is verified with a build gate that currently fails on a cold tree.

## Out of scope

- **Dark mode, a theme switcher, or user-chosen accents.** Light only, one palette; a second theme multiplies the contrast surface this change is trying to make auditable.
- **Motion: transitions, animations, skeleton loaders, a motion system.** The page-state vocabulary already covers what a user needs; motion is a separate taste with its own review.
- **A component library or any new dependency** — Tailwind, shadcn/ui, Radix, an icon package. The repo's rule is that a dependency arrives only inside an approved change that needs it, and plain CSS needs none.
- **Information-architecture, copy, or flow changes.** No label moves, no page is merged or split, no route changes; every string stays in `apps/web/lib/strings.ts`.
- **`docs/design-system.md`.** Tokens live in the stylesheet and ten lines in `README.md` §7.5; a document that restates them would be the "second plan" the repo forbids.
- **Admin table functionality** (sorting, filtering, pagination controls): the tables are restyled, not extended.
- **A print stylesheet, emails, or the manifest icons.**

## Risks and rollback

| Risk | Mitigation |
|---|---|
| A page-level class name collides or a page is missed | `apps/web/test/design-tokens.test.ts` cross-checks every `className` literal in `apps/web/app` against the stylesheet's selectors, so a typo or an omission fails a test rather than shipping |
| Restyling breaks a wiring test that greps markup | The web suite runs after each page group; a test that asserted bare markup is updated only where the assertion was about markup, never where it was about behaviour |
| The palette fails AA and change 5 inherits a problem | Contrast is computed for each token pair before the pages are styled, and the ratio is recorded in the design's acceptance criteria |
| A narrow-viewport fix changes desktop layout | The responsive rules are additive `@media (max-width: …)` blocks; the desktop rendering is asserted unchanged in the browser harness |
| The change is large and touches 20+ files | Pages are grouped by flow (auth, profile/requests, mentorship, admin/institution) with a commit per group, so a revert is one group, not the whole change |

**Rollback**: delete `globals.css`, revert the `layout.tsx` import and the class attributes per group. No behaviour, data or contract depends on the styling.

**Traces to** `FR-UX-01`, `FR-UX-02`, `FR-UX-04`, `NFR-ACC-01`, `DEBT-38`, `experience/page-states`, `experience/installable-pwa`, D-242, D-243.
