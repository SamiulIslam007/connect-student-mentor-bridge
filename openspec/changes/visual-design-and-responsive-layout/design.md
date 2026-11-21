# Design: visual-design-and-responsive-layout

## Context

See `proposal.md` — Why. Constraints that shape the approach:

- `apps/web/app/layout.tsx` is 29 lines: `metadata`, `viewport` with `themeColor: manifestColors.theme`, and a `<body>` containing `<SessionNav />` and `{children}`. There is no stylesheet, no font, no class.
- 23 pages exist under `apps/web/app`: `/`, `/sign-in`, `/sign-in/mfa`, `/sign-up`, `/verify`, `/forgot-password`, `/reset`, `/account`, `/account/security`, `/account/sessions`, `/consent`, `/terms`, `/privacy`, `/profile`, `/mentors`, `/request/new`, `/requests`, `/mentorship/[id]`, `/institution/attestations`, `/admin/reviews`, `/admin/reports`, `/admin/audit`, `/admin/institutions`.
- `apps/web/app/manifest.ts` already exports `manifestColors`, and the viewport theme colour comes from it — the one existing colour source, and the stylesheet must stay consistent with it.
- `apps/web/lib/security-headers.ts:19` allows `style-src 'self' 'unsafe-inline'`, so a same-origin stylesheet needs no CSP change and no nonce (the inline-script gap stays `DEBT-60`, untouched).
- Every visible string is in `apps/web/lib/strings.ts` (797 lines) and `FR-UX-03` forbids hard-coded text. CSS carries no user-facing copy, so the catalog is not touched — but `content:` strings and `aria-label` values are not allowed in the stylesheet for the same reason.
- The page-state vocabulary (`apps/web/lib/page-state.ts`, 5 states, 10 surfaces) defines loading/empty/error semantics; the styles must render those states, not replace them.
- `apps/web/test/page-states-wiring.test.ts` reads page sources; a class attribute added to a page is visible to that test's greps, so the run after each group is not optional.

## Goals / Non-Goals

**Goals**

- A coherent, calm interface that reads as an institutional product, not a demo, with one visual language across student, mentor, institution and admin surfaces.
- Contrast and target size that are properties of the tokens, so change 5's automated audit has nothing structural to find.
- A narrow-viewport contract a test can measure: document width ≤ viewport, 44 px targets, visible focus.

**Non-Goals**

- No dark theme, no colour-picker, no per-role theme beyond badge accents.
- No motion, no transitions, no skeleton loaders.
- No layout redesign that moves controls between pages, renames anything, or changes what a page fetches.
- No typographic webfont download (a font CDN is a third-party request inside the one page load that must never fail; system font stacks only).

## Decisions

### D-242: One plain `globals.css` with tokens, no styling dependency

- Date: 2026-11-21
- Decision: a single `apps/web/app/globals.css` imported by `app/layout.tsx`, holding `:root` custom properties and semantic classes applied to plain elements. No Tailwind, no CSS modules per page, no CSS-in-JS.
- Reason: the repository carries no styling dependency and its rules forbid adding one outside an approved change; a token file plus ~15 semantic classes is the smallest complete answer, needs no build configuration, and keeps one idiom instead of two. The app's own CSP already allows a same-origin stylesheet with no nonce.
- What would change this decision: a designer handing over a token contract in a different format (the tokens still fit a plain CSS file), or the page count doubling with a component library already in use elsewhere.
- Alternatives rejected: (a) Tailwind — faster iteration, but a dependency, a config surface, a second idiom and a content-scanning step in a repo where every gate is hand-listed; (b) CSS modules per page — scoping without shared tokens, 23 files to keep in sync.
- Status: Decided (owner-approved as the audit's V1 recommendation)
- Affects: `apps/web/app/globals.css`, `apps/web/app/layout.tsx`

### D-243: Calm institutional direction, with the four stakeholder colours as role accents only

- Date: 2026-11-21
- Decision: a restrained palette — one surface, one ink, one accent for actions — with the four stakeholder colours already named in `README.md` §2 (cyan students, violet mentors, green institutions, amber employers) used only on role badges and never as a page or panel background. Type: a system stack, one scale with four sizes (display, heading, body, small). Spacing on a 4 px grid.
- Reason: the product is bought by institutions on the strength of evidence, so the visual register should read as documentation rather than as a startup landing page; and the stakeholder colours already exist in the project's own vocabulary, so using them as accents costs nothing and gives each role a recognisable marker.
- What would change this decision: the pilot partner supplying brand guidelines or a logo with its own palette.
- Alternatives rejected: (a) neutral product-SaaS — familiar but indistinguishable from any tool; (b) plain utility in the gov.uk register — the most accessible option and the least inviting to a 20-year-old student.
- Status: Decided (owner-approved as the audit's V2 recommendation)
- Affects: `apps/web/app/globals.css`, `README.md` §7.5

## The token contract

Declared in `:root`, consumed by classes only:

| Group | Tokens | Rule |
|---|---|---|
| Surface | `--surface`, `--surface-raised`, `--surface-sunken` | text on each meets its size's AA ratio |
| Ink | `--ink`, `--ink-muted`, `--ink-on-accent` | `--ink` ≥ 7:1 on `--surface`, `--ink-muted` ≥ 4.5:1 |
| Line | `--border`, `--border-strong` | interactive boundaries ≥ 3:1 against both surfaces they separate |
| Accent | `--accent`, `--accent-ink`, `--accent-quiet` | the accent is used for one primary action per view, never for text on a coloured panel without a checked pair |
| Role | `--role-student`, `--role-mentor`, `--role-institution`, `--role-employer` | badges only; a badge's text uses `--ink` and the role colour is the border and the tint |
| State | `--ok`, `--warn`, `--error` | each has a paired `-quiet` background whose text pair is checked |
| Type | `--font-sans`, `--text-display/-heading/-body/-small`, `--leading-*` | four sizes; no page sets a size outside the scale |
| Space | `--space-1..8` on a 4 px grid | no page sets a margin or padding outside the scale |
| Shape | `--radius-sm/-md/-lg`, `--focus-ring` | one radius per element class; focus ring 2 px with 2 px offset |
| Measure | `--measure` (~66ch) | body text in prose surfaces (`/terms`, `/privacy`) |

Contrast is computed for every pair at the time the tokens are chosen and the ratios are recorded in the task that introduces them; a pair below its ratio is a design failure, not a styling preference.

## Risks / Trade-offs

- 23 pages styled by hand is the bulk of the work and a large diff → committed per flow group (auth, profile and requests, mentorship, admin and institution, legal), each with its own gate run.
- A class used by a page but missing from the stylesheet is silent visually → `design-tokens.test.ts` fails on it.
- Semantic HTML is already good (labelled controls, one alert line per surface); a class-based restyle could tempt a `<div>` where a `<button>` was → the review pass checks that no element's role changed.
- The narrow-viewport rules are `max-width` media queries, so desktop is the base → the desktop rendering is asserted unchanged in the browser harness before and after.

## Migration Plan

1. Tokens and base element styles (no page touched) — one commit; the app renders slightly differently everywhere and no test moves.
2. Class vocabulary (container, card, button, input, table, alert, badge) — one commit.
3. Pages by flow group, one commit each, with the web suite after each.
4. Viewport, target-size and focus assertions in the browser harness last, once the pages are styled.

**Rollback**: per group. Deleting `globals.css` and the `layout.tsx` import returns the app to today's rendering with no other change.

## Open Questions

1. **Which device represents a student for the narrow-viewport and slow-network check?** `DEBT-37` names a low-end Android and no device is chosen. Safe default used here: the owner's own Android handset plus a Chrome throttled profile at 360 CSS pixels, recorded as a limitation in the handoff, so the layout is measured even though the hardware is not representative. Choosing a device changes the copy of the record, not the CSS.
2. **Palette values.** Chosen during implementation under the contrast rule above; if any pair cannot meet its ratio without changing the direction (D-243), the pair changes, not the direction.
