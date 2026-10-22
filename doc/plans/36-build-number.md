# 36: Show a build number and date instead of the commit hash

Issue #36. Branch `issue-36-build-number`. Agreed with AL in the session on 2026-10-22.

## What changes for AL

- The footer shows `v143 · 22 Oct` instead of `38d5cf4`. The hash and the build time stay in its tooltip.
- **Versioning policy:**
  - The app's version is the CI run number, which goes up with every build. Staging and production show the same number for the same build.
  - The file format has its own `1.0` style version (`doc/format.md`).

## Design

- `vite.config.ts` reads `BUILD_NUMBER`: digits only, else none.
  - It defines `__BUILD_NUMBER__`.
  - `version.json` becomes `{"build":"<hash>","number":143}`; `number` is `null` when none.
  - The update check still compares `build`.
- `apps/web/src/lib/version.ts`: `versionLabel(number, id, builtAt)`.
  - With a number it gives `v<number> · <d> <Mon>`, with the date from the UTC build time and English month abbreviations, so it doesn't depend on locale.
  - Without one it gives the id (the hash or `dev`).
- `StatusLine.svelte` shows the label. Its tooltip stays `Build <hash>, <time>`.
- CI:
  - `deploy-staging` and `preview` builds get `BUILD_NUMBER: ${{ github.run_number }}`.
  - `promote-check.mjs` also outputs `run_number` (that of the CI run being promoted), and Promote's rebuild path passes it as `BUILD_NUMBER`.
  - The stored build already has it.
- The e2e web server builds with `BUILD_NUMBER=7`, so the label shows in e2e.

## Acceptance criteria

- [ ] The footer shows `v<n> · <d> <Mon>` in CI builds and the hash or `dev` locally; the tooltip is unchanged.
- [ ] `version.json` has `build` and `number`.
- [ ] A Promote rebuild shows the promoted run's number, not Promote's own.
- [ ] Staging and production of the same build show the same label.

## Tests I'll write first

- `version.test.ts`:
  - `versionLabel(143, 'abc1234', '2026-10-22 14:43 UTC')` gives `v143 · 22 Oct`;
  - no number gives the id;
  - January and December.
- `tools/ci/test/promote-check.test.mjs`: it returns `runNumber` from the passed run.
- `e2e/lifecycle.spec.ts`: the build shown is `v7 · <d> <Mon>`. This changes the existing "build beside the status" test on purpose.
- `e2e/updates.spec.ts`: `version.json` has `number: 7`.

## Out of scope

Release notes, GitHub Releases, SemVer for the app.
