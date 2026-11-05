# #152: Ideas first, then a plan, a demo and a review

The maintainer's flow (2026-11-05). It replaces this plan's first version, which removed the plan gate. The gate stays.

## What changes for users

Nothing in the apps. For people taking part, a new idea goes through these steps:

1. **Idea.** Anyone posts in Discussions, in Ideas. Others vote with 👍 and comment.
2. **Agreed.** A maintainer says yes or a friendly no in the discussion, with the reason. A yes becomes a `ready` issue that links the discussion.
3. **Plan.** Whoever builds it, a maintainer's agent or an outside person with theirs, posts a plan on the issue.
4. **Plan approved.** By a maintainer, as today.
5. **Built and shown.** The PR shows it working in a demo on made-up data.
6. **Approved and reviewed.** A maintainer approves the demo, and each finding from the AI review is fixed or answered.
7. **Merged.** That deploys to staging. A maintainer checks it there and runs Promote. The release note credits who had the idea and who built it.

Staging deploys from `main`, so it comes after the merge. The demo before the merge is the PR's preview, which is a separate site with made-up data.

A bug fix or small tweak (`size:small`) still goes straight to a PR, with no plan, as today. Bugs don't start as ideas.

## Acceptance criteria

- [ ] `CONTRIBUTING.md`, `GOVERNANCE.md`, `doc/factory.md`, `AGENTS.md` and the `omark-factory` skill describe the seven steps, and ask for ideas first. Code stays welcome and optional.
- [ ] The plan gate stays: `tools/ci/plan-approval.mjs`, `plan-review`, `plan-approved` and `size:*` don't change.
- [ ] The PR template gains **Demo**: the preview link for a branch in this repository, a short screen recording of `pnpm demo` from a fork, or "nothing to show" and why, for what a demo can't show, such as docs, CI, sign-in or real storage.
- [ ] The definition of done in `AGENTS.md` and `CONTRIBUTING.md` gains the demo, and each AI review finding fixed or answered.
- [ ] `CONTRIBUTING.md` and `GOVERNANCE.md` say a fork's PR isn't merged until a maintainer has run `@claude review` on it and its findings are answered.
- [ ] `REVIEW.md` marks as **Important** any new dependency, new network call, or change to sign-in, sync, file formats, CI, deploy or `.claude/`, even when the issue asks for it, so the maintainer always sees them.
- [ ] `CONTRIBUTING.md` drops "a maintainer can push your branch to the main repository" as a way to get a preview. That branch's code would run in CI with the repository's secrets. A fork shows a recording instead.
- [ ] The stale "Discussions open when the repository goes public" lines are gone, in `CONTRIBUTING.md`, `GOVERNANCE.md` and `PHILOSOPHY.md`.

## Tests I'll write first

In `tools/ci/test/docs.test.ts`:

- `AGENTS.md`'s definition of done has the demo and the answered findings.
- The PR template has a Demo section.
- `CONTRIBUTING.md`, `GOVERNANCE.md` and `doc/factory.md` name the steps, in order.
- `CONTRIBUTING.md` and `GOVERNANCE.md` say a fork's PR needs the AI review before merging.
- `REVIEW.md` names each flagged area.
- `PHILOSOPHY.md`, `CONTRIBUTING.md` and `GOVERNANCE.md` no longer say Discussions are about to open, and `CONTRIBUTING.md` no longer offers to push a fork's branch here.
- The plan gate's existing tests still pass unchanged.

## Risks

- **The maintainer's approval rests on the plan, the demo and the review, not on reading the code.** A demo can look perfect and still send tokens or files somewhere else. Mitigation: flagged areas are always marked Important, test-first and the required checks stay, and a maintainer can ask their own agent for a second look. The AI review can still miss a deliberately hidden change.
- **The review rule for forks is a habit, not a check.** Nothing stops a merge without `@claude review` on a fork's PR. Making it a required check would need reviews on forks without a comment, which is a separate job with its own capped key.
- **A plan and a demo are more work for an outside person.** That can put off small contributions. `size:small` stays plan-free for this reason.
- **Screen recordings are thin evidence.** They show the feature is what was agreed. The maintainer still checks on staging before Promote.

## Out of scope

- A preview for forks: a job that builds a fork's demo with no secrets, and a separate workflow that publishes it and never runs the fork's code. It comes next, as its own issue.
- Writing credits into release notes automatically, and telling the discussion an idea shipped. Those come with the bot's later phases. Until then a maintainer writes them.
- Changing the size rules.
