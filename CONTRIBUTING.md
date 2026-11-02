# Contributing

Thanks for wanting to help. Omark is built mostly by AI agents working through issues and pull requests, and your agent is welcome to do the same. This page is the short version; [AGENTS.md](AGENTS.md) and [doc/factory.md](doc/factory.md) have the rest.

## Set up

You need Node 22 or newer (`.nvmrc` has the version CI uses) and pnpm 10. `pnpm i` may say it ignored the build scripts of esbuild and workerd: that is expected.

Fork the repository on GitHub, then:

```
git clone https://github.com/<you>/omark.git
cd omark
pnpm i
pnpm demo
```

`pnpm demo` serves Omark on http://localhost:5173 with a made-up person's tasks, hours and goals, and no sign-in. Edits stay in your browser; "Reset demo" in the footer starts over.

The checks every change must pass:

| command | |
|---|---|
| `pnpm typecheck` | type checks, all packages |
| `pnpm test` | unit tests (Vitest) |
| `pnpm e2e` | browser tests of every app on a fake drive (Playwright: desktop Chrome and iPhone WebKit) |
| `pnpm --filter omark build` | the production build |

Run `pnpm --filter tasks exec playwright install chromium webkit` once before the first `pnpm e2e`.

## Ideas and bugs

- **An idea?** Post it in Discussions, in the Ideas category, and vote for others' with 👍. Discussions open when the repository goes public. Maintainers turn the ideas that fit [PHILOSOPHY.md](PHILOSOPHY.md) into issues ([GOVERNANCE.md](GOVERNANCE.md)).
- **A bug?** Open an issue with the Bug form: which app, what happened, what you expected, the build number (in the app's footer), your OS and browser, whether it's installed or in a tab, your storage, and the steps.
- **A security problem?** Never in public: see [SECURITY.md](SECURITY.md).

## Working on an issue

1. **Pick an issue labelled `ready`.** `good first issue` is a good start. Comment that you are taking it, so nobody else does.
2. **Fork the repo** and work on a branch named `issue-<n>-<slug>`.
3. **Check the size.** `size:small` issues go straight to code. `size:large` ones (file formats, sync, sign-in, CI, dependencies, a new screen) need a plan first: write `doc/plans/<n>-<slug>.md` with what changes for users, acceptance criteria, the tests you'll write first, risks and what's out of scope. Post its summary on the issue in a comment starting `Plan for #<n>:` (you may also open a draft PR with the plan), and **wait for a maintainer's approval** before writing code. `node tools/ci/plan-approval.mjs <n>` tells you (and your agent) when a maintainer has approved it; your own label or comment doesn't count.
4. **Test first.** Write the test, run it, see it fail, then make it pass. The PR quotes the failing line.
5. **Open the pull request** from the template. It closes the issue, says what changes for users and how to try it, and fills in the AI-use section.

## Definition of done

A pull request is ready for review when:

- a test written first failed before the change, and the PR quotes the failing line;
- `pnpm typecheck`, `pnpm test`, the build and the e2e specs the change touches pass on your machine, and the full e2e passes in CI;
- the PR follows the template and closes the issue;
- you (or a fresh-eyes review by your agent) checked the diff against the issue or plan, and fixed what it found;
- for large work, every acceptance criterion in the plan is met or explicitly moved out;
- docs for changed behaviour are updated, including [doc/format.md](doc/format.md) when a file format changes.

Existing tests change only when the behaviour they cover is meant to change, and the PR says which and why.

## AI-assisted contributions

Welcome, under the same rules as everyone else:

- Every PR links an accepted issue: `ready`, or a large one with an approved plan.
- The PR says whether and how AI was used (for example "written by Claude Code, reviewed by me").
- You are responsible for what you submit. Read the diff before you open the PR.

PRs with no issue are closed with a pointer to this page. That keeps reviews about agreed work, and keeps maintaining Omark from becoming a chore.

## CI on forks

- A fork's pull request runs the checks and both e2e projects. A maintainer may need to approve the first run.
- Forks have no secrets, so they get no preview deploy. If a preview helps, a maintainer can push your branch to the main repository, where previews are made.
- Docs-only changes (`doc/**` and `*.md`) skip CI.

## Style

Plain, short English in docs, comments, issues and PRs. Commit messages are short imperative sentences ("Add tasks.md parser"). When main moves and your PR conflicts, merge main in; don't rebase work you've already pushed.

## Code of conduct

Everyone taking part follows the [code of conduct](CODE_OF_CONDUCT.md).
