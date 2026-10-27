# #81: deploy from main only while the commit is main's tip

## What changes for AL

Two PRs merged close together can no longer leave omark.app, staging or the demo on the older commit. The older run's deploy job skips with a notice ("main is at … now, so its own run deploys"), and the job stays green.

## Acceptance criteria

- [ ] `tasks-staging`, `tasks-demo` and `site-production` each check, right after the variables check, whether main has changed anything since `github.sha` outside `doc/` and `*.md` (`gh api repos/$REPO/compare/$GITHUB_SHA...main`). Docs-only commits get no CI run (`paths-ignore`), so they must not make a deploy skip.
- [ ] When it isn't, every later step in the job is skipped, so nothing is built, uploaded or deployed.
- [ ] The check runs inside the job's concurrency group, so two deploys never pass it at once.
- [ ] Previews and Promote are unchanged.

## Tests I'll write first

- `tools/ci/test/workflows.test.ts`: for each of the three jobs, step 2 has `id: tip`, calls the compare API with the docs filter and `GH_TOKEN` and `REPO`, writes `latest=true` only when nothing else changed, and every later step has `if: steps.tip.outputs.latest == 'true'`.

## Risks

- A skipped staging run keeps no `tasks-dist` artifact, so Promote can't pick that commit. That's fine: a newer commit on main replaced it.
- Re-running an old deploy job by hand now skips. The site README's rollback step said to do that, so it now points to the Cloudflare rollback or a revert.

- If the newer commit's own run fails, the older commit skips too. Nothing deploys until the next green commit on main. That's acceptable: main was red anyway.
- If the API call fails, the step fails and the job goes red, which is better than skipping silently.

## Out of scope

- Previews: each PR deploys to its own branch alias, so they can't overwrite each other.
