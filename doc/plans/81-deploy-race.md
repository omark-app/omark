# #81: deploy from main only while the commit is main's tip

## What changes for AL

Two PRs merged close together can no longer leave omark.app, staging or the demo on the older commit. The older run's deploy job skips with a notice ("main is at … now, so its own run deploys"), and the job stays green.

## Acceptance criteria

- [ ] `tasks-staging`, `tasks-demo` and `site-production` each check, right after the variables check, whether `github.sha` is still main's tip (`gh api repos/$REPO/commits/main`).
- [ ] When it isn't, every later step in the job is skipped, so nothing is built, uploaded or deployed.
- [ ] The check runs inside the job's concurrency group, so two deploys never pass it at once.
- [ ] Previews and Promote are unchanged.

## Tests I'll write first

- `tools/ci/test/workflows.test.ts`: for each of the three jobs, step 2 has `id: tip`, calls `gh api "repos/$REPO/commits/main" --jq .sha` with `GH_TOKEN` and `REPO`, and every later step has `if: steps.tip.outputs.latest == 'true'`.

## Risks

- A skipped staging run keeps no `tasks-dist` artifact, so Promote can't pick that commit. That's fine: a newer commit on main replaced it.
- Re-running an old deploy job by hand now skips. The site README's rollback step said to do that, so it now points to the Cloudflare rollback or a revert.

## Out of scope

- Previews: each PR deploys to its own branch alias, so they can't overwrite each other.
