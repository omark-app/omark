# Open source launch roadmap

Implements [the open source launch spec](../TaskApp%20open%20source%20launch%20spec.md). The spec covers about ten independent workstreams, so this file orders them, and each becomes one GitHub issue with its own detailed plan, written when its turn comes (the factory's large-work rule). Milestone 1 is planned in detail in [open-source-m1-groundwork.md](open-source-m1-groundwork.md).

Legend: **AL** = a step only AL can do (`needs-human`). **Plan** = a detailed TDD plan in `doc/plans/` is written and approved before the work starts.

## Milestone 0: name and home (AL, before any code) — done 2026-10-21

| # | Step | Spec |
|---|---|---|
| 0.1 | AL: trademark search for OMARK (EUIPO, USPTO, classes 9 and 42). If blocked, stop and pick another name. | 6.10 |
| 0.2 | AL: buy `omark.app`, add it to Cloudflare, set up Email Routing for `hello@` and `security@`. | 6.10 |
| 0.3 | AL: create the GitHub org (`omarkhq`, `omark-app` or `getomark`); transfer the repo (still private), rename it `tasks`; check that old URLs redirect and that CI and Promote still work. | 6.10 |

## Milestone 1: groundwork — done 2026-10-22 (PRs #29, #30)

| # | Workstream | Spec | Depends on |
|---|---|---|---|
| 1.1 | Host and folder config from build variables; brand module | 6.1 | 0.3 |
| 1.2 | OneDrive app-folder scope and configurable tenant (client and sign-in helper) | 6.1 | — |
| 1.3 | CI from repository variables, fork-safe jobs, a sign-in check that verifies scope, pinned actions | 6.2 | 1.1, 1.2 |
| 1.4 | Rename to Omark Tasks: visible text and `@omark/*` packages | 6.6 | 1.1 |
| 1.5 | Clean-up: `.gitignore`, MSAL leftovers | 6.1 | — |
| 1.6 | AL: set repository variables and the helper's Pages variables, merge, check staging, Promote | 6.1, 8 | 1.1–1.5 |

My instance (`tasks.alipka.com`) keeps running on bridge values throughout.

## Milestone 2: try it and read it

Each row is one issue and one PR; rows marked Plan get a detailed plan first.

| # | Workstream | Spec | Size | Depends on |
|---|---|---|---|---|
| 2.1 | (#31) Demo storage mode (seeded, IndexedDB-durable, "Reset demo"), `pnpm demo`, `.env.example`, demo deployment at `demo-tasks.omark.app` | 6.3 | large, Plan | M1 |
| 2.2 | Landing page at `omark.app` with privacy and terms pages | 6.3.1 | large, Plan | 2.1, 2.4 |
| 2.3 | Docs set: README, PHILOSOPHY, AGENTS.md (+ `CLAUDE.md` import), CONTRIBUTING, GOVERNANCE, SECURITY, CODE_OF_CONDUCT, LICENSE, `doc/spec.md`, `doc/format.md`, `doc/architecture.md`, `doc/self-hosting.md`, `doc/factory.md`, `doc/history/` | 6.7 | large, Plan | M1 |
| 2.4 | Icon family: 2–3 directions as side-by-side mockups → AL picks → full set in `brand/`, wired into the app and manifests | 6.6 | large, Plan | M1 |
| 2.5 | Factory generalised: roles, maintainer check by repo role, role-neutral skills, guard and templates, labels script, issue and PR templates | 6.8 | large, Plan | 2.3 |
| 2.6 | AL: give 2–3 pilot developers Read or Triage; one runs the contributor dry run from a private fork | 6.2, 6.8 | — | 2.5 |
| 2.7 | AL: approve PHILOSOPHY wording and the "won't add" list | 6.7.1 | — | 2.3 |

Build-in-public posts on LinkedIn can start here.

## Milestone 3: real use

| # | Workstream | Spec | Size | Depends on |
|---|---|---|---|---|
| 3.1 | `LocalFolderAdapter` (File System Access API) + folder picking + permission re-prompt | 6.4 | large, Plan | M1 |
| 3.2 | First-run choice screen (demo / OneDrive / folder) and a setting to change it | 6.5 | large, Plan | 2.1, 3.1 |
| 3.3 | AL: two Entra registrations ("Omark Tasks", "Omark Tasks Staging"), Pages projects for `tasks.`, `staging-tasks.`, `demo-tasks.` and `omark.app`, Pages secrets, repository variables switched to the Omark values | 6.5, 8 | — | M1 |
| 3.4 | CI re-pointed to the Omark projects; the bridge kept for my old instance until 3.6 | 6.5 | small | 3.3 |
| 3.5 | AL: publisher verification (not a blocker) | 6.5 | — | 2.2 |
| 3.6 | AL: cutover to `tasks.omark.app` (spec 6.5.1, checklist in `doc/history/`) | 6.5.1 | — | 3.4 |
| 3.7 | Remove the bridge: drive-root scope option, the old hosts and folders, the legacy-cache migration, old tests; the spec's `grep` is clean | 6.1 | large, Plan | 3.6 |

## Milestone 4: open the doors

| # | Step | Spec | Depends on |
|---|---|---|---|
| 4.1 | Write the ~10 seeded issues with acceptance criteria and labels | 6.9 | 2.5 |
| 4.2 | AL: ask 5–10 developers to take one each | 6.9 | 4.1 |
| 4.3 | AL: delete stale branches, set repository settings (branch protection, fork approval, Discussions, vulnerability reporting, topics, social preview), skim Actions logs, flip to public | 6.10 | everything above |

## Milestone 5: launch

| # | Step | Spec |
|---|---|---|
| 5.1 | Demo GIF or video (quick add, complete, the file changing in Obsidian, Claude editing it) | 6.11 |
| 5.2 | AL: launch day: Show HN, r/ObsidianMD, r/selfhosted, r/gtd, r/ClaudeAI, LinkedIn | 6.11 |
| 5.3 | Awesome-list submissions; answer issues and Discussions within 24 h for two weeks | 6.11 |

## Spec coverage

| Spec section | Where |
|---|---|
| 6.1 | 1.1, 1.2, 1.5, 3.7 |
| 6.2 | 1.3, 2.6, 4.3 |
| 6.3 | 2.1 |
| 6.3.1 | 2.2 |
| 6.4 | 3.1 |
| 6.5, 6.5.1 | 3.2–3.6 |
| 6.6 | 1.4, 2.4 |
| 6.7 | 2.3, 2.7 |
| 6.8 | 2.5, 2.6 |
| 6.9 | 4.1, 4.2 |
| 6.10 | 0.1–0.3, 4.3 |
| 6.11 | 5.1–5.3 |
