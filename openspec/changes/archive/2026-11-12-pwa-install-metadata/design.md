# Design: pwa-install-metadata

## Context

See `proposal.md` for motivation. Only the state that shapes the approach is recorded here.

**Repository snapshot (verified 2026-11-11, re-check at apply).**

- `main` is at `6e88994`, clean; `openspec list` reports no active change; `openspec validate --all --strict` reports 35 passed before this round's five directories exist. CI run `42989401590` on `main` is green, checks job 3m28s. No gate was run in this propose round.
- `apps/web` is Next.js `16.4.3` (`.pnpm/next@16.4.3_...`). The app router is in use: `apps/web/app/layout.tsx`, and twenty `page.tsx` files under `apps/web/app/`.
- `apps/web/public` does not exist (`ls apps/web/public` fails). No `manifest`, `sw.js`, `service-worker`, or `apple-icon` exists anywhere under `apps/web` outside `.next`.
- `apps/web/app/layout.tsx` carries the existing metadata; the app name string lives in `apps/web/lib/strings.ts` (`strings.appName`).
- `apps/web/package.json` runs `node --test` over `test/*.test.ts`; there is no React renderer and every web test asserts a pure helper or reads a file (`apps/web/test/mentor-directory.test.ts` reads a page source with `readFileSync`).

**Library behaviour confirmed with context7 (2026-11-11), recorded because it decides two decisions below:**

- Next.js app router: a web app manifest is declared as `app/manifest.ts` (or `.js`), default-exporting a function that returns a `MetadataRoute.Manifest`. The documented example declares name, short_name, description, start_url, display, background_color, theme_color and an icon array with `src`, `sizes` and `type`.
- Install criteria, in the same Next.js guide: "To ensure your application can be installed to a mobile home screen, you must have: 1. A valid web app manifest 2. The website served over HTTPS". A service worker is not listed as an install criterion, and the guide recommends against a custom install button because it is not cross-platform. That is the basis for D-107.
- App icons may also be generated as code (`app/icon.tsx`, `app/apple-icon.tsx` returning `ImageResponse`). Rejected for this change: it makes an icon a build-time route handler and adds a rendering surface for a static asset, when two committed PNGs satisfy the same criteria.

## Goals / Non-Goals

**Goals**

- The app declares a valid install identity that a supported mobile browser accepts.
- The icons, the theme colour, and the name have one source each, and a test fails if any of them drifts or goes missing.
- The absence of a service worker is a written requirement rather than an omission, so the next agent does not "fix" installability by adding an offline cache.

**Non-Goals**

- No offline behaviour, no caching, no install prompt UI.
- No redesign, no new component, no new page.
- No accessibility evidence and no narrow-viewport sweep (DEBT-38 and FR-UX-04 stay as they are).

## Decisions

Owner decisions keep the numbers the brief fixed (D-107 and D-108). Decisions taken while writing carry `R` numbers.

### D-107. No service worker and no offline cache (owner decision)

The change ships a manifest and metadata only. Offline behaviour belongs to `FR-UX-02` and an offline cache is a retention and privacy decision (what is stored on a shared device, for how long), so it is not a side effect of making the app installable. Confirmed by the framework documentation above: a valid manifest plus HTTPS is what installability needs; a service worker is not a criterion. Alternative rejected: a minimal fetch-handler service worker "for installability", which would take on cache semantics nobody has decided.

### D-108. Icons are rendered from the existing brand mark, flat tiles if none exists (owner decision)

Check the tree for a usable mark first (`apps/web/app/**` icon or image assets, `apps/web/public` if any, README assets). If one exists, render the three PNGs from it locally with a throwaway command and commit only the PNGs. If none exists, commit flat colour tiles at the documented sizes, state that in the handoff, and record it as a follow-up under the new capability. No dependency is added either way. Alternative rejected: a generated `app/icon.tsx` (see Context), and a placeholder that silently ships the wrong mark.

### R1. The manifest is `apps/web/app/manifest.ts`, not a static file

The framework convention wins: the file is typed, it is cached as a route handler, and it keeps the palette constants in one module next to the layout that reads them. A static `public/manifest.webmanifest` would work but duplicates the name and the colours and cannot be type-checked. Recorded so the convention is not re-litigated at apply.

### R2. The test reads the manifest module and the icon files; it does not render anything

`apps/web/test/manifest.test.ts` imports the default export and asserts: the required key set; that `start_url` is a path; that `display` is `standalone`; that there is an icon at exactly 192 and exactly 512; that at least one icon is declared `purpose` maskable; and, for each icon, that the file exists under `apps/web/public` and that its PNG header declares the width and height its entry claims. The PNG header read is 24 bytes (`IHDR` width and height at byte offsets 16 and 20) with `readFileSync`, which needs no dependency and no renderer. Alternative rejected: asserting only the JSON keys, which is exactly the failure mode where a missing icon quietly kills installability.

### R3. The `DEBT-50` correction rides this change as its own docs-only commit

`docs/known-debt.md` line 64 asserts that `FR-AUTH-09` has no reversal path and that `grep -rn reactivate services/api/src` returns nothing. The mechanism exists under a different name: `packages/domain/src/account-status.ts` returns `ACTIVATE_THEN_ALLOW` for `DEACTIVATED`; `services/api/src/identity/account-activation.ts` exports `resumeDeactivatedAccount`, which flips the row and writes `ACCOUNT_ACTIVATED` with `from_status: DEACTIVATED`; `services/api/src/identity/better-auth.ts` calls it on sign-in and refuses if the row was no longer `DEACTIVATED`. The UI promise in `apps/web/lib/strings.ts` ("Signing in again reactivates it") is therefore true. The row is corrected to built, no action, citing those paths, and the `FR-AUTH-09` annotation is aligned. It rides this change because it is one docs commit and the register otherwise sends the next run to build a duplicate route.

### R4. Palette and name have one source each

`background_color` and `theme_color` read from one exported constant in the manifest module, and the layout's `themeColor` reads the same constant. The display name reads `strings.appName`, so the manifest cannot drift from the header. Alternative rejected: literals in both files.

## Acceptance criteria

1. `GET /manifest.webmanifest` (the path the framework serves for `app/manifest.ts`) returns the manifest with name, short name, `start_url`, `display` equal to standalone, background colour, theme colour, and three icons.
2. The declared icons exist under `apps/web/public` at 192, 512 and 512 maskable, and each file's PNG header matches the size its entry claims.
3. The root layout declares the manifest and the theme colour, and the display name comes from the string catalog.
4. No service worker is registered anywhere in `apps/web`, and no `sw.js` or service-worker file exists.
5. `pnpm lint`, `pnpm typecheck`, `CI=true pnpm test`, `pnpm build` all pass from the repo root, with the same per-package totals as the previous archive plus one web test.
6. `DEBT-50` reads built with its evidence, and `DEBT-37` is narrowed to the parts still missing.
7. The install-on-device check is recorded as a manual step that was not run, in the handoff, exactly as task 4.1 of `request-draft-autosave` was.

## Assumptions

1. The app is served over HTTPS in every environment where install matters; local `http://localhost:3000` counts as a secure context for the browser, and `DEBT-16` records that a plain-http LAN address is a separate, known problem.
2. No brand mark exists as a file until the apply-time check says otherwise; the design covers both branches so the agent never stops on it.
3. A manifest route handler is acceptable in this repo's build; the framework caches it statically, and `pnpm build` in CI is the proof.

## Risks / Trade-offs

- The install check cannot be automated here. Mitigation: the test freezes every property installability depends on, and the device check is named as open in the handoff.
- `apps/web/public` is new, so `.dockerignore` and `Dockerfile.web` must not exclude it. Mitigation: a task checks both files after the build, since a missing public directory in the image would break install in the container while local `pnpm build` still passes.
- The maskable icon crops to a safe area; a mark that fills the frame loses its edges. Mitigation: the maskable variant keeps the mark inside the middle 80 percent; if no mark exists, the flat tile is already safe.

## Open Questions

- None blocking. The only unwritten fact is whether a brand mark exists as a file, and D-108 resolves both branches at apply time.

## Migration Plan

None. Static assets and metadata only; no schema, no backfill, no deploy ordering. Rollback is the revert of one commit.
