# #152: Ideas first, with a demo and no plan gate

This is the last plan under the old rules: the gate still applies to the change that removes it. It builds on #151 (the AI review) and merges after it.

## What changes for users

Nothing in the apps. For people taking part:

- The first thing we ask for is an idea, in Discussions. Code is welcome and optional.
- Nothing gets built without an agreed issue: a maintainer's yes in the discussion becomes a `ready` issue that links it. PRs with no agreed issue are closed with a friendly pointer, as today.
- Anyone can then build it, with no plan and no wait for approval. The PR shows it working in a demo.
- A maintainer merges when it's the agreed feature, the demo works and the AI review's findings are answered. Staging and Promote stay as they are, by hand.
- The release note credits who had the idea and who built it.

## Acceptance criteria

- [ ] `CONTRIBUTING.md`, `GOVERNANCE.md`, `doc/factory.md`, `AGENTS.md`, `CLAUDE.md`, `README.md` and the `omark-factory` skill describe the new flow. None of them mentions a plan gate, `plan-approval.mjs` or size labels.
- [ ] `tools/ci/plan-approval.mjs` and its test are deleted.
- [ ] `plan-review`, `plan-approved`, `size:small` and `size:large` are gone from `.github/labels.yml`. Sizing existed to decide who needs a plan, so it goes with the plan.
- [ ] `doc/format.md` and `doc/architecture.md` no longer send people to a plan or `size:large`. A format change still needs an agreed issue labelled `format`.
- [ ] The "Ask first" list in `AGENTS.md` (file formats, sync, sign-in, task lines, dependencies, CI, `.claude/`, new screens) becomes a list the PR must call out. It stops being a gate and stays a warning.
- [ ] The PR template drops size and adds **Demo**: a short screen recording of `pnpm demo`, or the preview link for a branch in this repository, or "nothing to show" for docs and CI. It keeps the tests written first, by name, without quoting the failing line.
- [ ] Test-first, the required checks, the fresh-eyes review and the guard all stay.
- [ ] `REVIEW.md` marks as **Important** any new dependency, new network call, or change to sign-in, sync, file formats, CI, deploy or `.claude/`, even when the issue asks for it, so the maintainer always sees them. It's also the maintainer's cue for a second look.
- [ ] `CONTRIBUTING.md` and `GOVERNANCE.md` say a fork's PR isn't merged until a maintainer has run `@claude review` on it and its findings are answered.
- [ ] The stale "Discussions open when the repository goes public" lines are gone, in `CONTRIBUTING.md`, `GOVERNANCE.md` and `PHILOSOPHY.md`.
- [ ] Once this merges, I delete the four labels from the repository through the API. `tools/ci/labels.mjs` never deletes one. Issues #107–#122 stay `ready`.

## Tests I'll write first

In `tools/ci/test/docs.test.ts`:

- `AGENTS.md`'s flow and definition of done have the new lines, and no longer have the plan lines the test pins today.
- None of the docs above contains `plan-approval`, `plan-review`, `plan-approved` or `size:`.
- The PR template has a Demo section and no Size line.
- `REVIEW.md` names each flagged area.
- `CONTRIBUTING.md` and `GOVERNANCE.md` say a fork's PR needs the AI review before merging.
- `PHILOSOPHY.md`, `CONTRIBUTING.md` and `GOVERNANCE.md` no longer say Discussions are about to open.

In `tools/ci/test/labels.test.ts`: the label list loses the four labels. In a test beside it: `tools/ci/plan-approval.mjs` doesn't exist.

## Risks

- **Nobody reads the code before merging.** A demo can look perfect and still send tokens or files somewhere else, and the app handles sign-in to people's drives. Mitigation: the AI review on every PR, loud flags for the risky areas, test-first and the required checks, and a second look from a maintainer's own agent for anything flagged. The AI review can still miss a deliberately hidden change. That risk is accepted knowingly, and it's the main one here.
- **Data loss without a plan.** Plans made people think about sync and merge first. Mitigation: those changes are always flagged, and `pnpm e2e:real` stays on the list for them.
- **The merge rule for forks is a habit, not a check.** A fork's PR gets its review when a maintainer asks, and nothing stops a merge without one. Making it a required check would need reviews on fork PRs without a comment, which is a separate job with its own capped key.
- **Screen recordings are thin evidence**, and easy to fake. For now they're enough to see that the feature is what was agreed. The maintainer still checks on staging before Promote.
- **Deleting labels** removes them from issues that carry them. Only the history of old plans loses them, and those plans stay in `doc/plans/`.

## Out of scope

- A preview for forks: a separate job that builds a fork's demo with no secrets and publishes it from a workflow that never runs the fork's code. It comes next, as its own issue.
- Writing credits into release notes automatically, and telling the discussion that an idea shipped. Those come with the bot's later phases. Until then the maintainer writes them.
- Rewriting old plans and `doc/history/`, and the launch spec and roadmap, which describe how things were decided at the time.
