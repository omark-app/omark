# Open source launch roadmap

Implements [the open source launch spec](../TaskApp%20open%20source%20launch%20spec.md). The spec covers about ten independent workstreams, so this file orders them, and each becomes one GitHub issue with its own detailed plan, written when its turn comes (the factory's large-work rule). Milestone 1 is planned in detail in [open-source-m1-groundwork.md](../history/open-source-m1-groundwork.md).

Updated 2026-10-22 for the suite:
- the monorepo move (2.8);
- suite-wide landing, docs, icons and factory;
- Google Drive storage (3.8–3.9);
- a new **milestone T** that builds [Omark Time](../time/spec.md) alongside milestone 3.

The launch waits for both apps. Row numbers already in use are unchanged.

Updated 2026-10-28 (AL, in the Omark Goals brainstorm):
- **Omark becomes one app at one address** (`app.omark.app`) with Tasks, Time and Goals as parts, one storage provider and one folder: [the one app spec](../suite/one-app-spec.md). New **milestone U** builds it. It replaces the per-app registrations, hosts, first runs and demos in rows 3.2–3.4, 3.9, T.1, T.5, T.7 and T.9 (marked below).
- **Omark Goals launches with Tasks and Time**: [the Goals spec](../goals/spec.md). New **milestone G** builds it.
- The launch now waits for all three parts.

## Order from 2026-10-28

Work is serial in the coordinating session (fast mode until launch). AL's steps run alongside.

1. U.1 Google check, then U.3 the shell (absorbs 3.2's first run) and G.1 `goals-core` (pure, no clash).
2. U.4 Time inside the shell, U.5 one Settings page.
3. G.2 the Goals part, G.3 tag suggestions in Tasks, G.4 the skill and format.
4. U.6 the demo world (absorbs T.7), U.7 CI, hosts and redirects.
5. 3.6 cutover to `app.omark.app`, T.11 a week of use, 3.7, then milestones 4 and 5.

AL alongside: U.2 (registrations, Pages, DNS), then the cutover.

## Running in parallel (2026-10-26)

The rows below keep their numbers, but work now runs in waves: each item in a wave is its own session in its own worktree, with its own issue, plan and PR. AL's part is batched per wave: one sitting to approve the wave's plans, one to check staging and Promote once for the wave.

The longest chain is Omark Time: 3.8 → T.4 → T.5 → T.6/T.7 → a week of AL's own use (T.11). So 3.8 and T.3 start first. The second chain is Google: 2.2 must be live before both Google projects can leave Testing.

| Wave | Items (parallel) | AL |
|---|---|---|
| 1 (done 2026-10-27) | 2.2 landing and privacy policy (`apps/site`, wordmark until 2.4 lands); 3.8 Google Drive and the Google sign-in provider; T.2 milestone plan, then T.3 `time-core`; 2.1 demo mode (#31, rebased onto `apps/tasks`); 2.4 icon directions (shown as a page) | approve 4 plans, pick an icon direction, read the privacy policy |
| 2 (done 2026-10-27, except 3.2) | three lanes: storage (3.1 local folder, then 3.2 first-run choice); Time (T.4 Google part #56, then T.5 `apps/time` shell); docs (2.3, then T.8); publish both Google staging projects; the deploy race #81 (PR #84) | approve plans, approve PHILOSOPHY (2.7), consent clicks with `hello@omark.app` |
| 3 | three lanes: Tasks (3.2 first-run choice, then 3.4 once 3.3 is done); Time (local folder in `apps/time` if T.5 left it, T.6 screens, then T.7 demo); docs and factory (the 2.3 moves, then 2.5 factory) | Entra registrations and Pages for Omark Tasks (3.3), DNS for `staging-time.` and `demo-time.`, staging checks |
| 4 | T.6 screens; T.7 Time demo; T.9 Time production; 3.6 cutover, then 3.7 | T.11 a week on his own calendar, cutover |
| 5 | 4.1 seeded issues, 2.6 pilot developers, 4.3, milestone 5 | the launch steps |

Clashes to watch: 2.1 and 2.2 both add a deploy job to `ci.yml`, and 3.1 and 3.8 both add an adapter to `packages/storage`. New files keep these small; whichever PR merges second rebases.

**After wave 1** (9 PRs in a day, about 15 rounds of conflict fixing): from wave 2 a wave is at most three lanes, each in a different area (a package, another app, docs), and work inside one app runs one after another. Each PR merges as soon as it is green, not in a batch at the end. Previews deploy after `check`, and sessions run only the e2e specs they touch; CI runs the full suite (#76).

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
| 2.1 | Demo storage mode (seeded, IndexedDB-durable, "Reset demo"), `pnpm demo`, `.env.example`, demo deployment at `demo-tasks.omark.app` | 6.3 | large, Plan | M1 |
| 2.8 | *Done 2026-10-26 (#47, PR #48; repo renamed `omark-app/omark`).* **Monorepo move** (right after 2.1 merges): `apps/web` → `apps/tasks`, `packages/core` → `packages/tasks-core`, storage and sign-in made app-neutral, CI and Promote per app, paths, hooks and docs re-pointed; no behaviour change. AL: rename the repo to `omark` | 6.12 | large, Plan | 2.1 |
| 2.2 | Landing page at `omark.app` with a card per app (Tasks, Time), privacy policy covering Google data (Limited Use) and terms; live early for Google's review | 6.3.1 | large, Plan | 2.8, 2.4 |
| 2.3 | *Done 2026-10-27 (#85, PR #88 with the new and rewritten files; the moves follow in a second PR).* Docs set, suite-wide: README, PHILOSOPHY (principles), AGENTS.md (+ `CLAUDE.md` import), CONTRIBUTING, GOVERNANCE, SECURITY, CODE_OF_CONDUCT, LICENSE, `doc/tasks/spec.md`, `doc/format.md`, `doc/architecture.md`, `doc/self-hosting.md`, `doc/factory.md`, `doc/history/` (Omark Time's own docs come in T.8) | 6.7 | large, Plan | 2.8 |
| 2.4 | *Built 2026-10-26 (#62, PR #64; direction B, Ring).* Icon family: 2–3 directions shown with both the Tasks and Time glyphs → AL picks → full set for both apps in `brand/`, wired into the apps and manifests | 6.6 | large, Plan | 2.8 |
| 2.5 | Factory generalised: roles, maintainer check by repo role, role-neutral skills (`omark-factory`), guard and templates, labels script (with `app:`, `task`, `needs-info`, `in-progress`), issue forms (Bug, Feature, Task), the Ideas Discussion form, security and Q&A contact links, the skill's "missing required field → `needs-info`" rule, PR template; one factory for both apps | 6.8 | large, Plan | 2.3 |
| 2.6 | AL: give 2–3 pilot developers Read or Triage; one runs the contributor dry run from a private fork | 6.2, 6.8 | — | 2.5 |
| 2.7 | *Done 2026-10-27 (approved in the session).* AL: approve the PHILOSOPHY principles and wording | 6.7.1 | — | 2.3 |

Order: 2.1, then 2.8, then 2.2–2.5. 2.8 went before 2.1 by AL's choice, so #31 (demo mode) rebases onto the new paths.

Build-in-public posts on LinkedIn can start here.

## Milestone 3: real use

| # | Workstream | Spec | Size | Depends on |
|---|---|---|---|---|
| 3.1 | *Done 2026-10-27 (#86, PR #89).* `LocalFolderAdapter` (File System Access API) + folder picking + permission re-prompt | 6.4 | large, Plan | M1 |
| 3.2 | *Done 2026-10-27 (#94, PR #101); merges into the one app's first run in U.3.* First-run choice screen (demo / OneDrive / Google Drive / folder) and a setting to change it | 6.5 | large, Plan | 2.1, 3.1, 3.8 |
| 3.3 | *Replaced by U.2 (one "Omark" registration pair, one app's Pages projects).* AL: two Entra registrations ("Omark Tasks", "Omark Tasks Staging"), Pages projects for `tasks.`, `staging-tasks.`, `demo-tasks.` and `omark.app`, Pages secrets, repository variables switched to the Omark values | 6.5, 8 | — | M1 |
| 3.4 | *Replaced by U.7.* CI re-pointed to the Omark projects; the bridge kept for my old instance until 3.6 | 6.5 | small | 3.3 |
| 3.5 | AL: publisher verification (not a blocker) | 6.5 | — | 2.2 |
| 3.6 | AL: cutover to `app.omark.app`, files into `Apps/Omark/tasks/` (one app spec 11; launch spec 6.5.1, checklist in `doc/history/`) | 6.5.1 | — | U.7 |
| 3.7 | Remove the bridge: drive-root scope option, the old hosts and folders, the legacy-cache migration, old tests; rename the Tasks cookies, header, IndexedDB names and tags; the spec's `grep` is clean | 6.1 | large, Plan | 3.6 |
| 3.8 | Google provider in `@omark/signin` and a shared `GoogleDriveAdapter` (`drive.file`), after checking conditional writes and desktop-edit file ids; Tasks can use Google Drive | 6.4.1 | large, Plan | 2.8, 3.9 |
| 3.9 | *Search Console done; the projects are replaced by U.2 (one "Omark" project; `omark-time-staging` becomes "Omark Staging", `omark-tasks-staging` retired).* AL: verify `omark.app` in Google Search Console; Google Cloud projects "Omark Tasks" and "Omark Tasks Staging" (consent screen, Web OAuth client, secrets in Pages); brand verification. *Search Console and the staging project done 2026-10-26 (in Testing until 2.2 is live)* | 6.4.1, 8 | — | 2.2 |

## Milestone T: Omark Time

Builds [the Omark Time spec](../time/spec.md). It runs alongside milestone 3 and starts once the monorepo move (2.8) has merged. Its first planned item is the T.2 plan, which splits the build into issues.

| # | Workstream | Spec | Size | Depends on |
|---|---|---|---|---|
| T.1 | AL: Google Cloud project "Omark Time Staging" (published, unverified) and a test Google account with a test calendar. *Staging project and client done 2026-10-26 (in Testing until 2.2 is live); `hello@omark.app` doubles as the test account* | Time 10.3, 17 | — | 3.9 |
| T.2 | Spike (throwaway): colour patch on an invite with `calendar.events.owned`, invites on the primary calendar, recurring instances in incremental sync, the green and red ids, read-only sync with `calendar.events.owned.readonly`; findings into the Time spec; then the milestone plan. *Spike done 2026-10-26 (Time 15.1); the plan waits for 2.8* | Time 15 | small, then Plan | T.1 |
| T.3 | `packages/time-core`: title parser, event → rows (window, midnight split, all-day, declined, overlaps, time zone), colour decision, CSV and YAML, projects and config models, summaries, chart series, reports | Time 5–7, 9 | large, Plan | T.2 |
| T.4 | *Done 2026-10-27 (#55 and #56, PR #87).* `packages/calendar`: `CalendarSource` interface, Google implementation (calendar list, incremental sync, colour patch with throttling), fake calendar, shared contract test | Time 8, 13 | large, Plan | T.2, 3.8 |
| T.5 | *Done 2026-10-27 (#57, PRs #91 and #92); its sign-in, first run and storage choice merge into the one app in U.4, so the `staging-time` DNS record is no longer needed.* `apps/time` shell: Google sign-in, first run, storage choice (Google Drive, OneDrive, local folder), sync and colouring loop, rebuild, offline cache; staging at `staging-time.omark.app` | Time 4, 7, 8, 10 | large, Plan | T.3, T.4, 3.1, 3.8 |
| T.6 | Screens: hours summary, charts, fix list, projects, settings, report export | Time 9 | large, Plan | T.5 |
| T.7 | *Replaced by U.6 (one demo world at `demo.omark.app`).* Demo mode on the fake calendar, deployed at `demo-time.omark.app`; no outside requests | Time 12 | large, Plan | T.5 |
| T.8 | *Done 2026-10-27 (#60, PR #90).* Agent skill `omark-time`, the Time part of `doc/format.md`, `doc/time/spec.md`, README examples with DuckDB queries | Time 11 | small | T.3 |
| T.9 | *Replaced by U.2.* AL: production Google Cloud project "Omark Time"; Entra registrations "Omark Time" and "Omark Time Staging"; Pages projects and DNS for `time.`, `staging-time.`, `demo-time.omark.app`; secrets and repository variables | Time 17 | — | T.5 |
| T.10 | AL: record the verification video (Claude writes the script) and submit Google verification; not a launch blocker | Time 10.3 | — | 2.2, T.5 on staging |
| T.11 | AL: acceptance on staging with the test account (Time spec 15), then Promote and use Time on `app.omark.app` with AL's own calendar for at least a week before launch | Time 15 | — | T.6, U.6, U.7 |

## Milestone U: one app

Builds [the one app spec](../suite/one-app-spec.md): Tasks, Time and Goals as parts of one app at `app.omark.app`, one storage provider, one folder (`Apps/Omark/` with `tasks/`, `time/`, `goals/`, and `projects.csv` at the top), one sign-in per provider, one demo world. It comes before the cutover (3.6) and before Time is used for real (T.11).

| # | Workstream | Spec | Size | Depends on |
|---|---|---|---|---|
| U.1 | Check (throwaway, on the staging Google project): does a `drive.file`-only consent on a project that also lists the calendar scopes show the "unverified app" screen or count toward the 100-user cap? Finding into the one app spec, section 5 | one app 5, 12 | small | — |
| U.2 | AL: Entra "Omark" and "Omark Staging"; Google project "Omark" (and `omark-time-staging` renamed "Omark Staging", `omark-tasks-staging` retired); Pages projects and DNS for `app.`, `staging-app.`, `demo.omark.app`; secrets and repository variables; redirects for the old hosts | one app 15 | — | U.1 |
| U.3 | `apps/omark` shell: one origin and token broker (no `OMARK_APP`), the folder layout and suite `config.yaml`, parts on and off, tabs, the merged first run; Tasks moves in unchanged | one app 4–7 | large, Plan | U.1 |
| U.4 | Time inside the shell: its screens as a part, its calendar sign-in asked only when Time is turned on, its files in `time/` | one app 5–7 | large, Plan | U.3 |
| U.5 | One Settings page: General (storage, parts, sign-ins) and a section per part | one app 8 | large, Plan | U.3 |
| U.6 | The demo world (Maya) across all three parts at `demo.omark.app` and in previews; replaces Tasks' samples and Time's demo seed | one app 9, Goals 12 | large, Plan | U.4, G.2 |
| U.7 | CI and deploys for one app (one preview, staging, demo, Promote), self-hosting doc, landing page links (a Goals card too), redirects in place, per-app jobs and variables retired; the bridge jobs for `tasks.alipka.com` stay until 3.6 | one app 10 | large, Plan | U.2, U.3 |

## Milestone G: Omark Goals

Builds [the Omark Goals spec](../goals/spec.md). Launches with Tasks and Time.

| # | Workstream | Spec | Size | Depends on |
|---|---|---|---|---|
| G.1 | `packages/goals-core`: `goals.md` parse and write (byte for byte), area tags, links and last activity per area, status chips | Goals 5–6, 11 | large, Plan | — |
| G.2 | The Goals part: the Vision board, area and goal forms with pictures, Not now, first-run placeholders, Needs update, creating a project from a goal | Goals 7–8 | large, Plan | G.1, U.3 |
| G.3 | Tasks: `#` in quick add suggests project codes and area tags | Goals 9 | small | U.3 |
| G.4 | The `omark-goals` skill and the Goals part of `doc/format.md` | Goals 10 | small | G.1 |

## Milestone 4: open the doors

| # | Step | Spec | Depends on |
|---|---|---|---|
| 4.1 | Write the seeded issues (Tasks and Time) with acceptance criteria and labels | 6.9 | 2.5 |
| 4.2 | AL: ask 5–10 developers to take one each | 6.9 | 4.1 |
| 4.3 | AL: delete stale branches, set repository settings (branch protection, fork approval, Discussions, vulnerability reporting, topics, social preview), skim Actions logs, flip to public | 6.10 | everything above, including milestone T |

## Milestone 5: launch

| # | Step | Spec |
|---|---|---|
| 5.1 | Demo GIF or video per app: Tasks (quick add, complete, the file changing in Obsidian, Claude editing it); Time (an event turning green, Claude adding an event, a DuckDB or Claude answer) | 6.11 |
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
| 6.4.1 | 3.8, 3.9 |
| 6.5, 6.5.1 | 3.2–3.6 |
| 6.6 | 1.4, 2.4, 2.8 (repo rename) |
| 6.7 | 2.3, 2.7 |
| 6.8 | 2.5, 2.6 |
| 6.9 | 4.1, 4.2 |
| 6.10 | 0.1–0.3, 4.3 |
| 6.11 | 5.1–5.3 |
| 6.12 | 2.8 |
| 6.13 and the Omark Time spec | T.1–T.11 |
| The one app spec | U.1–U.7, 3.6 |
| The Omark Goals spec | G.1–G.4, U.6 |
