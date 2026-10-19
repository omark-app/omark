---
name: taskapp-factory
description: 'Use when working on a TaskApp GitHub issue or PR: "work on #14", "take the next issue", "file a bug", sizing issues, writing or updating a plan, implementing, opening or handing over a PR'
---

# TaskApp factory

The flow from `doc/TaskApp factory spec.md`, step by step. GitHub: MCP tools or `gh api` (REST), never `gh issue` / `gh pr`. Every comment you post ends with the Claude Code footer.

## File an issue

When AL says "file a bug: …" or "idea: …": create the issue with the matching template's headings (`bug.yml`, `feature.yml`), label `bug` or `enhancement`, then size it (below). Don't start work unless he asked.

## Pick up

1. **"Take the next issue":** list open issues labelled `ready` and not `in-progress`. Take `bug` before `enhancement`, then the oldest.
2. Read the issue and all comments. If it isn't sized yet, size it first.
3. If it is `size:large` without `plan-approved` (or an "approved" comment from AL after the latest plan), go to **Plan**.
4. Create the branch `issue-<n>-<slug>` from the latest `main`. Add `in-progress`, remove `ready`, and comment:
   `Working on this in branch <branch>.`

## Size

Small only if **all** hold: a bug fix or small tweak with clear expected behaviour; no change to the file formats, to sync, merge or saving, or to sign-in; no new dependency; no change to CI, deploy, `.claude/` or the guard; no new screen, gesture or flow. Anything else is large. When in doubt, large. File formats, sync and merge, sign-in, and anything that deletes or rewrites task lines are always large.

Add the label and comment:
`Sized **small**: <one-line reason>. Relabel if you disagree.`

AL's label wins. Never relabel what he labelled.

If anything about the expected behaviour is unclear, ask one clear question, add `needs-info`, and stop.

## Plan (large only)

1. Write `doc/plans/<n>-<slug>.md` on the issue branch: **What changes for AL**, **Acceptance criteria** (checkboxes), **Tests I'll write first**, **Risks**, **Out of scope**. Commit and push it.
2. Comment the summary:
   ```
   Plan for #<n>: <one-line goal>

   <acceptance criteria as a short list>

   Full plan: doc/plans/<n>-<slug>.md on branch <branch>.
   Reply "approved" or add `plan-approved`.
   ```
3. Add `plan-review` and stop.
4. Approval is `plan-approved`, an "approved" comment from AL, or AL saying so in the live session. Record a chat approval with the comment `Approved by AL in the session.` and the label. Remove `plan-review`.
5. A change of direction mid-way means updating the plan, a new comment, `plan-review` again, and waiting.

## Implement

1. For each behaviour: write the test, run it, **see it fail**, save the failing line for the PR, then write the code.
2. Small work turning out bigger: stop, relabel `size:large`, comment why, go to **Plan**.
3. Before pushing, run `pnpm typecheck`, `pnpm test`, `pnpm e2e` and `pnpm --filter web build`. All green, or don't push.
4. Commit in small steps with short imperative messages.

## Hand over

1. Push and open the PR from `.github/pull_request_template.md`: `Closes #<n>`, size, what changed for AL, the tests written first with their failing line, and things to try on the phone.
2. Run a review subagent with no memory of the work: give it the issue (or plan) and `git diff main...HEAD` and ask for bugs, missed acceptance criteria and untested paths. Fix what holds up, re-run the four commands, push.
3. When CI is green, the preview comment appears. Make sure the PR body links it.
4. Remove `in-progress`. Tell AL in one or two lines: what changed, the preview link, what to try.
5. Fix CI failures and answer review comments until the PR is green. Never merge.

## Blocked

- Only AL can do it (Entra, his PC, a dashboard, a device check): add `needs-human` and comment short numbered steps. Never ask for a secret in chat.
- A question only AL can answer: add `needs-info` and ask one clear question.
- Either way, stop and say so in the session.
