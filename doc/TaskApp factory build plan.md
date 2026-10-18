# TaskApp factory build plan (phase 1)

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans if the session has them; otherwise work task by task in order. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Phase 1 of `doc/TaskApp factory spec.md` (section 10): the repo rules, skill, hooks and guard, labels and templates, the new CI with previews, staging and Promote, sample data for previews, the cloud environment doc, and proof that a cloud session runs the full suite.

**Spec:** `doc/TaskApp factory spec.md`. Where this plan and the spec disagree, this plan wins and Task 1 fixes the spec.

**Branch:** all work on `factory-spec-5d5i5w`, one PR. Nothing reaches `main` until I merge.

## Global constraints

- **No extra cost.** No claude-code-action, no new paid service. CI stays within the budget in spec 6.3.
- **No secrets in the cloud session.** Cloudflare, Entra and OneDrive credentials are used only by GitHub Actions (repo secrets `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, variable `MSAL_CLIENT_ID`) or by me on my PC. Never ask for a secret in chat.
- **GitHub from the cloud session:** the GitHub MCP tools or `gh api` (REST). `gh issue` and `gh pr` are blocked.
- **Never** push to `main`, merge, run Promote, or touch `ALAI/TaskApp`. Commit and push only this plan's work.
- **Tests first** for every code change (app, guard, workflow helper scripts). Workflow YAML itself is checked by `actionlint` in the check job and by a real run on the PR.
- **Commands:** `pnpm typecheck`, `pnpm test`, `pnpm e2e`, `pnpm --filter web build`. A task isn't done until all four pass.
- **Commits:** short imperative sentences, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **needs-human** marks a step only I can do (my PC, Entra, a dashboard, billing). Those steps are collected in Task 16 as short numbered instructions.

## Facts the code changes depend on

- Sign-in goes through the helper at `/api/auth/*` (`functions/`, `packages/signin`). Its redirect URI is `<origin>/api/auth/callback`, and it needs the Pages secrets `MSAL_CLIENT_ID`, `MSAL_CLIENT_SECRET` and `COOKIE_KEY` **on each Pages project**. So staging needs:
  - the Entra **Web** redirect URI `https://tasks-staging.alipka.com/api/auth/callback` (the spec's `https://tasks-staging.alipka.com/` is wrong), and
  - those three secrets on `taskapp-staging`. A second client secret (`taskapp staging`) and a new `COOKIE_KEY` keep staging and production apart.
- Deploying with `wrangler pages deploy` from the repo root bundles `functions/`. So Promote checks out the commit (for `functions/` and `packages/signin`) and uploads the stored `apps/web/dist` from that run.
- The offline cache is already keyed by OneDrive folder (`boot.ts`), so a staging folder on its own origin can't mix with production.
- Most e2e specs start with no `__TASKAPP_SEED__` and expect an empty drive. Sample data must therefore never load on `localhost`.
- The existing Cloudflare token was created with Pages Edit, Account Settings Read and DNS Edit on `alipka.com` (v1 plan, Task 2). Creating the staging project and DNS record should work; Task 9 still has a fallback.
- Cloudflare: account `fabcb19d1492aebda45eea22fbef9df8`, zone `alipka.com` `00596fbc87cfb99f68372f59fbd4e55c`, existing project `taskapp` (`taskapp-64g.pages.dev`, `tasks.alipka.com`).

## Decisions made in this plan

1. **Environment from the host name** (spec 6.1): a pure function `envForHost(host)` returns `production` for `tasks.alipka.com`, `staging` for `tasks-staging.alipka.com`, `preview` for `*.pages.dev`, and `local` for anything else. Folder: production `ALAI/TaskApp`, staging `ALAI/TaskApp-staging`, local and preview follow the build variables as today.
2. **Staging look:** footer label `STAGING`, theme colour `#F6E7C8` (light amber) in `<meta name="theme-color">`, `document.title` and `apple-mobile-web-app-title` `TaskApp Staging`. The build ships a second manifest, `manifest-staging.webmanifest` (name `TaskApp Staging`, same theme colour), and the app points `<link rel="manifest">` at it on the staging host before the page finishes loading. If the iPhone still shows "TaskApp" on the home screen, staging keeps the name and is told apart by colour and label (spec fallback); no per-environment build.
3. **Preview look:** footer label `PREVIEW` on the `preview` environment only (not on localhost, so e2e screens don't change).
4. **Sample data:** a fake build on the `preview` environment with no `__TASKAPP_SEED__` starts with sample files. On `local` the drive starts empty, as today.
5. **Production deploys only through Promote.** The current `deploy` job on `main` (straight to production) is removed.
6. **Staging project setup runs in CI**, idempotently, before the preview deploy. That way the factory PR's own first CI run creates `taskapp-staging`, its custom domain and DNS record, before anything is merged. (`workflow_dispatch` can't run a workflow that isn't on `main` yet.)
7. **Guard** is a Node script with no dependencies, `tools/claude-guard/guard.mjs`, so it runs on Node 22 on my PC and Node 24 in CI without a build. Its tests spawn it with real hook JSON on stdin.

## Review focus

1. **Production can't change by accident:** a push to `main` must deploy only to `taskapp-staging`. Grep the final `ci.yml` for `--project-name=taskapp ` (with the space): it must not appear.
2. **Staging never touches production files:** `envForHost` tests cover the exact host strings, upper case, a trailing dot, and look-alikes such as `tasks.alipka.com.evil.example` and `tasks-staging.alipka.com.pages.dev`.
3. **Promote refuses bad input:** a commit not on `main`, a commit whose CI didn't pass, a typo in the SHA. Tests in Task 11.
4. **Guard false negatives:** `git push origin HEAD:main`, `git push origin +main`, `git push -f`, `git push --force-with-lease`, `git -C dir push origin main`, `git push origin :other-branch`, `gh pr merge`, `gh api -X PUT repos/…/pulls/14/merge`, commands chained with `&&`, `;` or `|`. Tests in Task 5.
5. **Guard false positives:** `git push -u origin factory-spec-5d5i5w`, `git log main`, `git diff origin/main`, `git checkout main` and `echo "push to main"` must pass.

---

## Task 1: Fix the spec and fill the backlog

**Files:**
- Modify: `doc/TaskApp factory spec.md` (section 9 step 1; section 6.1 sign-in row; status line)
- Modify: `doc/TaskApp backlog.md`

- [ ] **Step 1:** Spec section 9 step 1 becomes: add the **Web** redirect URI `https://tasks-staging.alipka.com/api/auth/callback`, make a second client secret `taskapp staging`, and set the three Pages secrets on `taskapp-staging`. Section 6.1's sign-in row for staging says the same. Status: `approved, 2026-10-18`.
- [ ] **Step 2:** Add spec section 13 ("Not now") to the backlog under a `## Factory` heading, one line each, linking `[[TaskApp factory spec]]`.
- [ ] **Step 3: Done check:** both files read cleanly. No CI runs (doc-only).
- [ ] **Step 4: Commit** `Fix the staging sign-in steps in the factory spec`.

## Task 2: `CLAUDE.md`

**Files:**
- Create: `CLAUDE.md`

- [ ] **Step 1:** Write it per spec 7.1, under ~80 lines: what TaskApp is, the layout (`apps/web`, `packages/core|storage|signin`, `functions/`, `tools/`, `doc/`), the four commands, the definition of done (spec 5, as a checklist), the flow (sizing, plans in `doc/plans/<issue>-<slug>.md`, labels, PRs), the hard rules, and the `gh issue`/`gh pr` note. Point to the `taskapp-factory` and `taskapp-files` skills instead of repeating them.
- [ ] **Step 2: Done check:** every rule in spec 7.1 appears once; nothing contradicts `README.md`.
- [ ] **Step 3: Commit** `Add CLAUDE.md`.

## Task 3: `taskapp-factory` skill

**Files:**
- Create: `.claude/skills/taskapp-factory/SKILL.md`

- [ ] **Step 1:** Write the skill with sections **Pick up**, **Size**, **Plan** (large only), **Implement**, **Hand over**, **Blocked**. Each has the exact steps, the labels it adds or removes, and the comment wording, for example:
  - Size comment: `Sized **small**: <one-line reason>. Relabel if you disagree.`
  - Plan comment: the plan's summary, its path on the branch, and `Reply "approved" or add plan-approved.`
  - Pick up: add `in-progress`, comment `Working on this in branch <branch>.`
  - Hand over: open the PR from the template, remove `in-progress`, run the fresh-eyes review subagent (spec 5.4) and fix what it finds before saying the PR is ready.
  - Blocked: `needs-human` with numbered steps, or `needs-info` with one clear question.
  - "Take the next issue": oldest `ready`, not `in-progress`, `bug` before `enhancement` (list with the GitHub tools).
  - Mid-way growth: stop, relabel `size:large`, post a plan.
- [ ] **Step 2: Done check:** the frontmatter `description` starts with "Use when" and names issues, plans and PRs, so the skill loads on "work on #14".
- [ ] **Step 3: Commit** `Add the taskapp-factory skill`.

## Task 4: Labels and templates

**Files:**
- Create: `.github/ISSUE_TEMPLATE/bug.yml`, `.github/ISSUE_TEMPLATE/feature.yml`, `.github/ISSUE_TEMPLATE/config.yml` (blank issues allowed), `.github/pull_request_template.md`

- [ ] **Step 1:** Templates per spec 3.5. Short fields; only "what happened" (bug) and "what I want" (feature) are required, so an issue typed on the phone isn't blocked.
- [ ] **Step 2:** Create the labels from spec 3.4 that don't exist yet, with `gh api -X POST repos/alipkagit/TaskApp/labels -f name=… -f color=… -f description=…`. Skip existing ones (`gh api repos/alipkagit/TaskApp/labels`). If `gh api` is refused in the session, mark it **needs-human** and put the list in Task 16.
- [ ] **Step 3: Done check:** `gh api repos/alipkagit/TaskApp/labels --jq '.[].name'` lists all ten.
- [ ] **Step 4: Commit** `Add issue and PR templates`.

## Task 5: Guard script, test-first

**Files:**
- Create: `tools/claude-guard/{package.json,vitest.config.ts,guard.mjs}`, `tools/claude-guard/test/guard.test.ts`

**Interface:** reads the `PreToolUse` JSON on stdin (`{ tool_name, tool_input: { command } }`). Exit 0 lets the command run. Exit 2 with a one-line reason on stderr blocks it. Anything other than `Bash` passes. Unreadable input passes, with a warning (best-effort, spec 8).

- [ ] **Step 1: Write the failing tests:** one table of blocked commands (review focus 4) and one of allowed commands (review focus 5). Each case spawns `node guard.mjs` with the JSON and checks the exit code and that stderr names the rule. Also: deleting the session's own remote branch (`git push origin --delete <current branch>`) is allowed, and any other delete is blocked.
- [ ] **Step 2: Run** `pnpm test` → FAIL (no script).
- [ ] **Step 3: Implement:** split the command on `&&`, `||`, `;`, `|` and new lines; tokenise each part, keeping quoted strings whole; find `git … push` (allowing `-C dir` and `-c k=v` before `push`), and check refspecs (`main`, `HEAD:main`, `+main`, `refs/heads/main`, `:branch`), `--force` / `-f` / `--force-with-lease` / `--delete` / `-d`, and `--mirror`/`--all`. Block `gh pr merge` and `gh api` calls whose path ends in `/merge` or `/merges`. The current branch comes from `git rev-parse --abbrev-ref HEAD` in the hook's `cwd`.
- [ ] **Step 4: Run** `pnpm test` → PASS. `pnpm typecheck` → PASS.
- [ ] **Step 5: Commit** `Add the Claude guard hook script`.

## Task 6: Hooks and settings

**Files:**
- Create: `.claude/settings.json`, `.claude/hooks/session-start.sh`

- [ ] **Step 1:** `.claude/settings.json`:
  - `hooks.PreToolUse`: matcher `Bash`, command `node "$CLAUDE_PROJECT_DIR/tools/claude-guard/guard.mjs"`.
  - `hooks.SessionStart`: command `"$CLAUDE_PROJECT_DIR/.claude/hooks/session-start.sh"`.
  - `permissions.deny`: `Bash(git push origin main:*)`, `Bash(git push origin HEAD:main:*)`, `Bash(git push --force:*)`, `Bash(git push -f:*)`, `Bash(gh pr merge:*)`.
  - `enabledPlugins` and `extraKnownMarketplaces` for superpowers (spec 7.2). Whether cloud sessions load them is checked in Task 15.
- [ ] **Step 2:** `session-start.sh`: exit at once unless `CLAUDE_CODE_REMOTE=true`. Then `corepack enable` and run `pnpm install --frozen-lockfile` when `node_modules` is missing or older than `pnpm-lock.yaml`. If the Playwright browsers are missing (spec 12, setup script too slow), install chromium and webkit too. Quiet on success, one line on failure, never blocks the session (exit 0).
- [ ] **Step 3: Done check:** in this session, `echo '{"tool_name":"Bash","tool_input":{"command":"git push origin main"}}' | node tools/claude-guard/guard.mjs; echo $?` prints the reason and `2`. Running `session-start.sh` twice: the second run does nothing.
- [ ] **Step 4: Commit** `Add the guard and session-start hooks`.

## Task 7: Environment from the host name, test-first

**Files:**
- Create: `apps/web/src/lib/environment.ts`, `apps/web/src/lib/environment.test.ts`, `apps/web/public/manifest-staging.webmanifest` (or emitted by the Vite config), `apps/web/e2e/environment.spec.ts`
- Modify: `apps/web/src/env.ts`, `apps/web/src/main.ts`, `apps/web/src/components/StatusLine.svelte`, `apps/web/index.html` (add `apple-mobile-web-app-title`), `apps/web/vite.config.ts` if the second manifest is emitted there

**Interface:** `envForHost(host: string): 'production' | 'staging' | 'preview' | 'local'`; `folderFor(env, buildFolder): string`; `applyLook(env, doc: Document): void` (title, theme colour, manifest link, app title). `env.ts` exports `APP_ENV` and uses `folderFor` for `ONEDRIVE_FOLDER`.

- [ ] **Step 1: Write the failing unit tests** (review focus 2): exact hosts; upper case and a trailing dot; look-alikes fall to `preview` or `local`, never `production` or `staging`; `folderFor('staging', 'ALAI/TaskApp')` is `ALAI/TaskApp-staging`; `folderFor('production', anything)` is `ALAI/TaskApp`; `local` and `preview` return the build folder; `applyLook('staging')` on a test document sets the four values, and `applyLook('production')` changes nothing.
- [ ] **Step 2: Write the failing e2e** (`desktop` project only, Chromium launched with `--host-resolver-rules=MAP tasks-staging.alipka.com 127.0.0.1:4173`): opening `http://tasks-staging.alipka.com:4173/` shows `STAGING` in the footer, the title `TaskApp Staging`, and a manifest link that resolves to JSON with `name: 'TaskApp Staging'`. The existing `shell.spec.ts` (localhost) stays as it is and must still pass. WebKit has no host mapping, so the iPhone check is manual (Task 16).
- [ ] **Step 3: Run** `pnpm test` and `pnpm e2e` → the new tests FAIL.
- [ ] **Step 4: Implement.** `main.ts` calls `applyLook(APP_ENV, document)` before mounting. `StatusLine` shows `STAGING` or `PREVIEW` (test id `env-label`) beside the build ID.
- [ ] **Step 5: Run** all four commands → PASS.
- [ ] **Step 6: Commit** `Pick the environment from the host name`.

## Task 8: Sample data for previews, test-first

**Files:**
- Create: `apps/web/src/lib/sample-files.ts`, `apps/web/src/lib/sample-files.test.ts`
- Modify: `apps/web/src/lib/boot.ts`

**Interface:** `sampleFiles(today: ISODate): Record<FileName, string>`; boot uses it when `STORAGE_MODE === 'fake'`, `APP_ENV === 'preview'` and `window.__TASKAPP_SEED__` is undefined.

- [ ] **Step 1: Write the failing tests:** the sample `tasks.md` parses with `@taskapp/core` without loss (round-trip equal); with a fixed `today` it fills every bucket (Today, This week, Next week, Later, Someday), has at least one repeat, one task with notes and two ALWAYS lines; `done.md` has a few lines so stats aren't zero; `config.yaml` is the defaults. Dates are relative to `today`, so the preview never looks stale.
- [ ] **Step 2: Run** `pnpm test` → FAIL.
- [ ] **Step 3: Implement** and wire into `boot.ts`. Neutral content, nothing personal.
- [ ] **Step 4: Run** all four commands → PASS. The existing e2e specs still start empty (they run on `localhost`).
- [ ] **Step 5: Commit** `Seed previews with sample tasks`.

## Task 9: Staging project setup script, test-first

**Files:**
- Create: `tools/ci/{package.json,vitest.config.ts}`, `tools/ci/ensure-staging.mjs`, `tools/ci/test/ensure-staging.test.ts`

**Interface:** `node tools/ci/ensure-staging.mjs` with `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` in the environment. Idempotent, using the Cloudflare REST API with `fetch` (no wrangler, so it can be tested with a fake `fetch`):
  1. Create the Pages project `taskapp-staging` (production branch `main`) unless it exists.
  2. Read the project's `subdomain` (for example `taskapp-staging-abc.pages.dev`).
  3. Add the custom domain `tasks-staging.alipka.com` to the project unless present.
  4. Create a proxied CNAME `tasks-staging` → that subdomain in zone `00596fbc87cfb99f68372f59fbd4e55c` unless a record with that name exists; never change an existing one.
  5. Print the subdomain for later steps (`$GITHUB_OUTPUT`).

  On a 403 it stops with `::error::` and the exact dashboard steps (Workers & Pages → Create → Pages → Upload, name `taskapp-staging`; Custom domains → `tasks-staging.alipka.com`), which are also in Task 16 as the fallback.

- [ ] **Step 1: Write the failing tests** against a fake `fetch`: a fresh account makes all three creates; a set-up account makes none; an existing DNS record with another target is left alone and reported; a 403 on project create exits non-zero with the dashboard steps; the token never appears in output.
- [ ] **Step 2: Run** `pnpm test` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm test` and `pnpm typecheck` → PASS.
- [ ] **Step 5: Commit** `Add the staging project setup script`.

## Task 10: CI rework

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1:** Rewrite per spec 6.2 and 6.3:
  - `on: pull_request` and `push: branches: [main]`, both with `paths-ignore: ['doc/**', '**/*.md']`.
  - `concurrency: { group: ci-${{ github.ref }}, cancel-in-progress: true }`.
  - `permissions: contents: read` at the top; the e2e job adds `pull-requests: write` (preview comment).
  - **check:** as today, plus `actionlint` (the `rhysd/actionlint` Docker action or its download script, pinned) and the guard tests (already in `pnpm test`).
  - **e2e:** cache `~/.cache/ms-playwright` keyed on the Playwright version from `pnpm-lock.yaml`; on a hit, `playwright install-deps chromium webkit` only. `pnpm e2e`. Then, on pull requests only: `node tools/ci/ensure-staging.mjs`, then `wrangler pages deploy apps/web/dist --project-name=taskapp-staging --branch=pr-${{ github.event.number }}` (the fake build e2e just tested), then a single PR comment with the alias URL from the wrangler action's `pages-deployment-alias-url` output. The comment is updated on later pushes, not repeated (find it by a hidden marker `<!-- taskapp-preview -->`).
  - **deploy-staging:** `needs: [check, e2e]`, only on push to `main`, `concurrency: { group: staging, cancel-in-progress: false }`. `pnpm --filter web build` (OneDrive mode; the host picks the folder at run time); `ensure-staging.mjs`; deploy from the repo root to `taskapp-staging --branch=main`; upload `apps/web/dist` as artifact `web-dist`, 30 days; then the sign-in helper check against `https://tasks-staging.alipka.com/api/auth/login`, as today's check does for production.
  - The old production `deploy` job is removed (decision 5).
- [ ] **Step 2: Done check:** `actionlint` passes locally (download the binary into the scratchpad). Review focus 1 grep is clean.
- [ ] **Step 3: Commit** `Rework CI: previews, staging, fewer minutes`.

## Task 11: Promote to production, test-first

**Files:**
- Create: `.github/workflows/promote.yml`, `tools/ci/promote-check.mjs`, `tools/ci/test/promote-check.test.ts`, `tools/ci/release-notes.mjs`, `tools/ci/test/release-notes.test.ts`

**Interface:**
- `promote-check.mjs <sha-or-tag>`, with `GITHUB_TOKEN` and `GITHUB_REPOSITORY`: resolves the input to a full SHA, checks it is an ancestor of `main` (`compare` API), finds the `CI` run for that SHA on `push` to `main` with conclusion `success`, and prints `sha`, `run_id` and whether its `web-dist` artifact still exists. Empty input means the commit of the last successful staging deploy.
- `release-notes.mjs <from-tag> <sha>`: the merged PRs between the last `prod-` tag and the SHA, as a markdown list. The next tag name is `prod-YYYY-MM-DD-n`.

- [ ] **Step 1: Write the failing tests** with a fake GitHub API: a commit not on `main` → refused; CI failed or still running → refused; a bad SHA → refused with a clear message; an older `prod-` tag (rollback) → allowed; an expired artifact → `artifact=missing`. Release notes: the PR list from a set of commits; the first release (no earlier tag) lists the last 20 merges; `-n` counts up within a day.
- [ ] **Step 2: Run** `pnpm test` → FAIL.
- [ ] **Step 3: Implement** the scripts, then `promote.yml`: `workflow_dispatch` with input `commit` (optional); `permissions: contents: write, actions: read`; `concurrency: production`. Steps: checkout at the resolved SHA; `promote-check`; download `web-dist` from that run (`actions/download-artifact@v4` with `run-id` and `github-token`), or rebuild with `pnpm --filter web build` when it is missing; `wrangler pages deploy apps/web/dist --project-name=taskapp --branch=main` from the repo root; the existing sign-in helper check against `tasks.alipka.com`; tag and `gh release create` with the notes.
- [ ] **Step 4: Run** `pnpm test`, `pnpm typecheck`, `actionlint` → PASS.
- [ ] **Step 5: Commit** `Add Promote to production`.

## Task 12: Cloud environment doc

**Files:**
- Create: `doc/TaskApp cloud environment.md`

- [ ] **Step 1:** Record spec 7.4: name, repository, network level and the extra Playwright hosts (`playwright.download.prss.microsoft.com`, `cdn.playwright.dev`, `playwright.azureedge.net`; check the current list against the Playwright docs at write time), the setup script verbatim, "no secrets", and how to re-create the environment. Include the setup script's timing from Task 15.
- [ ] **Step 2: Commit** `Add the cloud environment doc`.

## Task 13: README and docs

**Files:**
- Modify: `README.md` (Deploy and Sign-in sections, Commands), `.claude/skills/taskapp-files/SKILL.md` only if it mentions deploys

- [ ] **Step 1:** Deploy section: previews per PR, staging on merge, production only through Promote, rollback by promoting an older `prod-` tag. Sign-in section: the staging redirect URI and secrets on `taskapp-staging` next to the production ones. Link `CLAUDE.md` and the factory spec.
- [ ] **Step 2: Commit** `Document previews, staging and Promote`.

## Task 14: Push and open the PR

- [ ] **Step 1:** Run all four commands and the guard check from Task 6, then `git push -u origin factory-spec-5d5i5w`.
- [ ] **Step 2:** Open the PR with the GitHub tools, using the new PR template. List the Task 16 steps I must do before merging.
- [ ] **Step 3: Done check:** CI on the PR: check and e2e green; `ensure-staging` created the project, domain and DNS record (or stopped with the dashboard steps); the preview comment links a working `pr-<n>` preview showing sample tasks and `PREVIEW`. Fix and re-push until green.

## Task 15: Cloud session check

Run in a fresh cloud session on the TaskApp environment (after I create it, Task 16 step 2), on this branch.

- [ ] **Step 1:** Time the setup script. If it is over ~5 minutes, move the browser install into `session-start.sh` (already supported, Task 6) and update the doc.
- [ ] **Step 2:** `pnpm typecheck && pnpm test && pnpm e2e && pnpm --filter web build`, both Playwright projects. If WebKit fails in the sandbox, record the error, set the session to `--project=desktop` in `CLAUDE.md`, and keep CI as the WebKit judge (spec 12).
- [ ] **Step 3:** Check the session sees the superpowers skills. If not, commit copies of the ones the flow uses (brainstorming, writing-plans, test-driven-development, verification-before-completion, requesting-code-review) into `.claude/skills/` with their MIT licence, and drop the plugin entries.
- [ ] **Step 4:** Live guard check: ask the session to `git push origin HEAD:main`. It must be blocked.
- [ ] **Step 5:** Write the results into `doc/TaskApp cloud environment.md`, commit `Record the cloud session check`, push.

## Task 16: What I do by hand (needs-human)

Before merging the PR:

1. **Entra** (https://portal.azure.com/47bed4a7-e649-443a-b055-b54d901df272): App registrations → TaskApp → Authentication → Web → add `https://tasks-staging.alipka.com/api/auth/callback`.
2. Same app → Certificates & secrets → New client secret, `taskapp staging`, 24 months. Copy the Value.
3. **Staging Pages secrets**, on the PC in the TaskApp folder, after the PR's CI has created `taskapp-staging`:
   ```
   pnpm exec wrangler pages secret put MSAL_CLIENT_ID --project-name=taskapp-staging
   # paste 1fa03c5b-4275-490e-8e71-2aa7a405e310
   pnpm exec wrangler pages secret put MSAL_CLIENT_SECRET --project-name=taskapp-staging
   # paste the Value from step 2
   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
   pnpm exec wrangler pages secret put COOKIE_KEY --project-name=taskapp-staging
   # paste the 44-character line it printed
   ```
4. **OneDrive:** copy `ALAI/TaskApp` to `ALAI/TaskApp-staging` on the PC (the three files).
5. **Cloud environment** at claude.ai: create it from `doc/TaskApp cloud environment.md`.
6. **GitHub:** Settings → Integrations → GitHub Apps → Claude → has access to `alipkagit/TaskApp`.
7. **GitHub:** Settings → Billing and licensing → Budgets → Actions budget $0, "stop usage" on.
8. **claude.ai:** Settings → Usage → extra usage off.
9. Only if Task 9 stopped on a 403: create the `taskapp-staging` project and the `tasks-staging.alipka.com` custom domain in the Cloudflare dashboard, as its error message says.
10. Only if Task 4 couldn't create labels: create them from spec 3.4.

Then merge. After the merge:

11. Open `https://tasks-staging.alipka.com` on the iPhone, sign in, add it to the home screen next to TaskApp. Check the name, the colour and `STAGING`, and that it shows the staging copy of my tasks.
12. Run **Actions → Promote to production → Run workflow** once, and check `tasks.alipka.com` still works and shows the new build ID.

## Done for phase 1

- [ ] All four commands green in CI and in a cloud session (WebKit, or the recorded fallback).
- [ ] A PR gets a working preview link with sample data.
- [ ] A merge to `main` updates staging only; Promote updates production and creates a `prod-` release.
- [ ] The guard blocks a push to `main` and a merge, in tests and live.
- [ ] Staging and production sit side by side on the iPhone and are easy to tell apart.
- [ ] Spec, README, `CLAUDE.md` and the cloud environment doc match what was built.
