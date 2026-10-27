# Docs set for the suite (#85)

Roadmap item 2.3. Spec: [open source launch spec](../TaskApp%20open%20source%20launch%20spec.md), section 6.7 (6.7.1 for PHILOSOPHY, 6.7.2 for the format). Omark Time's own docs are #60 (T.8), after PR A merges.

## What changes for AL

- The repo reads like an open source project: a README for strangers, PHILOSOPHY, AGENTS, CONTRIBUTING, GOVERNANCE, SECURITY, CODE_OF_CONDUCT and an MIT LICENSE at the root.
- `AGENTS.md` holds the agent instructions. `CLAUDE.md` becomes `@AGENTS.md` plus the Claude-only notes, so Claude Code sees exactly the rules it sees today.
- Today's README is mostly the operating manual for AL's own deployment. That moves to `doc/self-hosting.md`, written for anyone running their own copy, with a short section for the bridge deployment that lasts until the cutover (roadmap 3.6) and is removed with the bridge (3.7).
- `doc/format.md` describes `tasks.md`, `done.md` and `config.yaml` as an open format, version 1.0, so someone could write a compatible tool. Its examples are checked by a test against `tasks-core`.
- AL approves the PHILOSOPHY principles and wording (roadmap 2.7). The draft is in PR A's body.

## Two PRs

- **PR A: new and rewritten files only.** `README.md`, `PHILOSOPHY.md`, `AGENTS.md`, `CLAUDE.md`, `CONTRIBUTING.md`, `GOVERNANCE.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, `LICENSE`, `doc/format.md`, `doc/architecture.md`, `doc/self-hosting.md`, `doc/factory.md`, and the docs test. No file is moved or renamed. The new docs link the old files where they are today.
- **PR B: the moves**, once the coordinator says no other PR touches these files:
  - `doc/TaskApp v1 spec.md` → `doc/tasks/spec.md`, generalised: the seven stale statements (spec section 5) fixed, the launch features added (demo, Google Drive, first run as far as built).
  - `doc/TaskApp habits spec.md` and `doc/Omark settings page spec.md` → `doc/tasks/`.
  - To `doc/history/`, each with a one-line "historical, may be out of date" note and no Cloudflare account or zone IDs: `TaskApp spike findings.md`, `TaskApp v1 acceptance checklist.md`, and the factory spec and cloud environment once `doc/factory.md` covers them.
  - `doc/TaskApp ideation.md` removed (its spirit is in PHILOSOPHY). `doc/TaskApp backlog.md` stays until its items become issues or Ideas (roadmap 4.1), then goes.
  - `doc/history/19-quick-dates-important.md` generalised as the example plan.
  - Every link to a moved file fixed, in docs, skills and code comments.

## Acceptance criteria

PR A:

- [ ] `README.md`: what it is (one paragraph and a screenshot), the three ways to use it (demo, hosted, local folder, marked "coming" where not built yet), a 4-command quick start, links to PHILOSOPHY, AGENTS, CONTRIBUTING, format, self-hosting. Both apps.
- [ ] `PHILOSOPHY.md`: why Omark exists (AL's story, first person), the five suite principles and the two app premises of 6.7.1 in meaning unchanged, how features get in, the Omark direction. No "won't add" list.
- [ ] `AGENTS.md`: overview, a task router by app and kind of task, layout, the four commands, Always / Ask first / Never rules, the definition of done, the issue flow in brief, the AI-contribution rule, links to the specs.
- [ ] `CLAUDE.md` starts with `@AGENTS.md`; every rule from today's `CLAUDE.md` is in `AGENTS.md` word for word; the Claude-only notes (skills, `gh api` in cloud sessions, cloud environment) stay in `CLAUDE.md`.
- [ ] `CONTRIBUTING.md`: setup with demo mode, picking up an issue, sizing and plans, the definition of done, the AI policy, fork CI notes, ideas and voting.
- [ ] `GOVERNANCE.md`: roles, how ideas become issues, who approves plans and merges, how a contributor becomes a maintainer.
- [ ] `SECURITY.md`: private reporting (GitHub private vulnerability reporting, or `security@omark.app`), what the sign-in helper keeps and doesn't keep, known gaps (no CSP yet).
- [ ] `CODE_OF_CONDUCT.md`: Contributor Covenant 2.1, contact `hello@omark.app`.
- [ ] `LICENSE`: MIT.
- [ ] `doc/format.md` (Tasks part): grammar, completion rules, recurrence rules and table, week settings, what a tool must preserve, version `1.0` and how changes are proposed (`format` label, always large), Obsidian Tasks compatibility. A placeholder heading for Omark Time points to #60.
- [ ] `doc/architecture.md`: the packages of both apps, the data flow (core → app workspace and file sync → cache → adapter), three-way merge and eTags, the sign-in helper, how to add a storage adapter with the contract test.
- [ ] `doc/self-hosting.md`: your own Entra app (and Google client), Cloudflare Pages projects, secrets, variables, Promote, rollback.
- [ ] `doc/factory.md`: the factory for maintainers and contributors, and the Claude cloud environment.
- [ ] No `[[wiki links]]` in the new files; every relative link resolves.
- [ ] `pnpm typecheck` and `pnpm test` pass.

PR B: the moves listed above, with every link fixed and the test's link check covering `doc/tasks/`.

## Tests I'll write first

One new file, `tools/ci/test/docs.test.ts` (in the existing `ci-scripts` project, so no new package and no lockfile change):

- `LICENSE` is the MIT text.
- `CLAUDE.md`'s first line is `@AGENTS.md`.
- Every rule line of today's `CLAUDE.md` (Definition of done, Hard rules, Style, the merge-main and existing-tests rules) appears in `AGENTS.md` word for word.
- Every relative link in the root docs and the new `doc/*.md` files points to a file that exists; none has a `[[wiki link]]`.
- `doc/format.md`: every `markdown` example round-trips through `tasks-core`; the next-date table and the repeat-wording table agree with `nextDate` and `formatRepeat` (as `skill-examples.test.ts` does for the skill); it states version `1.0`.
- `README.md` links PHILOSOPHY, AGENTS, CONTRIBUTING, `doc/format.md` and `doc/self-hosting.md`.

Each fails first because the files don't exist yet.

Because `tools/ci/test/` is not in CI's `paths-ignore`, this PR runs CI even though the rest is Markdown. Later PRs that change only Markdown skip CI, so these checks run there only through the local `pnpm test` the factory asks for.

After the review the test also checks that every field in the examples is read as a field, that the completion example is what `completeTask` does, that the config and shortcut tables match `DEFAULT_CONFIG`, that anchor links resolve, and that `AGENTS.md` has the "Hard rules" heading the guard's message points to.

## Risks

- **Conflicts with the other lanes.** Storage and Time edit `README.md` and `CLAUDE.md`. Kept small by rewriting them once, early, and by doing no moves in PR A. Their "README note for the docs lane" items are folded in by this lane.
- **Losing AL's operating notes.** Today's README holds the steps for the bridge deployment (tenant link, client ID, Pages projects). They move to a clearly marked section of `doc/self-hosting.md`, not dropped. Its values go with the bridge in 3.7, before the repo goes public.
- **Agents losing rules.** The test pins today's rules in `AGENTS.md`, and `CLAUDE.md` imports it. The guard's message says "See CLAUDE.md, Hard rules", so `AGENTS.md` keeps a "Hard rules" heading; 2.5 rewrites the guard's wording.
- **Stale pointers in CI.** `ci.yml`, `promote.yml`, `tools/ci/check-signin.mjs` and `apps/site/README.md` point to "README, Environment variables" (or Sign-in, Deploy). Those sections are now in `doc/self-hosting.md`, and the README says so. The pointers themselves are outside this lane (a follow-up for whoever next touches CI).
- **Docs-only changes skip CI**, so `doc/format.md` can drift unless `pnpm test` runs locally. Taking `doc/format.md` out of `paths-ignore` is a CI change for 2.5.
- **The format doc drifting from the code.** Its examples and tables are tested, like the skill's.
- **PHILOSOPHY in AL's voice.** It is a draft until AL approves (2.7); the PR body lists each principle in one line.

## Out of scope

- Role-neutral wording ("a maintainer", not "AL") in the rules, skills, guard and templates, the issue forms, labels script and Discussion form: 2.5. `AGENTS.md` keeps today's rules word for word until then.
- Omark Time's format, spec, skill and DuckDB examples: #60.
- The `taskapp-files` skill pointing to `doc/format.md` and dropping AL's local path: with 2.5's skill rewrite, or #60 if it is simple. Not in PR A, to keep the skill test untouched.
- Moving or renaming any file: PR B. When PR B moves the v1 spec, the definition-of-done line "(README, the v1 spec, …)" stays word for word until 2.5.
- The roadmap: the coordinator updates it.
