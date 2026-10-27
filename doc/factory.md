# The factory

Omark is built through a small software factory: ideas and bugs are GitHub issues, AI agents do the work on branches, and changes land through pull requests that a maintainer reviews and merges. This page describes it for maintainers and contributors. Agents get the same rules in [AGENTS.md](../AGENTS.md); Claude Code also gets them step by step in the `taskapp-factory` skill.

The factory was first built for one person; [its original spec](TaskApp%20factory%20spec.md) has the history and the reasons. Making its wording role-neutral for outside contributors is roadmap item 2.5.

## Who does what

| Who | Does |
|---|---|
| Maintainer | Turns ideas into `ready` issues; sets and changes sizes; approves plans; reviews and merges; runs Promote; handles `needs-human` steps |
| Contributor and their agent | Picks a `ready` issue and claims it; sizes it; writes a plan for large work and waits; implements test-first; opens the PR; fixes CI and review comments; never merges |
| GitHub Actions | Checks, e2e, previews, staging and demo deploys, Promote |

## The issue flow

```
issue ──► sized (small | large) ──► small: implement ──────────────────────► PR ──► merge ──► staging ──► Promote
                                └─► large: plan ──► maintainer approves ──► implement ─┘
```

### Sizing

**Small** only if all of these hold:

- a bug fix or small tweak with clear expected behaviour;
- no change to the file formats, to sync, merge or saving, or to sign-in;
- no new dependency;
- no change to CI, deploy, `.claude/` or the guard;
- no new screen, gesture or flow.

Anything else is **large**. When in doubt, large. File formats, sync and merge, sign-in, and anything that deletes or rewrites task lines are always large, because mistakes there lose data or lock people out. A maintainer's label wins.

### Plans for large work

1. Write `doc/plans/<n>-<slug>.md` on the issue's branch: **What changes for users**, **Acceptance criteria** (checkboxes), **Tests I'll write first**, **Risks**, **Out of scope**.
2. Post a summary on the issue, label it `plan-review`, and stop.
3. A maintainer approves with the `plan-approved` label or an "approved" comment. Only a maintainer's approval counts.
4. A change of direction mid-way means an updated plan and a new approval.

### Labels

| Label | Meaning |
|---|---|
| `bug`, `enhancement` | Kind of issue |
| `size:small`, `size:large` | Size |
| `ready` | Can be picked up |
| `good first issue`, `help wanted` | Starter and open work |
| `needs-info` | A question was asked; waiting for the answer |
| `plan-review`, `plan-approved` | The plan gate for large work |
| `in-progress` | Someone is on it; their comment names the branch |
| `needs-human` | Blocked on a step only a maintainer can do (accounts, dashboards, devices) |
| `format` | A change to an open file format ([doc/format.md](format.md)); always large. Created with the factory update (roadmap 2.5) |

"Take the next issue" means the oldest `ready` issue that isn't `in-progress`, bugs first.

### Definition of done

[AGENTS.md](../AGENTS.md#definition-of-done) has the checklist: a test written first that failed, the four commands green, the PR template filled in, a fresh-eyes review of the diff, every acceptance criterion met, and docs updated.

## Environments and CI

| | Preview | Staging | Production | Demo |
|---|---|---|---|---|
| Built from | Each PR from the repository | `main`, on every merge | A promoted `main` commit | `main`, on every merge |
| Storage | The demo build: sample tasks in the browser | Real storage, a staging folder | Real storage | Sample tasks in the browser |
| Sign-in | None | Its own registration | Its own registration | None |

Staging and production run the same build; Promote ships the exact files staging ran. [self-hosting.md](self-hosting.md) has the setup.

| Workflow | When | Does |
|---|---|---|
| `ci.yml` | PR opened or updated | `check` (typecheck and unit tests), e2e on desktop Chrome and iPhone WebKit in parallel, and once `check` passes a preview deploy with a comment linking it |
| `ci.yml` | Push to `main` | The same checks, then the staging deploy (keeping the build as an artifact), the demo deploy and the omark.app site deploy |
| `promote.yml` | By hand | Production deploy of a green `main` commit, tag and release |

- Docs-only changes (`doc/**`, `*.md`) skip CI.
- A newer push to a PR cancels the older run.
- Agents run the checks before pushing, so CI confirms rather than debugs. They run only the e2e specs they touch; CI runs all of them.
- Fork PRs get the checks and e2e but no preview, because forks have no secrets. A maintainer can push a contributor's branch to the main repository to get one.

## The guard

Branch protection comes with the public repository. Until then, and for every agent after it, a `PreToolUse` hook (`tools/claude-guard/guard.mjs`) and matching deny rules in `.claude/settings.json` block:

- pushes to `main` (including `HEAD:main`, `+main` and wildcard refspecs), force pushes, `--prune`;
- deleting remote branches other than the session's own;
- merging PRs, by `gh`, the API or the GitHub tools;
- writing to `main` through the API;
- starting Promote.

The guard is best-effort: it reads the command line and can't see what a script or alias does. Its tests run in CI's `check` job.

## Claude Code and the cloud environment

`.claude/` is the Claude Code adapter: the skills, the guard and a session-start hook. Adapters for other agents are welcome contributions; they follow the same [AGENTS.md](../AGENTS.md).

Factory sessions can run in a Claude cloud environment, which keeps working with the laptop closed and can be followed from the phone. Its settings live at claude.ai, so they are recorded here. To re-create it: claude.ai/code → environment menu → Add environment.

| Setting | Value |
|---|---|
| Repository | `omark-app/omark` (a contributor points it at their fork) |
| Network access | **Limited**, with the package managers box ticked, plus `cdn.playwright.dev` and `playwright.download.prss.microsoft.com` (Playwright downloads its browsers from them) |
| Setup script | none |
| Environment variables | none |
| Secrets | none. Sessions never need Cloudflare, Entra, Google or OneDrive credentials; deploys run in GitHub Actions |

When a cloud session starts, `.claude/hooks/session-start.sh` (only when `CLAUDE_CODE_REMOTE=true`) enables corepack, runs `pnpm install --frozen-lockfile` when `node_modules` is missing or older than the lockfile, and installs Playwright's Chromium and WebKit when this version's are missing. It prints one line if a step fails and never blocks the session.

In cloud sessions `gh issue` and `gh pr` (GraphQL) are blocked by the proxy. Use the GitHub MCP tools or `gh api` (REST).

The checks made when the environment was set up are in [the old cloud environment notes](TaskApp%20cloud%20environment.md).

## Costs

The factory is meant to cost nothing beyond a coding assistant's subscription: agents run on that subscription, CI on GitHub's free Actions minutes (free and unlimited for a public repository), and hosting on Cloudflare Pages Free.
