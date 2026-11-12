# Proposal: pwa-install-metadata

## Why

`FR-UX-01` is Must, scored zero, and recorded as `DEBT-37`: "no manifest, no service worker, no install path; the app is responsive Next.js only". The pilot's stated primary device is a low-end Android phone (`FR-UX-01`, `docs/functional-requirements.md` section 0.3), and the requirement's own acceptance line is that the app "can be installed" from a supported mobile browser. Today nothing in `apps/web` declares a manifest, an install identity, or an icon set: `apps/web/public` does not exist and a search for `manifest` under `apps/web` finds only build artifacts.

The cost is asymmetric. Every other Must row in UX is a multi-day surface (accessibility evidence, offline states, an onboarding checklist), while installability is metadata plus two icons. The pilot device story improves the most per hour spent here, and the change carries no API, no contract, no schema and no design work, so it is the safest possible first change of an unattended run.

## What Changes

- Add `apps/web/app/manifest.ts` returning `MetadataRoute.Manifest` (the Next.js 16 app-router convention, confirmed with context7 on 2026-11-11): name, short name, a description, `start_url`, `display` standalone, `background_color`, `theme_color`, and three icon entries (192, 512, and one 512 maskable).
- Add the two icon files under `apps/web/public/`, rendered from the existing brand mark by a one-off local render with no new dependency; if no brand mark exists as a file in the tree, ship flat colour tiles and say so in the handoff.
- Declare the manifest through the root layout metadata, and add an apple-touch icon and the theme colour, so iOS home-screen install and the browser chrome both pick them up.
- Add `apps/web/test/manifest.test.ts` asserting the parsed manifest's required keys and, separately, that every declared icon exists on disk at the size it claims. A missing icon fails installability silently, so presence and size are asserted, not just the key.
- Correct `DEBT-50` and the `FR-AUTH-09` annotation as a docs-only commit inside this change (evidence at the end of this file), because the reactivation mechanism already exists and the register says it does not.
- Narrow `DEBT-37` to the parts this change does not cover.

## Capabilities

### New Capabilities

- `experience/installable-pwa`: the install identity of the web app — the manifest, its icons, and the deliberate absence of a service worker and an offline cache.

### Modified Capabilities

None. No existing spec mentions a manifest, an install path, or a service worker (`grep -rn -i "manifest\|installable\|PWA" openspec/specs/` returns nothing), so an additive capability collides with nothing at archive.

## Impact

- **Code**: `apps/web/app/manifest.ts` (new), `apps/web/app/layout.tsx` (manifest, icons and theme metadata), `apps/web/public/icon-192.png`, `apps/web/public/icon-512.png`, `apps/web/public/icon-maskable-512.png` (new directory and files).
- **Tests**: `apps/web/test/manifest.test.ts` (new). No existing test changes: no page, route, contract, registry or helper is touched.
- **API/contract**: none. No route, no OpenAPI path, no body key, no authorization-matrix row.
- **Data**: none. No table, column, enum or migration.
- **Dependencies**: none added. The icon render is a one-off local script run, not a checked-in build step.
- **Docs**: `docs/functional-requirements.md` (`FR-UX-01` built, with the manual device step left open), `docs/known-debt.md` (`DEBT-37` narrowed, `DEBT-50` corrected), `docs/decision-log.md` (D-107, D-108), `docs/mvp-build-plan.md` section 5, `docs/milestones-and-phases.md` current state, `README.md` status line, `docs/local-setup.md` only if the icon files change a local step (they do not).

## Depends on

- `platform/workspace` (archived 2026-10-29): the `apps/web` workspace, its test runner and the `test/*.test.ts` glob this test joins.
- `identity/account-navigation` (archived 2026-11-05): the root layout and the string catalog the manifest's display name reads from.

## Out of scope

- A service worker, an offline cache, a background sync, or any caching policy (D-107).
- A custom install button or a `beforeinstallprompt` handler; browsers show their own prompt.
- The narrow-viewport sweep across the student, mentor, institution and admin areas, and the recorded WCAG evidence (`FR-UX-04`, DEBT-38).
- The offline and error states of `FR-UX-02`.
- A store listing, a splash-screen generator, or per-role manifests.

## Risks and rollback

| Risk | Mitigation |
|---|---|
| A manifest whose icon is absent or the wrong size fails installability with no error anywhere | The test asserts each declared icon's presence on disk and its pixel size, so a missing or mis-sized file fails a gate rather than a device |
| The theme colour drifts from the app's real palette | One constant read by both the manifest and the layout metadata, so there is a single source |
| Someone adds a service worker later for "installability", quietly taking on an offline-cache and retention decision | The capability carries an explicit requirement that no service worker and no offline cache exist, so adding one is a spec change, not a tidy-up |
| The icon render introduces a dependency or a build step | The render is a one-off local run; only the PNGs are committed, and no package is added |

Rollback: delete `apps/web/app/manifest.ts`, the three icon files, the layout metadata additions and the test. Nothing persisted server-side; no data is affected.

**Traces to** FR-UX-01 (installable, mobile-first PWA); FR-UX-02 (offline states, explicitly not this change); ADR-016 (Docker-first local stack, untouched); D-107 and D-108 (this change); DEBT-37 (narrowed), DEBT-50 (corrected), DEBT-38 (untouched).
