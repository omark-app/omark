# Omark

Small tools that keep your work in plain files you own.

Omark is a set of open source apps for people and their AI agents. **Omark Tasks** keeps your tasks in three Markdown files in your own OneDrive or Google Drive: one calm page with today, this week and later, quick add, repeating tasks and habits. The files stay editable in Obsidian, any text editor, or by an AI agent such as Claude Code. **Omark Time** (in progress) turns calendar events titled `CODE; Category; description` into hours per project, in CSV files you own. No Omark server ever stores your data.

![Omark Tasks: today, this week and later on one page, with important tasks on the right](apps/site/src/img/tasks-light.webp)

## Use it

- **Try the demo:** https://demo-tasks.omark.app. Sample tasks, no sign-in; edits stay in your browser.
- **Use the hosted app** (coming soon at `tasks.omark.app`): sign in with Microsoft or Google, and your files live in your OneDrive or Google Drive. The sign-in helper keeps nothing on the server ([SECURITY.md](SECURITY.md)).
- **Use a local folder** (coming soon): in desktop Chrome or Edge, pick a folder and skip the account entirely. Sync it with whatever you already use.
- **Host your own copy:** [doc/self-hosting.md](doc/self-hosting.md) has the environment variables, sign-in setup, deploys and Promote that this README used to hold.

Each app installs like any other: on the iPhone, Safari → Share → Add to Home Screen; in Chrome or Edge, the install icon in the address bar. Both work offline. On the iPhone, sign in inside the home-screen app itself: it has its own cookies, separate from Safari.

## Quick start

You need Node 22 or newer and pnpm 10.

```
git clone https://github.com/omark-app/omark.git
cd omark
pnpm i
pnpm demo
```

This opens Omark Tasks on http://localhost:5173 with sample tasks and no sign-in. [CONTRIBUTING.md](CONTRIBUTING.md) has the tests and how to send a change.

## Your files

```markdown
# Tasks
- [ ] Inbox zero by Friday ⏫
- [ ] Pay rent 🔁 every month on the 1st 📅 2026-11-01
    - transfer from savings
- [ ] Meditate 10 min 🌱 🔁 every day 📅 2026-10-27
```

- `tasks.md` holds your open tasks, `done.md` a log of everything you completed, `config.yaml` your settings. Completing a task moves it to `done.md` with its notes; nothing is lost.
- The format is compatible with the Obsidian Tasks emoji format, and documented as an open standard in [doc/format.md](doc/format.md), so any tool or agent can read and write it.
- Settings: the gear in the footer, or the `,` key. The page writes only what differs from the defaults and keeps your comments in `config.yaml`.

**With Claude Code.** The repo ships a skill, `.claude/skills/taskapp-files/`, that teaches Claude Code the formats. Inside this repo it is picked up automatically. To use it from anywhere, copy the folder to your personal skills folder: `~/.claude/skills/taskapp-files/` on macOS and Linux, `C:\Users\<you>\.claude\skills\taskapp-files\` on Windows. Then ask Claude to add, move or complete tasks in your files.

**Coming from Todoist?** A one-time import of your open tasks: `pnpm --filter todoist-import start -- --out <path> [--force]`, with your API token in `TODOIST_TOKEN`. Review the warnings it prints.

## How it's built

A Svelte 5 + TypeScript PWA in a pnpm monorepo, with the logic in pure packages that know nothing about the browser. [doc/architecture.md](doc/architecture.md) explains the packages, sync and merge, and the sign-in helper.

Omark is built mostly by AI agents, through GitHub issues and pull requests, in a small software factory that ships with the repo: every change is planned when it's large, written test-first, and reviewed. [doc/factory.md](doc/factory.md) describes it. Agents start at [AGENTS.md](AGENTS.md).

## More

| | |
|---|---|
| [PHILOSOPHY.md](PHILOSOPHY.md) | Why Omark exists and the principles every idea is weighed against |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Set up, pick an issue, send a pull request; the AI policy |
| [AGENTS.md](AGENTS.md) | Instructions for AI coding agents |
| [GOVERNANCE.md](GOVERNANCE.md) | Who decides, how ideas become issues |
| [SECURITY.md](SECURITY.md) | Reporting a problem; what the sign-in helper keeps |
| [doc/format.md](doc/format.md) | The file formats |
| [doc/self-hosting.md](doc/self-hosting.md) | Run your own copy |
| [The Tasks spec](doc/TaskApp%20v1%20spec.md), [the Omark Time spec](doc/Omark%20Time%20spec.md) | What each app does, in detail |

## Licence

[MIT](LICENSE).
