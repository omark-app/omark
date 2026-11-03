# #134: AI review on every PR, with a REVIEW.md

## What changes for users

Nothing in the apps. For people opening PRs and for the maintainer:

- A PR from a branch in this repository gets an AI review when it is opened or marked ready: inline comments on the lines that matter, each tagged **Important**, **Nit** or **Pre-existing**, and one summary comment that starts with the number of findings and says plainly when there is nothing to fix.
- A maintainer can ask for a review again, or review a PR from a fork, by commenting `@claude review` on it.
- `REVIEW.md` at the root tells the reviewer what matters in Omark. It is short and owned by the maintainers.
- `main` requires every conversation to be resolved before merge, so each finding is fixed or answered with a reason.

How Anthropic does it, and why: https://claude.dev/blog/solving-code-review-at-anthropic/

## Which reviewer (the maintainer picks)

1. **Anthropic's Code Review GitHub app** (Claude Team or Enterprise plan): an admin turns it on for the repository and picks Quick, Standard or Deep. It needs no workflow and no secret, and handles forks. It costs a Team or Enterprise seat.
2. **The Claude Code GitHub Action** (`anthropics/claude-code-action`), in a workflow here. It runs on the maintainer's Claude subscription through a `CLAUDE_CODE_OAUTH_TOKEN` repository secret (made with `claude setup-token`), or on an API key. Only the maintainer can add the secret (`needs-human`).

The rest of this plan is written for option 2. With option 1, the workflow and its tests drop out, and `REVIEW.md`, the branch-protection change and the docs stay.

## Acceptance criteria

- [ ] `.github/workflows/review.yml` reviews PRs from this repository on `opened` and `ready_for_review`, not on every push, so an agent pushing fixes doesn't start round after round.
- [ ] A comment starting `@claude review` from someone with write access reviews the PR, forks included. Anyone else's comment does nothing.
- [ ] The job can read the code and comment, nothing more: `contents: read`, `pull-requests: write`, `issues: write`, no `id-token`. The reviewer's tools are reading files, `gh pr diff` / `gh pr view`, and posting inline comments. It can't run the PR's code, push or approve.
- [ ] The reviewer reads `REVIEW.md` and `AGENTS.md`, reviews only the PR's diff, doesn't repeat a finding it already posted, and after the third review of the same PR asks the author to rethink the approach instead of posting more.
- [ ] `REVIEW.md` says what failure looks like here: task lines lost or rewritten, a user's file changed where the change doesn't touch it, users' data or tokens sent to a server, a sync or merge that drops an edit, a `*-core` package that touches the DOM, network or storage, a test that doesn't test the change. It caps nits at three, skips `pnpm-lock.yaml`, `brand/png/`, `doc/history/` and generated files, and asks for a file and line for every finding.
- [ ] Branch protection on `main` has `required_conversation_resolution` on (I set it through the API once this merges).
- [ ] `doc/factory.md`, `CONTRIBUTING.md` and the `omark-factory` skill (Hand over) say a PR gets an AI review and that each finding is fixed or answered.

## Tests I'll write first

In `tools/ci/test/workflows.test.ts`:

- `review.yml` triggers on `pull_request` `opened` and `ready_for_review` only, and on `issue_comment`.
- The PR job runs only for branches in this repository (`head.repo.full_name == github.repository`), so fork code never gets the secret.
- The comment job runs only on a PR comment that starts `@claude review` from an `OWNER`, `MEMBER` or `COLLABORATOR`.
- Permissions are exactly the four above, and the action's allowed tools contain no `Bash` beyond `gh pr diff` and `gh pr view`, and no `Write` or `Edit`.

In `tools/ci/test/docs.test.ts`: `REVIEW.md` exists, names the failure cases above, the skip list, and the nit cap.

## Risks

- **Prompt injection from a fork's code** when a maintainer triggers a review: the reviewer reads text the contributor wrote. Mitigation: read-only permissions and tools, so the worst case is a misleading comment, which the maintainer reads anyway.
- **Noise**: a reviewer that nags gets ignored. Mitigation: `REVIEW.md`'s nit cap and skip list; I'll tune it on the first PRs and look at which findings were real.
- **Cost**: each review uses the maintainer's subscription or API credit. Reviewing on open and on request only, never on every push, keeps it to about one or two reviews per PR.
- **Resolved conversations block merging** a PR where a bot comment was left open. That is the point: answer it and resolve it.

## Out of scope

- An automated security review: a later issue if the first weeks show it's worth it.
- Letting low-risk PRs merge without the maintainer: the maintainer merges every PR.
- Turning missed bugs into an eval set for the reviewer.
