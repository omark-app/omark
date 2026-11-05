# #134: AI review on every PR, with a REVIEW.md

## What changes for users

Nothing in the apps. For people opening PRs and for the maintainer:

- A PR from a branch in this repository gets an AI review when it is opened or marked ready: inline comments on the lines that matter, each tagged **Important**, **Nit** or **Pre-existing**, and one summary comment that starts with the number of findings and says plainly when there is nothing to fix.
- A maintainer can ask for a review again, or review a PR from a fork, by commenting `@claude review` on it.
- `REVIEW.md` at the root tells the reviewer what matters in Omark. It is short and owned by the maintainers.
- `main` requires every conversation to be resolved before merge, so each finding is fixed or answered with a reason.

How Anthropic does it, and why: https://claude.dev/blog/solving-code-review-at-anthropic/

## Which reviewer

The maintainer chose the Claude Code GitHub Action (`anthropics/claude-code-action`), in a workflow here, on the maintainer's Claude subscription through a `CLAUDE_CODE_OAUTH_TOKEN` repository secret made with `claude setup-token`. The secret is in place.

## Who can use up the subscription

Nobody outside. A fork's PR never gets the secret, and a comment only starts a review if its author has write access: the workflow checks that, and the action checks it again. A flood of PRs or comments from outside spends nothing. A review stops after 10 minutes, so a huge PR can't take much of the allowance either. Reviews share the plan's limits with the maintainer's own use; at a limit they stop until it resets.

## Acceptance criteria

- [ ] `.github/workflows/review.yml` reviews PRs from this repository on `opened` and `ready_for_review`, not on every push, so an agent pushing fixes doesn't start round after round.
- [ ] A comment starting `@claude review` from someone with write access reviews the PR, forks included. Anyone else's comment does nothing.
- [ ] The job can read the code and comment, nothing more: `contents: read`, `pull-requests: write`, `issues: write`, no `id-token`. The reviewer's tools are reading files outside `.git`, `gh pr diff` / `gh pr view`, one read of the PR's inline comments, and posting comments (`gh pr comment` and inline ones). It can't run the PR's code, push or approve.
- [ ] Each review job has `timeout-minutes: 10`. Both jobs check out the base, never the PR, so the PR's code, hooks and `REVIEW.md` can't steer its own review. (Changed while building: only the comment job did this at first. A review reads a new file through the diff.)
- [ ] Concurrency sits on the jobs, so someone else's comment can't replace a queued review.
- [ ] The reviewer reads `REVIEW.md` and `AGENTS.md`, reviews only the PR's diff, doesn't repeat a finding it already posted, and once a PR has three of its summary comments asks the author to rethink the approach instead of posting more.
- [ ] `REVIEW.md` says what failure looks like here: task lines lost or rewritten, a user's file changed where the change doesn't touch it, users' data or tokens sent to a server, a sync or merge that drops an edit, a `*-core` package that touches the DOM, network or storage, a test that doesn't test the change. It caps nits at three, skips `pnpm-lock.yaml`, `brand/png/`, `doc/history/` and generated files, and asks for a file and line for every finding.
- [ ] Branch protection on `main` has `required_conversation_resolution` on (I set it through the API once this merges).
- [ ] `doc/factory.md`, `CONTRIBUTING.md` and the `omark-factory` skill (Hand over) say a PR gets an AI review and that each finding is fixed or answered.

## Tests I'll write first

In `tools/ci/test/workflows.test.ts`:

- `review.yml` triggers on `pull_request` `opened` and `ready_for_review` only, and on `issue_comment`.
- The PR job runs only for branches in this repository (`head.repo.full_name == github.repository`), so fork code never gets the secret.
- The comment job runs only on a PR comment that starts `@claude review` from an `OWNER`, `MEMBER` or `COLLABORATOR`.
- Permissions are exactly the three above, and the action's allowed tools contain no `Bash` beyond `gh pr diff`, `gh pr view` and `gh pr comment`, and no `Write` or `Edit`.
- Each job's timeout is 10 minutes, the action is pinned to a commit, the comment job's checkout names no `ref`, and no part of a comment's text reaches the prompt.

In `tools/ci/test/docs.test.ts`: `REVIEW.md` exists, names the failure cases above, the skip list, and the nit cap.

## Risks

- **Prompt injection from a fork's code** when a maintainer triggers a review: the reviewer reads text the contributor wrote. Mitigation: narrow permissions and tools, and the base checked out. The likely worst case is a misleading comment, which the maintainer reads anyway. The action keeps the job's GitHub token in `.git/config`; the reviewer is denied that folder, because a comment could otherwise carry the token out. That token can only comment and ends with the job.
- **Noise**: a reviewer that nags gets ignored. Mitigation: `REVIEW.md`'s nit cap and skip list; I'll tune it on the first PRs and look at which findings were real.
- **Cost**: each review uses the maintainer's subscription. Reviewing on open and on request only, never on every push, keeps it to about one or two reviews per PR, each at most 10 minutes.
- **Fork PRs wait for a maintainer's comment.** That is what keeps outsiders from spending the subscription. Reviewing them without a comment is a separate job with its own capped API key and a daily limit, outside this issue.
- **Resolved conversations block merging** a PR where a bot comment was left open. That is the point: answer it and resolve it.

## Out of scope

- An automated security review: a later issue if the first weeks show it's worth it.
- Letting low-risk PRs merge without the maintainer: the maintainer merges every PR.
- Turning missed bugs into an eval set for the reviewer.
