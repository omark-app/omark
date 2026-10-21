# TaskApp open source launch spec

Status: approved, 2026-10-21. Agreed in the session that weighed a paid app against open source. Plans: [roadmap](plans/open-source-launch-roadmap.md), [milestone 1](plans/open-source-m1-groundwork.md).
Related: [v1 spec](TaskApp%20v1%20spec.md), [factory spec](TaskApp%20factory%20spec.md), [backlog](TaskApp%20backlog.md).

## 1. Intent

TaskApp started as my replacement for Todoist: a small, fast task app whose data is three plain Markdown files in my own OneDrive, editable in Obsidian and by Claude Code. It works and I use it every day.

I looked at selling it as a paid mobile app and decided against it. The numbers did not add up for a side project with a small audience. Also, the people who would value it most, those who know what LLMs can do, can build their own. Open source suits it better:

- **"Your data is yours" can be checked.** Anyone can read the code and see that nothing is sent to a server of mine.
- **The build story is the hook.** The app was built in a few evenings by Claude through a software factory (issues → agent sessions → pull requests), and that factory ships with the repo.
- **Contributors can add what I won't build myself**: more storage providers, platforms and languages.

The model is [Open Mercato](https://github.com/open-mercato/open-mercato), but for personal productivity: an umbrella brand, **Omark**, for a family of small, plain-file tools that AI agents can work on. The task app is the first, published as **Omark Tasks**. Other tools are only a direction in PHILOSOPHY.md for now.

## 2. Goals, non-goals, anti-goals

### 2.1 Goals

1. **A public repository** under the Omark GitHub organisation, MIT-licensed, that a stranger can understand, try, run, fork and contribute to.
2. **Try it in 30 seconds.** A public demo with sample data and no sign-in.
3. **Use it for real**, three ways:
   - the hosted app, where anyone signs in with OneDrive and the server still stores nothing (I use it myself too);
   - local-folder mode in desktop Chrome or Edge, with no account at all;
   - a self-hosted copy.
4. **Ready for any AI coding assistant.**
   - AGENTS.md is the single source of agent instructions and points to the full spec.
   - CLAUDE.md imports it.
   - The factory works for any contributor with Claude Code; users of other tools can add their own.
5. **A philosophy that keeps it small.** PHILOSOPHY.md covers data sovereignty, local or cloud-synced files, an open `.md` format, a clean simple UI, features only when people want them, and GTD: simplifying life rather than complicating it.
6. **Work ready to pick up**: about ten seeded issues, from small to large.
7. **A launch** that gives the repo a fair chance of being noticed.

### 2.2 Success after 3 months from going public

- At least **2 outside contributors** have each had at least one feature merged (an issue labelled `enhancement`).
- **300 GitHub stars** as the target, **1,000** as the stretch. One front-page Show HN typically brings 300–800.

### 2.3 Non-goals for the launch

These are not part of the launch. They can be issues or later specs.

- Native iOS or Android apps, iCloud storage, Google Drive and Dropbox adapters, a desktop wrapper.
- Sharing, multiple users, team features.
- Paid tiers, sponsorship tooling, usage analytics.
- Any second Omark tool. Notes and other apps are ideas for later versions. The naming (`notes.omark.app`), the landing page and the icon family leave room for them, but nothing is built for them now.

### 2.4 Anti-goals

The launch counts as a failure, even if everything else is done, if:

- **User data reaches an Omark server**, other than the short-lived sign-in tokens the helper already handles.
- **My own daily use breaks or my real files are damaged.** That covers a sync bug, an edit lost during the move to the hosted app (6.5.1), or a lost offline copy.
- **The app gains features** that make the one-page, quick-add experience slower or busier.
- **Maintaining it becomes a chore**, for example from low-quality AI pull requests or from support questions the docs should answer.
- **Personal details leak into the public repo** beyond the accepted ones in section 3: my email on commits, and old notes in history.

## 3. Decisions already taken

| Topic | Decision |
|---|---|
| Model | Open source. No paid version for now. |
| Brand | **Omark** (from "own + markdown"). The app is **Omark Tasks**. The GitHub org `omark` is a dormant personal account, so the org is one of `omarkhq`, `omark-app`, `getomark`. Domain: **`omark.app`**. Each app gets a subdomain: Omark Tasks is at `tasks.omark.app`, its staging at `staging-tasks.omark.app`, and its demo at `demo-tasks.omark.app` *(demo host is my call)*. `omark.app` itself is the landing page (6.3.1). A trademark check comes before announcing. |
| Licence | MIT |
| History | Keep it. A full scan of all 170 commits on every branch found no secret ever committed, so nothing needs rotating. Accepted: `alipka@gmail.com` on 117 commits, and the old personal notes in history. |
| Hosting | Public demo (sample data, no sign-in) plus an open hosted app that anyone can sign into with a personal Microsoft account. Self-hosting is documented. |
| My own instance | **I move to the hosted app** and use it like everyone else. The public repo deploys only Omark's own instances: previews, demo, staging, hosted app. `tasks.alipka.com` is retired after the move (6.5.1). My files move from `ALAI/TaskApp` to the app folder, outside my Obsidian vault; I open that folder as a vault of its own, or use local-folder mode on the PC. |
| Governance | Anyone can 👍 an idea. The most-wanted ideas that fit the philosophy become `ready` issues. PHILOSOPHY.md keeps a written "won't add" list. Maintainers have the final say on simplicity. No majority vote of contributors. |
| Agent instructions | AGENTS.md holds them. CLAUDE.md is `@AGENTS.md` plus Claude-only notes. Claude Code reads AGENTS.md only when no CLAUDE.md exists, so the import matters. Use the import, not a symlink, because of Windows. |
| AI contributions | Welcome. Every PR links an accepted issue (`ready`, or a large one with an approved plan), and says whether and how AI was used. Drive-by PRs with no issue are closed with a pointer to CONTRIBUTING. |
| Local-folder mode | Built before launch. It delivers the "local or cloud-synced" promise with no account. *(My call; override if you prefer it as a flagship issue.)* |

## 4. Constraints

- **No new running costs** beyond the domain. A public repo gets free Actions minutes and branch protection. Cloudflare Pages Free, Entra, and Microsoft publisher verification (through a free Microsoft AI Cloud Partner Program account) cost nothing.
- **My own app keeps working until I move.** `tasks.alipka.com` and its staging stay on my folders (`ALAI/TaskApp`, `ALAI/TaskApp-staging`) and my sign-in until the cutover in 6.5.1, which I run myself.
  - Changes reach production only through staging and Promote, as today.
  - Until the cutover, code changes must keep my current deployment working. After it, that deployment is retired and its values leave the code.
- **Nothing tied to my accounts stays in code.** Hosts, folders, project names, tenant and client IDs come from build variables, repository variables or secrets, with neutral defaults.
- **The factory spec's rules still apply**: test first, the four commands green, the review subagent, and large work planned and approved. Sync, storage, sign-in and file-format changes are always large.
- **The repo stays private until section 6.10 is done.** Flipping it public is the last step. It moves into the Omark org early (milestone 1), still private, so pilot developers can get read access, fork it and test the contributor flow before launch.

## 5. Current state (review of `main` at de2b14f)

- **Strong:**
  - Pure `packages/core`, about 260 tests.
  - A two-method `StorageAdapter` with a shared contract test, `packages/storage/test/adapter-contract.ts`.
  - About 700 tests overall.
  - Every direct dependency is MIT, ISC, Apache-2.0 or OFL (fonts), so no licence conflicts.
- **Tied to my setup:**
  - `apps/web/src/lib/environment.ts` (hosts and folders), `apps/web/src/env.ts` (default folder `ALAI/TaskApp`).
  - `packages/signin/src/handler.ts:17` (authority fixed to `/consumers`).
  - `apps/web/vite.config.ts` (`allowedHosts`).
  - `.github/workflows/ci.yml` and `promote.yml` (project names, `alipka.com` health checks).
  - `tools/ci/ensure-staging.mjs` (project, domain, zone ID), `apps/web/e2e-real/state.ts`.
  - Test fixtures that copy these values; the README, CLAUDE.md, every doc, both skills, the guard's messages.
  - `*.pages.dev` hosts are all treated as `preview`. A self-hoster on `x.pages.dev` would get the PREVIEW label.
- **CI fails on fork PRs.** `ensure-staging`, the preview deploy and the preview comment run on every `pull_request`, and need secrets or write access that fork PRs don't get.
- **No way to just try it.**
  - Plain `pnpm dev` shows a Microsoft sign-in that cannot work under Vite.
  - `VITE_STORAGE=fake` starts empty locally (`sample-files.ts` seeds only on `*.pages.dev`) and forgets everything on reload.
  - There is no `.env.example`, and the inline `VITE_STORAGE=fake` syntax doesn't work in PowerShell.
- **The factory assumes me.** "AL approves plans", "only AL merges", "AL's label wins": an outside contributor's agent would wait forever for an approval it cannot get.
- **The spec has seven stale statements:**
  1. §2 deploy flow: production now goes through Promote.
  2. §4.1 and §4.2 week bounds: they are configurable now.
  3. §15 the smoke-test account.
  4. §14 the architecture leaves out `functions/` and the tools.
  5. The factory spec gives the smoke sign-in as 24 h; it is 90 days now.
  6. §3.5 still mentions "the sign-in library".
  7. §3.1 hard-codes the folder.
- **Leftovers:**
  - MSAL-era code: `packages/storage/src/auth.ts:123-129` (clears `msal.*` keys) and the "hung MSAL" comment in `auth-stub.ts`.
  - The README paragraph about keeping the SPA platform.
- **`.gitignore`** lacks `.env*`, `.secrets/`, `.superpowers/` and `*e2e-state*.json`.
- **Stale branches**: 22 remote branches, including 4 `claude/*` ones.

## 6. What gets built

Each subsection is a workstream with its acceptance criteria. Sizes follow the factory: anything touching storage, sync, sign-in or formats is large and gets its own plan.

### 6.1 Configuration instead of my values (large: touches sign-in)

- **The app reads these build variables**, with the defaults shown:

  | Variable | Default |
  |---|---|
  | `VITE_PROD_HOST`, `VITE_STAGING_HOST`, `VITE_DEMO_HOST` | unset |
  | `VITE_PREVIEW_HOST_SUFFIXES` (comma-separated list) | unset |
  | `VITE_ONEDRIVE_FOLDER` | unset: the files sit at the root of the app folder |

  With nothing set, every host is `local`.
- **One access scope for every Omark instance: `Files.ReadWrite.AppFolder`.**
  - Paths resolve under `/me/drive/special/approot`. OneDrive names that folder after the Entra app's display name, so it is `Apps/Omark Tasks` for the hosted app.
  - The sign-in helper's scope (`handler.ts:18`) and the app's Graph paths change together.
  - Full-drive access is no longer offered. A self-hoster who wants a folder outside the app folder changes the code.
- **Staging and production use separate Entra registrations** ("Omark Tasks" and "Omark Tasks Staging"). Each therefore gets its own app folder, and staging can never touch a user's real files. This replaces today's per-host folder choice.
- **Bridge to the cutover.** Until 6.5.1, my current deployment (`tasks.alipka.com`, `ALAI/TaskApp`, full-drive scope) must keep working. The builder may keep its values behind build variables set only by my deployment's CI for that period, and removes them, the old Pages projects and their tests after the cutover.
- **The sign-in helper reads `MSAL_TENANT`**, default `consumers`. The CI health checks follow it.
- **CI uses repository variables**: `CF_PROD_PROJECT`, `CF_STAGING_PROJECT`, `PROD_URL`, `STAGING_URL`. `ensure-staging.mjs` reads its project, domain and zone from the environment and skips the DNS and custom-domain steps when they are unset.
- **Test fixtures use neutral values**: `tasks.example.test`, `Apps/Omark Tasks`, `owner/repo`.
- **Clean-up:**
  - Remove the MSAL-era code and comments.
  - Fix `.gitignore`.
  - After the cutover, `grep -ri "alipka\|ALAI\|alipkagit\|47bed4a7\|fabcb19d\|00596fbc"` over the tree finds nothing outside `doc/history/`.
- **Brand and domain strings live in one module** (name, domain, hosts, contact addresses), so a late name change touches one file.

### 6.2 CI that works for forks (large: CI)

- **The preview deploy and its comment move to a `preview` job.** It runs only when `github.event.pull_request.head.repo.full_name == github.repository`.
- **The `check` and `e2e` jobs need no secrets** and pass on a fork PR.
- **`deploy-staging` runs only when `vars.DEPLOY_ENABLED == 'true'`**, so a fork's own `main` stays green.
- **No `pull_request_target` anywhere.** That is already true; keep it so.
- **Third-party actions are pinned** to full commit SHAs, with the tag as a comment (for example `cloudflare/wrangler-action@<sha> # v3.x.y`, `pnpm/action-setup`). This matters most for the steps that receive `CLOUDFLARE_API_TOKEN`. Dependabot keeps the SHAs up to date.
- **Repository settings** (done by hand, listed in section 8):
  - Protect `main`: PR required, the `check` and `e2e` checks required, no force pushes.
  - Require approval for workflow runs from first-time contributors.
- **Acceptance:** a PR from a test fork passes `check` and `e2e`, and shows no failed or skipped-with-error preview steps. While the repo is private, this runs from a private fork in the org, with "Run workflows from fork pull requests" enabled for private repos. Branch protection is set when the repo goes public (GitHub Free doesn't offer it on private repos); until then the guard covers agents.

### 6.3 Try it: demo mode and public demo (large: storage wiring)

- **A `demo` storage mode**:
  - The fake drive is seeded with the sample files, the cache and drive are stored in IndexedDB, and there is no sign-in.
  - "DEMO" shows in the footer, with a "Reset demo" action and a link to the real options.
  - The durable path already exists behind a test hook (`window.__TASKAPP_FAKE_DURABLE__`, `boot.ts`); this makes it a real mode.
- **Developer setup:**
  - `pnpm demo` runs it locally, and plain `pnpm dev` defaults to demo.
  - A `.env.example` lists every variable.
  - The README's commands work in PowerShell, cmd and bash.
- **A demo deployment** from `main` at `demo-tasks.omark.app`: a Pages project or a host-selected mode of the same build. *(The builder decides which.)*
- **Acceptance:**
  - A fresh clone runs `pnpm i && pnpm demo` and sees sample tasks.
  - Edits survive a reload.
  - The public demo makes no network request outside its own origin. An e2e test checks this.

#### 6.3.1 The omark.app landing page

`omark.app` is the front door for people who just want to use the app. Getting started must be very simple: one click to the demo, two to real use (open the app, sign in or pick a folder), with no account to create beyond the Microsoft sign-in.

Content, in this order:

1. **One line on what it is**, a screenshot or short GIF, and two buttons: **Open Omark Tasks** (`tasks.omark.app`) and **Try the demo** (`demo-tasks.omark.app`).
2. **How to start**, in three steps: open the app; sign in with Microsoft or pick a folder on your computer; add your first task. Then how to install it, briefly per platform: iPhone Safari → Share → Add to Home Screen; Chrome or Edge → the install icon.
3. **Where your data lives**: three Markdown files in your OneDrive app folder or your own folder, editable in Obsidian or by an AI agent; leaving is just closing the app.
4. **The philosophy in five short lines**, linking to PHILOSOPHY.md on GitHub.
5. **Open source**: a link to the GitHub repo and to CONTRIBUTING, and one line on the software factory.
6. **An apps section** with Omark Tasks as its only card. It is laid out so later apps can be added, but does not tease them.
7. **Footer**: privacy policy, terms, `hello@omark.app`, MIT licence.

How it is built:

- Static HTML and CSS in the repo (e.g. `sites/omark/`), with no framework, no tracking, no cookies and no third-party requests (fonts self-hosted).
- It works at phone width and in light and dark mode, using the app's design tokens.
- It hosts the privacy policy and terms pages, and `/.well-known/microsoft-identity-association.json` for publisher verification.
- It deploys to its own Pages project from `main`. *(My call; it carries no user data, so no staging step.)*

Acceptance:

- From `omark.app` on an iPhone and on a Windows PC, a new person reaches the demo in one click and a signed-in, empty task list in two clicks plus the Microsoft sign-in.
- The page makes no request outside `omark.app`.
- Lighthouse scores 95+ for performance and accessibility.

### 6.4 Local-folder mode (large: new storage adapter)

- **A `LocalFolderAdapter`** implements `StorageAdapter` with the File System Access API and passes `adapter-contract.ts`.
- **The user picks a folder.**
  - It can be any folder, including one synced by OneDrive, Dropbox, iCloud for Windows or Google Drive for desktop.
  - The directory handle is kept in IndexedDB. On later starts the app asks for permission again when the browser requires it.
- **The eTag is built from the file's `lastModified` and size** (or a content hash; the builder decides), so a change made outside the app (Obsidian, an agent, a sync client) is detected and merged like a OneDrive 412.
- **Sync-client conflict copies** (`tasks (1).md` and similar) are not merged automatically. The app shows a note naming them.
- **Supported browsers:** Chromium desktop browsers only. Safari, Firefox and phones get a clear "not available here" with the alternatives.
- **Acceptance:**
  - Contract tests pass with an in-memory directory fake.
  - e2e on desktop Chrome covers picking a folder, adding and completing a task, an outside edit while open, and a restart with the permission prompt.
  - Manual: a folder inside a synced OneDrive folder on Windows, edited in Obsidian while the app is open.

### 6.5 The open hosted app (large: sign-in and storage scope)

- **The hosted app lives at `tasks.omark.app` and is Omark's production.** It goes through today's pipeline, re-pointed:
  - A preview per PR on fake storage.
  - Staging at `staging-tasks.omark.app` from every merge to `main`.
  - Production through Promote.
  - The demo (6.3) deploys from `main` with staging.
  - New Pages projects are used, so my current deployment is untouched until the cutover.
- **It signs in personal Microsoft accounts** and uses `Files.ReadWrite.AppFolder`, so files land in `OneDrive/Apps/Omark Tasks/`. The user sees them there and can open them in Obsidian.
- **It has its own Entra registrations** (production and staging, 6.1), client secrets and cookie keys. My old registration stays as it is until the cutover.
- **A first-run screen** offers three choices: "Try the demo", "Use my OneDrive", "Use a folder on this computer". The last one appears only where it works.
  - The choice is remembered per device and can be changed in settings.
  - Switching never copies or deletes files. Copying is a later issue.
- **Pages on `omark.app` (6.3.1), linked from the hosted app's sign-in screen and footer:**
  - A short privacy policy: what is stored where, the sign-in cookie, no analytics, no server-side data.
  - Plain terms: as is, no warranty.
- **Microsoft publisher verification** is done for the new registration, so the consent screen shows a verified publisher.
- **Acceptance:**
  - A new Microsoft account signs in on the hosted app and sees an empty list with the Always and Tasks headings; the files are created in `Apps/Omark Tasks`.
  - The consent screen asks only for app-folder access.
  - My current instance keeps working until the cutover.
- **Publisher verification is not a launch blocker.** For personal accounts it only changes the consent screen. If the partner program won't verify an individual or it stalls, the app launches unverified and verification follows.

#### 6.5.1 Cutover: I move to the hosted app

I run this by hand once the hosted app is in production, before the repo goes public. The builder writes the steps as a checklist in `doc/history/` (it is mine, not a user feature). It covers:

1. On every device, open `tasks.alipka.com` and wait for "saved", so no edit is left only in an offline copy.
2. Sign in to `tasks.omark.app` once, so OneDrive creates `Apps/Omark Tasks` with fresh files. Close the app everywhere.
3. On the PC, copy `tasks.md`, `done.md` and `config.yaml` from `ALAI/TaskApp` over the fresh ones, and wait for OneDrive to sync.
4. Open the hosted app on each device; check counts and stats against the old app; re-add the iPhone home-screen app from the new address.
5. Make `tasks.alipka.com` redirect to `tasks.omark.app`, then retire the old Pages projects, my old Entra registration's secret, and the bridge values (6.1).
6. Keep `ALAI/TaskApp` untouched as a backup for a month, then archive it.
7. In Obsidian, open `Apps/Omark Tasks` as its own vault (or skip it and use local-folder mode on the PC).

### 6.6 Rename to Omark Tasks (small to medium, not large)

- **User-visible text:** the app name, page title, manifest, PWA name, sign-in text, footer, README and docs.
- **An Omark icon family, with Omark Tasks as its first icon:**
  - **The brand mark.** One Omark mark for the landing page, the GitHub org avatar and the social preview.
  - **A family rule for app icons.** All apps share a shape, a frame and a palette, and each app has its own glyph, so a later Notes icon is plainly a sibling. Omark Tasks is the first icon made with this rule.
  - **Deliverables:**
    - SVG sources;
    - the PWA set: 192, 512, and a maskable 512;
    - an apple-touch-icon at 180;
    - a favicon as SVG plus a 32 px PNG or ICO;
    - a 500 px org avatar and a 1280×640 social preview.

    Every icon must stay readable at 16 px and on light and dark backgrounds, with colours from `tokens.css`.
  - **Process.** The builder proposes 2–3 directions as mockups side by side, and I pick one. Then the full set is made. Sources and a short note of the family rules live in `brand/`.
- **Package scope** `@taskapp/*` becomes `@omark/*`.
- **The repo is named `tasks`** in the Omark org; GitHub's transfer redirect keeps old links working.
- **Not renamed:** the file names `tasks.md`, `done.md`, `config.yaml`, and my folders.

### 6.7 Documentation set

The old docs are rewritten for a stranger, in plain, short English, with no `[[wiki links]]` and no personal references.

| File | Content | Drawn from |
|---|---|---|
| `README.md` | What it is (one paragraph and a screenshot or GIF), the three ways to use it (demo, hosted, local folder), a 4-command quick start, links to PHILOSOPHY, AGENTS, CONTRIBUTING, format, self-hosting | Current README intro and commands |
| `PHILOSOPHY.md` | Why it exists (my story, in first person), the premises in 6.7.1, the "won't add" list, how features get in, the Omark direction | `TaskApp ideation.md`, v1 spec §1, this conversation |
| `AGENTS.md` | Short overview, a task router (which doc to read for which kind of task), layout, the four commands, Always / Ask first / Never rules, the definition of done, the issue flow in brief, the AI-contribution rule, links to the specs | CLAUDE.md, factory spec §3–5, Open Mercato's AGENTS.md structure |
| `CLAUDE.md` | `@AGENTS.md` plus Claude-only notes: the skills, cloud-session `gh api` note, cloud environment | Current CLAUDE.md |
| `CONTRIBUTING.md` | Setup with demo mode, how to pick up an issue, sizing and plans, the definition of done, the AI policy, fork CI notes, how ideas and voting work | Factory spec, README |
| `GOVERNANCE.md` | Roles (maintainers, contributors, community), how ideas become issues, who approves plans and merges, how a contributor becomes a maintainer | New |
| `SECURITY.md` | How to report privately (GitHub private vulnerability reporting), what the sign-in helper keeps and doesn't keep, known gaps (CSP) | README sign-in section, backlog |
| `CODE_OF_CONDUCT.md` | Contributor Covenant 2.1, contact address | Standard |
| `LICENSE` | MIT | Standard |
| `doc/spec.md` | The v1 spec, generalised, with the 7 stale statements fixed and the launch features added (demo, local folder, first run) | `TaskApp v1 spec.md` |
| `doc/format.md` | The file format as an open standard (section 6.7.2) | `taskapp-files` skill, v1 spec §3, §6, §10 |
| `doc/architecture.md` | The packages, the data flow (core → workspace and file sync → cache → adapter), three-way merge and eTags, the sign-in helper, how to add a storage adapter (with the contract test) | v1 spec §14–15, storage package, README |
| `doc/self-hosting.md` | Your own Entra app, Cloudflare Pages projects, secrets, variables, Promote, rollback | README "Sign-in", "Deploy", "Later" |
| `doc/factory.md` | The factory for maintainers and contributors (6.8), the Claude cloud environment | Factory spec, `TaskApp cloud environment.md` |
| `doc/plans/` | Kept as is; `19-quick-dates-important.md` is generalised as the example plan | |
| `doc/history/` | The v1 build plan, factory build plan, spike findings and acceptance checklist, each with a one-line "historical, may be out of date" note at the top. Cloudflare account and zone IDs are removed from them. | Existing |

**Removed:** `TaskApp ideation.md` (its spirit goes into PHILOSOPHY.md) and `TaskApp backlog.md` (its items become issues or Discussions ideas).

**Rewritten:** the two skills. The `taskapp-files` skill points to `doc/format.md` as its source and drops my local path.

#### 6.7.1 PHILOSOPHY.md premises

In my words, to be polished but not changed in meaning:

1. **Data sovereignty.** Your tasks live in files you own, in a place you choose. No Omark server ever stores them.
2. **Local or cloud-synced.** A folder on your computer, or your own cloud storage. Bring your own sync.
3. **An open `.md` standard.** Plain Markdown that any editor, script or AI agent can read and write. It is compatible with the Obsidian Tasks emoji format. Leaving is as easy as closing the app.
4. **A clean, simple UI.** One page with your main things, quick add, a calm design. Features are added only when many people want them and they fit; most ideas get a friendly no.
5. **Simplify, don't complicate.** A tool for GTD and a lighter head, not another system to maintain.
6. **Built with AI, in the open.** The repo carries its own software factory, so anyone can evolve it with an AI coding assistant, and every change goes through the same tests and review.

**The first "won't add" list.** These are my proposals for the builder to put in as a draft; I may edit them.

- No accounts, storage or analytics on Omark servers.
- No proprietary or binary file formats.
- No team or shared-workspace features in Omark Tasks.
- No nested projects or sprawling settings.
- No AI feature that sends your tasks anywhere without an explicit, per-feature opt-in.

#### 6.7.2 The format as an open standard

`doc/format.md` describes `tasks.md`, `done.md` and `config.yaml` so that someone else could write a compatible tool from it. It covers:

- The grammar: headings, task lines, `⏫` `🔁` `📅` `✅`, notes as indented lines, Always lines.
- The rules: completing moves the line and its notes to `done.md`; nothing is deleted except by delete.
- The recurrence rules with their table, and the week settings.
- What a tool must preserve: unknown lines, other Obsidian Tasks signs kept as text.
- A version number (`1.0`) and how changes to the format are proposed: an issue labelled `format` is always large.
- A compatibility note: which Obsidian Tasks fields are understood, kept or ignored.

The `taskapp-files` skill keeps the agent-facing editing rules and links here.

### 6.8 The factory, generalised (large: `.claude/`, guard, CI)

Roles:

| Who | Does |
|---|---|
| Maintainer (me, at first) | Turns ideas into `ready` issues; labels and re-labels sizes; approves plans; reviews and merges; runs Promote; handles `needs-human` |
| Contributor (and their agent) | Picks a `ready` issue and comments to claim it; works in a fork; for large issues posts a plan as a draft PR or issue comment and waits for a maintainer's approval; follows the definition of done; never merges |
| Community | Opens ideas in Discussions, votes with 👍, reports bugs |

- **Skills, guard and templates say "a maintainer", not "AL".** At launch I am the only maintainer: the only account with the org's Maintain or Admin role on the repo, and the only one listed in `.github/CODEOWNERS`. Pilot developers get Read or Triage. A plan approval counts only from a maintainer, checked through the GitHub API, never from comment text alone. A contributor's agent that reaches a plan gate stops and says so.
- **The guard keeps blocking agents** from pushing to `main`, force-pushing, merging and running Promote, for everyone. Its messages are role-neutral.
- **Labels:**

  | Label | Use |
  |---|---|
  | `ready` | The issue can be picked up |
  | `good first issue`, `help wanted` | Starter and open work |
  | `size:small`, `size:large` | Sizing |
  | `plan-review`, `plan-approved` | Large-work plan gate |
  | `needs-human` | Infrastructure steps only a maintainer can do |
  | `format` | Changes to the open file format |
  | `enhancement`, `bug` | Kind of issue |

  A labels file plus a script (or a one-off `gh api` call) creates them.
- **Ideas live in GitHub Discussions** (an "Ideas" category with voting). Issues are for accepted work and bugs.
- **Templates:**
  - The bug template asks for OS, browser, installed or tab, and storage mode.
  - The feature template asks for the problem, who has it, and the link to the Discussions idea.
  - The PR template has "What changes for users", "How to try it" and an AI-use line.
- **Factory documentation for contributors:**
  - What their agent needs: Node, pnpm, the four commands.
  - For Claude cloud sessions: their own environment pointed at their fork, with the Playwright domains allowed.
  - Previews exist only for branches in the main repo. A maintainer can push a contributor's branch there to get one.
- **Other tools:** AGENTS.md carries the whole process, so Codex, Cursor and similar tools can follow it today. `.claude/` is the Claude Code adapter (skills, hooks, guard), and adapters for other tools are welcome contributions.
- **Acceptance:** a dry run where an agent, acting as a non-maintainer on a test fork, picks a `ready` small issue and reaches a green PR. On a large issue it stops at the plan gate.

### 6.9 Seeded issues

At launch, about ten issues are labelled `ready`, sized, and written with acceptance criteria, so a contributor (or their agent) can start without asking. Proposed set:

| Issue | Size | Label |
|---|---|---|
| Todoist priority 1 imports as `⏫` | small | good first issue |
| Security headers and CSP in Report-Only mode | small | good first issue |
| Stats: 30-day view and streaks | small | good first issue |
| More natural-language dates in quick add ("in 3 days", "next fri") | large | help wanted |
| Export the three files as a zip | large | help wanted |
| Polish UI translation, and the i18n groundwork it needs | large | help wanted |
| Dropbox storage adapter | large | help wanted |
| Google Drive storage adapter (`drive.file` scope; first check whether conditional writes are possible) | large | help wanted |
| Week board on phones (bucket tabs) | large | help wanted |
| Reopen a completed task from search | large | help wanted |

I will also ask 5–10 developers I know to take one each before and right after the launch.

### 6.10 Publishing checklist (by hand)

**At the start (before milestone 1):**

1. Trademark search for OMARK (EUIPO, USPTO, software classes 9 and 42). If it's blocked, pick another name now; the brand module (6.1) keeps a later change cheap. Buy `omark.app` and add it to Cloudflare.
2. Set up two addresses with Cloudflare Email Routing (free), forwarding to me: `hello@omark.app` for the code of conduct and the privacy policy, `security@omark.app` for SECURITY.md. No personal address appears in the repo.
3. Create the GitHub org. Transfer the repo (still private) and rename it `tasks`. Check that the old URLs redirect and that CI and Promote still work.

**`omark.app`** serves the landing page (6.3.1).

**Before going public (after milestone 4 and the cutover in 6.5.1):**

4. Delete merged and stale branches, including the 4 `claude/*` ones. Keep tags and releases.
5. Repository settings:
   - branch protection;
   - fork workflow approval;
   - Discussions on, with an Ideas category;
   - private vulnerability reporting on;
   - topics (`markdown`, `todo`, `obsidian`, `local-first`, `gtd`, `pwa`, `ai-agents`);
   - a social preview image.
6. Check that the demo and the hosted app work. Skim the Actions logs that will become public.
7. Flip the repo to public.

### 6.11 Launch

- **Build in public for 3–4 weeks before the launch.** Weekly LinkedIn posts: why I left Todoist, building with a software factory, files your AI can read, the philosophy. A waitlist is not needed; the demo is the call to action.
- **Launch day**, a Tuesday to Thursday, posting around 8–10 am US Eastern:
  - Show HN;
  - r/ObsidianMD, r/selfhosted, r/gtd, r/ClaudeAI;
  - a LinkedIn post.
- **Material:** a 20–30 second GIF or video of quick add, completing a task, the file changing in Obsidian, and Claude editing it.
- **After the launch:**
  - Submit to awesome-lists where the project fits their rules.
  - Answer every issue and Discussion within 24 hours in the first two weeks.

## 7. Order of work

0. **Before milestone 1:** the first three steps of 6.10 (name, domain, addresses, org, transfer).
1. **Milestone 1, groundwork:** 6.1 configuration, 6.2 fork CI, 6.6 rename. My current deployment keeps working through the bridge values, checked on staging before Promote.
2. **Milestone 2, try it and read it:** 6.3 demo and landing page, 6.7 docs, 6.8 factory. Pilot developers get access and try the contributor flow.
3. **Milestone 3, real use:** 6.4 local folder, 6.5 hosted app, then my cutover (6.5.1) and removal of the bridge values.
4. **Milestone 4, open the doors:** 6.9 issues, the rest of 6.10.
5. **Milestone 5:** 6.11 launch. The build-in-public posts can start during milestone 2.

Each large workstream gets a plan in `doc/plans/` and my approval, as the factory requires.

## 8. Steps only I can do

- Pick the org name, run the trademark check, buy the domain, set up the email forwarding.
- The two new Entra registrations, "Omark Tasks" and "Omark Tasks Staging" (6.1, 6.5):
  - create each with a Web redirect URI;
  - create the client secrets;
  - get publisher verification for the production one, including joining the Microsoft AI Cloud Partner Program and verifying the domain (not a launch blocker).
- Cloudflare: the Pages projects for `tasks.omark.app`, `staging-tasks.omark.app`, `demo-tasks.omark.app` and `omark.app`, DNS, the Pages secrets.
- Pick one of the icon directions (6.6).
- GitHub: create the org, transfer the repo, give pilot developers Read or Triage, set repository variables and secrets, the Actions approval setting, Discussions; at the end, branch protection and flipping to public.
- The cutover (6.5.1), then retiring `tasks.alipka.com`.
- Approve the PHILOSOPHY wording and the "won't add" list.
- Write and post the LinkedIn posts; ask the developers I know.

## 9. Left to the builder

- **Demo deployment:** a separate project or a host-selected mode of one build (6.3).
- **Local-folder eTag:** `lastModified`+size or a content hash (6.4).
- **How a maintainer is recognised** by the factory (the API check or CODEOWNERS), as long as it can't be spoofed by a comment from a non-maintainer.
- **The icon directions to propose** (6.6). I choose among them.
- **The exact structure of AGENTS.md**, as long as it has the parts listed in 6.7.
- **How each milestone splits into issues and PRs.**

## 10. Calls made after the builder check

A builder read this spec cold and asked five questions. I answered the first one; the others were settled as calls of their own, marked here so they can be checked:

1. **My own instance** (my answer): I move to the hosted app. The public repo deploys only Omark's instances (sections 3, 6.5, 6.5.1).
2. **Name before code** (call): the trademark check and domain come first, and brand strings live in one module (6.1, 6.10).
3. **Where the repo lives before launch** (call): it moves into the org early, still private. Pilot developers get Read or Triage and test the fork flow from private forks. Branch protection comes with going public (6.2, 6.10).
4. **Bare domain, contact, verification** (call, then shaped by my later answer): `omark.app` is the landing page described in 6.3.1, which also serves the Microsoft verification file; `hello@` and `security@` forwarding addresses; publisher verification is not a launch blocker (6.5, 6.10).

Later changes from me: the domain is `omark.app`, with Omark Tasks at `tasks.omark.app` and staging at `staging-tasks.omark.app`; the landing page content (6.3.1); an Omark icon family with Omark Tasks as its first icon (6.6); notes and other apps are future ideas only (2.3).
5. **Maintainers at launch** (call): only me, recognised by repo role and CODEOWNERS, never by comment text (6.8).
