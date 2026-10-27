# TaskApp factory spec

Status: approved, 2026-10-18. Agreed points are from the session that compared ready-made factories (zazencodes, addyosmani/factory, claude-code-action, PranayHaldiya/software-factory and others).
Related: [[TaskApp v1 spec]], [[TaskApp backlog]].

## 1. Goal

Grow TaskApp by working with Claude from the phone or the PC, with GitHub as the source of truth:

- Ideas and bugs are **GitHub issues**. Work happens on branches and lands through **pull requests**.
- Claude works in **Claude cloud sessions**, which keep running with the laptop lid closed and can be started and followed from the iPhone app or the desktop app's Code tab.
- Every change is test-first (TDD) and passes the full suite: type checks, unit tests, e2e on desktop Chrome and iPhone WebKit, and a build.
- Three environments: a **preview** per pull request, **staging** on real data, **production**.
- I decide what gets built, approve plans for bigger work, merge, and promote to production. Claude does the rest.

### 1.1 Constraints

- **No extra costs.** GitHub Free (private repo, 2,000 Linux Actions minutes a month, each job rounded up to the minute) and the Claude Max subscription.
  - Claude's work (implementing, plans, the review subagent, Auto-fix, routines) runs in cloud sessions on Anthropic's machines. That uses the subscription, not Actions minutes. "Extra usage" stays off in claude.ai settings, so hitting a limit means waiting, never paying.
  - claude-code-action is left out at first: it runs on a GitHub runner and uses minutes even with a subscription token. Anthropic's separate Code Review product isn't part of Max and isn't used.
  - Cloudflare Pages Free covers previews, staging and production. Files are built in CI and uploaded with wrangler, so Cloudflare's build quota isn't touched. Entra and an extra OneDrive folder are free.
  - CI stays lean (section 6.3). An Actions budget of $0 (section 9) means running out of minutes pauses CI until the month resets, never a charge.
- **No branch protection for now** (GitHub Free can't protect a private repo). The guard in section 8 and the staging step make up for it.
- **Self-built and small.** No factory framework is installed. Ideas are borrowed from addyosmani/factory (issue queue, fail-closed gates, humans merge) and zazencodes (escalation list). Nothing is copied from zazencodes, which has no license.

## 2. Roles

| Who | Does |
|---|---|
| Me | Write or dictate issues; answer questions; approve plans for large work; try previews and staging; merge; promote |
| Claude (cloud session) | Size issues, ask questions, write plans for large work, implement test-first, open PRs, fix CI failures, review its own PR |
| GitHub Actions | Checks, e2e, preview deploy, staging deploy, promote |

## 3. Issue flow

```
issue ──► sized (small | large) ──► small: implement ──────────────► PR ──► merge ──► staging ──► promote
                                └─► large: plan ──► I approve ──► implement ─┘
```

### 3.1 Sizing

Claude sizes each issue when it first reads it, adds the label with a one-line reason as an issue comment, and I can relabel at any time. My label wins.

**Small**: all of these hold.
- A bug fix or a small tweak with clear expected behaviour.
- No change to the file formats (`tasks.md`, `done.md`, `config.yaml`), to sync, merge or saving, or to sign-in.
- No new dependency.
- No change to CI, deploy, `.claude/` or the guard.
- No new screen, gesture or flow.

**Large**: anything else. When in doubt, large.

If small work turns out bigger mid-way, Claude stops, relabels it large, and posts a plan.

Always large, because mistakes here can lose data or lock me out: file formats, sync and merge, sign-in, anything that deletes or rewrites task lines.

### 3.2 Small issues

Claude goes straight to TDD and a pull request (section 5). I review the PR.

### 3.3 Large issues

1. Claude writes a short plan: what changes for me, acceptance criteria, the tests it will write, risks, and what's out of scope. The plan lives in `doc/plans/<issue>-<slug>.md` on the issue's branch, and its summary goes into an issue comment.
2. Label `plan-review`. Claude stops.
3. I approve by adding `plan-approved`, by commenting "approved" on the issue (handy from the GitHub app), or by saying so in the live session. Claude records a chat approval on the issue.
4. Claude implements against the approved plan. A change of direction means a plan update and a new approval.

### 3.4 Labels

| Label | Meaning |
|---|---|
| `bug`, `enhancement` | Kind (existing labels) |
| `size:small`, `size:large` | Size (3.1) |
| `ready` | Can be picked up |
| `needs-info` | Claude asked a question in the issue; waiting for me |
| `plan-review` | Plan posted; waiting for me |
| `plan-approved` | Go ahead |
| `in-progress` | A session is working on it; the comment names the branch |
| `needs-human` | Blocked on something only I can do (Entra, a device check, a dashboard) |

"Take the next issue" means the oldest `ready` issue that isn't `in-progress`, with `bug` before `enhancement`.

### 3.5 Issue and PR templates

- `.github/ISSUE_TEMPLATE/bug.yml`: what happened, what I expected, device (Windows/Brave or iPhone), steps.
- `.github/ISSUE_TEMPLATE/feature.yml`: what I want and why, how I'll know it works.
- `.github/pull_request_template.md`: `Closes #n`, size, what changed for me, tests written first (with the failing line from before the fix), preview link, anything I should try on the phone.

## 4. Starting work

From the iPhone app or the desktop Code tab, choose **Cloud** and the TaskApp environment, then say for example "work on #14", "take the next issue", or "file a bug: …". The session works under the project's `CLAUDE.md` and the `taskapp-factory` skill (section 7).

Later and optional (section 10): a daily routine that sizes new issues and asks its questions while I'm away.

Remote Control (driving the local PC session from the phone) is not used for factory work: it stops when the laptop sleeps.

## 5. Definition of done

A PR is ready for me when:

1. The new behaviour, or the bug, has a test that was written first and failed before the change. The PR body quotes the failing line.
2. `pnpm typecheck`, `pnpm test`, `pnpm --filter tasks build` and the e2e specs the change touches pass in the session. The full `pnpm e2e` passes in CI. (Running it everywhere locally made parallel sessions slow and flaky; CI runs both projects side by side in about 5 minutes.)
3. The PR body follows the template, links the issue, and has the preview link.
4. Claude has reviewed its own diff fresh (a review subagent with no memory of writing it) against the issue or the approved plan, and fixed what it found.
5. For large work: every acceptance criterion in the plan is met or explicitly moved out.
6. Docs that describe changed behaviour are updated (README, the v1 spec's sections, the `taskapp-files` skill when formats change).

Existing tests can change only when the behaviour they cover is meant to change, and the PR says which and why.

The real-OneDrive smoke (`pnpm e2e:real`) stays manual, since its sign-in lasts about 24 hours. Claude lists it under "try this" when sync or storage changed.

## 6. Environments and CI

### 6.1 Environments

| | Preview | Staging | Production |
|---|---|---|---|
| Built from | Each PR | `main`, on every merge | A promoted `main` commit |
| URL | `pr-<n>.taskapp-staging.pages.dev` | `tasks-staging.alipka.com` | `tasks.alipka.com` (as today) |
| Cloudflare Pages project | `taskapp-staging` (preview branches) | `taskapp-staging` (production branch) | `taskapp` |
| Storage | The demo build: sample tasks kept in this browser | Real OneDrive, `ALAI/TaskApp-staging` | Real OneDrive, `ALAI/TaskApp` |
| Sign-in | None (demo build) | Same Entra app: its own Web redirect URI, client secret and Pages secrets | As today |
| Looks | "PREVIEW" in the footer | Name "TaskApp Staging", "STAGING" in the footer, different theme colour | Unchanged |

- `staging` gets its own Pages project so its "production" branch is staging and `tasks-staging` can be a plain custom domain. A one-level subdomain (`tasks-staging`, not `staging.tasks`) stays inside Cloudflare's free certificate.
- Previews are demo builds because Entra doesn't accept wildcard redirect URIs. The demo starts with sample tasks (all buckets, a repeat, notes, ALWAYS lines) and keeps edits in the browser, so a preview is worth opening on the phone.
- The public demo (`demo-tasks.omark.app`, Pages project `omark-tasks-demo`) is the same demo build, deployed from `main` with staging by the `tasks-demo` job. It has no Promote step and no sign-in helper.
- The staging folder starts as a copy of `ALAI/TaskApp`. "Refresh staging" means copying the production files over it again. Staging is throwaway, and production files are never touched by staging.
- Staging and production are different origins, so their offline caches and sign-ins are separate. Both can sit on the iPhone home screen, told apart by name and colour.
- **One build for staging and production.** The app picks its environment at run time from the host name: `tasks-staging.alipka.com` uses `ALAI/TaskApp-staging` and the staging look, `tasks.alipka.com` uses `ALAI/TaskApp`, anything else (localhost, previews) follows the build variables as today. Promote then uploads the exact files staging ran, with no rebuild.
  - Trade-off: a little host-name logic in the app instead of a pure build setting, and the iPhone may keep a single home-screen name from the static manifest. If a runtime name proves impossible, staging keeps the same name and differs by colour and the "STAGING" label, or falls back to a per-environment build (one more build job per promote). Decided in the phase 1 plan.

### 6.2 Workflows

| Workflow | When | Does |
|---|---|---|
| `ci.yml` | PR opened or updated | check; e2e, one job per Playwright project (`e2e (desktop)`, `e2e (iphone)`) in parallel; then a preview job that deploys the demo build and comments the link |
| `ci.yml` | Push to `main` | check; both e2e jobs; then a small deploy job that builds once for staging and production, deploys to staging, and keeps the files as a workflow artifact; beside it `tasks-demo` builds and deploys the demo |
| `promote.yml` | By hand (`workflow_dispatch`) | Production deploy (below) |

- PR previews wait for check only, so they appear while e2e runs; a PR is still ready only when e2e is green. The staging, demo and site deploys wait for check and both e2e jobs.
- e2e runs in Playwright's own container image (`mcr.microsoft.com/playwright`), whose version must match `@playwright/test`; `workflows.test.ts` checks it. It keeps Playwright's default workers: 4 made the iPhone job slower (#35).
- check and e2e start together, so a green run doesn't wait for check. If check fails, a small job after it (`stop-on-check-failure`) cancels the run, so the e2e jobs stop early and check still shows as failed.
- Every job has a time limit (`timeout-minutes`): check 10, stop-on-check-failure 5, e2e 20, preview, staging deploy, demo deploy and Promote 15.
- The staging build is a separate build from the e2e one, because e2e tests the fake drive and staging needs the real one.

**Promote to production**, one tap from the GitHub app (Actions → Promote to production → Run workflow):

1. Input: the app (only `tasks` so far) and a commit, defaulting to the one staging runs now.
2. Refuses unless that commit is on `main` and its CI run passed.
3. Downloads that run's artifact and deploys it unchanged to the `taskapp` project. If the artifact has expired (kept 30 days), it rebuilds from the commit.
4. Tags it `tasks-prod-YYYY-MM-DD-n` (the app's name first; before the monorepo move it was `prod-YYYY-MM-DD-n`) and creates a GitHub release listing the PRs merged since the last of these tags.

**Rollback:** run Promote with an older `tasks-prod-` or `prod-` tag. Cloudflare's dashboard rollback also works.

### 6.3 Keeping CI within the free minutes

Today every push to a PR branch runs CI twice (`push` and `pull_request`), about 6 minutes each (check ~1, e2e ~4, deploy ~1).

- CI runs on `pull_request` and on `push` to `main` only, so a PR is checked once per push.
- `concurrency` with `cancel-in-progress`: a newer push cancels the older run on the same branch.
- `paths-ignore` for `doc/**` and `**/*.md`: doc-only changes skip CI.
- e2e runs in Playwright's image, so no browsers or Linux packages are installed in a run.
- Claude runs the suite in its session before pushing, so CI confirms rather than debugs.
- Rough budget (each job rounds up to a whole minute): ~9 minutes per PR push (check 1, e2e desktop 3, e2e iPhone 4, preview 1) and ~9 per merge (deploy instead of preview). 2,000 minutes is about 220 PR pushes a month. A merge reaches tasks-staging in about 3.5 minutes.

## 7. Repo setup for Claude

### 7.1 `CLAUDE.md` (new)

Short and factual:
- What TaskApp is and where things live; points to the specs.
- Commands and the definition of done (section 5).
- How work flows: sizing, plans, labels, PRs (sections 3–5).
- Hard rules: never push to `main`, never merge, never run Promote unless I ask in that conversation, never delete or rewrite task lines in my real files, and use `TaskApp-e2e` (in the app folder, which the real e2e uses) or `ALAI/TaskApp-staging` for anything real.
- In cloud sessions, `gh issue` and `gh pr` (GraphQL) are blocked by the proxy: use the GitHub tools or `gh api` (REST).

### 7.2 Skills

- `taskapp-factory` (new, in `.claude/skills/`): the step-by-step for picking up, sizing, planning, implementing, and handing over an issue, including the comment and label wording.
- `taskapp-files` (existing).
- No third-party skill plugins. Cloud sessions don't load plugins from the project's `.claude/settings.json` (checked 2026-10-18), and copying them into the repo isn't worth the clutter, so the flow is written to work without them.

### 7.3 Hooks

- `SessionStart`, in the cloud only: `pnpm install --frozen-lockfile` when `node_modules` is missing or older than the lockfile, and the Playwright browsers when this Playwright version's are missing (so no setup script is needed).
- `PreToolUse` guard: section 8.

### 7.4 Cloud environment

Cloud environment settings can't be committed, so `doc/TaskApp cloud environment.md` records them:

- Name `TaskApp`, repository `alipkagit/TaskApp`.
- Network: Limited (the default package-manager list) plus the Playwright browser download hosts `cdn.playwright.dev` and `playwright.download.prss.microsoft.com`.
- No setup script: the SessionStart hook (7.3) installs packages and browsers.
- No secrets. The cloud session never needs Cloudflare, Entra or OneDrive credentials.

## 8. Guard (instead of branch protection)

- A `PreToolUse` hook on Bash and the GitHub MCP tools blocks: any push to `main` (including `HEAD:main`, `+main` and wildcard refspecs), force pushes, `--prune`, deleting remote branches other than the session's own, merging PRs (`gh pr merge`, `gh api …/merge`, the merge tools), writing to `main` through the API or the GitHub tools, and starting Promote.
- `.claude/settings.json` adds matching deny rules. Promote also refuses to run from any branch but `main`.
- The hook is best-effort: it reads the command line, not what scripts or aliases do.
- **Known gap:** on GitHub Free every workflow on any branch can read the repo's secrets, and the one Cloudflare token can deploy to every Pages project in the account. So a PR whose own workflow or CI script was edited could deploy to production. What stops that today is the rules (CI changes are always `size:large`, I review every PR) and the guard. Closing it fully needs a staging-only token, e.g. staging and previews in a second, free Cloudflare account.
- Hook tests: a small script feeds it allowed and blocked commands and runs in CI's check job.
- If the repo later moves to GitHub Pro or goes public, branch protection on `main` (PR required, checks required) replaces most of this.

## 9. What I do by hand (once)

1. On the Entra app (tenant-scoped portal), add the **Web** redirect URI `https://tasks-staging.alipka.com/api/auth/callback` and a second client secret `taskapp staging`. Then set the Pages secrets `MSAL_CLIENT_ID`, `MSAL_CLIENT_SECRET` and `COOKIE_KEY` on `taskapp-staging`, as README → Sign-in does for `taskapp`.
2. Create the cloud environment at claude.ai from `doc/TaskApp cloud environment.md`.
3. Check that the Claude GitHub App has access to `alipkagit/TaskApp` (cloud sessions and Auto-fix need it).
4. GitHub → Settings → Billing and licensing → Budgets: an Actions budget of $0 with "stop usage when budget limit is reached" on (or no payment method on file).
5. claude.ai → Settings → Usage: "extra usage" off.
6. Try the pilot (section 11) from the phone.

Claude does the rest: the Cloudflare project and DNS record (if the existing token's scope allows, otherwise a `needs-human` step), copying the staging folder in the local OneDrive, labels, templates, workflows and files.

## 10. Phases

1. **Foundations**: `CLAUDE.md`, the `taskapp-factory` skill, hooks and guard, labels and templates, the new CI with previews, staging and Promote, sample data for fake builds, the cloud environment doc, and a check that a cloud session can run the full suite, WebKit included.
2. **Pilot**: section 11.
3. **Unattended triage (optional)**: a daily cloud routine that sizes new issues, asks questions, and posts a short summary. It runs on the subscription with no Actions minutes, and it reads issues through the GitHub tools (routines have no "issue opened" trigger).
4. **Unattended small fixes (optional, after the pilot)**: a nightly routine that takes one `ready` + `size:small` issue to a PR, so I can merge in the morning.

## 11. Pilot acceptance

- [ ] With the laptop lid closed, from the iPhone: file a small bug, have a cloud session fix it test-first, get a PR with a working preview link, merge it in the GitHub app, see it on staging, promote it, see it on `tasks.alipka.com`.
- [ ] A large feature: the plan arrives as an issue comment, I approve it from the phone, and the PR meets the plan.
- [ ] A deliberately failing CI run gets fixed by Auto-fix without me.
- [ ] The guard blocks a push to `main` and a merge (shown by its tests and one live attempt).
- [ ] Staging and production sit side by side on the iPhone home screen and are easy to tell apart.
- [ ] A month of normal use stays within 2,000 Actions minutes.

## 12. Risks to check first

- **WebKit in the cloud sandbox**: undocumented. If it fails, sessions run chromium only and CI stays the WebKit judge.
- **Plugins in cloud sessions**: they don't load from project settings (checked 2026-10-18); the flow does without them (7.2).
- **Cloudflare token scope**: may not cover creating a Pages project and a DNS record.
- **Setup script time**: browser installs may push it past the ~5 minute cache limit; then move browser install into the SessionStart hook.
- **Subscription usage**: parallel cloud sessions and routines draw on the Max limits. Start with one routine and watch usage.

## 13. Not now (into the backlog)

- Branch protection, once on GitHub Pro or public.
- claude-code-action (`@claude` in issues and PRs, automatic PR review in Actions): it uses Actions minutes. Revisit if minutes allow.
- An "issue opened" trigger that starts work instantly (an Action calling a routine's API trigger).
- A multi-reviewer panel per PR (security, UX, UI, code) and a separate approver agent.
- Auto-merge of small PRs.
- Mutation testing, and proving tests fail by reverting the fix in CI.
- Native apps and a multi-user setup: these need their own specs. Costs to know: iOS needs an Apple Developer account ($99 a year) and macOS runners, which use Actions minutes 10× faster; Android needs a Google Play account ($25 once).
