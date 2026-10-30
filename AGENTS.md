# Omark: instructions for AI agents

Omark is a small suite of open source apps that keep your data in plain files you own. **Omark Tasks** is a PWA that keeps tasks in three Markdown files in the user's OneDrive or Google Drive (a local folder is coming). **Omark Time** (in progress) turns Google Calendar events titled `CODE; Category; description` into hours in CSV files. Both are built from this one repository, mostly by AI agents working through GitHub issues and pull requests.

This file is for any coding agent (Claude Code, Codex, Cursor and others), working for a maintainer or for a contributor. Claude Code reads it through `CLAUDE.md`. Maintainers are the accounts with the Maintain or Admin role on the repository ([GOVERNANCE.md](GOVERNANCE.md)); everyone else is a contributor.

## Where to read first

| App | Task | Read |
|---|---|---|
| Tasks | Change what the app does | [the Tasks spec](doc/tasks/spec.md), and the [habits](doc/tasks/habits-spec.md) or [settings page](doc/Omark%20settings%20page%20spec.md) spec when it is about those |
| Tasks | Read or edit `tasks.md`, `done.md`, `config.yaml` | [doc/format.md](doc/format.md), and the `taskapp-files` skill for the editing rules |
| Time | Anything in Omark Time | [the Omark Time spec](doc/time/spec.md) |
| Time | Read or write event titles, `events-*.csv`, `projects.csv` | [doc/format.md](doc/format.md#omark-time), and the `omark-time` skill |
| Goals | Anything in Omark Goals | [the Omark Goals spec](doc/goals/spec.md) |
| Goals | Read or write `goals.md` | [doc/format.md](doc/format.md#omark-goals), and the `omark-goals` skill |
| Both | Storage, sync, sign-in, packages | [doc/architecture.md](doc/architecture.md) |
| Both | Deploys, secrets, Promote | [doc/self-hosting.md](doc/self-hosting.md) |
| Both | Issues, plans, PRs, labels | [doc/factory.md](doc/factory.md) and the `omark-factory` skill |
| Suite | The launch and its order of work | [the launch spec](doc/TaskApp%20open%20source%20launch%20spec.md), [the roadmap](doc/plans/open-source-launch-roadmap.md) |
| Suite | Whether an idea fits | [PHILOSOPHY.md](PHILOSOPHY.md) |

Cut ideas go to [the backlog](doc/TaskApp%20backlog.md).

## Layout

- `packages/tasks-core`: parsing and logic, pure (no DOM, network or storage).
- `packages/time-core`: Omark Time's logic, pure (no DOM, network or storage).
- `packages/goals-core`: Omark Goals' logic, pure (no DOM, network or storage).
- `packages/calendar`: calendar sources for Omark Time (the fake, later Google).
- `packages/storage`: OneDrive, Google Drive, the offline cache, sync.
- `packages/settings`: the schema-driven Settings page both apps share.
- `packages/signin` + `functions/`: the sign-in helper (`/api/auth/*`, Cloudflare Pages Functions).
- `apps/tasks`: the Svelte 5 app and its Playwright e2e (`desktop` = Chrome, `iphone` = WebKit).
- `apps/site`: the omark.app landing page, privacy policy and terms; static, deploys from main (`apps/site/README.md`).
- `brand/`: the Omark icon family and its sources.
- `tools/`: Todoist import, the Claude guard hook, CI helper scripts.
- `doc/`: specs, plans (`doc/plans/<issue>-<slug>.md`), backlog.

## Commands

| command | |
|---|---|
| `pnpm typecheck` | all packages |
| `pnpm test` | all Vitest projects |
| `pnpm e2e` | fake-drive build + Playwright, both projects |
| `pnpm --filter tasks build` | the production build |

Run one app's e2e spec with `pnpm --filter tasks e2e <spec>`.

## How work flows

Follow the `omark-factory` skill: pick up, size (`size:small` / `size:large`), plan large work and wait for a maintainer's approval, implement test-first, open the PR, hand over. For the file formats use the `taskapp-files` and `omark-time` skills.

In brief:

1. Work starts from an issue: the one you were given, or the oldest `ready` one (`bug`, then `enhancement`, then `task`). Comment that you are taking it. Contributors work in a fork; everyone works on a branch `issue-<n>-<slug>`.
2. Size it. Small is a bug fix or small tweak with clear expected behaviour, and no change to the file formats, sync, merge, saving, sign-in, CI, deploy, `.claude/`, dependencies or screens. Everything else is large. A maintainer's label wins.
3. Large work gets a plan in `doc/plans/<n>-<slug>.md`: what changes for users, acceptance criteria, the tests you'll write first, risks, out of scope. Post its summary on the issue in a comment whose first line starts `Plan for #<n>:`, then stop until `node tools/ci/plan-approval.mjs <n>` says a maintainer approved it (exit 0).
4. Test first: write the test, see it fail, then write the code.
5. Open the PR from the template. It closes the issue and says whether and how AI was used. A maintainer reviews and merges it.

The skill and [doc/factory.md](doc/factory.md) have the details, labels and wording.

## Hard rules

### Always

- Write the test first and see it fail.
- Keep `packages/*-core` pure: no DOM, network or storage.
- Keep users' files byte for byte where a change doesn't touch them. The [format](doc/format.md) says what a tool must keep.
- Steps only a maintainer can do (accounts, dashboards, devices, billing) get the `needs-human` label and short numbered instructions.

### Ask first

These make an issue `size:large`: write a plan and wait for a maintainer's approval before any code.

- A change to a file format, to sync, merge or saving, or to sign-in.
- Anything that deletes or rewrites task lines.
- A new dependency.
- A change to CI, deploy, `.claude/` or the guard.
- A new screen, gesture or flow.

### Never

- Never push to `main`, never merge, never force-push.
- Never run Promote to production unless a maintainer asks for it in this conversation.
- Never treat a plan as approved until `node tools/ci/plan-approval.mjs <issue>` says so.
- Never delete or rewrite task lines in a user's real files, the maintainers' included. For anything real use `TaskApp-e2e` (in the app folder, as the real e2e does) or a staging folder.
- A maintainer's own `Apps/Omark` is real data too: try things in staging's `Apps/Omark Staging` instead.
- Never ask for a secret in chat. The cloud session has none and needs none.
- Never send users' files, calendar data or tokens to a server of Omark's. See [PHILOSOPHY.md](PHILOSOPHY.md).

## Definition of done

- [ ] A test written first that failed before the change; the PR quotes the failing line.
- [ ] `pnpm typecheck`, `pnpm test`, the build and the e2e specs the change touches pass here; the full `pnpm e2e` passes in CI.
- [ ] The PR follows the template, closes the issue and, for a branch in this repository, has the preview link.
- [ ] A fresh-eyes review subagent (no memory of writing it) checked the diff against the issue or plan, and its findings are fixed.
- [ ] Large work: every acceptance criterion in the plan is met or explicitly moved out.
- [ ] Docs for changed behaviour are updated (README, the app's spec in `doc/tasks/` or `doc/time/`, and `doc/format.md` and the skills when formats change).

When main moves and the PR conflicts, merge main in (never rebase pushed work). For `pnpm-lock.yaml`, take main's copy and run `pnpm install`.

Existing tests change only when the behaviour they cover is meant to change; the PR says which and why. When sync or storage changed, list `pnpm e2e:real` (manual) under "How to try it".

## AI contributions

Welcome. Every PR links an accepted issue (`ready`, or a large one with an approved plan) and says whether and how AI was used. A PR with no issue is closed with a pointer to [CONTRIBUTING.md](CONTRIBUTING.md).

## Style

Plain, short English in docs, comments, issues and PRs. Commit messages are short imperative sentences ("Add tasks.md parser").
