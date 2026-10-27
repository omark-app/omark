# The factory for contributors (#96)

Roadmap item 2.5. Spec: [open source launch spec](../TaskApp%20open%20source%20launch%20spec.md), section 6.8 (roles, maintainer check, labels, Ideas, templates, contributor docs, one factory for both apps). The dry run that proves it is 2.6 (a pilot developer, by hand).

## What changes for AL

- The factory stops assuming one person. The skills, guard, templates and agent rules say "a maintainer", and AL is the only maintainer at launch.
- **A plan approval counts only from a maintainer**, checked by the approver's repository role through the GitHub API. A contributor (or their agent) can't approve their own plan with an "approved" comment or the `plan-approved` label. A small script does the check, so agents don't each reinvent it.
- `taskapp-factory` becomes `omark-factory`. Sessions started with "follow the taskapp-factory skill" need the new name.
- New issue forms (Bug, Feature, Task) ask which app; blank issues are off, with links for security reports and questions. An Ideas form for Discussions. A PR template with "What changes for users", "How to try it" and an AI-use line. `CODEOWNERS` names AL.
- A labels file and a script that creates the labels (`task`, `format`, `app:tasks`, `app:time`, `app:suite` and the rest). Running it against the repo is one command for AL, or for this session with AL's OK.
- The `taskapp-files` skill points to `doc/format.md` and asks where the files are instead of naming AL's OneDrive path.
- The old factory spec and cloud environment notes move to `doc/history/`; `doc/factory.md` is the current description.

## Acceptance criteria

- [ ] **Roles.** No "AL" in `AGENTS.md`, `CLAUDE.md`, `.claude/skills/`, `.github/` templates or the guard's messages; they say "a maintainer". GOVERNANCE, CONTRIBUTING and `doc/factory.md` describe the same roles.
- [ ] **Maintainer check.** `tools/ci/plan-approval.mjs <issue>` reports whether the issue's latest plan is approved and by whom. It counts the `plan-approved` label only when the account that added it (from the issue's events) has the Maintain or Admin role, and an "approved" comment only from such an account. Only approvals after the latest plan comment count, and comments carrying the agent footer don't count. Exit code 0 = approved, 1 = not.
- [ ] **`omark-factory` skill**, role-neutral:
  - the plan gate runs the approval script; a contributor's agent that reaches it stops and says so;
  - when sizing, a required field of the issue's template that is missing means `needs-info`, a question, and stop;
  - the agent adds the `app:` label when sizing;
  - "take the next issue": `bug`, then `enhancement`, then `task`, oldest first;
  - contributors work in a fork; the agent never merges.
- [ ] **Guard.** Still blocks pushes to `main`, force pushes, merges and Promote for everyone. Messages are role-neutral: "Blocked by the Omark guard: …, see AGENTS.md, Hard rules."
- [ ] **Issue forms** as in spec 6.8:
  - Bug (App*, What happened*, What I expected*, Build number*, OS and browser*, Installed or tab*, Storage mode*, Steps);
  - Feature (App*, The problem*, Who has it*, Ideas link, How I'll know it works*);
  - Task (App*, What and why*, Done when*).

  Each adds its kind label. `config.yml` turns blank issues off and links "Report a security problem" and "Ask a question".
- [ ] **Ideas form** in `.github/DISCUSSION_TEMPLATE/ideas.yml`: The problem*, How you handle it today, Which app.
- [ ] **PR template:** `Closes #`, size, What changes for users, Tests written first, How to try it, Preview, and an AI-use line.
- [ ] **`CODEOWNERS`** names the maintainer.
- [ ] **Labels:** `.github/labels.yml` lists every label in spec 6.8 with a colour and description. `tools/ci/labels.mjs` shows what it would change, and changes it with `--apply`.
- [ ] **AGENTS.md:** role-neutral hard rules, the plan gate and maintainer check in "How work flows", and the skill's new name. `CLAUDE.md` lists the skills under their new names.
- [ ] **Docs:** `doc/factory.md` (roles, the approval check, labels, forms, previews for contributors), CONTRIBUTING and GOVERNANCE updated. The factory spec and `TaskApp cloud environment.md` are in `doc/history/` with a historical note, and the comments that cite the factory spec's path point to `doc/factory.md`.
- [ ] `pnpm typecheck` and `pnpm test` pass.

## Tests I'll write first

- `tools/claude-guard/test/guard.test.ts`: every block message names no person, and ends with "see AGENTS.md, Hard rules"; the existing block and allow cases are unchanged.
- `tools/ci/test/plan-approval.test.ts`, with a fake `gh api`:
  - the label added by a maintainer after the plan: approved;
  - the label added by a contributor: not;
  - "approved" from a maintainer: approved; from a contributor: not;
  - an approval before the latest plan comment: not;
  - a comment carrying the agent footer: not;
  - no plan comment: not.
- `tools/ci/test/labels.test.ts`: `labels.yml` has every label from spec 6.8 with a valid colour; the script's plan for a repo with some labels missing or different is the right list of creates and updates, and nothing is deleted.
- `tools/ci/test/templates.test.ts`:
  - each issue form parses, adds its kind label, and has the required fields above with an App dropdown (Tasks, Time, Both or the suite);
  - `config.yml` turns blank issues off and has both links;
  - the Ideas form has its fields;
  - the PR template has its sections and the AI line;
  - `CODEOWNERS` exists.
- `tools/ci/test/docs.test.ts`:
  - the pinned rules become the role-neutral ones;
  - no "AL" in AGENTS, CLAUDE, the skills or the templates;
  - `omark-factory` has its frontmatter, and `taskapp-factory` is gone;
  - `taskapp-files` has no local path.
- `packages/tasks-core/test/skill-examples.test.ts` pins the `taskapp-files` frontmatter and stays as it is. The skill's description doesn't change.

## Risks

- **Locking AL out of his own flow.** AL's sessions approve plans in chat. In AL's own session the agent's `gh` runs as AL, a maintainer, so the label it adds after a chat approval still counts. The footer rule only stops agent-written "approved" comments from counting. Tested both ways.
- **Self-approval by a contributor's agent.** It runs as the contributor, who has Read or Triage, so neither the label nor a comment counts. Triage can add labels; the check reads who added it, not just whether it is there.
- **Renaming the skill** breaks prompts that name `taskapp-factory`, including the coordinator's. The PR says so, and the coordinator switches.
- **Comments outside this lane.** `ci.yml`, `promote.yml` and `apps/tasks/src/lib/environment.ts` cite `doc/TaskApp factory spec.md` in comments. Moving the spec to `doc/history/` makes those comments point at a history file, which is still true but stale. Changing a comment line in a workflow is outside this lane, so the PR asks the coordinator. Without an OK, those three comments keep the old path, and the spec moves anyway with a pointer to `doc/factory.md` at its top.
- **The labels script writes to the repository.** It only shows its plan unless given `--apply`, and never deletes a label.

## Out of scope

- The dry run on a fork (2.6) and pilot developers' access (AL).
- Turning on Discussions, branch protection and private vulnerability reporting (4.3, AL). The forms and links are ready for them.
- Workflow changes: none are needed. The labels script runs by hand.
- Adapters for other agents (Codex, Cursor): AGENTS.md already carries the process.
