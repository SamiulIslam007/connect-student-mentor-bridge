# Tasks: dependency-security-bump

Decision rows to add at apply (reserved, one contiguous block): **D-234** the patched `next` bump with no suppression, **D-235** the two dev-only advisories inside their parents' ranges.

## 0. Preconditions

- [x] 0.1 Re-read the snapshot: `git log --oneline -1`, `git status --short`, `grep -n '"next"' apps/web/package.json`, `pnpm audit --audit-level=high`.
- [x] 0.2 Reproduce the failure before changing anything: `rm -rf apps/web/.next && CI=true pnpm build; echo $?` — record the exit code and the first failing line. It must fail for the change to have a target.
- [x] 0.3 Record the advisory list verbatim (`pnpm audit --json` piped to `jq '.vulnerabilities | keys'`) so the closing note names what was fixed and what remains.

## 1. The runtime bump

- [x] 1.1 `apps/web/package.json`: move `next` to the newest patched `16.x`; change no other field. Verify: `grep -n '"next"\|"react"' apps/web/package.json` shows the new version and an unchanged React.
- [x] 1.2 `pnpm install`; commit `pnpm-lock.yaml` with the manifest. Verify: `git diff --stat` lists exactly the two files, and `grep -n 'next@' pnpm-lock.yaml | head` resolves the new version.
- [x] 1.3 Read the release notes for the two advisory areas (`use cache`, the image optimizer) and record in the change's handoff whether this app uses either. Verify: `grep -rn "use cache" apps/web` and the presence or absence of `next/image` in `apps/web` are quoted.

## 2. The dev-only advisories

- [x] 2.1 `esbuild` and `minimatch`: if a patched version satisfies the parent's range, update the lockfile through `pnpm update`; if not, leave both and write the dated debt note. Verify: `pnpm why esbuild` and `pnpm why minimatch` name the parent, or the debt note names them.
- [x] 2.2 Re-run `pnpm audit --audit-level=high` and record the exact count and severity line. Verify: the output is quoted in the handoff, and `pnpm audit --audit-level=high` exits `0`.

## 3. The gates, twice

- [x] 3.1 `rm -rf apps/web/.next && CI=true pnpm build; echo $?` — first cold build after the bump. Verify: exit code `0` recorded.
- [x] 3.2 The same command a second time, from the same clean state. Verify: exit code `0` recorded, so the result is not a retry artefact.
- [x] 3.3 `pnpm lint`, `pnpm typecheck`, `pnpm test` — separate commands, exit codes recorded. Verify: 832 tests still pass, 0 skipped, and the web total is unchanged unless a test was added by the bump.
- [x] 3.4 Rebuild the web image and fetch one page: `docker compose build web && docker compose up -d web && curl -s -o /dev/null -w '%{http_code}' localhost:3000/sign-in`. Verify: the status is `200`.

## 4. Docs

- [x] 4.1 `docs/known-debt.md`: close `DEBT-71` with the strike-through convention (D-228), naming the advisories fixed, the ones that remain and their parents. Verify: `grep -n 'DEBT-71' docs/known-debt.md` reads `Closed 2026-11-21 by dependency-security-bump` and its problem text is struck.
- [x] 4.2 `docs/decision-log.md`: add D-234 and D-235 in the existing field style. Verify: `grep -c '^### D-23[45]'` prints `2`.
- [x] 4.3 `README.md` status line and `docs/milestones-and-phases.md` "Current state" name the change, the new `next` version and the audit count. Verify: `grep -n 'dependency-security-bump' README.md docs/milestones-and-phases.md` matches both.
- [x] 4.4 `docs/production-requirements.md` §11 "CI gates": if its Playwright line is still unchecked and this change did not add it, leave it for `e2e-happy-path` and say so in the handoff. Verify: the diff touches no other line of that section.

## 5. Checks, review, handoff

- [x] 5.1 `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` (twice) — every exit code recorded, none inferred.
- [x] 5.2 `openspec validate dependency-security-bump --strict` and `openspec validate --all --strict`; quote the totals.
- [x] 5.3 Review gate per `AGENTS.local.md` §2: line-by-line pass on the manifest and lockfile diff, then an adversarial pass asking whether the lockfile moved a package nobody asked for. Verify: `git diff pnpm-lock.yaml` is summarised by package in the handoff.
- [x] 5.4 Handoff: the before/after build exit codes, the audit count, the changelog note on the two advisory areas, and any package the lockfile moved that the manifest did not name.
