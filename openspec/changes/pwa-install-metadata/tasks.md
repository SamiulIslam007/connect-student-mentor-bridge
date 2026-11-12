# Tasks: pwa-install-metadata

## 0. Preconditions

- [x] 0.1 Re-read the repository snapshot in `design.md` against the real tree: `git log --oneline -1` (expect `6e88994`), `git status`, `ls apps/web/public`, `node -p "require('./node_modules/next/package.json').version"` from the web workspace, `grep -rn -i "manifest\|service-worker" apps/web/app apps/web/lib`. Verify: every snapshot line is confirmed by an output or listed as a mismatch in the handoff before any file is written.
- [x] 0.2 Look for a brand mark: `find apps/web -type f \( -name "*.svg" -o -name "*.png" -o -name "icon*" \) -not -path "*/node_modules/*" -not -path "*/.next/*"`, and check `README.md` for one. Verify: the answer is recorded in this file (mark found at a path, or none found), which decides D-108's branch. **Result 2026-11-12:** `find` returned no SVG, PNG or icon file anywhere under `apps/web` outside `node_modules` and `.next`, and `README.md` names no asset, so D-108's fallback applies: flat colour tiles, recorded here and in D-125.

## 1. The manifest

- [x] 1.1 Add `apps/web/app/manifest.ts` exporting a default function returning `MetadataRoute.Manifest`: name and short name from `strings.appName`, a one-line description, `start_url` as a path, `display` standalone, `background_color` and `theme_color` from one exported constant, and the three icon entries (192, 512, 512 maskable with `purpose`). Verify: `pnpm --filter web typecheck` passes and the file exports a function, not an object.
- [x] 1.2 Add the three PNGs under `apps/web/public/`. If 0.2 found a mark, render them from it locally (a throwaway command, no new dependency, nothing checked in but the PNGs); otherwise commit flat colour tiles at the same sizes. Verify: each file opens as a PNG and its header width and height match its name.
- [x] 1.3 Declare the manifest, the theme colour and the apple-touch icon in `apps/web/app/layout.tsx` metadata. Verify: `grep -n "manifest\|themeColor" apps/web/app/layout.tsx` shows the declarations, and the display name still comes from the string catalog.

## 2. The test

- [x] 2.1 Add `apps/web/test/manifest.test.ts`: import the default export, assert the required key set, `start_url` being a path, `display` being standalone, one icon at exactly 192 and one at exactly 512, at least one maskable icon, and for every icon that the file exists under `apps/web/public` and that its PNG header width and height equal the declared size. Use `readFileSync` and the four IHDR bytes; no dependency, no renderer. Verify: `pnpm --filter web test` passes, and a deliberately renamed icon file makes the test fail (run that once, then restore).
- [x] 2.2 Assert the absence of a service worker: no `sw.js`, no `service-worker` file, and no `navigator.serviceWorker` registration anywhere under `apps/web/app` or `apps/web/lib`. Verify: the test fails if a registration line is added to a page.

## 3. Docs and decisions

- [x] 3.1 Correct `docs/known-debt.md` `DEBT-50`: mark it built, no action, citing `packages/domain/src/account-status.ts`, `services/api/src/identity/account-activation.ts` and `services/api/src/identity/better-auth.ts`, and stating why the original grep missed it. Update the `FR-AUTH-09` annotation in `docs/functional-requirements.md` to match. This commit is docs-only and touches nothing else. Verify: `grep -n "DEBT-50" docs/known-debt.md` names the three files, and `docs/functional-requirements.md` does not call the reversal unbuilt.
- [x] 3.2 Narrow `DEBT-37` to what remains after this change (no service worker, no offline cache, no install prompt, no device evidence), keeping the row open for the offline work that belongs to `FR-UX-02`.
- [x] 3.3 Update `docs/functional-requirements.md` (`FR-UX-01` built, with the manual device check named as open), `docs/api-contracts.md` is untouched, `docs/mvp-build-plan.md` section 5, `docs/milestones-and-phases.md` "Current state", and the `README.md` status line. Verify: the three tracker docs agree on status, PR number and date.
- [x] 3.4 Add the decision rows `D-107` and `D-108` (full text at the end of this file) to `docs/decision-log.md`, plus the `R` rows this change took, following the existing row shape. Verify: `grep -n "D-107\|D-108" docs/decision-log.md` shows them exactly once each.

## 4. Gates, review and handoff

- [ ] 4.1 Run from the repo root with Docker up: `pnpm lint`, then `pnpm typecheck`, then `CI=true pnpm test`, then `pnpm build`. Record each exit code and the per-package totals. `CI=true` is what makes the integration files run, and a run with skipped files and zero failures is UNVERIFIED. Run the four gates as one background job writing to a log file and poll it; do not block a foreground call on the api suite. CI takes about 3.5 minutes for the whole checks job and creates `connect_test` itself.
- [ ] 4.2 Confirm `Dockerfile.web` and `.dockerignore` do not exclude `apps/web/public`, so the icons reach the image. Verify: `docker compose build web` succeeds and the built page serves the manifest path (a local `curl` against the running container).
- [ ] 4.3 Run the review gate from `AGENTS.local.md` section 2: `verify-before-done`, `/ponytail-review`, `/ce-code-review`, the silent-failure hunt, the trust-rule check, `/ponytail-debt`, and `review-diff`. This change touches no trust rule, so `/ponytail-audit` is not required.
- [ ] 4.4 Confirm the diff contains only the tasks above, then write the handoff naming the PR, the merge commit, the four gate totals, whether a brand mark was used, the manual device check left open, and `DEBT-50`'s correction.

## Decision rows to add at apply

Add each to `docs/decision-log.md` as its own row. They are reserved here because this propose round may create only files under `openspec/changes/`.

**D-107**

- Date: 2026-11-11
- Decision: The installable-web-app work ships a manifest, icons, and metadata only: no service worker, no offline cache, no custom install prompt. Offline behaviour stays with `FR-UX-02`.
- Reason: the framework documentation lists a valid manifest plus HTTPS as the install criteria and does not list a service worker; an offline cache is a retention and privacy decision on a shared device, not a side effect of installability.
- Status: Decided
- Affects: `experience/installable-pwa`, `docs/known-debt.md` (DEBT-37 narrowed)

**D-108**

- Date: 2026-11-11
- Decision: The three icons (192, 512, 512 maskable) are rendered from the existing brand mark by a one-off local command and committed as PNGs; if no mark exists in the tree, flat colour tiles ship instead and the handoff says so. No dependency and no build step are added.
- Reason: installability needs real icon files at the declared sizes, and a generated icon route would add a rendering surface for a static asset.
- Status: Decided
- Affects: `experience/installable-pwa`, `apps/web/public/`

## Workflow follow-up

- Merge the PR with a merge commit after every check passes, then archive on its own `chore/archive-pwa-install-metadata` branch, because the ruleset refuses a direct push to `main`.
- At archive, confirm the new capability's requirements are synced verbatim and `openspec validate --all --strict` still passes.
- Leave the on-device install check open in the handoff and in `DEBT-37`; it is a human step.
